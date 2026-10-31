/**
 * Logger que se le pasa a Baileys.
 *
 * Con `LOG_LEVEL = 'silent'` (el valor por defecto) pino solo hace de
 * sumidero: no imprime nada. Importarlo cuesta ~350 ms en un arranque en
 * frio, asi que en ese caso se usa un logger vacio con la misma forma.
 *
 * Con cualquier otro nivel se carga pino de verdad y se comporta como antes.
 */

const METODOS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

function noHacer() {}

/** Logger mudo: acepta todo, imprime nada. `child()` devuelve otro igual. */
function silencioso() {
  const logger = { level: 'silent' }
  for (const metodo of METODOS) logger[metodo] = noHacer
  logger.child = () => silencioso()
  return logger
}

/**
 * Crea el logger de Baileys segun el nivel configurado.
 *
 * @param {string} nivel 'silent' | 'warn' | 'info' | 'debug'
 * @returns {Promise<object>}
 */
export async function crearLogger(nivel) {
  if (nivel === 'silent') return silencioso()
  const { default: pino } = await import('pino')
  return pino({ level: nivel })
}
