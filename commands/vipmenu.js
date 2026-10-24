export default async ({ sock, jid, msg }) => {
  await sock.sendMessage(jid, {
    text: `👑 *Menú VIP Exclusive*

• .vip add @user (solo owner)
• .vip remove @user (solo owner)
• .vip (lista)
• .vipbadge (perfil VIP)
• .vipboost (+500 monedas / +200 exp — 1/semana)
• .gachaclaim <nombre> (reclamo VIP, 1/mes)
• .gacha (nuevo gacha)
• .c (reclamar la carta del chat)

Acceso: solo miembros del club.`,
    quoted: msg,
  })
}
