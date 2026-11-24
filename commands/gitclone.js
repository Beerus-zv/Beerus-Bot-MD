/**
 * `/gitclone` — busca un repositorio de GitHub y lo manda como ZIP.
 *
 *   /gitclone owner/repo
 *   /gitclone https://github.com/owner/repo
 *
 * Usa la API pública de GitHub para leer la metadata (estrellas, lenguaje,
 * rama por defecto) y baja el ZIP de codeload. Sin token, así que el límite
 * de la API es 60 peticiones por hora por IP: suficiente para un bot.
 */
const MAXIMO_BYTES = 45 * 1024 * 1024
const TIMEOUT_MS = 60000

/** Extrae owner/repo de un texto libre o de una URL */
function parsearRepositorio(texto) {
  const limpio = String(texto || '').trim().replace(/\.git$/, '')
  if (!limpio) return null

  const url = limpio.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  if (url) return { owner: url[1], repo: url[2] }

  const corto = limpio.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (corto) return { owner: corto[1], repo: corto[2] }

  return null
}

/** fetch con AbortController y tope de tiempo */
async function pedir(url, opciones = {}) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: control.signal,
      headers: { 'User-Agent': 'Beerus-Bot-MD', ...(opciones.headers || {}) },
      ...opciones,
    })
  } finally {
    clearTimeout(temporizador)
  }
}

/** Lee un cuerpo de respuesta con tope de tamaño */
async function leerConTope(respuesta, tope) {
  const declarado = Number(respuesta.headers.get('content-length') || 0)
  if (declarado && declarado > tope) {
    throw new Error(`el ZIP pesa ${(declarado / 1048576).toFixed(1)} MB (tope ${(tope / 1048576).toFixed(0)} MB)`)
  }

  const partes = []
  let total = 0
  for await (const trozo of respuesta.body) {
    total += trozo.length
    if (total > tope) throw new Error(`el ZIP pasa del tope de ${(tope / 1048576).toFixed(0)} MB`)
    partes.push(trozo)
  }
  return Buffer.concat(partes)
}

export default async ({ sock, jid, msg, args }) => {
  const pedido = (args || []).join(' ').trim()

  if (!pedido) {
    return sock.sendMessage(jid, {
      text:
        '📦 *Descargar repositorio*\n\n' +
        '• `/gitclone owner/repo`\n' +
        '• `/gitclone https://github.com/owner/repo`\n\n' +
        `_Tope: ${(MAXIMO_BYTES / 1048576).toFixed(0)} MB._`,
      quoted: msg,
    })
  }

  const destino = parsearRepositorio(pedido)
  if (!destino) {
    return sock.sendMessage(jid, {
      text: '❌ No entendí el repositorio. Usa `owner/repo` o el link de GitHub.',
      quoted: msg,
    })
  }

  const { owner, repo } = destino
  await sock.sendMessage(jid, {
    text: `🔎 Buscando \`${owner}/${repo}\`...`,
    quoted: msg,
  })

  // 1) Metadata (también valida que el repo exista)
  let info
  try {
    const respuesta = await pedir(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (respuesta.status === 404) {
      return sock.sendMessage(jid, {
        text: `❌ No existe \`${owner}/${repo}\` o es privado.`,
        quoted: msg,
      })
    }
    if (respuesta.status === 403) {
      return sock.sendMessage(jid, {
        text: '❌ GitHub limitó las peticiones de esta IP. Probá en un rato.',
        quoted: msg,
      })
    }
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    info = await respuesta.json()
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ No pude leer el repositorio: ${err.message}`,
      quoted: msg,
    })
  }

  if (info.size && info.size * 1024 > MAXIMO_BYTES) {
    return sock.sendMessage(jid, {
      text:
        `❌ *${info.full_name}* pesa ~${(info.size / 1024).toFixed(1)} MB y el tope es ` +
        `${(MAXIMO_BYTES / 1048576).toFixed(0)} MB.`,
      quoted: msg,
    })
  }

  // 2) ZIP de la rama por defecto
  const rama = info.default_branch || 'main'
  let zip
  try {
    const respuesta = await pedir(
      `https://codeload.github.com/${info.full_name}/zip/refs/heads/${encodeURIComponent(rama)}`
    )
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    zip = await leerConTope(respuesta, MAXIMO_BYTES)
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ No pude bajar el ZIP: ${err.message}`,
      quoted: msg,
    })
  }

  const nombreArchivo = `${repo}-${rama}.zip`
  const pie =
    `📦 *${info.full_name}*\n\n` +
    `▸ *Rama:* ${rama}\n` +
    `▸ *Lenguaje:* ${info.language || 'sin definir'}\n` +
    `▸ *Estrellas:* ${info.stargazers_count ?? 0}\n` +
    `▸ *Tamaño:* ${(zip.length / 1024).toFixed(0)} KB\n` +
    (info.description ? `\n_${info.description}_\n` : '') +
    (info.html_url ? `\n${info.html_url}` : '')

  return sock.sendMessage(jid, {
    document: zip,
    mimetype: 'application/zip',
    fileName: nombreArchivo,
    caption: pie,
    quoted: msg,
  })
}
