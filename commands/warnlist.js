/**
 * `/warnlist` — lista general de advertencias del grupo.
 *
 *   /warnlist            todos los miembros con advertencias, de más a menos
 *   /warnlist @usuario   detalle de un miembro con la razón de cada una
 *
 * `/advertencia @usuario lista` sigue existiendo para un solo miembro; esto es
 * la vista de grupo que faltaba.
 */
import { advertenciasPorGrupo, listarAdvertencias, limiteAdvertencias } from '../database/db.js'
import { obtenerMetadata, resolverObjetivo, tokenMencion, jidUsuario, esGrupo } from '../lib/grupo.js'

/** Nombre legible de un participante del grupo */
function nombreDe(metadata, jid) {
  const p = metadata?.participants?.find(
    (x) => x.id === jid || x.phoneNumber === jid || x.lid === jid
  )
  return p?.name || p?.notify || jid.split('@')[0]
}

export default async ({ sock, jid, msg, args }) => {
  if (!esGrupo(jid)) {
    return sock.sendMessage(jid, {
      text: '❌ Las advertencias solo existen en grupos.',
      quoted: msg,
    })
  }

  const metadata = await obtenerMetadata(sock, jid).catch(() => null)
  const limite = limiteAdvertencias(jid)

  // Detalle de un miembro
  const objetivo = resolverObjetivo(metadata, msg, args)
  if (objetivo?.participante) {
    const quien = objetivo.participante
    const filas = listarAdvertencias(jid, quien.id, 20)
    if (!filas.length) {
      return sock.sendMessage(jid, {
        text: `✅ ${nombreDe(metadata, quien.id)} no tiene advertencias.`,
        quoted: msg,
        mentions: [jidUsuario(quien.id)],
      })
    }
    const lineas = filas.map((f, i) => {
      const fecha = String(f.creado_en || '').slice(0, 16)
      const razon = f.razon ? ` — ${f.razon}` : ''
      return `${i + 1}. ${fecha}${razon}`
    })
    return sock.sendMessage(jid, {
      text:
        `⚠️ *Advertencias de ${nombreDe(metadata, quien.id)}* (${filas.length}/${limite})\n\n` +
        `${lineas.join('\n')}\n\n` +
        `_Para limpiarlas:_ \`/advertencia @usuario borrar\``,
      quoted: msg,
      mentions: [jidUsuario(quien.id)],
    })
  }

  // Lista general
  const filas = advertenciasPorGrupo(jid)
  if (!filas.length) {
    return sock.sendMessage(jid, {
      text: `✅ *Sin advertencias.*\n\n_Nadie del grupo tiene faltas registradas._\n_Límite actual:_ ${limite}`,
      quoted: msg,
    })
  }

  const menciones = []
  const lineas = filas.map((f) => {
    const destino = jidUsuario(f.jid)
    menciones.push(destino)
    const marca = f.total >= limite ? ' 🚫' : ''
    return `▸ ${tokenMencion(destino)} — *${f.total}*${marca}`
  })

  return sock.sendMessage(jid, {
    text:
      `⚠️ *Advertencias del grupo* (${filas.length} miembros)\n\n` +
      `${lineas.join('\n')}\n\n` +
      `_Límite:_ ${limite} · 🚫 = llegó al límite\n` +
      `_Detalle:_ \`/warnlist @usuario\``,
    quoted: msg,
    mentions: menciones,
  })
}
