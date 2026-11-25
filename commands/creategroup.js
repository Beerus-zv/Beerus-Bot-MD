import { log } from '../lib/logger.js'

export default async ({ sock, jid, msg, args }) => {
  const nombre = args.join(' ').trim()

  if (!nombre) {
    await sock.sendMessage(jid, {
      text: '❓ Indica el nombre del grupo.\n\n*Ejemplo:* `/creategroup Beerus Fans`',
      quoted: msg,
    })
    return
  }

  try {
    const grupo = await sock.groupCreate(nombre, [])

    await sock.sendMessage(jid, {
      text: `✅ Grupo *${nombre}* creado!\n\n*ID:* \`${grupo.id}\`\n\n_Agrega miembros con /add <numero>_`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error creando el grupo', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo crear el grupo.',
      quoted: msg,
    })
  }
}

