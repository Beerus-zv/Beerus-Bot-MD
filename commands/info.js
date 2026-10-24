import { TEMA, ORNAMENTOS } from '../lib/tema.js'
import { CONTACTO } from '../config.js'

export default async ({ sock, jid, msg }) => {
  const poderes = TEMA.poderes.map((p) => `▸ ${p}`).join('\n')

  await sock.sendMessage(jid, {
    text:
      `👑 *${TEMA.titulo}*\n` +
      `_${TEMA.subtitulo}_\n\n` +
      `${ORNAMENTOS.titulo} *INFORMACION* ${ORNAMENTOS.titulo}\n` +
      `♛ Version › ${TEMA.version}\n` +
      `♛ Desarrollador › ${TEMA.desarrollador}\n` +
      `♛ Moneda › ${TEMA.moneda}\n` +
      `♛ Motor › Baileys (WhatsApp Web)\n\n` +
      `🌙 *¿Apoyar el bot?*\n` +
      `▸ PayPal › ${CONTACTO.paypal}\n` +
      `▸ Instagram › @${CONTACTO.instagram}\n\n` +
      `*Poderes:*\n${poderes}\n\n` +
      `_${TEMA.lema}._`,
    quoted: msg,
  })
}

