/**
 * Bot primario del grupo.
 *
 *   /setprimary             marca este bot como primario del grupo
 *   /setprimary @bot        (o con el JID del bot) marca ese bot
 *   /delprimary             quita el primario
 *   /setprimary             sin argumentos en un grupo ya marcado: muestra estado
 *
 * Con primario fijado, cualquier otro bot del grupo se calla: el primario es
 * el único que responde. Sin primario, responden todos (comportamiento normal).
 */
import { primarioDe, configurarPrimario, quitarPrimario } from '../database/db.js'
import { obtenerMetadata, esAdmin, esGrupo, jidUsuario } from '../lib/grupo.js'
import { esOwnerMsg } from '../lib/owner.js'

const AYUDA =
  '👑 *Bot primario*\n\n' +
  '• `/setprimary` — este bot pasa a ser el primario del grupo\n' +
  '• `/delprimary` — quita el primario\n\n' +
  '_Con primario fijado, los demás bots del grupo no responden._'

export default async ({ sock, jid, msg, args, sender }) => {
  if (!esGrupo(jid)) {
    return sock.sendMessage(jid, { text: '❌ Solo funciona en grupos.', quoted: msg })
  }

  const accion = String(args[0] || '').toLowerCase()
  const yo = sock.user?.id
  const actual = primarioDe(jid)
  const esOwner = esOwnerMsg({ sock, msg, sender })

  // Solo admins del grupo o el owner tocan esto
  let permitido = esOwner
  if (!permitido) {
    const metadata = await obtenerMetadata(sock, jid).catch(() => null)
    permitido = Boolean(metadata && esAdmin(metadata, sender))
  }
  if (!permitido) {
    return sock.sendMessage(jid, {
      text: '⛔ Solo los administradores del grupo (o el owner) cambian el bot primario.',
      quoted: msg,
    })
  }

  if (['del', 'borrar', 'quitar', 'remove'].includes(accion)) {
    if (!actual) {
      return sock.sendMessage(jid, { text: 'ℹ️ Este grupo no tiene bot primario fijado.', quoted: msg })
    }
    quitarPrimario(jid)
    return sock.sendMessage(jid, {
      text: '👑 *Primario eliminado.* Todos los bots del grupo vuelven a responder.',
      quoted: msg,
    })
  }

  if (['estado', 'status', 'info'].includes(accion)) {
    return sock.sendMessage(jid, {
      text: actual
        ? `👑 *Primario actual:* \`${String(actual).split('@')[0]}\`\n\n_Quítalo con_ \`/delprimary\`.`
        : '👑 Este grupo no tiene bot primario.\n\n_Marca uno con_ `/setprimary`.',
      quoted: msg,
    })
  }

  // Marcar: por mencion/argumento o el propio bot
  const mencion = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
  const objetivo = mencion || (args[0] && args[0].includes('@') ? args[0] : null) || yo

  if (!objetivo) {
    return sock.sendMessage(jid, { text: AYUDA, quoted: msg })
  }

  configurarPrimario(jid, objetivo)
  const propio = objetivo === yo
  return sock.sendMessage(jid, {
    text: propio
      ? '👑 *Este bot es ahora el primario del grupo.*\n\n_Los demás bots quedan en silencio._'
      : `👑 *Primario fijado:* \`${String(objetivo).split('@')[0]}\`\n\n_Ese bot responde; los demás quedan en silencio._`,
    quoted: msg,
    mentions: objetivo === yo ? undefined : [jidUsuario(objetivo)],
  })
}
