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

/** Importa (o reutiliza) el modulo de un comando por su nombre de archivo */
function moduloDe(nombre) {
  let promesa = MODULOS.get(nombre)
  if (!promesa) {
    promesa = import(pathToFileURL(join(COMMANDS_DIR, `${nombre}.js`)).href)
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
    log.aviso(`Comandos no cargados (${errores.length}):`)
    for (const e of errores) log.aviso(`  · ${e}`)
  }

  return comandos
}

/** Compatibilidad con el cargador antiguo (Map nombre -> comando). */
export async function loadCommands(opciones) {
  return new Map(Object.entries(await cargarComandos(opciones)))
}
