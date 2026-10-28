export default async ({ sock, jid, msg }) => {
  await sock.sendMessage(jid, {
    text: `👑 *Menú VIP Exclusive*

*Miembros del club:*
• .vipbadge — tu rango VIP
• .vipboost — +500 monedas / +200 exp (1/semana)
• .gachaclaim <nombre> — reclamo VIP de personaje (1/mes)

*Solo owner:*
• .vip add @user — dar acceso
• .vip remove @user — quitar acceso

*Todos:*
• .vip — lista de miembros
• .c — reclamar la carta del chat
• .gacha — gacha normal

Acceso: solo miembros del club.`,
    quoted: msg,
  })
}
