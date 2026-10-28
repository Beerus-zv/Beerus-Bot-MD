import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMMANDS_DIR = join(__dirname, '..', 'commands')

/**
 * Carga todos los archivos .js de /commands.
 *
 * Cada comando exporta por defecto una funcion `async (ctx) => {}` y se
 * registra con el nombre de su archivo (commands/ping.js -> `C.ping`).
 * Los alias y subcomandos (conSub) viven en index.js, asi que este modulo
 * solo se ocupa de la carga y de validar el contrato.
 *
 * Un archivo roto no tumba el bot: se avisa por consola y se sigue.
 *
 * @returns {Promise<Record<string, Function>>}
 */
export async function cargarComandos() {
  const comandos = {}
  const errores = []
  const archivos = readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()

  for (const archivo of archivos) {
    const nombre = archivo.slice(0, -3)
    try {
      const mod = await import(pathToFileURL(join(COMMANDS_DIR, archivo)).href)
      if (typeof mod.default !== 'function') {
        errores.push(`${archivo}: no exporta una funcion por defecto`)
        continue
      }
      comandos[nombre] = mod.default
    } catch (err) {
      errores.push(`${archivo}: ${err?.message || err}`)
    }
  }

  if (errores.length) {
    console.warn(`⚠️  Comandos no cargados (${errores.length}):`)
    for (const e of errores) console.warn(`   - ${e}`)
  }

  return comandos
}

/** Compatibilidad con el cargador antiguo (Map nombre -> comando). */
export async function loadCommands() {
  return new Map(Object.entries(await cargarComandos()))
}
