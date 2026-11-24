/**
 * Videos NSFW: `/xvideos`, `/xnxx` y `/r34vid`.
 *
 *   /xvideos <búsqueda>      busca y lista 5 resultados
 *   /xvideos 2 <búsqueda>    baja el resultado 2
 *   /xnxx <búsqueda>
 *   /r34vid <búsqueda>
 *
 * Igual que el resto del sótano: exige el modo NSFW activo en el chat
 * (`/nsfw on`, solo admins) y respeta la recarga compartida de 'nsfw'.
 *
 * WhatsApp corta el video en 25 MB, así que el tope real de descarga son
 * 24 MB y lo que pase se responde con el enlace.
 */
import { nsfwActivo, ultimoUso, marcarUso } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { buscarVideos, descargarVideo, resolverVideo, SITIOS } from '../lib/nsfw-video.js'

const CLAVE_RECARGA = 'nsfw'
const MAX_MB = 24

/** Nombre legible del sitio a partir del comando usado */
function sitioDe(nombre) {
  const limpio = String(nombre || '').toLowerCase()
  if (limpio.includes('r34') || limpio.includes('rule34')) return 'rule34video'
  if (limpio.includes('xnxx')) return 'xnxx'
  return 'xvideos'
}

/** Aviso de bloqueo; '' = puede seguir */
function bloqueo(quien, chat) {
  if (!nsfwActivo(chat)) {
    return '🚫 *El modo NSFW está desactivado aquí.*\n_Un admin puede activarlo con_ `/nsfw on`_.'
  }
  return recargaActiva(quien, CLAVE_RECARGA)
}

/**
 * Handler común. `sitio` viene del mapa de comandos (uno por comando) o del
 * nombre con el que se llamó.
 */
export function fabricarComandoVideo(sitio) {
  return async ({ sock, jid, msg, args, sender }) => {
    const quien = sender || msg.key.participant || jid

    const aviso = bloqueo(quien, jid)
    if (aviso) return sock.sendMessage(jid, { text: aviso, quoted: msg })

    const partes = [...(args || [])]

    // Índice opcional al principio: /xvideos 2 gatos
    let indice = null
    if (partes.length > 1 && /^\d+$/.test(partes[0])) {
      indice = Number(partes.shift()) - 1
    }

    const consulta = partes.join(' ').trim()
    if (!consulta) {
      const cfg = SITIOS[sitio]
      return sock.sendMessage(jid, {
        text:
          `🔞 *${cfg?.nombre || sitio}*\n\n` +
          `• \`/${sitio} <búsqueda>\` — lista resultados\n` +
          `• \`/${sitio} 2 <búsqueda>\` — baja el resultado 2\n\n` +
          `_Tope de envío: ${MAX_MB} MB._`,
        quoted: msg,
      })
    }

    // Enlace directo del video: no hace falta buscar
    if (/^https?:\/\//i.test(consulta)) {
      await sock.sendMessage(jid, { text: '⬇️ Bajando el enlace...', quoted: msg })
      let datos
      try {
        datos = await descargarVideo(consulta, { maxMB: MAX_MB })
      } catch (err) {
        return sock.sendMessage(jid, {
          text: `❌ No pude bajar el video: ${err.message}\n\n▸ ${consulta}`,
          quoted: msg,
        })
      }
      await sock.sendMessage(jid, {
        video: datos.buffer,
        mimetype: 'video/mp4',
        caption: `🔞 *${datos.titulo}*\n📦 ${(datos.buffer.length / 1048576).toFixed(1)} MB`,
        quoted: msg,
      })
      marcarUso(quien, CLAVE_RECARGA)
      return
    }

    await sock.sendMessage(jid, {
      text: `🔎 Buscando *${consulta}* en ${SITIOS[sitio]?.nombre || sitio}...`,
      quoted: msg,
    })

    // 1) Búsqueda
    let videos = []
    try {
      const resultado = await buscarVideos(sitio, consulta, 6)
      videos = resultado.videos
    } catch (err) {
      return sock.sendMessage(jid, {
        text: `❌ El sitio no respondió: ${err.message}`,
        quoted: msg,
      })
    }

    if (!videos.length) {
      return sock.sendMessage(jid, {
        text: `📭 Sin resultados para *${consulta}*.`,
        quoted: msg,
      })
    }

    // Sin índice: lista para elegir
    if (indice === null) {
      const top = videos.slice(0, 5)
      const lineas = top.map((v, i) => `*${i + 1}.* ${v.titulo}`).join('\n')
      return sock.sendMessage(jid, {
        text:
          `🔞 *${SITIOS[sitio]?.nombre || sitio}* — ${consulta}\n\n` +
          `${lineas}\n\n` +
          `_Baja uno con_ \`/${sitio} 1 ${consulta}\` _(cambia el número)._\n` +
          `_O pasa el enlace:_ \`/${sitio} <url del video>\``,
        quoted: msg,
      })
    }

    const elegido = videos[Math.max(0, Math.min(indice, videos.length - 1))]
    await sock.sendMessage(jid, {
      text: `⬇️ Bajando *${elegido.titulo}*...`,
      quoted: msg,
    })

    // 2) Descarga con tope
    let datos
    try {
      datos = await descargarVideo(elegido.url, { maxMB: MAX_MB })
    } catch (err) {
      // El tope o un mp4 que no publica enlace: se manda la página
      return sock.sendMessage(jid, {
        text:
          `❌ No pude bajar el video: ${err.message}\n\n` +
          `▸ ${elegido.url}`,
        quoted: msg,
      })
    }

    const pie =
      `🔞 *${datos.titulo}*\n` +
      `📦 ${(datos.buffer.length / 1048576).toFixed(1)} MB\n` +
      `▸ ${elegido.url.slice(0, 90)}`

    await sock.sendMessage(jid, {
      video: datos.buffer,
      mimetype: 'video/mp4',
      caption: pie,
      quoted: msg,
    })

    // La recarga se gasta solo si el video salió completo
    marcarUso(quien, CLAVE_RECARGA)
  }
}

/**
 * Handler por defecto del archivo: sirve para `/nsfwvideo <sitio> <búsqueda>`.
 * Los comandos del menú usan `fabricarComandoVideo`.
 */
export default async (ctx) => {
  const sitio = sitioDe(ctx.args?.[0])
  return fabricarComandoVideo(sitio)({ ...ctx, args: (ctx.args || []).slice(1) })
}

export { sitioDe, resolverVideo }
