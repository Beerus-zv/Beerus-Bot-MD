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
import { AUTO_ACTUALIZAR, RAMA_ACTUALIZACION } from './config.js'
import { actualizarBot } from './lib/actualizador.js'

const omitir = process.argv.includes('--no-update') || process.env.BEERUS_NO_UPDATE === '1'

if (AUTO_ACTUALIZAR && !omitir) {
  try {
    actualizarBot({ rama: RAMA_ACTUALIZACION })
  } catch (err) {
    // El actualizador nunca debe impedir que el bot arranque
    console.warn('Error inesperado en el actualizador:', err?.message || err)
  }
}

await import('./index.js')
