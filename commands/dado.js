/**
 * /dado /dados /dadu — Sticker aleatorio de dado
 */
export default async ({ sock, msg, jid }) => {
  const dados = [
    'https://tinyurl.com/gdd01',
    'https://tinyurl.com/gdd02',
    'https://tinyurl.com/gdd003',
    'https://tinyurl.com/gdd004',
    'https://tinyurl.com/gdd05',
    'https://tinyurl.com/gdd006',
  ]
  const url = dados[Math.floor(Math.random() * dados.length)]
  const fkontak = {
    key: { participants: '0@s.whatsapp.net', remoteJid: 'status@broadcast', fromMe: false, id: 'Halo' },
    message: {
      contactMessage: {
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=${msg.key.participant?.split('@')[0] || msg.key.fromMe ? sock.user?.id?.split('@')[0] || 'Bot' : msg.key.participant?.split('@')[0] || 'Bot'}:${msg.key.participant?.split('@')[0] || msg.key.fromMe ? sock.user?.id?.split('@')[0] || 'Bot' : msg.key.participant?.split('@')[0] || 'Bot'}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
      }
    },
    participant: '0@s.whatsapp.net'
  }
  await sock.sendMessage(jid, {
    text: '🎲 *Tirando tu dado...*\n\n𝙋𝙊𝙍 𝙁𝘼𝙑𝙊𝙍 𝙀𝙎𝙋𝙀𝙍𝙀, 𝙎𝙐 𝘿𝘼𝘿𝙊 𝙎𝙀 𝙀𝙎𝙏𝘼 𝘾𝙍𝙀𝘼𝙉𝘿𝙊\n\nPLEASE WAIT, YOUR DICE IS BEING CREATED',
    quoted: fkontak,
  }, { quoted: msg })
  await sock.sendMessage(jid, { sticker: { url } }, { quoted: msg })
}
