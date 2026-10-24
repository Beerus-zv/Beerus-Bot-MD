import { crearNota, listarNotas, eliminarNota } from '../database/db.js'

const AYUDA = `📝 *Notas*

*Uso:*
• \`/notes add <texto>\` - Guardar una nota
• \`/notes list\` - Listar tus notas
• \`/notes del <id>\` - Eliminar una nota`

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const accion = (args[0] || 'list').toLowerCase()

  // Agregar
  if (accion === 'add' || accion === 'new' || accion === '+') {
    const texto = args.slice(1).join(' ').trim()
    if (!texto) {
      await sock.sendMessage(jid, { text: '❓ Escribe el texto de la nota.\n\n' + AYUDA, quoted: msg })
      return
    }

    const id = crearNota(quien, texto, quien)
    await sock.sendMessage(jid, {
      text: `✅ Nota *#${id}* guardada.`,
      quoted: msg,
    })
    return
  }

  // Eliminar
  if (accion === 'del' || accion === 'delete' || accion === 'rm') {
    const id = Number(args[1])
    if (!id) {
      await sock.sendMessage(jid, { text: '❓ Indica el id de la nota.\n\n' + AYUDA, quoted: msg })
      return
    }

    const cambios = eliminarNota(quien, id)
    await sock.sendMessage(jid, {
      text: cambios
        ? `🗑️ Nota *#${id}* eliminada.`
        : `❌ No se encontró la nota *#${id}*.`,
      quoted: msg,
    })
    return
  }

  // Listar
  if (accion === 'list' || accion === 'ls') {
    const notas = listarNotas(quien, 20)

    if (!notas.length) {
      await sock.sendMessage(jid, { text: '📭 Todavía no tienes notas.\n\n' + AYUDA, quoted: msg })
      return
    }

    const lista = notas
      .map((n) => `• *#${n.id}* ${n.texto}\n  _${n.creado_en}_`)
      .join('\n\n')

    await sock.sendMessage(jid, {
      text: `📝 *Tus notas* (${notas.length})\n\n${lista}`,
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
}

