/**
 * `/lid` — muestra el LID (identificador local) de un usuario.
 *
 * WhatsApp entrega los remitentes de grupo con un LID cuando la cuenta usa
 * direccionamiento por identidad. Saberlo sirve para depurar permisos, bans y
 * menciones que dependen del JID exacto.
 *
 *   /lid              LID de quien escribe
 *   /lid @usuario     LID del mencionado
 *   /lid <numero>     LID registrado para ese número en la sesión
 */
import { obtenerMetadata, resolverObjetivo, digitosJid } from '../lib/grupo.js'
import { lidParaPN, pnParaLid } from '../lib/owner.js'

/** Devuelve el LID de un JID o número, o null si la sesión no tiene el mapeo */
function lidDe(valor) {
  const texto = String(valor || '')
  if (!texto) return null
  // Ya viene como LID: '1668...:5@lid'
  if (texto.endsWith('@lid')) return texto.split('@')[0].split(':')[0]
  const digitos = digitosJid(texto)
  if (!digitos) return null
  return lidParaPN(digitos)
}

/** Devuelve el teléfono de un LID, o null */
function telefonoDeLid(valor) {
  const texto = String(valor || '')
  if (!texto.endsWith('@lid')) return null
  return pnParaLid(digitosJid(texto))
}

export default async ({ sock, jid, msg, args, sender }) => {
  const pedido = (args || []).join(' ').trim()

  // Sin argumento: el remitente
  if (!pedido) {
    const lid = lidDe(sender) || lidDe(msg?.key?.participant)
    return sock.sendMessage(jid, {
      text: lid
        ? `🪪 *Tu LID:* \`${lid}\`\n\n_El bot te reconoce por este identificador en grupos._`
        : '🪪 No tengo el LID de tu cuenta en esta sesión.\n\n_Prueba_ `/lid @usuario` _o_ `/lid <número>`_._',
      quoted: msg,
    })
  }

  let metadata = null
  if (jid.endsWith('@g.us')) {
    metadata = await obtenerMetadata(sock, jid).catch(() => null)
  }

  const objetivo = metadata ? resolverObjetivo(metadata, msg, args) : null
  if (objetivo?.participante) {
    const p = objetivo.participante
    const lid = lidDe(p.id) || lidDe(p.lid) || (p.lid ? digitosJid(p.lid) : null)
    const telefono = p.phoneNumber ? digitosJid(p.phoneNumber) : telefonoDeLid(p.lid)
    return sock.sendMessage(jid, {
      text:
        `🪪 *LID de ${p.name || p.notify || 'el usuario'}*\n\n` +
        (lid ? `▸ *LID:* \`${lid}\`\n` : '▸ *LID:* no registrado en esta sesión\n') +
        (telefono ? `▸ *Teléfono:* \`${telefono}\`\n` : '') +
        `▸ *JID:* \`${p.id}\``,
      quoted: msg,
    })
  }

  // Número pelado
  const digitos = pedido.replace(/[^\d]/g, '')
  if (digitos.length >= 6) {
    const lid = lidParaPN(digitos)
    return sock.sendMessage(jid, {
      text: lid
        ? '🪪 *LID de ' + digitos + ':* `' + lid + '`'
        : '🪪 No hay mapeo LID para `' + digitos + '` en esta sesión.\n\n_El mapeo aparece cuando esa cuenta escribe en un grupo donde está el bot._',
      quoted: msg,
    })
  }

  return sock.sendMessage(jid, {
    text:
      '🪪 *Uso*\n\n' +
      '• `/lid` — tu LID\n' +
      '• `/lid @usuario` — LID del mencionado\n' +
      '• `/lid 573001234567` — LID del número',
    quoted: msg,
  })
}
