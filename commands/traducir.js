import { traducir } from '../lib/internet.js'
import { log } from '../lib/logger.js'

const AYUDA = `🌍 *Traducir*

*Uso:* \`/traducir <texto> [idioma]\`

_Ejemplos:_ \`/traducir hello\` · \`/traducir hola en\`

_Traduce al español por defecto. Idiomas: en, es, fr, de, it, pt, ja, ru..._`

export default async ({ sock, jid, msg, args }) => {
  const argumentos = args || []
  const destino = argumentos[argumentos.length - 1]?.toLowerCase()

  const esIdioma = destino && /^(en|es|fr|de|it|pt|ja|ru|zh|ko|ar|nl|tr|pl)$/.test(destino)
  const texto = (esIdioma ? argumentos.slice(0, -1) : argumentos).join(' ').trim()
  const idioma = esIdioma ? destino : 'es'

  if (!texto) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, {
    text: `🌍 Traduciendo...`,
    quoted: msg,
  })

  try {
    const resultado = await traducir(texto, idioma)

    await sock.sendMessage(jid, {
      text:
        `🌍 *Traduccion*\n\n` +
        `📝 Original: ${texto}\n` +
        `🔁 Traducido: *${resultado.texto}*\n` +
        `_(idioma detectado: ${resultado.idioma} → ${idioma})_`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error traduciendo', err)
    await sock.sendMessage(jid, {
      text: `💥 *No pude traducir eso.*\n_${err.message}_`,
      quoted: msg,
    })
  }
}
