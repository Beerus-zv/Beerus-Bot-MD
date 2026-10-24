import { ACCIONES, elegirAleatorio } from '../lib/entretenimiento.js'
import { menciones } from '../lib/grupo.js'
import { obtenerUsuario } from '../database/db.js'
import { nombreLegible } from '../lib/economia.js'

const AYUDA = `💗 *Acciones*

*Uso:*
• \`/love @user\` - Declarar amor
• \`/love hug @user\` - Dar un abrazo
• \`/love kiss @user\` - Dar un beso
• \`/love slap @user\` - Dar un tortazo
• \`/love pat @user\` - Acariciar la cabeza
• \`/love call @user\` - Llamar a alguien`

const TIPOS = {
  amor: ['amor', 'love', 'declarar'],
  hug: ['hug', 'abrazo', 'abrazar'],
  kiss: ['kiss', 'beso', 'besar'],
  slap: ['slap', 'tortazo', 'cachetazo'],
  pat: ['pat', 'mascota', 'caricia'],
  call: ['call', 'llamar', 'llamada'],
}

export default async ({ sock, jid, msg, args, sender }) => {
  const sub = String(args[0] || 'amor').toLowerCase()
  const tipo = Object.keys(TIPOS).find((k) => TIPOS[k].includes(sub))

  if (!tipo) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  const mentioned = menciones(msg)
  const yo = nombreLegible(sender, obtenerUsuario)
  const otro = mentioned[0] ? nombreLegible(mentioned[0], obtenerUsuario) : 'alguien'

  const texto = elegirAleatorio(ACCIONES[tipo]).replace('{a}', yo).replace('{b}', otro)

  await sock.sendMessage(jid, { text: texto, quoted: msg })
}
