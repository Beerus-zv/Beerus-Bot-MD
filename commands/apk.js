/**
 * `/apk <búsqueda>` — busca apps Android y manda el APK.
 *
 *   /apk whatsapp              busca y lista los 5 primeros con botones
 *   /apk 2 whatsapp            descarga el resultado 2
 *   /apk <package>             va directo: /apk com.whatsapp
 *   /apk <link de play store>  saca el package del enlace
 *
 * La API pública de Aptoide (v7) no pide clave y devuelve el enlace directo
 * del APK en `file.path`. WhatsApp admite 100 MB por documento, así que lo
 * que pase de ahí se responde con el enlace en vez del archivo.
 */
const API = 'https://ws75.aptoide.com/api/7'
const MAX_MB = 100
const MAX_BYTES = MAX_MB * 1024 * 1024
const TIMEOUT_MS = 45000

/** fetch con tope de tiempo */
async function pedirJson(url) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Beerus-Bot-MD', Accept: 'application/json' },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(temporizador)
  }
}

/** Descarga el APK con tope de tamaño (por cabecera y por lectura) */
async function bajarApk(url) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 180000)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Beerus-Bot-MD' },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const declarado = Number(res.headers.get('content-length') || 0)
    if (declarado && declarado > MAX_BYTES) {
      throw new Error(`pesa ${mb(declarado)} y el tope es ${MAX_MB} MB`)
    }

    const partes = []
    let total = 0
    for await (const trozo of res.body) {
      total += trozo.length
      if (total > MAX_BYTES) throw new Error(`pasa del tope de ${MAX_MB} MB`)
      partes.push(trozo)
    }
    return Buffer.concat(partes)
  } finally {
    clearTimeout(temporizador)
  }
}

/** Bytes a "12.4 MB" */
function mb(bytes) {
  return `${(Number(bytes || 0) / 1048576).toFixed(1)} MB`
}

/** Saca el package de un enlace de Play Store o de un texto tipo com.algo.app */
function packageDe(texto) {
  const limpio = String(texto || '').trim()
  if (!limpio) return null
  const play = limpio.match(/[?&]id=([A-Za-z0-9_.]+)/)
  if (play) return play[1]
  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,}$/i.test(limpio)) return limpio
  return null
}

/** Formatea un resultado de Aptoide como línea de lista */
function lineaDe(app, i) {
  const version = app.file?.vername || '?'
  const tam = mb(app.file?.filesize || app.size)
  const dev = app.developer?.name || 'sin dev'
  return `*${i + 1}.* ${app.name}\n    ${dev} · v${version} · ${tam}`
}

export default async ({ sock, jid, msg, args }) => {
  const partes = [...(args || [])]

  if (!partes.length) {
    return sock.sendMessage(jid, {
      text:
        '📱 *APKs de Android*\n\n' +
        '• `/apk whatsapp` — busca y lista resultados\n' +
        '• `/apk 2 whatsapp` — descarga el resultado 2\n' +
        '• `/apk com.whatsapp` — va directo por package\n' +
        '• `/apk <link de play store>`\n\n' +
        `_Tope de envío: ${MAX_MB} MB._`,
      quoted: msg,
    })
  }

  // Índice opcional al principio
  let indice = null
  if (/^\d+$/.test(partes[0]) && partes.length > 1) {
    indice = Number(partes.shift()) - 1
  }

  const consulta = partes.join(' ').trim()
  const paquete = packageDe(consulta)

  let app = null

  // 1) Package exacto: getMeta suele ser más certero que la búsqueda
  if (paquete) {
    try {
      const datos = await pedirJson(`${API}/app/getMeta?package_name=${encodeURIComponent(paquete)}`)
      app = datos?.nodes?.meta?.data ?? null
    } catch {
      app = null
    }
  }

  // 2) Búsqueda por texto
  let resultados = []
  if (!app) {
    try {
      const datos = await pedirJson(`${API}/apps/search?query=${encodeURIComponent(consulta)}&limit=8`)
      resultados = (datos?.datalist?.list || []).filter((a) => a?.file?.path)
    } catch (err) {
      return sock.sendMessage(jid, {
        text: `❌ Aptoide no respondió: ${err.message}`,
        quoted: msg,
      })
    }

    if (!resultados.length) {
      return sock.sendMessage(jid, {
        text: `📭 Sin resultados para *${consulta}* en Aptoide.`,
        quoted: msg,
      })
    }

    // Sin índice: lista para que elija
    if (indice === null) {
      const top = resultados.slice(0, 5)
      return sock.sendMessage(jid, {
        text:
          `📱 *Resultados para* ${consulta}\n\n` +
          `${top.map(lineaDe).join('\n\n')}\n\n` +
          `_Descarga con_ \`/apk 1 ${consulta}\` _(cambia el número)._\n` +
          `_O el package directo:_ \`/apk ${top[0].package}\``,
        quoted: msg,
      })
    }

    app = resultados[Math.max(0, Math.min(indice, resultados.length - 1))]
  }

  if (!app?.file?.path) {
    return sock.sendMessage(jid, {
      text: '❌ No encontré un APK descargable para eso.',
      quoted: msg,
    })
  }

  const tam = Number(app.file.filesize || app.size || 0)
  if (tam > MAX_BYTES) {
    return sock.sendMessage(jid, {
      text:
        `📱 *${app.name}* v${app.file.vername || '?'}\n\n` +
        `Pesa *${mb(tam)}* y WhatsApp no pasa de ${MAX_MB} MB por archivo.\n\n` +
        `▸ Descarga directa:\n${app.file.path}`,
      quoted: msg,
    })
  }

  await sock.sendMessage(jid, {
    text: `⬇️ Bajando *${app.name}* v${app.file.vername || '?'} (${mb(tam)})...`,
    quoted: msg,
  })

  let apk
  try {
    apk = await bajarApk(app.file.path)
  } catch (err) {
    return sock.sendMessage(jid, {
      text:
        `❌ No pude bajar el APK: ${err.message}\n\n` +
        `▸ Enlace directo:\n${app.file.path}`,
      quoted: msg,
    })
  }

  const nombreArchivo = `${String(app.name || app.package).replace(/[^\w.\- ]+/g, '_')}-${app.file.vername || 'app'}.apk`

  return sock.sendMessage(jid, {
    document: apk,
    mimetype: 'application/vnd.android.package-archive',
    fileName: nombreArchivo,
    caption:
      `📱 *${app.name}*\n\n` +
      `▸ *Package:* ${app.package}\n` +
      `▸ *Versión:* ${app.file.vername || '?'}\n` +
      `▸ *Desarrollador:* ${app.developer?.name || 'sin datos'}\n` +
      `▸ *Tamaño:* ${mb(apk.length)}\n` +
      (app.file.md5sum ? `▸ *MD5:* ${app.file.md5sum}\n` : '') +
      `\n_Aptoide · instala con "orígenes desconocidos" activado._`,
    quoted: msg,
  })
}
