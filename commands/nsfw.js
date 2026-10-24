/**
 * Admin de la seccion NSFW (estilo GataBot-MD):
 *
 *   /nsfw          estado y comandos del modo
 *   /nsfw on       lo activa en el chat (solo admins, en grupos)
 *   /nsfw off      lo desactiva (solo admins, en grupos)
 *
 * El modo esta DESACTIVADO por defecto en todos los chats.
 * Con el modo activo: /rule34 <tags> y /hentai.
 */
import { esGrupo, obtenerMetadata, esAdmin } from '../lib/grupo.js'
import { nsfwActivo, configurarNSFW } from '../database/db.js'

const ESTADO = (chat, activo) =>
  `🔞 *Modo NSFW — ${activo ? 'ACTIVADO' : 'desactivado'}*\n\n` +
  (activo
    ? 'Los comandos adultos ya responden en este chat:\n' +
      '• `/rule34 <tags>` — busca por tags\n' +
      '• `/hentai` — una imagen al azar\n'
    : 'Está apagado por defecto. Con él activo responden:\n' +
      '• `/rule34 <tags>` — busca por tags\n' +
      '• `/hentai` — una imagen al azar\n\n' +
      '_Actívalo con_ `/nsfw on`_\n') +
  (esGrupo(chat) ? '' : '\n_Este chat no es un grupo: el cambio lo aplica cualquier participante._')

export default async ({ sock, jid, msg, args, sender }) => {
  const sub = String(args[0] || '').toLowerCase()

  // ── Estado ──
  if (!sub) {
    await sock.sendMessage(jid, { text: ESTADO(jid, nsfwActivo(jid)), quoted: msg })
    return
  }

  const quiereActivar = sub === 'on' || sub === 'activar' || sub === 'activa'
  const quiereApagar = sub === 'off' || sub === 'apagar' || sub === 'apaga'

  if (!quiereActivar && !quiereApagar) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/nsfw on` o `/nsfw off` (admins del grupo)',
      quoted: msg,
    })
    return
  }

  // ── Permisos: en grupos solo los admins tocan el interruptor ──
  if (esGrupo(jid)) {
    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }

    const quien = sender || msg.key.participant
    if (!metadata || !esAdmin(metadata, quien)) {
      await sock.sendMessage(jid, {
        text: '🔒 Solo los admins pueden activar o apagar el modo NSFW.',
        quoted: msg,
      })
      return
    }
  }

  configurarNSFW(jid, quiereActivar)

  await sock.sendMessage(jid, {
    text: quiereActivar
      ? '🔞 *Modo NSFW ACTIVADO* para este chat.\n`/rule34 <tags>` y `/hentai` ya responden. Que la prudencia no arrase: aquí mandan los instintos 💢'
      : '✅ *Modo NSFW desactivado* para este chat. El sótano queda bajo llave.',
    quoted: msg,
  })
}
