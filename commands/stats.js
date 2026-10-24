import { obtenerMensajes, totalChats, totalMensajes, totalNotas, totalUsuarios } from '../database/db.js'

export default async ({ sock, jid, msg }) => {
  try {
    const enEsteChat = obtenerMensajes(jid)

    await sock.sendMessage(jid, { 
      text: `📊 Estadísticas del bot

*En este chat:* ${enEsteChat} mensajes
*Total de mensajes:* ${totalMensajes()}
*Chats registrados:* ${totalChats()}
*Usuarios registrados:* ${totalUsuarios()}
*Notas guardadas:* ${totalNotas()}`,
      quoted: msg
    })
  } catch (err) {
    console.error('Error obteniendo las estadísticas:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudieron obtener las estadísticas.',
      quoted: msg
    })
  }
}
