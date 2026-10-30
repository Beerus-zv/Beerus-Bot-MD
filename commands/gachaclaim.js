import { db, tieneReclamado, reclamarPersonaje, obtenerClaimMsg, anadirExperiencia } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { buscarOImportar } from '../lib/gacha-internet.js'
import { formatearFicha } from '../lib/gacha.js'
import { enviarCartaPersonaje } from '../lib/imagenes.js'
import { asegurarOwnerVip } from '../lib/owner.js'
import { jidsDe, esVip } from '../lib/vip.js'

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
  asegurarOwnerVip(db, { sock, msg, sender })
  // Solo VIP (el owner tambien), aceptando PN, LID o sufijo de dispositivo
  if (!esVip(jidsDe({ msg, sender, sock }))) {
    return await sock.sendMessage(jid, {
      text: '❌ Solo usuarios VIP pueden usar `.gachaclaim`.\nPide acceso con `.vip add @usuario` (owner).',
      quoted: msg,
    })
  }

  // Cooldown de 2 semanas
  const vig = recargaActiva(sender, 'vip_gachaclaim')
  if (vig) {
    return await sock.sendMessage(jid, { text: vig + ' Vuelve en ~2 semanas.', quoted: msg })
  }

  const nombre = args.join(' ').trim()
  if (!nombre) {
    return await sock.sendMessage(jid, {
      text: '❓ Uso: `.gachaclaim <nombre del personaje>`',
      quoted: msg,
    })
  }

  const hallador = await buscarOImportar(nombre)
  const personaje = hallador?.personaje || null
  if (!personaje) {
    return await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
  }

  if (tieneReclamado(sender, personaje.id)) {
    return await sock.sendMessage(jid, {
      text: `⚠️ Ya tienes a *${personaje.nombre}* en tu colección.`,
      quoted: msg,
    })
  }

  // Sumar experiencia moderada (+10)
  anadirExperiencia(sender, 10)

  reclamarPersonaje(sender, personaje.id, null)

  // Marcar cooldown de 2 semanas
  db.prepare('INSERT INTO recarga (jid, comando, ultimo) VALUES (?, ?, datetime(\'now\',\'localtime\')) ON CONFLICT(jid, comando) DO UPDATE SET ultimo = excluded.ultimo').run(sender, 'vip_gachaclaim')

  const mensajePropio = obtenerClaimMsg(sender)
  const texto =
    formatearFicha(personaje, { estado: 'En tu colección' }) +
    (mensajePropio
      ? `\n\n💌 ${mensajePropio}`
      : `\n\n_Ya está en tu colección. Usa \`/gacha collection\` para verl@._`)

  // Envia la carta con imagen (fallback: texto si la imagen no se resuelve)
  await enviarCartaPersonaje(sock, jid, msg, personaje, texto)
}