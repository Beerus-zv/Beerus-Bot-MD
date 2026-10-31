/**
 * Arranque rapido: cache de bytecode de V8.
 *
 * Node compila cada modulo en cada arranque. Con ~210 archivos propios mas
 * Baileys, ese trabajo se nota, y en Windows se multiplica porque el
 * antivirus vuelve a leer todos los archivos en frio.
 *
 * `enableCompileCache()` guarda el bytecode compilado en disco (data/v8-cache/)
 * y lo reutiliza en el arranque siguiente, saltandose la compilacion. La
 * primera vez no cambia nada; a partir de la segunda se recorta casi todo.
 *
 * Este modulo se importa ANTES que cualquier otro en index.js e iniciar.js:
 * la cache solo aplica a los modulos que se compilan despues de activarla.
 *
 * Node 22.8+ trae la API. En versiones anteriores el archivo no hace nada y el
 * bot arranca igual, solo sin cache.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { enableCompileCache } from 'node:module'

const DIR_CACHE = join(process.cwd(), 'data', 'v8-cache')

try {
  if (typeof enableCompileCache === 'function') {
    mkdirSync(DIR_CACHE, { recursive: true })
    enableCompileCache(DIR_CACHE)
  }
} catch {
  // La cache es una mejora, nunca un requisito: sin ella el bot arranca igual.
}
