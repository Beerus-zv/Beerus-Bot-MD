/**
 * .setcardimage <nombre|id> [url]
 *
 * Reemplaza la imagen de la ficha/carta de un personaje del gacha por una
 * imagen puesta por el usuario. La imagen puede venir:
 *   1. En el propio mensaje (foto con el comando de pie de foto).
 *   2. Citada (responder a una foto con el comando).
 *   3. Como URL al final del comando.
 *
 * Solo el owner o un admin del grupo pueden cambiar la imagen.
 * Alias corto: .sci
 */
import { personajePorNombre, obtenerPersonajeGacha, listarPersonajesGacha } from '../database/db.js'
import { obtenerMetadata, esAdmin } from '../lib/grupo.js'
import { esOwnerMsg } from '../lib/owner.js'
import { resolverFuenteMedia, detectarTipoMedia, descargarMedia } from '../lib/multimedia.js'
import { bajarArchivo } from '../lib/descargas.js'
import { guardarImagenPersonaje, enviarCartaPersonaje } from '../lib/imagenes.js'

/** Tope de descarga para la imagen que manda el usuario */
const MAX_IMAGEN = 12 * 1024 * 1024

const USO = `🖼️ *Cambiar imagen de una carta*

*Uso:*
 \`.setcardimage <nombre o id>\` — responde a una foto o mándala con este texto de pie
 \`.setcardimage <nombre o id> <url>\`

*Ejemplos:*
 \`.setcardimage gojo\` (respondiendo a la imagen)
 \`.setcardimage 12 https://ejemplo.com/imagen.jpg\`

_Alias corto:_ \`.sci\`
_Solo el owner o un admin del grupo._`

const ERROR_PERMISO = '⛔ Solo el *owner* o un *admin del grupo* pueden cambiar la imagen de una carta.'

/** Minusculas y sin acentos, para buscar nombres con tolerancia */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Busca un personaje por id, nombre exacto o nombre parcial */
export function buscarPersonaje(ref) {
  const limpio = String(ref || '').trim()
  if (!limpio) return null
  if (/^\d+$/.test(limpio)) return obtenerPersonajeGacha(Number(limpio))

  const exacto = personajePorNombre(limpio)
  if (exacto) return exacto

  const buscado = normalizar(limpio)
  const lista = listarPersonajesGacha()
  return (
    lista.find((p) => normalizar(p.nombre) === buscado) ||
    lista.find((p) => normalizar(p.nombre).startsWith(buscado)) ||
    lista.find((p) => normalizar(p.nombre).includes(buscado)) ||
    null
  )
}

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  // ── Permisos: owner o admin del grupo ──
  let permitido = esOwnerMsg({ sock, msg, sender })
  if (!permitido && esGrupo) {
    try {
      permitido = esAdmin(await obtenerMetadata(sock, jid), sender)
    } catch {
      permitido = false
    }
  }
  if (!permitido) {
    return sock.sendMessage(jid, { text: ERROR_PERMISO, quoted: msg })
  }

  // ── Referencia del personaje + URL opcional al final ──
  const partes = [...(args || [])]
  let url = null
  if (partes.length && /^https?:\/\//i.test(partes[partes.length - 1])) {
    url = partes.pop()
  }
  const ref = partes.join(' ').trim()

  if (!ref) {
    return sock.sendMessage(jid, { text: USO, quoted: msg })
  }

  const personaje = buscarPersonaje(ref)
  if (!personaje) {
    return sock.sendMessage(jid, {
      text: `❌ No encontré el personaje *${ref}*.\n_Prueba con su id o con otro nombre:_ \`.setcardimage <nombre>\``,
      quoted: msg,
    })
  }

  // ── Origen de la imagen ──
  let buffer = null
  try {
    if (url) {
      buffer = await bajarArchivo(url, { maxBytes: MAX_IMAGEN })
    } else {
      const fuente = resolverFuenteMedia(msg)
      if (!fuente) {
        return sock.sendMessage(jid, {
          text: `❓ Falta la imagen.\n\n${USO}`,
          quoted: msg,
        })
      }
      if (detectarTipoMedia(fuente.mensaje) !== 'image') {
        return sock.sendMessage(jid, {
          text: '❌ Eso no es una imagen. Responde a una foto o manda la foto con el comando de pie de foto.',
          quoted: msg,
        })
      }
      buffer = await descargarMedia(sock, fuente.mensaje)
    }
  } catch (err) {
    console.error('[setcardimage] no se pudo obtener la imagen:', err.message)
    return sock.sendMessage(jid, {
      text: '❌ No pude descargar la imagen. Inténtalo de nuevo o mándala como foto.',
      quoted: msg,
    })
  }

  if (!buffer?.length || buffer.length > MAX_IMAGEN) {
    return sock.sendMessage(jid, {
      text: '❌ La imagen está vacía o supera los 12 MB.',
      quoted: msg,
    })
  }

  // ── Guardar y confirmar con la carta ya actualizada ──
  try {
    await guardarImagenPersonaje(personaje, buffer)
  } catch (err) {
    console.error('[setcardimage] no se pudo procesar la imagen:', err.message)
    return sock.sendMessage(jid, {
      text: '❌ Esa imagen no se pudo procesar. Prueba con una foto JPG o PNG.',
      quoted: msg,
    })
  }

  await enviarCartaPersonaje(
    sock,
    jid,
    msg,
    personaje,
    `🖼️ *Nueva imagen de ${personaje.nombre}*\n_${personaje.anime || 'Gacha'}_`
  )
}
