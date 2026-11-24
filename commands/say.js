/**
 * `/say <texto>` — repite un texto con la voz del bot.
 *
 * Sin argumentos toma el texto del mensaje citado, así que sirve para
 * "reenviar" una frase sin la cita del original.
 */
import { obtenerCitado } from '../lib/multimedia.js'

const MAXIMO = 3000

/** Saca el texto de cualquier contenido de mensaje de WhatsApp */
function textoDe(contenido) {
  if (!contenido) return ''
  return (
    contenido.conversation ||
    contenido.extendedTextMessage?.text ||
    contenido.imageMessage?.caption ||
    contenido.videoMessage?.caption ||
    contenido.documentMessage?.caption ||
    ''
  )
}

export default async ({ sock, jid, msg, args }) => {
  let texto = (args || []).join(' ').trim()

  if (!texto) {
    texto = textoDe(obtenerCitado(msg)).trim()
  }

  if (!texto) {
    return sock.sendMessage(jid, {
      text: '🗣️ Uso: `/say <texto>` o responde a un mensaje con `/say`.',
      quoted: msg,
    })
  }

  if (texto.length > MAXIMO) {
    return sock.sendMessage(jid, {
      text: `❌ El texto no puede pasar de ${MAXIMO} caracteres.`,
      quoted: msg,
    })
  }

  return sock.sendMessage(jid, { text })
}
