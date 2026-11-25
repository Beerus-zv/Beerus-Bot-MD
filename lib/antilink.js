// ───────────── Antilink ─────────────
import { obtenerAntilink, dominiosPermitidos } from '../database/db.js'
import { esAdmin, tokenMencion } from './grupo.js'
import { log } from './logger.js'

// ───────────── Detección de enlaces ─────────────
// TLDs frecuentes: evita falsos positivos como "Sr.Mateo" o "archivo.pdf"
const TLD_VALIDOS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  'io', 'co', 'ai', 'app', 'dev', 'me', 'tv', 'gg', 'ly', 'sh', 'fm', 'cloud',
  'online', 'site', 'shop', 'store', 'blog', 'link', 'page', 'club', 'live',
  'world', 'today', 'news', 'tech', 'space', 'website', 'xyz', 'top', 'vip',
  'es', 'mx', 'ar', 'cl', 'co', 've', 'pe', 'uy', 'py', 'bo', 'ec', 'cu', 'do',
  'gt', 'br', 'pt', 'it', 'fr', 'de', 'uk', 'ru', 'cn', 'jp', 'kr', 'in', 'id',
  'tr', 'nl', 'se', 'no', 'fi', 'pl', 'ch', 'at', 'be', 'cz', 'gr', 'hu', 'ro',
  'ua', 'ca', 'au', 'nz', 'ie', 'il', 'sa', 'ae', 'cl', 'to', 'tv', 'gg', 'im',
])

const URL_PATTERN = /\b((?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.([a-z]{2,24}))(\/[^\s]*)?)/gi

/**
 * Extrae los enlaces de un texto.
 * @returns {{ url: string, dominio: string }[]}
 */
export function detectarLinks(texto) {
  const encontrados = []
  const palabras = String(texto || '').split(/\s+/).filter(Boolean)

  for (const palabra of palabras) {
    let coincidencia
    URL_PATTERN.lastIndex = 0
    while ((coincidencia = URL_PATTERN.exec(palabra)) !== null) {
      const tld = (coincidencia[3] || '').toLowerCase()
      if (!TLD_VALIDOS.has(tld)) continue

      encontrados.push({
        url: coincidencia[0],
        dominio: (coincidencia[2] || '').toLowerCase(),
      })
    }
  }
  return encontrados
}

export function contieneLink(texto) {
  return detectarLinks(texto).length > 0
}

export function esDominioPermitido(dominio, whitelist = []) {
  if (!dominio) return true
  const limpio = dominio.toLowerCase()
  return whitelist.some((w) => {
    const permitido = String(w).trim().toLowerCase()
    if (!permitido) return false
    return limpio === permitido || limpio.endsWith(`.${permitido}`)
  })
}

/**
 * Revisa un mensaje de grupo y aplica la acción configurada en el antilink.
 * @returns {Promise<null | { accion: string, dominio: string }>}
 */
export async function revisarAntilink({ sock, jid, msg, sender, texto, metadata }) {
  if (!jid?.endsWith('@g.us')) return null

  const config = obtenerAntilink(jid)
  if (!config || !config.activo) return null

  const links = detectarLinks(texto)
  if (links.length === 0) return null

  const permitidos = dominiosPermitidos(jid)
  const linksBloqueados = links.filter((l) => !esDominioPermitido(l.dominio, permitidos))
  if (linksBloqueados.length === 0) return null

  const dominio = linksBloqueados[0].dominio

  // Los administradores del grupo y el propio bot nunca son sancionados
  if (metadata && esAdmin(metadata, sender)) return null
  if (sender === sock.user?.id) return null

  const accion = config.accion || 'kick'

  try {
    if (accion === 'kick') {
      await sock.groupMemberRemove(jid, sender)
    } else if (accion === 'ban') {
      await sock.groupMemberRemove(jid, sender)
      await sock.sendMessage(jid, {
        text: `🚫 *Enlace bloqueado*\nEl usuario ${tokenMencion(sender)} fue removido por enviar enlaces no permitidos.`,
        mentions: [sender],
      })
    } else {
      // 'delete' o 'warn': solo avisa
      await sock.sendMessage(jid, {
        text: `⚠️ *Enlace no permitido*\nEl usuario ${tokenMencion(sender)} envió un enlace (${dominio}).\nNo se permiten enlaces en este grupo.`,
        mentions: [sender],
      })
    }
  } catch (err) {
    log.error('No se pudo aplicar la acción de antilink', err)
    await sock.sendMessage(jid, {
      text: `⚠️ Se detectó un enlace no permitido (${dominio}), pero no se pudo aplicar la acción.`,
    })
  }

  return { accion, dominio }
}