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
import { buscarNSFW, postRecibibles, descargarPost, TAGS_AZAR } from '../lib/nsfw.js'
import { mimeDe } from '../lib/descargas.js'
import { recargaActiva } from '../lib/economia.js'

const CLAVE_RECARGA = 'nsfw'
const MAX_ENVIO = 8 * 1024 * 1024

export const AYUDA =
  `🔞 *Rule34*\n\n` +
  `*Uso:* \`/rule34 <tags>\`\n     \`/hentai\` (imagen al azar)\n\n` +
  `_El modo NSFW debe estar activado:_ \`/nsfw on\`_ (admins)_\n` +
  `_Tags por defecto si no se especifican: ${TAGS_AZAR.slice(0, 3).join(', ')}..._`

/** Sale por donde la recarga o el modo NSFW bloquean; '' = puede seguir */
function bloqueos(quien, chat, recarga) {
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
    const resultado = await buscarNSFW(consulta, { fuente })

    if (!resultado.fuente || !resultado.posts.length) {
      await sock.sendMessage(jid, {
        text: `🔍 No encontré nada para *${resultado.tags}*. _Prueba otros tags._`,
        quoted: msg,
      })
      return
    }

    // Hasta 3 posts al azar: si la descarga de uno falla (peso/rotura),
    // se prueba con otro
    const lista = postRecibibles(resultado.posts, { permitirVideo: true })

    let post = null
    let buffer = null
    let ultimoErrorDescarga = null

    for (let intento = 0; intento < 3 && !buffer && lista.length; intento += 1) {
      const candidato = lista.splice(Math.floor(Math.random() * lista.length), 1)[0]
      try {
        buffer = await descargarPost(candidato)
        post = candidato
      } catch (err) {
        ultimoErrorDescarga = err
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

    const esVideo = ['gif', 'mp4', 'webm'].includes(post.extension)

    if (esVideo) {
      await sock.sendMessage(jid, {
        video: buffer,
        mimetype: mimeDe(post.extension) || 'video/mp4',
        gifPlayback: post.extension === 'gif',
        caption: descripcion,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        image: buffer,
        mimetype: mimeDe(post.extension) || 'image/jpeg',
        caption: descripcion,
        quoted: msg,
      })
    }

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
