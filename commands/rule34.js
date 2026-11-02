/**
 * /rule34 <tags> y /hentai: busqueda NSFW en los boorus keyless
 * (yande.re -> konachan.com -> e621). Se apoyan en:
 *
 *   - nsfwActivo(jid): modo NSFW activado por un admin (/nsfw on)
 *   - recarga 'nsfw' compartida con todo el apartado
 *
 * El post se envia como imagen (o video si es GIF/MP4) con sus tags y score.
 */
import { nsfwActivo, ultimoUso, marcarUso } from '../database/db.js'
import { buscarNSFW, postRecibibles, descargarPost, extensionReal, mejoresPosts, TAGS_AZAR, sinRepetir, marcarVisto } from '../lib/nsfw.js'
import { mimeDe } from '../lib/descargas.js'
import { recargaActiva } from '../lib/economia.js'
import sharp from 'sharp'

const CLAVE_RECARGA = 'nsfw'
/** Si el original pasa de aqui se reconvierte a JPEG de alta calidad */
const MAX_IMAGEN = 8 * 1024 * 1024

/** Reduce el peso sin bajar la resolucion (calidad 94, sin submuestreo de color) */
async function aligerarImagen(buffer) {
  let imagen = sharp(buffer, { failOn: 'none' })
  const { width } = await imagen.metadata()
  if (width && width > 4096) imagen = imagen.resize({ width: 4096 })
  return imagen
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

/**
 * Revisa el archivo antes de mandarlo.
 *
 * Un booru puede contestar 200 con una imagen cortada, un PNG de 1x1 o una
 * pagina de error, y WhatsApp entonces muestra una burbuja gris sin nada
 * dentro. Si el archivo no sirve se lanza para que la tirada pruebe otro post.
 */
async function validarMedia(buffer, extension) {
  if (['gif', 'mp4', 'webm'].includes(extension)) {
    if (buffer.length < 8 * 1024) throw new Error(`video demasiado corto (${buffer.length} bytes)`)
    // WhatsApp no reproduce VP8/VP9: el post viajaria como burbuja vacia
    if (extensionReal(buffer) === 'webm') throw new Error('contenedor webm, WhatsApp no lo reproduce')
    return
  }

  let meta = null
  try {
    meta = await sharp(buffer, { failOn: 'none' }).metadata()
  } catch {
    throw new Error('imagen ilegible')
  }

  const ancho = Number(meta?.width || 0)
  const alto = Number(meta?.height || 0)
  if (!ancho || !alto) throw new Error('imagen sin dimensiones')
  if (ancho < 500 || alto < 500) throw new Error(`imagen demasiado chica (${ancho}x${alto})`)
}

export const AYUDA =
  `🔞 *Rule34*\n\n` +
  `*Uso:* \`/rule34 <tags>\`\n     \`/hentai\` (imagen al azar)\n\n` +
  `_El modo NSFW debe estar activado:_ \`/nsfw on\`_ (admins)_\n` +
  `_Tags por defecto si no se especifican: ${TAGS_AZAR.slice(0, 3).join(', ')}..._`

/** Baraja sin tocar la lista original */
function barajar(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Sale por donde la recarga o el modo NSFW bloquean; '' = puede seguir */function bloqueos(quien, chat, recarga) {
  if (!nsfwActivo(chat)) {
    return '🚫 *El modo NSFW está desactivado aquí.*\n_Un admin puede activarlo con_ `/nsfw on`_.'
  }
  return recargaActiva(quien, recarga)
}

/** Motor compartido de envio (lo usan /rule34, /hentai, /danbooru, /e621) */
export async function ejecutarBusqueda({ sock, jid, msg, args, sender }, { azar = false, fuente = null } = {}) {
  const quien = sender || msg.key.participant || jid

  const bloqueo = bloqueos(quien, jid, CLAVE_RECARGA)
  if (bloqueo) {
    await sock.sendMessage(jid, { text: bloqueo, quoted: msg })
    return
  }

  const consulta = azar ? '' : (args || []).join(' ').trim()

  await sock.sendMessage(jid, {
    text: `🔎 Buscando *${consulta || 'algo del sótano'}* en los boorus...`,
    quoted: msg,
  })

  try {
    const resultado = await buscarNSFW(consulta, { fuente, orden: 'calidad' })

    if (!resultado.fuente || !resultado.posts.length) {
      await sock.sendMessage(jid, {
        text: `🔍 No encontré nada para *${resultado.tags}*. _Prueba otros tags._`,
        quoted: msg,
      })
      return
    }

    // Calidad primero: se ordenan los posts por lado corto y score, y se
    // mandan los mejores. Antes salia un post al azar del bloque, que muchas
    // veces era un boceto viejo o una imagen de 500 px borrosa en WhatsApp.
    // Se descartan los que ya se mandaron en este chat con esta misma busqueda,
    // asi dos `/r34 burnice` no repiten imagen.
    const claveVistos = `${jid}|${consulta.toLowerCase() || 'azar'}`
    const recibibles = sinRepetir(
      claveVistos,
      postRecibibles(resultado.posts, { permitirVideo: true }),
    )
    // Hasta 6 buenos al azar entre los mejores: variedad sin bajar la calidad
    const lista = barajar(mejoresPosts(recibibles, { cantidad: 6 }))
    // Respaldo: el resto del bloque, por si todos los buenos fallan al bajar
    const resto = barajar(recibibles.filter((p) => !lista.includes(p)))

    let post = null
    let buffer = null
    let ultimoErrorDescarga = null

    for (let intento = 0; intento < 5 && !buffer; intento += 1) {
      const candidato = lista.shift() ?? resto.shift()
      if (!candidato) break
      try {
        const bajado = await descargarPost(candidato)
        await validarMedia(bajado, candidato.extension)
        buffer = bajado
        post = candidato
      } catch (err) {
        ultimoErrorDescarga = err
        console.warn(`[nsfw] se descarta ${candidato.fuente} ${candidato.id}: ${err.message}`)
      }
    }

    if (!post) {
      throw ultimoErrorDescarga ?? new Error('sin posts descargables')
    }

    const ultimos = post.tags.split(' ').filter(Boolean).slice(0, 6).join(', ')
    const descripcion =
      `🔞 *${post.fuente}*\n` +
      `🏷️ ${ultimos}\n` +
      `⭐ ${post.score} puntos\n` +
      `📥 ${post.url.slice(0, 90)}`

    // La extension sale de la firma del archivo, no de lo que declare el post:
    // un webp etiquetado como jpg viaja con mimetype equivocado y no abre.
    const extension = extensionReal(buffer) || post.extension
    const esVideo = ['gif', 'mp4', 'webm'].includes(extension)
    let mimetypeImagen = mimeDe(extension) || 'image/jpeg'

    // Imagenes enormes: se reconvierten sin perder resolucion para que
    // WhatsApp no las rechace. El resto se envia tal cual (calidad original).
    if (!esVideo && buffer.length > MAX_IMAGEN) {
      buffer = await aligerarImagen(buffer)
      mimetypeImagen = 'image/jpeg'
    }

    if (esVideo) {
      await sock.sendMessage(jid, {
        video: buffer,
        mimetype: mimeDe(extension) || 'video/mp4',
        gifPlayback: extension === 'gif',
        caption: descripcion,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        image: buffer,
        mimetype: mimetypeImagen,
        caption: descripcion,
        quoted: msg,
      })
    }

    // Anota el post como enviado en este chat: la proxima busqueda igual
    // lo descarta y manda otra imagen
    marcarVisto(claveVistos, post.id)

    // La recarga se gasta solo si la entrega salio completa
    marcarUso(quien, CLAVE_RECARGA)

    console.log(`[nsfw] ${post.fuente} ${post.id} (${(buffer.length / 1024).toFixed(0)} KB) -> ${jid}`)
  } catch (err) {
    console.error('[nsfw] error:', err.message)
    await sock.sendMessage(jid, {
      text: '💥 El sótano no respondió. _Intenta con otros tags._',
      quoted: msg,
    })
    return
  }
}

/** Handler de una busqueda con fuente preferida (para /danbooru, /e621) */
export function fabricarBusquedaNSFW(fuente) {
  return (ctx) => ejecutarBusqueda(ctx, { fuente })
}

export default async ({ sock, jid, msg, args }) => {
  if (!(args || []).length) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await ejecutarBusqueda({ sock, jid, msg, args, sender: msg.key.participant })
}
