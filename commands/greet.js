import { SALUDO, FIRMA, TEMA } from '../lib/tema.js'

export default async ({ sock, jid, msg }) => {
  await sock.sendMessage(jid, {
    text: `${SALUDO}\n\n${FIRMA}\n\n👑 _${TEMA.titulo}_`,
    quoted: msg,
  })
}

