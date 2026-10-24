/**
 * Encuesta nativa de WhatsApp (inspirado en el plugin 'poll' de MEGA-MD).
 * Uso: /encuesta Pregunta | Opcion 1 | Opcion 2 | ...
 */
export default async ({ sock, jid, msg, args }) => {
  const texto = (args || []).join(' ')
  const partes = texto
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)

  if (partes.length < 3) {
    await sock.sendMessage(jid, {
      text:
        '📊 *Crear encuesta*\n\n' +
        '*Uso:* `/encuesta Pregunta | Opcion 1 | Opcion 2`\n\n' +
        '*Ejemplos:*\n' +
        '• `/encuesta Color favorito | Azul | Rojo | Verde`\n' +
        '• `/encuesta Jugar hoy | Si | No | Despues`\n\n' +
        '_Minimo 2 opciones, maximo 12._',
      quoted: msg,
    })
    return
  }

  const pregunta = partes[0]
  const opciones = partes.slice(1)

  if (opciones.length > 12) {
    await sock.sendMessage(jid, {
      text: '❌ Maximo *12 opciones*. Simplifica un poco tus opciones.',
      quoted: msg,
    })
    return
  }

  try {
    await sock.sendMessage(jid, {
      poll: {
        name: pregunta,
        values: opciones,
        selectableCount: 1,
      },
    })
  } catch (err) {
    console.error('Error creando la encuesta:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo crear la encuesta. Intenta de nuevo.',
      quoted: msg,
    })
  }
}
