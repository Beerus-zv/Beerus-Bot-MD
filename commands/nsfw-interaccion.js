/**
 * Acciones NSFW con mencion (estilo Neko): anal, spank, yuri y compania.
 *
 * fabricarAccionNSFW(clave) crea el handler de cada accion:
 *   - Solo grupos (como las interacciones SFW)
 *   - Exigen el modo NSFW activado (/nsfw on, admins)
 *   - Frase con mencion de pie de foto + GIF/video del tag de booru asociado
 *   - Mencionarse a si mismo: frase en solitario, sin media
 *   - Recarga compartida 'nsfw-accion'
 *
 * Las tiradas sueltas (ass, pussy, nekomimi) van con fabricarImagenNSFW:
 * sin mencion, devuelven el media del tag directo.
 *
 * fabricarBusquedaNSFW(fuente) reusa /rule34 con esa fuente preferida
 * (danbooru, e621).
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { nsfwActivo, ultimoUso, marcarUso } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { buscarNSFW, postRecibibles, descargarPost, extensionReal } from '../lib/nsfw.js'
import { accionNSFW, fraseNSFW, listarAccionesNSFW } from '../lib/nsfw-acciones.js'
import { mimeDe } from '../lib/descargas.js'

const CLAVE_RECARGA = 'nsfw-accion'

/** Mensaje de cierre si el modo esta apagado */
function mensajeModoApagado() {
  return (
    '🔒 *El modo NSFW está desactivado aquí.*\n' +
    '_Un admin puede activarlo con_ `/nsfw on`_._'
  )
}

/** Baraja sin tocar la lista original */
function barajar(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Extensiones que viajan como GIF/video de WhatsApp */
const ANIMADAS = ['gif', 'mp4']

/**
 * Baja el media del tag de la accion.
 *
 * La interaccion se responde con un GIF, asi que primero se buscan los posts
 * animados del tag y solo si no hay ninguno se acepta una imagen fija. Si el
 * primer post falla (roto, pesado, webm) se prueba con otro.
 *
 * @returns {Promise<{buffer: Buffer, post: object}|null>}
 */
async function mediaDeTag(tag) {
  let respaldo = []

  for (const consulta of [tag, `${tag} animated`]) {
    let resultado = null
    try {
      resultado = await buscarNSFW(consulta)
    } catch {
      continue
    }
    if (!resultado?.fuente) continue

    const recibibles = postRecibibles(resultado.posts, { permitirVideo: true })
    const animadas = barajar(recibibles.filter((p) => ANIMADAS.includes(p.extension)))

    for (const post of animadas.slice(0, 4)) {
      try {
        return { buffer: await descargarPost(post), post }
      } catch {
        /* post roto o bloqueado: siguiente */
      }
    }

    if (!respaldo.length) respaldo = barajar(recibibles)
  }

  // Sin animados en el tag: la imagen fija sigue siendo mejor que nada
  for (const post of respaldo.slice(0, 3)) {
    try {
      return { buffer: await descargarPost(post), post }
    } catch {
      /* siguiente */
    }
  }

  return null
}

/**
 * Envio del media en un solo mensaje: la frase va de pie de foto y las
 * menciones dentro del mismo mensaje, como en cualquier interaccion.
 */
async function enviarMedia(sock, jid, media, frase, mentions, msg) {
  const { buffer } = media
  // La extension sale de la firma del archivo: un webp etiquetado como jpg
  // viaja con el mimetype equivocado y WhatsApp no lo abre.
  const extension = extensionReal(buffer) || media.post.extension
  if (ANIMADAS.includes(extension)) {
    await sock.sendMessage(jid, {
      video: buffer,
      mimetype: mimeDe(extension) || 'video/mp4',
      gifPlayback: true,
      caption: frase,
      mentions,
      quoted: msg,
    })
    return
  }
  await sock.sendMessage(jid, {
    image: buffer,
    mimetype: mimeDe(extension) || 'image/jpeg',
    caption: frase,
    mentions,
    quoted: msg,
  })
}

/**
 * Crea el handler de una accion con mencion (anal, spank, yuri...)
 */
export function fabricarAccionNSFW(clave, nombre = clave, permiteSolo = false) {
  const def = accionNSFW(clave)

  return async ({ sock, jid, msg, args, sender }) => {
    if (!def) return
    const quien = sender || msg.key.participant || jid
    const prefijo = '/'
    const esPrivado = !esGrupo(jid)

    // Modo NSFW (en privado tambien se exige; ahi lo pone quien quiera)
    if (!nsfwActivo(jid)) {
      await sock.sendMessage(jid, { text: mensajeModoApagado(), quoted: msg })
      return
    }

    const espera = recargaActiva(quien, CLAVE_RECARGA)
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    if (esPrivado) {
      await sock.sendMessage(jid, {
        text: '❌ Las acciones NSFW solo funcionan en grupos, para mencionar a alguien.',
        quoted: msg,
      })
      return
    }

    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }

    const objetivo = resolverObjetivo(metadata, msg, args)

    // Sin mencion: si la accion permite modo solo, se ejecuta en solitario
    // (frase + GIF en un solo mensaje) sin exigir objetivo.
    if (!objetivo?.jid && permiteSolo) {
      const tokenAutor = tokenMencion(quien)
      const frase = fraseNSFW(clave, tokenAutor, '', true)

      let mediaSolo = null
      try {
        mediaSolo = await mediaDeTag(def.tag)
      } catch (err) {
        console.error(`[nsfw-accion] ${clave}:`, err.message)
      }

      if (mediaSolo) {
        try {
          await enviarMedia(sock, jid, mediaSolo, frase, [quien], msg)
          marcarUso(quien, CLAVE_RECARGA)
          return
        } catch (err) {
          console.error(`[nsfw-accion] envio ${clave}:`, err.message)
        }
      }

      if (frase) {
        await sock.sendMessage(jid, { text: frase, mentions: [quien], quoted: msg })
      }

      marcarUso(quien, CLAVE_RECARGA)
      return
    }

    if (!objetivo?.jid) {
      await sock.sendMessage(jid, {
        text: `❓ Menciona a alguien: \`${prefijo}${nombre} @usuario\``,
        quoted: msg,
      })
      return
    }

    const objetivoJid = objetivo.jid
    const tokenAutor = tokenMencion(quien)
    const tokenObjetivo = tokenMencion(objetivoJid)

    // Mencionarse a si mismo: frase en soledad, sin media ni recarga
    if (objetivoJid === quien) {
      await sock.sendMessage(jid, {
        text: fraseNSFW(clave, tokenAutor, '', true),
        mentions: [quien],
        quoted: msg,
      })
      return
    }

    // La frase va de pie de foto del GIF: un solo mensaje, menciones adentro
    const frase = fraseNSFW(clave, tokenAutor, tokenObjetivo)

    let media = null
    try {
      media = await mediaDeTag(def.tag)
    } catch (err) {
      console.error(`[nsfw-accion] ${clave}:`, err.message)
      media = null
    }

    if (!media) {
      await sock.sendMessage(jid, {
        text: '💥 El sótano no entregó nada para eso. Intenta de nuevo.',
        quoted: msg,
      })
      return
    }

    try {
      await enviarMedia(sock, jid, media, frase, [quien, objetivoJid], msg)
    } catch (err) {
      console.error(`[nsfw-accion] envio ${clave}:`, err.message)
      // El archivo no salio: al menos la frase queda, con la mencion hecha
      await sock.sendMessage(jid, { text: frase, mentions: [quien, objetivoJid], quoted: msg })
      return
    }

    marcarUso(quien, CLAVE_RECARGA)
  }
}

