export default async ({ sock, jid, msg }) => {
  await sock.sendMessage(jid, {
    text: `📢 Para crear un grupo usa /creategroup <nombre>.\n\n*Ejemplo:*\n\`/creategroup Beerus Fans\``,
    quoted: msg,
  })
}

