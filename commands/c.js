/**
 * .c — Reclama la waifu aleatoria pendiente del chat (resultado de .gacha random).
 * Disponible para todos los usuarios (no requiere VIP).
 */
import {
  obtenerPersonajeGacha,
  reclamarPersonaje,
  tieneReclamado,
  obtenerClaimMsg,
  marcarUso,
  anadirExperiencia,
  obtenerUltimaWaifu,
} from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { formatearFicha, datosRareza } from '../lib/gacha.js'
import { enviarCartaPersonaje } from '../lib/imagenes.js'

export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || jid

  // Cooldown de reclamo (15 min, misma clave que /waifu claim)
  const espera = recargaActiva(quien, 'claim')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  // Waifu pendiente del chat
  const pendiente = obtenerUltimaWaifu(jid)
  if (!pendiente) {
    await sock.sendMessage(jid, {
      text: '❌ No hay ninguna waifu pendiente en este chat.\n_Saca una con `.gacha random` y luego usa `.c`._',
      quoted: msg,
    })
    return
  }

  const personaje = obtenerPersonajeGacha(pendiente.personaje_id)
  if (!personaje) {
    await sock.sendMessage(jid, { text: '⚠️ El personaje pendiente ya no existe en el catálogo.', quoted: msg })
    return
  }

  if (tieneReclamado(quien, personaje.id)) {
    await sock.sendMessage(jid, {
      text: `⚠️ Ya tienes a *${personaje.nombre}* en tu colección.`,
      quoted: msg,
    })
    return
  }

  reclamarPersonaje(quien, personaje.id, jid?.endsWith('@g.us') ? jid : null)
  anadirExperiencia(quien, 10)

  const mensajePropio = obtenerClaimMsg(quien)
  const r = datosRareza(personaje.rareza)
  const texto =
    formatearFicha(personaje, { estado: 'En tu colección' }) +
    `\n🎁 *Reclamada vía* \`.c\`` +
    (mensajePropio ? `\n\n💌 ${mensajePropio}` : `\n\n_Ya está en tu colección. Usa \`/gacha collection\` para verl@._`)

  await enviarCartaPersonaje(sock, jid, msg, personaje, texto)
  marcarUso(quien, 'claim')
}
