/**
 * Auto limpiador de basura en disco.
 *
 * Un bot que descarga video, stickers y audios va dejando restos: pruebas,
 * `dl_*` que no llegaron a borrarse, logs de verificacion, archivos de
 * trabajo que nadie volvio a tocar. En un VPS de 10 GB o en Termux eso se
 * convierte en "no queda espacio" a las dos semanas.
 *
 * Reglas (nunca toca la sesion ni la base de datos, que no estan aca):
 *   - Solo mira carpetas de descarte: `tmp/`, `data/tmp/` y `logs/`.
 *   - Solo borra archivos sueltos, nunca carpetas ni enlaces, y no entra en
 *     subcarpetas: `tmp/baileys` o `tmp/subbot` son andamiaje de pruebas, no
 *     basura.
 *   - Doble criterio: borra lo que supera la edad maxima **o** lo que sobra
 *     del tope de tamaño de la carpeta (de lo mas viejo a lo mas nuevo).
 *   - Cada archivo tiene una ventana de gracia: si se toco hace poco, se
 *     deja quieto. Es lo que impide borrar una descarga en curso.
 *   - Borra por lotes con una pausa corta, para no clavar el disco mientras
 *     el bot atiende mensajes.
 *
 * Se puede ajustar por entorno sin tocar codigo:
 *   LIMPIADOR_ACTIVO=0            apagarlo
 *   LIMPIADOR_INTERVALO_MIN=60    cada cuanto mira
 *   LIMPIADOR_GRACIA_MIN=120      ventana de gracia general
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { log } from './logger.js'

const RAIZ = path.resolve('.')

/** Cada cuanto se hace una pasada (30 min) */
const INTERVALO_MS = 30 * 60_000
/** Primera pasada: tarde, para no competir con el arranque en frio */
const RETRASO_INICIAL_MS = 2 * 60_000
/** Archivos por tanda y pausa entre tandas */
const TAMANO_LOTE = 25
const PAUSA_LOTE_MS = 80
/**
 * Piso de seguridad absoluto: nada tocado en este tiempo se borra, ni
 * siquiera cuando la carpeta se pasa del tope. Es lo que protege una
 * descarga en curso de un recorte por tamaño.
 */
const GRACIA_MINIMA_MS = 15 * 60_000

/**
 * Que se limpia, cuanto tiene que envejecer y cuanto puede pesar la carpeta.
 * `topeMB` se aplica ademas de la edad: una carpeta por debajo de su tope se
 * queda con lo que todavia no vencio.
 */
const REGLAS = [
  { carpeta: 'tmp', etiqueta: 'temporales de trabajo', edadMs: 6 * 3_600_000, topeMB: 250 },
  { carpeta: 'data/tmp', etiqueta: 'descargas temporales', edadMs: 2 * 3_600_000, topeMB: 150 },
  { carpeta: 'logs', etiqueta: 'registros', edadMs: 7 * 24 * 3_600_000, topeMB: 60 },
]

/**
 * Nombres que no se tocan ni por error.
 * La sesion vive en `auth_info/` (fuera de estas carpetas), pero si alguna
 * regla se equivoca de ruta el archivo sigue protegido por nombre.
 */
const NUNCA_BORRAR = /^(creds\.json|sesion\.sqlite|sesion\.sqlite-wal|sesion\.sqlite-shm|\.gitkeep)$/i

let temporizador = null
let enCurso = null
let ultimaPasada = null
let totalBorrados = 0
let totalLiberados = 0

const numero = (valor, porDefecto) => {
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0 ? n : porDefecto
}

/** Intervalo configurado, en ms */
function intervaloMs() {
  return numero(process.env.LIMPIADOR_INTERVALO_MIN, INTERVALO_MS / 60_000) * 60_000
}

/** Ventana de gracia adicional configurada, en ms */
function graciaExtraMs() {
  return numero(process.env.LIMPIADOR_GRACIA_MIN, 0) * 60_000
}

/** El limpiador esta apagado explicitamente */
function apagado() {
  return /^(0|false|no|off)$/i.test(String(process.env.LIMPIADOR_ACTIVO || ''))
}

const mb = (bytes) => Math.round((bytes / 1_048_576) * 10) / 10