/**
 * Crea el handler de una tirada suelta (ass, pussy, nekomimi):
 * sin mencion, imagen al azar del tag como /hentai pero con tag fijo.
 */
export function fabricarImagenNSFW(clave) {
  const def = accionNSFW(clave)

  return async ({ sock, jid, msg }) => {
    if (!def) return

    if (!nsfwActivo(jid)) {
      await sock.sendMessage(jid, { text: mensajeModoApagado(), quoted: msg })
      return
    }

    const quien = msg.key.participant || jid
    const espera = recargaActiva(quien, 'nsfw')
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    let media = null
    try {
      media = await mediaDeTag(def.tag)
    } catch (err) {
      console.error(`[nsfw-imagen] ${clave}:`, err.message)
    }

    if (!media) {
      await sock.sendMessage(jid, {
        text: `🫙 No encontré ${def.texto} aceptable. Prueba de nuevo.`,
        quoted: msg,
      })
      return
    }

    try {
      await enviarMedia(sock, jid, media, `🏷️ ${media.post.fuente} · 📊 ${media.post.score}`, [], msg)
    } catch (err) {
      console.error(`[nsfw-imagen] envio ${clave}:`, err.message)
      return
    }

    marcarUso(quien, 'nsfw')
  }
}

/** Listado de las acciones NSFW disponibles */
export default async ({ sock, jid, msg, PREFIX }) => {
  const prefijo = PREFIX?.[0] ?? '/'

  const listado = listarAccionesNSFW().join('\n')

  await sock.sendMessage(jid, {
    text:
      `🔒 *Acciones NSFW de Beerus*\n\n` +
      `${listado}\n\n` +
      `_Menciona a otro usuario:_\n` +
      `\`${prefijo}spank @usuario\`\n\n` +
      `🎨 _Responde con frase + imagen/video del sótano._\n` +
      `⚓ _El modo NSFW debe estar activado:_ \`/nsfw on\`_ (admins)_`,
    quoted: msg,
  })
}
