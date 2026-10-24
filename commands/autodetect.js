/**
 * /autodetect — Activa/desactiva autodetect (bienvenidas, imagen de grupo, etc.)
 */
import { modoChat, configurarModo } from '../database/db.js'
import { esGrupo, esAdmin } from '../lib/grupo.js'

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  const accion = ((args || [])[0] || '').toLowerCase()
  if (accion === 'on' || accion === 'activar') {
    configurarModo(jid, 'detect', 1)
    await sock.sendMessage(jid, { text: '🐱 *Autodetect activado* — detectará cambios de imagen, bienvenida, despedida.', quoted: msg })
  } else if (accion === 'off' || accion === 'desactivar') {
    configurarModo(jid, 'detect', 0)
    await sock.sendMessage(jid, { text: '🐱 *Autodetect apagado*.', quoted: msg })
  } else {
    const activo = modoChat(jid, 'detect') ? 'ON' : 'OFF'
    await sock.sendMessage(jid, { text: `🐱 *Autodetect:* ${activo}\n\n• \`/autodetect on\` → activa\n• \`/autodetect off\` → desactiva`, quoted: msg })
  }
}
