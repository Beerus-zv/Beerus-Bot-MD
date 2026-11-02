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

/** Tope de peso para el GIF/video: uno de 15 MB tarda medio minuto en bajar */
const MAX_VIDEO = 6 * 1024 * 1024

/**
 * Boorus que sirven GIF/MP4 de verdad. yande.re y konachan casi no tienen
 * animados, y la cadena por defecto empieza por yande.re: por eso las
 * interacciones salian en imagen fija aunque el tag tuviera animacion.
 * tbib es espejo de danbooru, asi que tambien trae los gifs.
 */
const FUENTES_ANIMADAS = ['gelbooru.com', 'e621.net', 'danbooru.donmai.us', 'tbib.org']

/** Un "video" de menos de esto es un archivo cortado, no una animacion */
const MIN_VIDEO = 100 * 1024

/**
 * Paginas que se piden para un tag de accion. Con la pagina al azar de /r34
 * (20) muchas tiradas caian en un bloque sin posts del tag; para interaccion
 * se muestrea cerca del principio, que siempre tiene material.
 */
const PAGINAS_INTERACCION = 3

/** Tags reales del post (separados por espacio o por coma, segun el booru) */
function tagsDelPost(post) {
  return new Set(
    String(post?.tags || '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean),
  )
}

/** El post tiene que llevar de verdad alguno de los tags de la accion */
function coincide(post, tags) {
  const delPost = tagsDelPost(post)
  return tags.some((t) => delPost.has(t))
}

/**
 * Baja el media del tag de la accion.
 *
 * La interaccion se responde con un GIF alusivo al comando, asi que:
 *   1. se buscan animados del tag en los boorus que sirven video;
 *   2. si no hay, el tag en cualquier fuente, animado primero;
 *   3. y solo como ultimo recurso una imagen fija.
 *
 * Un booru que no conoce el tag devuelve cualquier cosa, asi que el post
 * tiene que traer el tag en su lista o se descarta.
 *
 * @param {{tags?: string[], tag?: string}} def ficha de la accion
 * @returns {Promise<{buffer: Buffer, post: object}|null>}
 */
export async function mediaDeTag(def) {
  const tags = def?.tags?.length ? def.tags : [def?.tag].filter(Boolean)
  if (!tags.length) return null
  const vistos = new Set()

  const candidatos = (posts, soloAnimadas) =>
    postRecibibles(posts, { permitirVideo: true }).filter(
      (p) => coincide(p, tags) && (!soloAnimadas || ANIMADAS.includes(p.extension)),
    )

  const intentar = async (lista, maxBytes) => {
    for (const post of barajar(lista).slice(0, 4)) {
      const clave = `${post.fuente}:${post.id}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      try {
        const buffer = await descargarPost(post, maxBytes ? { maxBytes } : {})
        if (ANIMADAS.includes(post.extension) && buffer.length < MIN_VIDEO) {
          throw new Error(`video cortado (${buffer.length} bytes)`)
        }
        return { buffer, post }
      } catch {
        /* post roto, bloqueado o webm: siguiente */
      }
    }
    return null
  }

  // 1. Animados del tag en los boorus que sirven GIF/MP4
  for (const fuente of FUENTES_ANIMADAS) {
    for (const tag of tags) {
      let resultado = null
      try {
        resultado = await buscarNSFW(tag, { fuente, paginas: PAGINAS_INTERACCION, exacto: true })
      } catch {
        continue
      }
      if (!resultado?.fuente) continue
      const media = await intentar(candidatos(resultado.posts, true), MAX_VIDEO)
      if (media) return media
    }
  }

  // 2. El tag a secas (animado primero), y 3. la imagen fija como respaldo
  for (const tag of tags) {
    let resultado = null
    try {
      resultado = await buscarNSFW(tag, { paginas: PAGINAS_INTERACCION, exacto: true })
    } catch {
      continue
    }
    if (!resultado?.fuente) continue

    const recibibles = candidatos(resultado.posts, false)
    const media =
      (await intentar(recibibles.filter((p) => ANIMADAS.includes(p.extension)), MAX_VIDEO)) ??
      (await intentar(recibibles.filter((p) => !ANIMADAS.includes(p.extension))))
    if (media) return media
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
        mediaSolo = await mediaDeTag(def)
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
      media = await mediaDeTag(def)
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
      media = await mediaDeTag(def)
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
