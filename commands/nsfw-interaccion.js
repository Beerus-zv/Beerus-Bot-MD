/**
 * Acciones NSFW con mencion (estilo Neko): anal, spank, yuri y compania.
 *
 * fabricarAccionNSFW(clave) crea el handler de cada accion:
 *   - Solo grupos (como las interacciones SFW)
 *   - Exigen el modo NSFW activado (/nsfw on, admins)
 *   - Frase con mencion + imagen/video del tag de booru asociado
 *   - Mencionarse a si mismo: frase en solitario, sin media
 *   - Recarga compartida 'nsfw-accion'
 *
 * Las tiradas sueltas (ass, pussy, nekomimi) van con fabricarImagenNSFW:
 * sin mencion, devuelven una imagen del tag directo.
 *
 * fabricarBusquedaNSFW(fuente) reusa /rule34 con esa fuente preferida
 * (danbooru, e621).
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { nsfwActivo, ultimoUso, marcarUso } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { buscarNSFW, postRecibible, descargarPost } from '../lib/nsfw.js'
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

/** Baja el media del tag de la accion: {buffer, post} o null */
async function mediaDeTag(tag) {
  const resultado = await buscarNSFW(tag)
  if (!resultado.fuente) return null

  const post = postRecibible(resultado.posts)
  if (!post) return null

  let buffer
  try {
    buffer = await descargarPost(post)
  } catch {
    return null
  }

  return { buffer, post }
}

/** Envio del media: imagen o video (con playback para los GIF) */
async function enviarMedia(sock, jid, buffer, post, caption) {
  if (['webm', 'mp4', 'gif'].includes(post.extension)) {
    await sock.sendMessage(jid, {
      video: buffer,
      mimetype: mimeDe(post.extension) || 'video/mp4',
      gifPlayback: true,
      caption,
    })
    return
  }
  await sock.sendMessage(jid, {
    image: buffer,
    mimetype: mimeDe(post.extension) || 'image/jpeg',
    caption,
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
    // (frase solo + imagen del tag) sin exigir objetivo.
    if (!objetivo?.jid && permiteSolo) {
      const tokenAutor = tokenMencion(quien)
      const frase = fraseNSFW(clave, tokenAutor, '', true)
      if (frase) {
        await sock.sendMessage(jid, {
          text: frase,
          mentions: [quien],
          quoted: msg,
        })
      }

      let mediaSolo = null
      try {
        mediaSolo = await mediaDeTag(def.tag)
      } catch (err) {
        console.error(`[nsfw-accion] ${clave}:`, err.message)
      }

      if (mediaSolo) {
        try {
          await enviarMedia(sock, jid, mediaSolo.buffer, mediaSolo.post, `🏷️ ${mediaSolo.post.fuente} · 📊 ${mediaSolo.post.score}`)
        } catch (err) {
          console.error(`[nsfw-accion] envio ${clave}:`, err.message)
        }
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

    // Frase con la mencion de ambos, y debajo la imagen del tag
    await sock.sendMessage(jid, {
      text: fraseNSFW(clave, tokenAutor, tokenObjetivo),
      mentions: [quien, objetivoJid],
      quoted: msg,
    })

    let media
    try {
      media = await mediaDeTag(def.tag)
    } catch (err) {
      console.error(`[nsfw-accion] ${clave}:`, err.message)
      media = null
    }

    if (!media) {
      await sock.sendMessage(jid, {
        text: '💥 El sótano no entregó imagen para eso. Intenta de nuevo.',
        quoted: msg,
      })
      return
    }

    try {
      await enviarMedia(sock, jid, media.buffer, media.post, `🏷️ ${media.post.fuente} · 📊 ${media.post.score}`)
    } catch (err) {
      console.error(`[nsfw-accion] envio ${clave}:`, err.message)
      await sock.sendMessage(jid, {
        text: `🖇️ El archivo venía demasiado pesado. Original: ${media.post.fuente} → post ${media.post.id}`,
        quoted: msg,
      })
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

    await sock.sendMessage(jid, { text: `🔞 Buscando *${def.texto}*...`, quoted: msg })

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
      await enviarMedia(sock, jid, media.buffer, media.post, `🏷️ ${media.post.fuente} · 📊 ${media.post.score}`)
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
