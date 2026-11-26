import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { log } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMMANDS_DIR = join(__dirname, '..', 'commands')

/**
 * Importaciones simultaneas para el modo estricto. Los comandos no dependen
 * entre si y varios arrastran dependencias pesadas (sharp, ytdl), asi que
 * cargarlos en serie sumaba segundos a `npm test`.
 */
const MAX_CARGA_PARALELA = 12

/** Promesas de importacion ya disparadas: un comando se compila una sola vez */
const MODULOS = new Map()

/**
 * Generacion del registro. Cada recarga la sube y se usa como sufijo de la URL
 * (`help.js?v=3`): Node cachea los modulos por URL, asi que sin cambiar la URL
 * `import()` devuelve el modulo viejo aunque se borre el mapa de promesas.
 */
let generacion = 0

/** Registro vivo del bot (el objeto `commands` de index.js), para altas y bajas */
let registro = null
let nombresArchivo = new Set()

/** Nombres de comando que hay ahora en commands/ */
function listarNombres() {
  return readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => f.slice(0, -3))
}

/** Importa (o reutiliza) el modulo de un comando por su nombre de archivo */
function moduloDe(nombre) {
  let promesa = MODULOS.get(nombre)
  if (!promesa) {
    const base = pathToFileURL(join(COMMANDS_DIR, `${nombre}.js`)).href
    // La generacion 0 es el arranque normal: sin sufijo, como siempre.
    promesa = import(generacion ? `${base}?v=${generacion}` : base)
    MODULOS.set(nombre, promesa)
  }
  return promesa
}

/**
 * Envoltorio perezoso: no importa el comando hasta que alguien lo invoca.
 *
 * El registro se construye con estas funciones, asi que el contrato no cambia
 * (`comando(ctx)` sigue devolviendo una promesa), pero el arranque solo abre
 * los comandos que de verdad se usan. Un archivo roto avisa por consola la
 * primera vez que se llama, igual que antes avisaba al arrancar.
 */
function perezoso(nombre) {
  return async (ctx) => {
    let mod
    try {
      mod = await moduloDe(nombre)
    } catch (err) {
      log.aviso(`No se pudo cargar ${nombre}.js · ${err?.message || err}`)
      throw err
    }
    if (typeof mod.default !== 'function') {
      throw new Error(`${nombre}.js: no exporta una funcion por defecto`)
    }
    return mod.default(ctx)
  }
}

/**
 * Carga los comandos de /commands.
 *
 * Modo normal (el del bot): registro perezoso. Solo se leen los nombres de
 * archivo, no su contenido, asi que el arranque no toca 210 archivos ni paga
 * el costo de compilarlos.
 *
 * Modo estricto (`{ eager: true }`, el de `npm test`): importa todos ahora
 * mismo y valida el contrato, para que un archivo roto falle antes de produccion.
 *
 * @param {{ eager?: boolean }} [opciones]
 * @returns {Promise<Record<string, (ctx: object) => Promise<unknown>>>}
 */
export async function cargarComandos({ eager = false } = {}) {
  const archivos = readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()

  const nombres = archivos.map((f) => f.slice(0, -3))

  if (!eager) {
    const perezosos = {}
    for (const nombre of nombres) perezosos[nombre] = perezoso(nombre)
    return perezosos
  }

  const comandos = {}
  const errores = []

  let siguiente = 0

  const trabajadores = Array.from(
    { length: Math.min(MAX_CARGA_PARALELA, nombres.length) },
    async () => {
      while (siguiente < nombres.length) {
        const nombre = nombres[siguiente++]
        try {
          const mod = await moduloDe(nombre)
          if (typeof mod.default !== 'function') {
            errores.push(`${nombre}.js: no exporta una funcion por defecto`)
            continue
          }
          comandos[nombre] = mod.default
        } catch (err) {
          errores.push(`${nombre}.js: ${err?.message || err}`)
        }
      }
    }
  )

  await Promise.all(trabajadores)

  if (errores.length) {
    log.aviso(`Comandos no cargados (${errores.length})`)
    for (const e of errores) log.aviso(`  · ${e}`)
  }

  return comandos
}

/** Compatibilidad con el cargador antiguo (Map nombre -> comando). */
export async function loadCommands(opciones) {
  return new Map(Object.entries(await cargarComandos(opciones)))
}

/**
 * Enlaza el registro del bot con el cargador.
 *
 * `index.js` arma su objeto `commands` una sola vez, copiando las funciones
 * perezosas del registro. Para que una recarga alcance sin tocar ese objeto,
 * el cargador guarda la referencia: los comandos ya enlazados se refrescan
 * solos (la funcion perezosa pide el modulo en cada llamada) y los archivos
 * nuevos que traiga un `git pull` se agregan aca.
 *
 * @param {Record<string, Function>} objetivo
 */
export function conectarRegistro(objetivo) {
  registro = objetivo
  nombresArchivo = new Set(listarNombres())
  return registro
}

/**
 * Recarga los comandos sin reiniciar el proceso.
 *
 * Borra las promesas y sube la generacion: la siguiente llamada a cualquier
 * comando importa el archivo de disco otra vez. Tambien sincroniza altas y
 * bajas contra `commands/`, y valida los archivos que acaban de cambiar para
 * que un error de sintaxis salga en el acto y no en el proximo uso.
 *
 * Solo cubre `commands/`. Lo que vive en `lib/`, `index.js` o
 * `database/` no se puede recargar en un proceso Node: esos cambios piden
 * reinicio, y de eso se encarga `commands/update.js`.
 *
 * Cada recarga deja el modulo anterior retenido (ESM no descarga), asi que en
 * una sesion con muchas actualizaciones conviene reiniciar de vez en cuando.
 *
 * @param {{ archivos?: string[] }} [opciones] rutas cambiadas segun git
 * @returns {Promise<{total:number, nuevos:string[], quitados:string[], probados:number, errores:string[]}>}
 */
export async function recargarComandos({ archivos = [] } = {}) {
  const nombres = listarNombres()
  const conjunto = new Set(nombres)

  MODULOS.clear()
  generacion += 1

  const nuevos = []
  const quitados = []

  if (registro) {
    for (const nombre of nombres) {
      if (!(nombre in registro)) {
        registro[nombre] = perezoso(nombre)
        nuevos.push(nombre)
      }
    }
    for (const nombre of nombresArchivo) {
      if (!conjunto.has(nombre) && nombre in registro) {
        delete registro[nombre]
        quitados.push(nombre)
      }
    }
  }

  nombresArchivo = conjunto

  // Validacion de lo que cambio: importar ahora deja el error en este mensaje.
  const cambiados = archivos
    .map((ruta) => String(ruta).replace(/\\/g, '/'))
    .filter((ruta) => ruta.startsWith('commands/') && ruta.endsWith('.js'))
    .map((ruta) => ruta.slice('commands/'.length, -'.js'.length))
    .filter((nombre) => conjunto.has(nombre))

  const errores = []
  for (const nombre of cambiados) {
    try {
      const mod = await moduloDe(nombre)
      if (typeof mod.default !== 'function') {
        errores.push(`${nombre}.js: no exporta una funcion por defecto`)
      }
    } catch (err) {
      errores.push(`${nombre}.js: ${err?.message || err}`)
    }
  }

  return { total: nombres.length, nuevos, quitados, probados: cambiados.length, errores }
}
