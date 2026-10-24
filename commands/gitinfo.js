import { pedirJson } from '../lib/internet.js'

/**
 * Información de un repositorio de GitHub (plugin 'gitinfo' de MEGA-MD).
 * Uso: /gitinfo <usuario>/<repo>
 */
export default async ({ sock, jid, msg, args }) => {
  const repo = (args?.[0] || '').trim().replace(/\.git$/, '')
  const m = repo.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)$/)
  if (!m) {
    await sock.sendMessage(jid, {
      text:
        '🐙 *Info de repositorio GitHub*\n\n' +
        '*Uso:* `/gitinfo usuario/repositorio`\n\n' +
        '*Ejemplo:* `/gitinfo GlobalTechInfo/MEGA-MD`',
      quoted: msg,
    })
    return
  }

  const [, dueno, nombre] = m
  await sock.sendMessage(jid, { text: '🔎 Consultando el repo...' })

  try {
    const r = await pedirJson(`https://api.github.com/repos/${dueno}/${nombre}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })

    let clonados = '—'
    let estrellas = 0
    try {
      const visitantes = await pedirJson(`https://api.github.com/repos/${dueno}/${nombre}/traffic/clones`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      clonados = visitantes.uniques ?? '—'
    } catch {
      // la estadística de clones requiere token: si falla, no importa
    }
    estrellas = r.stargazers_count ?? 0

    const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES') : '?'
    const actualizar = r.pushed_at ? new Date(r.pushed_at).toLocaleDateString('es-ES') : '?'

    const texto =
      `🐙 *GitHub*\n\n` +
      `📦 *${r.full_name}*\n\n` +
      `${r.description || '_Sin descripcion._'}\n\n` +
      `⭐ *Estrellas:* ${estrellas}\n` +
      `🍴 *Forks:* ${r.forks_count ?? '—'}\n` +
      `👁️ *Watchers:* ${r.subscribers_count ?? '—'}\n` +
      `🧩 *Issues abiertos:* ${r.open_issues_count ?? '—'}\n` +
      `📚 *Lenguaje principal:* ${r.language || '—'}\n` +
      `📏 *Tamaño:* ${Math.round((r.size || 0) / 1024 * 10) / 10} MB\n\n` +
      `🚀 *Clones (30 dias):* ${clonados}\n` +
      `📅 *Creado:* ${fecha}\n` +
      `🔄 *Ultimo push:* ${actualizar}\n` +
      `🔒 *Licencia:* ${r.license?.spdx_id || 'Sin licencia'}\n\n` +
      `🔗 ${r.html_url}`

    await sock.sendMessage(jid, {
      text: texto,
      quoted: msg,
    })
  } catch (err) {
    const noExiste = String(err?.message).includes('404')
    await sock.sendMessage(jid, {
      text: noExiste
        ? '❓ Ese repositorio no existe o es privado.'
        : '❌ Fallo la consulta a GitHub. Intenta de nuevo.',
      quoted: msg,
    })
  }
}
