import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMMANDS_DIR = join(__dirname, '..', 'commands')

// Carga todos los archivos .js de /commands y los registra por nombre y alias
export async function loadCommands() {
  const commands = new Map()
  const files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'))

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(COMMANDS_DIR, file)).href)
      const cmd = mod.default

      if (!cmd?.name || typeof cmd.run !== 'function') {
        console.warn(`⚠️ ${file} ignorado: debe exportar { name, run }`)
        continue
      }

      commands.set(cmd.name, cmd)
      for (const alias of cmd.aliases ?? []) commands.set(alias, cmd)
    } catch (err) {
      console.error(`❌ Error cargando ${file}:`, err)
    }
  }

  return commands
}