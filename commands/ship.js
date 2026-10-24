import { NOMBRES_ANIME, elegirAleatorio } from '../lib/entretenimiento.js'
import { esGrupo, obtenerMetadata, menciones } from '../lib/grupo.js'
import { obtenerUsuario } from '../database/db.js'
import { nombreLegible } from '../lib/economia.js'

/** Compatibilidad entre dos nombres (resultado entre 20 y 100) */
function compatibilidad(a, b) {
  const clave = String(a)
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const suma = clave + Math.floor(Math.random() * 60)
  return 20 + (suma % 81)
}

/** Comentario según el porcentaje */
function comentario(porcentaje) {
  if (porcentaje >= 95) return '¡Son perfectos el uno para el otro! 💞'
  if (porcentaje >= 85) return 'La química es altísima, casi como en una novela浪漫ántica.'
  if (porcentaje >= 70) return 'Se entienden muy bien, aunque de vez en cuando discuten por tonterías.'
  if (porcentaje >= 55) return 'Son buenas amistades, pero les falta algo de chispas.'
  if (porcentaje >= 40) return 'Hay cariño, pero todavía no llega a nivel de pareja.'
  return 'No hay química... por ahora. 🙃'
}

export default async ({ sock, jid, msg, args, sender }) => {
  if (!esGrupo(jid)) {
    await sock.sendMessage(jid, { text: '❌ El ship solo funciona en grupos.', quoted: msg })
    return
  }

  const mentioned = menciones(msg)
  let a
  let b

  if (mentioned.length >= 2) {
    a = mentioned[0]
    b = mentioned[1]
  } else if (mentioned.length === 1) {
    a = mentioned[0]
    b = sender
  } else {
    // Sin menciones: dos personajes al azar
    a = elegirAleatorio(NOMBRES_ANIME)
    b = elegirAleatorio(NOMBRES_ANIME)
    while (b === a) b = elegirAleatorio(NOMBRES_ANIME)
  }

  const pa = nombreLegible(a, obtenerUsuario)
  const pb = nombreLegible(b, obtenerUsuario)
  const porcentaje = compatibilidad(pa, pb)

  await sock.sendMessage(jid, {
    text:
      `💘 *Compatibilidad* (${porcentaje}%)\n\n` +
      `✨ ${pa}  💗  ${pb}\n\n` +
      `💭 ${comentario(porcentaje)}`,
    quoted: msg,
  })
}
