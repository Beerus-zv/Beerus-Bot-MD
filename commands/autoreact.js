/**
 * Autoreact — reacciones automáticas al azar a los mensajes del grupo.
 *
 *   /autoreact          estado y ajustes
 *   /autoreact on|off   lo activa o lo apaga (solo admins)
 *
 * La lógica de reacción vive en lib/autoreact.js y se dispara desde index.js.
 */
import { modoChat } from '../database/db.js'
import { AUTOREACT_PROBABILIDAD, AUTOREACT_PAUSA_MS } from '../config.js'
import { fabricarModo } from './modos.js'

// Reutiliza el alternador de modos (/bot, /economia...): comprueba que sea admin y guarda el cambio
const alternar = fabricarModo('autoreact')

export default async (ctx) => {
  const { sock, jid, msg, args, esGrupo } = ctx

  if (!esGrupo) {
    await sock.sendMessage(jid, { text: '❓ Solo funciona en grupos.' }, { quoted: msg })
    return
  }

  const sub = String(args?.[0] || '').toLowerCase()
  if (sub === 'on' || sub === 'off') {
    await alternar(ctx)
    return
  }

  const activo = modoChat(jid, 'autoreact')
  await sock.sendMessage(
    jid,
    {
      text:
        `${activo ? '✅ *Autoreact ACTIVO*' : '❌ *Autoreact DESACTIVADO*'}\n\n` +
        `Reacciono con un emoji a ~${Math.round(AUTOREACT_PROBABILIDAD * 100)}% de los mensajes del grupo, ` +
        `como máximo una vez cada ${Math.round(AUTOREACT_PAUSA_MS / 1000)} s.\n\n` +
        `• \`.autoreact on\` → activa (admins)\n` +
        `• \`.autoreact off\` → desactiva (admins)`,
    },
    { quoted: msg }
  )
}
