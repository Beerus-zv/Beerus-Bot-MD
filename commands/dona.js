/**
 * .dona — administracion de donantes del bot (solo owner).
 *
 *   .dona add @user <1|2>   1 USD = x2 xp + x2 oro · 2 USD = x3 ambos
 *   .dona del @user         quita el beneficio del donante
 *   .dona list              lista de donantes
 *
 * Ademas de los multiplicadores, cada donante entra automaticamente al
 * club VIP.
 */
import { db, registrarDonor, quitarDonor, listarDonores, nivelDonor, obtenerUsuario } from '../database/db.js'
import { esOwnerMsg, lidParaPN } from '../lib/owner.js'
import { CONTACTO } from '../config.js'

const LIMITE = [1, 2]

/** Info de contacto para donantes (se muestra en .dona sin argumentos) */
const CONTACTO_DONANTES =
  `💸 *Formato de donación*\n` +
  `• \$1 USD — *x2 oro y x2 xp* + VIP 💖\n` +
  `• \$2 USD — *x3 oro y x3 xp* + VIP 💖\n\n` +
  `🌙 *PayPal* (recibe donaciones):\n${CONTACTO.paypal}\n` +
  (CONTACTO.paypalLink ? `🔗 ${CONTACTO.paypalLink}\n` : '') +
  `\n📸 *Instagram* (contacto de donantes):\n@${CONTACTO.instagram}\n\n` +
  `_Al donar, envía el comprobante para registrarte._`

const AYUDA_DONA =
  '❓ *Uso de .dona*\n' +
  '`.dona add @usuario 1` — $1 USD → x2 oro y xp\n' +
  '`.dona add @usuario 2` — $2 USD → x3 oro y xp\n' +
  '`.dona del @usuario` — quita el beneficio\n' +
  '`.dona list` — lista de donantes'

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  if (!esOwnerMsg({ sock, msg, sender })) {
    // Para todos los demas: contacto y condiciones de donacion
    return await sock.sendMessage(jid, { text: CONTACTO_DONANTES, quoted: msg })
  }

  const accion = String(args[0] || 'list').toLowerCase()

  if (accion === 'list') {
    const filas = listarDonores()
    if (!filas.length) {
      return await sock.sendMessage(jid, { text: '🫙 Aún no hay donantes registrados.', quoted: msg })
    }
    const lineas = filas.map((d) => {
      const nivel = d.nivel >= 2 ? 'x3 oro y xp (2 USD)' : 'x2 oro y xp (1 USD)'
      const nombre = d.nombre || d.jid.split('@')[0]
      return `• *${nombre}* — ${nivel} · donado: $${Math.round(Number(d.donado) * 100) / 100} USD`
    })
    return await sock.sendMessage(jid, { text: `💖 *Donantes del bot*\n\n${lineas.join('\n')}`, quoted: msg })
  }

  // usuario objetivo: lo intentamos resolver del mensaje citado/mencion con lo que llève en args
  const objetivo = args[1] ? args[1].replace('@', '').replace(/[^\d]/g, '') : ''
  const destino = objetivo ? `${objetivo}@s.whatsapp.net` : null

  if (accion === 'del' || accion === 'remove' || accion === 'quitar') {    if (!destino) return await sock.sendMessage(jid, { text: '❓ Uso: `.dona del @usuario`', quoted: msg })
    const quitado = quitarDonor(destino)
    return await sock.sendMessage(jid, {
      text: quitado ? `💔 Beneficio de donante quitado a *${objetivo}*.` : `⚠️ *${objetivo}* no era donante.`,
      quoted: msg,
    })
  }

  if (accion === 'add' || accion === 'registro' || accion === 'registrar') {
    const nivel = Number(args[2])
    if (!destino || !LIMITE.includes(nivel)) {
      return await sock.sendMessage(jid, {
        text: '❓ Uso:\n`.dona add @usuario 1` — $1 USD → *x2 oro y xp*\n`.dona add @usuario 2` — $2 USD → *x3 oro y xp*',
        quoted: msg,
      })
    }
    const donado = nivel >= 2 ? 2 : 1
    registrarDonor(destino, nivel, donado)
    // El beneficio tambien lo resolvemos para su JID LID del grupo (si hay mapeo)
    const lid = lidParaPN(objetivo)
    if (lid && lid !== objetivo) registrarDonor(`${lid}@lid`, nivel, 0)
    // El donante entra automaticamente al club VIP
    db.prepare(`INSERT INTO vip (jid, rango) VALUES (?, 'vip') ON CONFLICT(jid) DO NOTHING`).run(destino)
    if (lid && lid !== objetivo) {
      db.prepare(`INSERT INTO vip (jid, rango) VALUES (?, 'vip') ON CONFLICT(jid) DO NOTHING`).run(`${lid}@lid`)
    }
    db.prepare(`INSERT INTO vip_log (jid, accion, razon) VALUES (?, 'add', 'Donante registrado')`).run(destino)
    const impacto = nivel >= 2 ? 'x3 oro y x3 xp' : 'x2 oro y x2 xp'
    const nombre = obtenerUsuario(destino)?.nombre || `+${objetivo}`
    return await sock.sendMessage(jid, {
      text: `💖 *${nombre}* ahora es donante VIP\nBeneficio: *${impacto}*\n\n¡Gracias por apoyar al bot! 🙏`,
      quoted: msg,
    })
  }

  return await sock.sendMessage(jid, {
    text: AYUDA_DONA,
    quoted: msg,
  })
}
