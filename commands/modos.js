/**
 * Modos por chat (`/bot`, `/economia`, `/onlyadmin` y los subs de /gacha):
 *
 *   /modos               estado de todos los modos del chat
 *   /<modo>              estado del modo en este chat
 *   /<modo> on|off       lo activa o lo apaga (solo admins, en grupos)
 *
 *   bot       apagado: el bot ignora todo menos `/bot on`
 *   economia  apagado: /economy, /casino y compania no responden
 *   gacha     apagado: /gacha, /waifu y compania no responden
 *   onlyadmin activo: los comandos responden solo a los admins
 *   autoread  activo: el bot marca como leído cada mensaje que llega
 */
import { esGrupo, obtenerMetadata, esAdmin } from '../lib/grupo.js'
import { modoChat, configurarModo } from '../database/db.js'
import { log } from '../lib/logger.js'

const LEYENDAS = {
  bot: 'el bot',
  economia: 'los comandos de economía',
  gacha: 'los comandos de gacha',
  onlyadmin: 'el modo solo administradores',
  autoreact: 'las reacciones aleatorias a los mensajes',
  autoread: 'la lectura automática de los mensajes',
  rpg: 'los comandos de rol (aventura, mazmorra, caza)',
  juegos: 'los juegos de mesa y apuestas',
  antistatus: 'no ver los estados automáticamente',
  anticall: 'rechazar las llamadas entrantes',
}

const FRASE_OFF = {
  bot: 'Estaré dormido... `/bot on` me despierta.',
  economia: 'El sótano queda bajo llave.',
  gacha: 'El sorteo queda en pausa.',
  onlyadmin: 'Solo los admins podrán usar comandos.',
  autoreact: 'Las reacciones aleatorias se pausan.',
  autoread: 'Los mensajes quedarán sin leer (con su contador).',
  rpg: 'Las aventuras quedan en pausa.',
  juegos: 'Las mesas se levantan.',
  antistatus: 'El bot volverá a marcar los estados como vistos.',
  anticall: 'El bot dejará pasar las llamadas.',
}

/**
 * Fabrica el handler de un modo concreto (/bot, /economia, /onlyadmin).
 * @param {string} modo clave del modo (bot | economia | onlyadmin)
 */
export function fabricarModo(modo) {
  const leyenda = LEYENDAS[modo] ?? modo

  return async ({ sock, jid, msg, args, sender }) => {
    const sub = String(args?.[0] || '').toLowerCase()

    // Estado
    if (!['on', 'off'].includes(sub)) {
      const activo = modoChat(jid, modo)
      await sock.sendMessage(jid, {
        text:
          `⚖️ *${modo.toUpperCase()} está ${activo ? 'ACTIVADO' : 'desactivado'}* en este chat.\n\n` +
          `_Cambia con_ \`/${modo} on\` _o_ \`/${modo} off\` (admins).`,
        quoted: msg,
      })
      return
    }

    // Cambio: solo admins en grupos
    if (esGrupo(jid)) {
      let metadata = null
      try {
        metadata = await obtenerMetadata(sock, jid)
      } catch (err) {
        log.error(`[modo ${modo}] metadata`, err.message)
      }
      if (!metadata || !esAdmin(metadata, sender || msg.key.participant)) {
        await sock.sendMessage(jid, {
          text: '⛔ Solo los *administradores* pueden cambiar este modo.',
          quoted: msg,
        })
        return
      }
    }

    const activar = sub === 'on'
    configurarModo(jid, modo, activar)
    await sock.sendMessage(jid, {
      text:
        activar
          ? `⚡ *${modo.toUpperCase()} activado* ${leyenda ? 'para ' + leyenda : ''}.`
          : `🌙 *${modo.toUpperCase()} desactivado*. ${FRASE_OFF[modo] ?? ''}`.trim(),
      quoted: msg,
    })
  }
}

/** Estado de todos los modos del chat (para el listado de /modos) */
export function textoModos(jid) {
  const filas = Object.keys(LEYENDAS).map((modo) => {
    const activo = modoChat(jid, modo)
    return `▸ \`${modo}\`: ${activo ? '✅ activo' : '❌ apagado'}`
  })
  return `⚖️ *Modos de este chat*\n\n${filas.join('\n')}\n\n_Cambia con_ \`/<modo> on|off\`; el NSFW vive en \`/nsfw on|off\`._`
}

export default async ({ sock, jid, msg }) => {
  await sock.sendMessage(jid, { text: textoModos(jid), quoted: msg })
}
