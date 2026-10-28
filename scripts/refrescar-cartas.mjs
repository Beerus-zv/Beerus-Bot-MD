/**
 * Refresca las cartas del gacha con retratos de alta calidad.
 *
 * Recorre el catalogo y, para cada personaje con imagen vieja/miniatura o
 * carta generica, busca un retrato grande (Fandom o busqueda de imagenes),
 * lo guarda en data/personajes y actualiza la URL de la base de datos.
 *
 * Uso:
 *   node scripts/refrescar-cartas.mjs                 # todo lo que necesite mejora
 *   node scripts/refrescar-cartas.mjs --limite=50     # solo 50 personajes
 *   node scripts/refrescar-cartas.mjs --forzar        # rehacer aunque ya este bien
 *   node scripts/refrescar-cartas.mjs --dry           # ver que haria, sin guardar
 *   node scripts/refrescar-cartas.mjs --pausa=1500    # ms entre personajes
 *
 * Es reanudable: al volver a ejecutarlo se saltan los que ya tienen
 * un retrato de 500 px o mas.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { db, listarPersonajesGacha, setImagenPersonaje } from '../database/db.js'
import { buscarRetrato, retratoAceptable } from '../lib/retratos.js'
import { rutaImagenPersonaje, rutaCartaPersonaje, esCartaGenerada } from '../lib/imagenes.js'

const args = process.argv.slice(2)
const opcion = (nombre, porDefecto = null) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  return encontrado ? encontrado.split('=').slice(1).join('=') : porDefecto
}
const bandera = (nombre) => args.includes(`--${nombre}`)

const LIMITE = Number(opcion('limite', 0)) || 0
const PAUSA = Math.max(0, Number(opcion('pausa', 900)) || 0)
const FORZAR = bandera('forzar')
const DRY = bandera('dry')

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Medidas de la imagen cacheada (0x0 si no existe o es una carta generica) */
async function medidasCache(archivo) {
  try {
    if (!fs.existsSync(archivo)) return { ancho: 0, alto: 0 }
    const buffer = fs.readFileSync(archivo)
    if (await esCartaGenerada(buffer)) return { ancho: 0, alto: 0 }
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    return { ancho: Number(meta.width) || 0, alto: Number(meta.height) || 0 }
  } catch {
    return { ancho: 0, alto: 0 }
  }
}

/** True si el personaje necesita un retrato mejor */
async function necesitaMejora(personaje) {
  if (FORZAR) return true
  if (!personaje.imagen) return true
  const archivo = rutaImagenPersonaje(personaje)
  if (!archivo || !fs.existsSync(archivo)) return true
  const { ancho, alto } = await medidasCache(archivo)
  return !retratoAceptable(ancho, alto)
}

async function main() {
  const todos = listarPersonajesGacha()
  const pendientes = []
  for (const personaje of todos) {
    if (await necesitaMejora(personaje)) pendientes.push(personaje)
  }

  const lista = LIMITE > 0 ? pendientes.slice(0, LIMITE) : pendientes
  console.log(
    `[cartas] ${todos.length} personajes, ${pendientes.length} por mejorar` +
      (LIMITE ? ` (se procesan ${lista.length})` : '') +
      (DRY ? ' [dry-run]' : '')
  )

  let ok = 0
  let fallos = 0
  let saltados = 0
  const inicio = Date.now()

  for (let i = 0; i < lista.length; i++) {
    const personaje = lista[i]
    const etiqueta = `(${i + 1}/${lista.length}) ${personaje.nombre} · ${personaje.anime}`

    let retrato = null
    try {
      retrato = await buscarRetrato(personaje.nombre, personaje.anime)
    } catch (err) {
      console.error(`[cartas] ${etiqueta}: ${err.message}`)
    }

    if (!retrato) {
      fallos++
      console.log(`✘ ${etiqueta}`)
      await esperar(PAUSA)
      continue
    }

    const meta = await sharp(retrato.buffer, { failOn: 'none' }).metadata()
    if (!retratoAceptable(meta.width, meta.height)) {
      saltados++
      console.log(`· ${etiqueta}: retrato pequeno (${meta.width}x${meta.height}), se deja el actual`)
      await esperar(PAUSA)
      continue
    }

    if (!DRY) {
      const destino = rutaImagenPersonaje(personaje)
      if (destino) {
        fs.mkdirSync(path.dirname(destino), { recursive: true })
        fs.writeFileSync(destino, retrato.buffer)
      }
      // La carta generica ya no hace falta
      const carta = rutaCartaPersonaje(personaje)
      try {
        if (carta && fs.existsSync(carta)) fs.rmSync(carta, { force: true })
      } catch {
        // sin permisos: se ignora
      }
      try {
        setImagenPersonaje(personaje.id, retrato.url)
      } catch (err) {
        console.error(`[cartas] no se pudo guardar la URL de ${personaje.nombre}:`, err.message)
      }
    }

    ok++
    console.log(`✔ ${etiqueta} -> ${retrato.fuente} ${meta.width}x${meta.height}`)

    if (i < lista.length - 1) await esperar(PAUSA)
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1)
  console.log(`\n[cartas] listo en ${minutos} min: ${ok} mejoradas, ${fallos} sin retrato, ${saltados} descartadas`)
  if (fallos) console.log('[cartas] vuelve a ejecutarlo mas tarde: las que fallaron siguen pendientes')

  // node:sqlite mantiene el archivo abierto: se cierra para poder copiarlo
  try {
    db.close()
  } catch {
    // ya cerrado
  }
}

main().catch((err) => {
  console.error('[cartas] error fatal:', err)
  process.exit(1)
})
