/**
 * Lanzador del bot (`npm start`).
 *
 * Antes de cargar el bot comprueba si hay una version nueva y la descarga,
 * asi no hace falta reiniciar: index.js se carga ya con el codigo actualizado.
 *
 * Saltar la comprobacion:
 *   node iniciar.js --no-update      (o AUTO_ACTUALIZAR = false en config.js)
 * Iniciar sin actualizador (desarrollo):
 *   npm run dev   /   node index.js
 */
/**
 * Arranque rapido: cache de bytecode de V8.
 * Tiene que ir primero: la cache solo cubre los modulos que se compilan despues.
 */
import './lib/arranque.js'

// Los parches de vinculacion de Baileys tienen que estar en disco antes de que
// `index.js` cargue el paquete. El postinstall los aplica, pero un despliegue
// que solo hace git pull y reinicia no pasa por ahi.
import './scripts/parche-baileys.mjs'

import { AUTO_ACTUALIZAR, RAMA_ACTUALIZACION } from './config.js'
import { actualizarBot } from './lib/actualizador.js'

const forzar = process.argv.includes('--update')
const omitir = process.argv.includes('--no-update') || process.env.BEERUS_NO_UPDATE === '1'

if ((AUTO_ACTUALIZAR || forzar) && !omitir) {
  try {
    actualizarBot({ rama: RAMA_ACTUALIZACION, forzar })
  } catch (err) {
    // El actualizador nunca debe impedir que el bot arranque
    console.warn('Error inesperado en el actualizador:', err?.message || err)
  }
}

await import('./index.js')
