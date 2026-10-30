import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const AYUDA =
  '🗣️ *Texto a voz*\n\n' +
  '*Uso:* `/voz <texto> [idioma]`\n\n' +
  '*Ejemplos:*\n' +
  '• `/voz Hola mortal, Beerus aqui` (español)\n' +
  '• `/voz Hello world en` (inglés)\n\n' +
  '_Idioma por defecto: es._'

export default async ({ sock, jid, msg, args }) => {
  if (!args?.length) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  let idioma = 'es'
  const idiomas = /^(es|en|pt|fr|de|it|ja|ko|zh|ru|ar|hi|nl|tr|sv|id|th|vi|ro|el|cs|hu|fi|da|no|uk|he|bn|ta|ms|fa|ur|sw|ca|gl|eu)$/i
  const ultimo = args[args.length - 1]
  if (args.length > 1 && idiomas.test(ultimo)) {
    idioma = ultimo.toLowerCase()
    args = args.slice(0, -1)
  }

  const texto = args.join(' ').trim()
  if (!texto) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, { text: `🎤 Generando la voz (${idioma})...`, quoted: msg })

  try {
    // node-gtts arrastra varias dependencias (~1s de carga): se importa solo
    // cuando alguien pide audio, no en el arranque del bot.
    const { default: gtts } = await import('node-gtts')
    const tts = gtts(idioma)
    const archivo = join(process.cwd(), 'tmp', `${Date.now()}.mp3`)
    await new Promise((resolve, reject) => {
      tts.save(archivo, texto, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    const audio = readFileSync(archivo)
    await sock.sendMessage(jid, {
      audio,
      mimetype: 'audio/mp4',
      ptt: false,
      quoted: msg,
    })
    unlinkSync(archivo)
  } catch (err) {
    console.error('Error generando la voz:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo generar el audio (posible límite de texto o servicio). Intentá con una frase corta.',
      quoted: msg,
    })
  }
}