/** Tamaño legible para el log: 640 KB no puede salir como "0 MB" */
const peso = (bytes) =>
  bytes >= 1_048_576 ? `${mb(bytes)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Lista los archivos sueltos de una carpeta con su fecha y tamaño.
 *
 * `withFileTypes` deja fuera las subcarpetas antes de tocar el disco con
 * `stat`, y los enlaces simbolicos se descartan a proposito: borrar el
 * enlace no libera nada y borrar el destino seria salirse de la carpeta.
 *
 * @param {string} dir ruta absoluta
 * @returns {Promise<Array<{nombre: string, ruta: string, bytes: number, mtimeMs: number}>>}
 */
async function inventario(dir) {
  let entradas
  try {
    entradas = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const archivos = []
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue
    if (NUNCA_BORRAR.test(entrada.name)) continue

    const ruta = path.join(dir, entrada.name)
    try {
      const info = await fsp.stat(ruta)
      archivos.push({ nombre: entrada.name, ruta, bytes: info.size, mtimeMs: info.mtimeMs })
    } catch {
      // el archivo desaparecio mientras se miraba: nada que borrar
    }
  }
  return archivos
}

/**
 * Borra una lista en tandas.
 *
 * `unlink` de a 25 en paralelo y una pausa entre tandas: 200 borrados de un
 * saque son un pico de I/O que se nota en la respuesta del bot.
 */
async function borrarPorLotes(archivos) {
  let borrados = 0
  let liberados = 0

  for (let i = 0; i < archivos.length; i += TAMANO_LOTE) {
    const tanda = archivos.slice(i, i + TAMANO_LOTE)
    const resultados = await Promise.allSettled(tanda.map((archivo) => fsp.unlink(archivo.ruta)))

    resultados.forEach((resultado, indice) => {
      if (resultado.status !== 'fulfilled') return
      borrados++
      liberados += tanda[indice].bytes
    })

    if (i + TAMANO_LOTE < archivos.length) {
      await new Promise((listo) => setTimeout(listo, PAUSA_LOTE_MS))
    }
  }

  return { borrados, liberados }
}

/**
 * Limpia una carpeta segun su regla.
 *
 * @param {{carpeta: string, etiqueta: string, edadMs: number, topeMB: number}} regla
 * @param {string} [raiz] base donde buscar la carpeta (por defecto la del bot)
 * @returns {Promise<{carpeta: string, etiqueta: string, borrados: number, liberados: number, motivo: string}>}
 */
async function limpiarCarpeta(regla, raiz = RAIZ) {
  const dir = path.resolve(raiz, regla.carpeta)
  const vacio = { carpeta: regla.carpeta, etiqueta: regla.etiqueta, borrados: 0, liberados: 0, motivo: '' }

  if (!fs.existsSync(dir)) return { ...vacio, motivo: 'no existe' }

  const archivos = await inventario(dir)
  if (!archivos.length) return { ...vacio, motivo: 'vacia' }

  // Gracia: lo que se toco hace menos de la edad de la regla sigue vivo.
  // Una descarga en curso escribe su archivo ahora mismo, asi que cae aca.
  const extra = graciaExtraMs()
  const limiteEdad = Date.now() - regla.edadMs - extra
  const limiteSeguro = Date.now() - GRACIA_MINIMA_MS - extra

  const vencidos = archivos.filter((archivo) => archivo.mtimeMs < limiteEdad)

  // Segundo criterio: el tope de tamaño. Si la carpeta pesa mas, se van los
  // mas viejos primero hasta entrar. Aca manda el piso de seguridad, no la
  // edad: si no, el tope no serviria para nada (lo vencido ya se fue arriba).
  const topeBytes = regla.topeMB * 1_048_576
  let total = archivos.reduce((suma, archivo) => suma + archivo.bytes, 0)
  const porTamano = []

  if (total > topeBytes) {
    const candidatos = archivos
      .filter((archivo) => archivo.mtimeMs < limiteSeguro)
      .sort((a, b) => a.mtimeMs - b.mtimeMs)

    for (const archivo of candidatos) {
      if (total <= topeBytes) break
      porTamano.push(archivo)
      total -= archivo.bytes
    }
  }

  const objetivo = [...new Map([...vencidos, ...porTamano].map((a) => [a.ruta, a])).values()]
  if (!objetivo.length) {
    return { ...vacio, motivo: `${mb(total)} MB, nada vencido` }
  }

  const { borrados, liberados } = await borrarPorLotes(objetivo)
  const motivo = porTamano.length ? `tope de ${regla.topeMB} MB` : 'vencidos por edad'

  return { ...vacio, borrados, liberados, motivo }
}

/**
 * Una pasada completa.
 *
 * Nunca lanza: si una carpeta falla, se anota y se sigue con la siguiente.
 * Dos pasadas no se pisan; la segunda espera a la primera.
 *
 * @param {{raiz?: string, reglas?: Array<object>}} [opciones] `raiz` permite
 *   apuntar a otra carpeta y `reglas` a otras reglas (las usa la verificacion
 *   para no tocar nada del bot)
 * @returns {Promise<{
 *   ejecutado: boolean, borrados: number, liberadosMB: number, duracionMs: number,
 *   carpetas: Array<{carpeta: string, etiqueta: string, borrados: number, liberados: number, motivo: string}>
 * }>}
 */
export async function limpiarAhora({ raiz = RAIZ, reglas = REGLAS } = {}) {
  if (enCurso) return enCurso

  enCurso = (async () => {
    const inicio = Date.now()
    const carpetas = []

    for (const regla of reglas) {
      try {
        carpetas.push(await limpiarCarpeta(regla, raiz))
      } catch (err) {
        carpetas.push({
          carpeta: regla.carpeta,
          etiqueta: regla.etiqueta,
          borrados: 0,
          liberados: 0,
          motivo: `error: ${err?.message || err}`,
        })
      }
    }

    const borrados = carpetas.reduce((suma, c) => suma + c.borrados, 0)
    const liberados = carpetas.reduce((suma, c) => suma + c.liberados, 0)

    totalBorrados += borrados
    totalLiberados += liberados
    ultimaPasada = new Date().toISOString()

    if (borrados > 0) {
      const detalle = carpetas
        .filter((c) => c.borrados > 0)
        .map((c) => `${c.carpeta}: ${c.borrados} (${peso(c.liberados)})`)
        .join(' · ')
      log.sistema(`🧹 Limpieza automática: ${borrados} archivo(s), ${peso(liberados)} — ${detalle}`)
    }

    return {
      ejecutado: true,
      borrados,
      liberadosMB: mb(liberados),
      duracionMs: Date.now() - inicio,
      carpetas,
    }
  })()

  try {
    return await enCurso
  } finally {
    enCurso = null
  }
}

/** Estado del servicio, para `.limpiador` */
export function estadoLimpiador() {
  const intervalo = intervaloMs()
  return {
    activo: Boolean(temporizador) && !apagado(),
    apagado: apagado(),
    intervaloMin: Math.round(intervalo / 60_000),
    ultimaPasada,
    proximaPasada: temporizador ? new Date(Date.now() + intervalo).toISOString() : null,
    totalBorrados,
    totalLiberadosMB: mb(totalLiberados),
    reglas: REGLAS.map((regla) => ({
      carpeta: regla.carpeta,
      etiqueta: regla.etiqueta,
      edadHoras: Math.round(regla.edadMs / 3_600_000),
      topeMB: regla.topeMB,
    })),
  }
}

/**
 * Arranca el servicio. Llamarlo dos veces no duplica nada.
 * @returns {boolean} true si quedo andando
 */
export function iniciarLimpiador() {
  if (temporizador) return true

  if (apagado()) {
    log.aviso('Limpiador automático apagado (LIMPIADOR_ACTIVO=0).')
    return false
  }

  const intervalo = intervaloMs()

  // Primera pasada con retraso: el arranque en frio necesita el disco para
  // Baileys y para la precarga del menu, no para borrar archivos.
  const primera = setTimeout(() => {
    limpiarAhora().catch((err) => log.aviso(`Limpiador: ${err?.message || err}`))
  }, RETRASO_INICIAL_MS)
  primera.unref?.()

  temporizador = setInterval(() => {
    limpiarAhora().catch((err) => log.aviso(`Limpiador: ${err?.message || err}`))
  }, intervalo)
  // El limpiador no mantiene vivo el proceso: si el bot cierra, cierra.
  temporizador.unref?.()

  log.sistema(
    `🧹 Limpiador automático cada ${Math.round(intervalo / 60_000)} min ` +
      `(${REGLAS.map((r) => `${r.carpeta} ${r.edadMs / 3_600_000}h/${r.topeMB}MB`).join(' · ')}).`
  )
  return true
}

/** Detiene el servicio */
export function detenerLimpiador() {
  if (!temporizador) return false
  clearInterval(temporizador)
  temporizador = null
  return true
}
