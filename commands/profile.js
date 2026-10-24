/**
 * `/profile [@mención]` (también subcomandos): muestra la ficha de perfil de
 * alguien (propio o de cualquier usuario registrado). También guarda el nombre
 * visible cuando se le pasa texto.
 *
 *   /profile                  tu perfil
 *   /profile @usuario         ficha de otro (por mención)
 *   /profile info [@usuario]  ficha de un usuario registrado (subcomando)
 *   /profile <texto>          guarda ese texto como tu nombre visible
 */
import {
  obtenerUsuario,
  registrarUsuario,
  totalUsuarios,
  obtenerMensajes,
  obtenerEconomia,
  obtenerCumpleanos,
  obtenerPareja,
  favoritoGacha,
  XP_POR_NIVEL,
} from '../database/db.js'
import { menciones, jidUsuario, tokenMencion, esGrupo, obtenerMetadata, resolverObjetivo } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'
import sharp from 'sharp'

const GENERO_CARITA = {
  hombre: '♂️ Hombre',
  mujer: '♀️ Mujer',
  otro: '🧩 Otro',
}

/** Días que faltan al MM-DD (el próximo año si ya pasó) */
function diasHasta(mmdd) {
  const hoy = new Date()
  const [mes, dia] = mmdd.split('-').map(Number)
  let destino = new Date(hoy.getFullYear(), mes - 1, dia)
  if (destino < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) {
    destino = new Date(hoy.getFullYear() + 1, mes - 1, dia)
  }
  return Math.round((destino - hoy) / (24 * 60 * 60 * 1000))
}

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = jidUsuario(sender || jid)

  const sub = String(args?.[0] || '').toLowerCase()
  const esVer = ['info', 'ver', 'view', 'perfil', 'show'].includes(sub)

  // Subcomando para ver el perfil de cualquier usuario registrado por mención
  if (esVer) {
    let metadata = null
    if (esGrupo(jid)) {
      try {
        metadata = await obtenerMetadata(sock, jid)
      } catch {
        metadata = null
      }
    }
    const resuelto = resolverObjetivo(metadata, msg, args.slice(1))
    const objetivo = resuelto?.jid || menciones(msg)[0] || quien
    await mostrarPerfil(sock, jid, msg, jidUsuario(objetivo), quien)
    return
  }

  // /profile @usuario -> ficha del objetivo (grupos y privados)
  const objetivo = menciones(msg)[0]
  if (objetivo) {
    await mostrarPerfil(sock, jid, msg, jidUsuario(objetivo), quien)
    return
  }

  // /profile <nombre> -> guarda el nombre visible
  if (args?.length) {
    const nombre = args.join(' ').trim()
    registrarUsuario(quien, nombre)

    await sock.sendMessage(jid, {
      text: `✅ Perfil guardado.\n\n*Nombre:* ${nombre}\n*JID:* \`${quien}\``,
      quoted: msg,
    })
    return
  }

  await mostrarPerfil(sock, jid, msg, quien, quien)
}

/** Arma y envía la ficha de perfil de un usuario (con foto de perfil si está disponible) */
async function mostrarPerfil(sock, jid, msg, objetivo, quien) {
  const usuario = obtenerUsuario(objetivo)
  const eco = obtenerEconomia(objetivo)
  const favorito = favoritoGacha(objetivo)
  const pareja = obtenerPareja(objetivo)
  const cumple = obtenerCumpleanos(objetivo)
  const esPropio = objetivo === quien

  const genero = usuario?.genero
    ? `✳️ *Género:* ${GENERO_CARITA[usuario.genero] || usuario.genero}\n`
    : ''
  const descripcion = usuario?.descripcion ? `💬 *Descripción:* ${usuario.descripcion}\n` : ''

  let lineaCumple = ''
  if (cumple) {
    const mmdd = String(cumple).split('-').slice(1).join('-')
    const faltan = diasHasta(mmdd)
    const cuando = faltan === 0 ? '🎉 ¡HOY!' : `faltan *${faltan}* día(s) (${mmdd.split('-')[1]}-${mmdd.split('-')[0]})`
    lineaCumple = `🎂 *Cumpleaños:* ${cuando}\n`
  }

  const lineaPareja = pareja ? `💍 *Pareja:* ${nombreLegible(pareja, obtenerUsuario)}\n` : ''
  const lineaFavorito = favorito
    ? `⭐ *Favorito:* ${favorito.nombre}${favorito.anime ? ` (${favorito.anime})` : ''}\n`
    : ''
  const faltan = XP_POR_NIVEL - (Number(eco.experiencia) % XP_POR_NIVEL)
  const lineaNivel = `📈 *Nivel:* ${eco.nivel} · *XP:* ${eco.experiencia}\n_le faltan ${faltan} XP para el nivel ${eco.nivel + 1}_\n`
  const lineaMoneda = `🪙 *${eco.monedas}* oro\n`

  const texto =
    `👤 *Perfil de ${nombreLegible(objetivo, obtenerUsuario)}*${esPropio ? '' : ` ${tokenMencion(objetivo)}`}\n\n` +
    genero +
    descripcion +
    lineaCumple +
    lineaPareja +
    lineaFavorito +
    lineaNivel +
    lineaMoneda +
    `📝 *Usuarios registrados:* ${totalUsuarios()}\n` +
    (usuario ? `_Última vez visto:_ ${usuario.ult_visto}_` : '_Nunca registrado_')

  const mentions = esPropio ? [] : [objetivo]

  // Foto de perfil (si está disponible y visible para el bot)
  let foto = null
  if (typeof sock?.profilePictureUrl === 'function') {
    try {
      foto = await sock.profilePictureUrl(objetivo, 'high')
    } catch {
      foto = null
    }
  }

  if (foto) {
    await sock.sendMessage(jid, {
      image: { url: foto },
      caption: texto,
      mentions,
      quoted: msg,
    })
  } else if (typeof sock?.profilePictureUrl === 'function') {
    // Sin foto de perfil: imagen por defecto "sin foto de perfil"
    const defaultImg = await obtenerImagenSinFoto()
    await sock.sendMessage(jid, {
      image: defaultImg,
      caption: `${texto}\n\n🖼️ _Sin foto de perfil visible para el bot._`,
      mentions,
      quoted: msg,
    })
  } else {
    await sock.sendMessage(jid, {
      text: texto,
      mentions,
      quoted: msg,
    })
  }
}

/** Imagen por defecto (placeholder) para usuarios sin foto de perfil */
let defaultPfpBuffer = null
async function obtenerImagenSinFoto() {
  if (defaultPfpBuffer) return defaultPfpBuffer
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#1f1f23"/>
    <circle cx="128" cy="100" r="40" fill="#555"/>
    <rect x="78" y="150" width="100" height="60" rx="30" fill="#555"/>
    <text x="128" y="235" font-size="14" fill="#aaa" text-anchor="middle" font-family="sans-serif">Sin foto de perfil</text>
  </svg>`
  defaultPfpBuffer = await sharp(Buffer.from(svg)).png().toBuffer()
  return defaultPfpBuffer
}
