/**
 * Crea un comando de descarga.
 *
 * Todos los comandos de descarga (descargar, tiktok, facebook...) comparten
 * la misma logica: detectan la plataforma, Bajan el contenido y lo envian.
 *
 * @param {object} opciones
 * @param {string} opciones.titulo nombre bonito del comando
 * @param {string[]} opciones.plataformas plataformas admitidas (o ['todas'])
 * @param {string} opciones.ejemplo ejemplo de uso
 * @param {string} opciones.descripcion texto corto para el menu
 * @param {number} [opciones.maxMB] limite de tamano
 */
import { descargarContenido, enviarDescarga, detectarPlataforma, esUrl, PLATAFORMAS } from './descargas.js'
import { log } from './logger.js'

export function crearComandoDescarga({
  titulo,
  plataformas,
  ejemplo,
  descripcion,
  maxMB = 25,
}) {
  const lista = plataformas.join(', ')

  const AYUDA = `${titulo}

*Uso:* \`${ejemplo}\`

_Ejemplo:_ \`${ejemplo}\`

_Plataformas: ${lista}_

_Descarga el contenido y lo envia directo al chat._`

  return async ({ sock, jid, msg, args }) => {
    const url = (args || []).join(' ').trim()

    if (!url) {
      await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
      return
    }

    if (!esUrl(url)) {
      await sock.sendMessage(jid, {
        text: `❓ Necesito un enlace completo.\n_Ejemplo: ${ejemplo}_`,
        quoted: msg,
      })
      return
    }

    const plataforma = detectarPlataforma(url)

    if (plataforma === 'desconocido') {
      await sock.sendMessage(jid, {
        text: `🤔 No recognize esa plataforma.\n\n_Soportadas:_ ${Object.values(PLATAFORMAS).join(', ')}`,
        quoted: msg,
      })
      return
    }

    if (!plataformas.includes('todas') && !plataformas.includes(plataforma)) {
      await sock.sendMessage(jid, {
        text: `⚠️ Ese enlace es de *${PLATAFORMAS[plataforma] || plataforma}*.\n_Este comando solo acepta:_ ${lista}`,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text: `⏳ Descargando de *${PLATAFORMAS[plataforma] || plataforma}*...`,
      quoted: msg,
    })

    try {
      const resultado = await descargarContenido(url, { maxMB })
      const tipo = await enviarDescarga(sock, jid, msg, resultado)
      log.sistema(`descargas · ${plataforma} -> ${tipo} (${(resultado.bytes / 1048576).toFixed(1)} MB)`)
    } catch (err) {
      log.error('No se pudo descargar el contenido', err)
      await sock.sendMessage(jid, {
        text: `💥 *No se pudo descargar.*\n_${err.message}_\n\n_El enlace puede estar caido, ser privado o no estar soportado._`,
        quoted: msg,
      })
    }
  }
}
