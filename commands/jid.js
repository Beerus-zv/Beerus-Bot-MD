/**
 * `/jid` — muestra el JID de un chat, usuario, grupo o canal.
 *
 *   /jid              JID del chat donde se escribe
 *   /jid @usuario     JID del mencionado
 *   /jid <numero>     JID del numero
 *   /jid <link>       JID del grupo del link de invitacion
 *
 * Sirve para copiar identificadores sin pelearse con la interfaz.
 */
import { obtenerMetadata, resolverObjetivo, jidUsuario } from '../lib/grupo.js'

export default async ({ sock, jid, msg, args }) => {
  const pedido = (args || []).join(' ').trim()

  // Sin argumento: el chat actual (y el remitente si es grupo)
  if (!pedido) {
    const lineas = [`▸ *Chat:* \`${jid}\``]
    const participante = msg?.key?.participant
    if (participante) lineas.push(`▸ *Tú:* \`${participante}\``)
    if (msg?.key?.participantPn) lineas.push(`▸ *Tu teléfono:* \`${msg.key.participantPn}\``)
    return sock.sendMessage(jid, {
      text: `🆔 *Identificadores*\n\n${lineas.join('\n')}`,
      quoted: msg,
    })
  }

  // Link de grupo: se resuelve con el codigo de invitacion
  const enlace = pedido.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,})/)
  if (enlace) {
    if (typeof sock.groupGetInviteInfo !== 'function') {
      return sock.sendMessage(jid, { text: '❌ Esta sesión no puede leer invitaciones.', quoted: msg })
    }
    try {
      const info = await sock.groupGetInviteInfo(enlace[1])
      return sock.sendMessage(jid, {
        text:
          `🆔 *Grupo del enlace*\n\n` +
          `▸ *Nombre:* ${info?.subject || '(sin nombre)'}\n` +
          `▸ *JID:* \`${info?.id || 'desconocido'}\`\n` +
          `▸ *Miembros:* ${info?.size ?? '?'}`,
        quoted: msg,
      })
    } catch (err) {
      return sock.sendMessage(jid, {
        text: `❌ No pude leer ese enlace: ${err.message}`,
        quoted: msg,
      })
    }
  }

  // Mencion o numero
  let metadata = null
  if (jid.endsWith('@g.us')) {
    metadata = await obtenerMetadata(sock, jid).catch(() => null)
  }

  const objetivo = metadata ? resolverObjetivo(metadata, msg, args) : null
  if (objetivo?.participante) {
    const p = objetivo.participante
    const lineas = [
      `▸ *Nombre:* ${p.name || p.notify || '(sin nombre)'}`,
      `▸ *JID:* \`${p.id}\``,
    ]
    if (p.phoneNumber) lineas.push(`▸ *Teléfono:* \`${p.phoneNumber}\``)
    if (p.lid) lineas.push(`▸ *LID:* \`${p.lid}\``)
    if (p.admin) lineas.push(`▸ *Rol:* ${p.admin}`)
    return sock.sendMessage(jid, {
      text: `🆔 *Identificadores*\n\n${lineas.join('\n')}`,
      quoted: msg,
      mentions: [jidUsuario(p.id)],
    })
  }

  const soloDigitos = pedido.replace(/[^\d]/g, '')
  if (soloDigitos.length >= 6) {
    return sock.sendMessage(jid, {
      text: `🆔 *JID del número*\n\n▸ \`${soloDigitos}@s.whatsapp.net\``,
      quoted: msg,
    })
  }

  return sock.sendMessage(jid, {
    text:
      '🆔 *Uso*\n\n' +
      '• `/jid` — identificadores del chat\n' +
      '• `/jid @usuario` — identificadores del mencionado\n' +
      '• `/jid 573001234567` — JID de un número\n' +
      '• `/jid <link de grupo>` — JID del grupo',
    quoted: msg,
  })
}
