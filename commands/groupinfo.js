import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'
import { obtenerMensajes } from '../database/db.js'

export default comandoGrupo({
  soloAdmin: false,
  handler: async ({ sock, jid, msg, metadata }) => {
    const creado = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString('es') : 'desconocida'

    const modoAnuncios = metadata.announce ? '🔒 Solo admins escriben' : '🔓 Todos escriben'
    const modoRestriccion = metadata.restrict ? '🔒 Solo admins cambian ajustes' : '🔓 Todos cambian ajustes'
    const aprobacion = metadata.joinApprovalMode ? '✅ Activada' : '❌ Desactivada'
    const mensajes = obtenerMensajes(jid)

    const texto = `📋 *Información del grupo*

*Nombre:* ${metadata.subject}
*Miembros:* ${metadata.size ?? metadata.participants?.length ?? 0}
*Creado:* ${creado}
*Propietario:* ${metadata.owner ? nombreParticipante({ id: metadata.owner }) : 'desconocido'}

*Permisos:*
• Escribir: ${modoAnuncios}
• Ajustes: ${modoRestriccion}
• Aprobación de ingreso: ${aprobacion}

*Mensajes registrados por el bot:* ${mensajes}
${metadata.desc ? `\n*Descripción:*\n${metadata.desc}` : ''}`

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  },
})

