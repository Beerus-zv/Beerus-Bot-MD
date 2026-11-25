import { alertasAutoActivas } from '../database/db.js'
import { tokenMencion, jidUsuario, mencionarEnTexto } from './grupo.js'
import { log } from './logger.js'

/**
 * Envia un aviso automatico (auto-evento) a un grupo si estan activados.
 * @returns {Promise<boolean>} true si se envio
 */
export async function enviarAlertaAuto(sock, jid, texto, mentions = []) {
  if (!jid?.endsWith('@g.us')) return false
  try {
    if (!alertasAutoActivas(jid)) return false
  } catch {
    return false
  }
  try {
    await sock.sendMessage(jid, {
      text: `🚨 *AUTO-EVENTO*\n\n${texto}`,
      mentions: mentions.length ? mentions : undefined,
    })
    return true
  } catch (err) {
    log.error('No se pudo enviar el auto-evento', err)
    return false
  }
}

export async function alertaPromocion(sock, jid, targetJid, participantes = []) {
  const token = tokenMencion(targetJid)
  const texto = `📈 *Promoción* — ${token} acaba de unirse al grupo.`
  const mentions = mencionarEnTexto(texto, [targetJid])
  return enviarAlertaAuto(sock, jid, texto, mentions ? [targetJid] : [])
}

export async function alertaDespedida(sock, jid, targetJid) {
  const token = tokenMencion(targetJid)
  const texto = `📉 *Baja* — ${token} ha abandonado el grupo.`
  const mentions = mencionarEnTexto(texto, [targetJid])
  return enviarAlertaAuto(sock, jid, texto, mentions ? [targetJid] : [])
}

export async function alertaAdmin(sock, jid, targetJid, accion = 'promote') {
  const token = tokenMencion(targetJid)
  const texto =
    accion === 'promote'
      ? `👑 *Promoción a admin* — ${token} ahora es administrador.`
      : `⬇️ *Degradación* — ${token} dejó de ser administrador.`
  const mentions = mencionarEnTexto(texto, [targetJid])
  return enviarAlertaAuto(sock, jid, texto, mentions ? [targetJid] : [])
}