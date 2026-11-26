/**
 * Reinicio en caliente.
 *
 * Node no puede descargar los modulos que ya importo, asi que un cambio en
 * `index.js`, `lib/` o `database/` no se aplica sin un proceso nuevo. Esto
 * lanza ese proceso sin soltar la consola: un lanzador aparte espera a que el
 * proceso actual muera (y con eso libere `data/beerus.lock`) y recien ahi
 * arranca el bot con el codigo nuevo.
 *
 * El lanzador no toma el bloqueo de instancia y no abre sockets: solo espera y
 * hace `spawn`. Si el padre no muere en el plazo, se retira sin arrancar nada,
 * para no dejar dos copias peleando por la misma sesion.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Programa el reinicio del bot.
 *
 * @param {{ entrada?: string, esperaMs?: number }} [opciones]
 * @returns {number} pid del lanzador
 */
export function relanzarEnCaliente({ entrada = 'index.js', esperaMs = 1500 } = {}) {
  const lanzador = path.join(RAIZ, 'lib', 'relanzar-hijo.js')
  const destino = path.isAbsolute(entrada) ? entrada : path.join(RAIZ, entrada)

  const hijo = spawn(
    process.execPath,
    [...process.execArgv, lanzador, String(process.pid), String(esperaMs), destino],
    {
      cwd: RAIZ,
      // Grupo de proceso propio: si el padre muere, el lanzador no se va con
      // la señal que el panel o la terminal mandan al proceso que sale.
      detached: true,
      stdio: 'inherit',
      env: { ...process.env, BEERUS_REINICIO: '1' },
    }
  )

  hijo.unref()
  return hijo.pid ?? 0
}
