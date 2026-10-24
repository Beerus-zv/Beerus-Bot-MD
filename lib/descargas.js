/**
 * Motor de descargas de contenido de internet.
 *
 * - yt-dlp (binario) para todo lo que soporta: YouTube, TikTok, Facebook,
 *   Instagram, Twitter/X, Reddit, Vimeo, SoundCloud...
 * - Scraper propio para MediaFire y Google Drive, que yt-dlp no soporta.
 *
 * El binario de yt-dlp vive en data/yt-dlp y se descarga solo la primera vez.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

const DIR_YTDLP = path.resolve('data', 'yt-dlp')
const DIR_TMP = path.resolve('data', 'tmp')

/** Limites practicos de WhatsApp (en MB) */
export const LIMITES = { video: 25, audio: 16, documento: 100 }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

let motor = null

/** Ruta del binario de yt-dlp */
export function rutaYtdlp() {
  return path.join(DIR_YTDLP, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

/** Plataformas que reconoce el bot */
export const PLATAFORMAS = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  reddit: 'Reddit',
  mediafire: 'MediaFire',
  gdrive: 'Google Drive',
  soundcloud: 'SoundCloud',
  vimeo: 'Vimeo',
  pinterest: 'Pinterest',
  directo: 'Enlace directo',
}

const PATRONES = [
  ['youtube', /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)/i],
  ['tiktok', /(^|\.)tiktok\.com/i],
  ['facebook', /(^|\.)(facebook\.com|fb\.watch|fb\.com)/i],
  ['instagram', /(^|\.)instagram\.com/i],
  ['twitter', /(^|\.)(twitter\.com|x\.com)/i],
  ['reddit', /(^|\.)reddit\.com/i],
  ['mediafire', /(^|\.)mediafire\.com/i],
  ['gdrive', /(^|\.)drive\.google\.com/i],
  ['soundcloud', /(^|\.)soundcloud\.com/i],
  ['vimeo', /(^|\.)vimeo\.com/i],
  ['pinterest', /(^|\.)(pinterest\.[a-z.]+|pin\.it)/i],
]

const EXTENSIONES_ARCHIVO = /\.(mp4|m4v|webm|mov|mkv|3gp|avi|mp3|m4a|ogg|opus|aac|flac|wav|jpg|jpeg|png|gif|webp|zip|rar|7z|pdf|apk|exe)$/i

/**
 * Detecta de que plataforma es un enlace.
 * @returns {string} clave de PLATAFORMAS o 'desconocido'
 */
export function detectarPlataforma(url) {
  let ruta
  try {
    ruta = new URL(url)
  } catch {
    return 'desconocido'
  }

  for (const [nombre, patron] of PATRONES) {
    if (patron.test(ruta.hostname)) return nombre
  }

  if (EXTENSIONES_ARCHIVO.test(ruta.pathname)) return 'directo'
  return 'desconocido'
}

/** Indica si el texto parece un enlace */
export function esUrl(texto) {
  return /^https?:\/\/\S+$/i.test(String(texto || '').trim())
}

/**
 * Descarga un archivo binario respetando un limite de tamano.
 * @param {string} url
 * @param {{maxBytes?:number, headers?:object}} opciones
 * @returns {Promise<Buffer>}
 */
export async function bajarArchivo(url, { maxBytes = 100 * 1024 * 1024, headers = {} } = {}) {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 120000)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      redirect: 'follow',
      signal: control.signal,
    })

    if (!res.ok) throw new Error(`El servidor respondio ${res.status}`)

    const declarada = Number(res.headers.get('content-length') || 0)
    if (declarada && declarada > maxBytes) {
      throw new Error('El archivo supera el tamano maximo permitido')
    }

    const partes = []
    let total = 0

    for await (const trozo of res.body) {
      total += trozo.length
      if (total > maxBytes) throw new Error('El archivo supera el tamano maximo permitido')
      partes.push(Buffer.from(trozo))
    }

    return Buffer.concat(partes)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Carga o crea la instancia de yt-dlp con el binario en su lugar.
 * Ejecuta una sola vez por proceso.
 */
export async function obtenerMotor() {
  if (motor) return motor
  const mod = await import('yt-dlp-wrap')
  const YtDlp = mod.default?.default ?? mod.default
  const binario = rutaYtdlp()

  if (!fs.existsSync(binario)) {
    if (!fs.existsSync(DIR_YTDLP)) fs.mkdirSync(DIR_YTDLP, { recursive: true })
    console.log('⬇️ Descargando el binario de yt-dlp (solo la primera vez, ~18 MB)...')
    await YtDlp.downloadFromGithub(binario)
  }

  const instancia = new YtDlp()
  instancia.setBinaryPath(binario)
  motor = instancia
  return instancia
}

/** Obtiene los metadatos del recurso con el json de yt-dlp */
async function infoYtdlp(instancia, url) {
  const salida = await instancia.execPromise([
    '-J', '--no-playlist', '--no-warnings', '--skip-download', '--no-check-certificates', url,
  ])
  return JSON.parse(salida.trim().split('\n')[0])
}

/** Elige el mejor formato que quepa dentro de maxBytes */
function elegirFormato(info, { maxBytes, soloAudio }) {
  const formatos = info.formats ?? []
  const tam = (f) => f.filesize ?? f.filesize_approx ?? 0
  const usable = (f) => Boolean(f?.url)

  if (soloAudio) {
    const audios = formatos
      .filter((f) => usable(f) && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))
    if (!audios.length) return null

    // WhatsApp reproduce bien el audio m4a, asi que se prefiere sobre webm/opus
    const conEspacio = audios.filter((f) => tam(f) > 0 && tam(f) <= maxBytes)
    const pool = conEspacio.length ? conEspacio : audios
    const elegido = pool.sort(
      (a, b) =>
        (a.ext === 'm4a' ? 0 : 1) - (b.ext === 'm4a' ? 0 : 1) ||
        (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0),
    )[0]

    return { selector: elegido.format_id, estimado: tam(elegido), como: elegido }
  }

  // Progresivo: video y audio en un solo archivo (sinneed ffmpeg)
  const progresivos = formatos
    .filter((f) => usable(f) && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .filter((f) => (f.height ?? 0) <= 1080)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || tam(a) - tam(b))

  const elegido = progresivos.find((f) => tam(f) > 0 && tam(f) <= maxBytes)
  if (elegido) return { selector: elegido.format_id, estimado: tam(elegido), como: elegido }

  // Pistas separadas: se fusionan con ffmpeg (viene con yt-dlp)
  const videos = formatos
    .filter((f) => usable(f) && f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'))
    .filter((f) => (f.height ?? 0) <= 1080)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
  const audios = formatos
    .filter((f) => usable(f) && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))

  if (videos.length && audios.length) {
    const v = videos.find((f) => tam(f) + tam(audios[0]) <= maxBytes) ?? videos[0]
    const a = audios[0]
    return { selector: `${v.format_id}+${a.format_id}`, estimado: tam(v) + tam(a) }
  }

  if (progresivos.length) {
    return { selector: progresivos[0].format_id, estimado: tam(progresivos[0]), como: progresivos[0] }
  }
  return null
}

/** Borra los archivos temporales de una descarga fallida */
function limpiarTmp(marca) {
  try {
    for (const nombre of fs.readdirSync(DIR_TMP)) {
      if (!nombre.startsWith(`dl_${marca}`)) continue
      fs.unlinkSync(path.join(DIR_TMP, nombre))
    }
  } catch {
    // si no se puede borrar, se ignora
  }
}

/**
 * Baja un recurso con yt-dlp a un archivo temporal y devuelve su ruta.
 * YouTube devuelve 403 de forma intermitente, asi que se reintenta.
 */
async function bajarConYtdlp(instancia, url, selector, { soloAudio, intentos = 3 }) {
  if (!fs.existsSync(DIR_TMP)) fs.mkdirSync(DIR_TMP, { recursive: true })

  let ultimoError = null

  for (let intento = 1; intento <= intentos; intento++) {
    const marca = Date.now()
    const destino = path.join(DIR_TMP, `dl_${marca}.%(ext)s`)

    const args = [
      '--no-playlist', '--no-warnings', '--no-part', '--newline', '--no-check-certificates',
      '-f', selector, '-o', destino, url,
    ]
    if (!soloAudio) args.push('--merge-output-format', 'mp4')

    try {
      await instancia.execPromise(args)
    } catch (err) {
      ultimoError = err
      limpiarTmp(marca)
      if (intento < intentos) {
        console.warn(`[descargas] Intento ${intento}/${intentos} fallido, reintentando...`)
        await new Promise((r) => setTimeout(r, 1500 * intento))
        continue
      }
      throw err
    }

    const archivos = fs.readdirSync(DIR_TMP).filter(
      (n) => n.startsWith(`dl_${marca}`) && !n.endsWith('.part'),
    )
    if (!archivos.length) {
      limpiarTmp(marca)
      throw new Error('No se pudo descargar el contenido')
    }

    return path.join(DIR_TMP, archivos[0])
  }

  throw ultimoError ?? new Error('No se pudo descargar el contenido')
}

/** Formatea un numero de segundos como duracion */
export function formatearDuracion(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Busca en YouTube con el motor de yt-dlp usando `ytsearchN:consulta`.
 * Devuelve una lista normalizada de resultados.
 *
 * @param {string} consulta
 * @param {number} limite
 * @returns {Promise<Array<{id:string, titulo:string, canal:string, duracion:number|null, url:string, thumb:string|null}>>}
 */
export async function buscarEnYouTube(consulta, limite = 5) {
  const instancia = await obtenerMotor()

  const args = [
    '-J',
    '--no-warnings',
    '--skip-download',
    '--ignore-errors',
    '--no-playlist',
    `ytsearch${limite}:${consulta}`,
  ]

  // yt-dlp puede salir con codigo de error si un video de la lista ya no
  // existe; el JSON con el resto de resultados sigue en stdout. El wrapper
  // de yt-dlp-wrap pierde el stdout en el rechazo, asi que se ejecuta con
  // execFile directamente (su error si trae stdout).
  let salida = ''
  try {
    const { stdout } = await ejecutar(instancia.binaryPath, args, { maxBuffer: 256 * 1024 * 1024 })
    salida = stdout
  } catch (err) {
    salida = err?.stdout ?? ''
    if (!salida.trim()) throw err
  }

  const datos = JSON.parse(salida.trim())
  const entradas = datos.entries ?? []

  return entradas
    .filter((e) => e?.id)
    .map((e) => ({
      id: e.id,
      titulo: e.title || 'Sin titulo',
      canal: e.uploader || e.channel || '',
      duracion: e.duration ?? null,
      url: e.webpage_url || `https://www.youtube.com/watch?v=${e.id}`,
      thumb: e.thumbnail || e.thumbnails?.[0]?.url || null,
    }))
}

/** Detecta si ffmpeg esta disponible en el PATH (para crear notas de voz) */
let ffmpegCache = null
export async function ffmpegDisponible() {
  if (ffmpegCache !== null) return ffmpegCache
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which'
    await ejecutar(bin, ['ffmpeg'], { timeout: 5000 })
    ffmpegCache = true
  } catch {
    ffmpegCache = false
  }
  return ffmpegCache
}

/**
 * Convierte un audio (m4a/webm/mp3) a nota de voz de WhatsApp:
 * opus, mono, 16 kHz. Necesita ffmpeg.
 * @returns {Promise<{buffer:Buffer, extension:'ogg'}|null>}
 */
export async function convertirANotaVoz(buffer, extension) {
  if (!(await ffmpegDisponible())) return null
  if (!fs.existsSync(DIR_TMP)) fs.mkdirSync(DIR_TMP, { recursive: true })

  const marca = Date.now()
  const origen = path.join(DIR_TMP, `ptt_${marca}.${(extension || 'bin').replace('.', '')}`)
  const destino = path.join(DIR_TMP, `ptt_${marca}.ogg`)

  fs.writeFileSync(origen, buffer)

  try {
    await ejecutar(
      'ffmpeg',
      ['-y', '-i', origen, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '16000', destino],
      { timeout: 120000 }
    )
    return { buffer: fs.readFileSync(destino), extension: 'ogg' }
  } catch (err) {
    console.error('ffmpeg no pudo convertir a nota de voz:', err.message)
    return null
  } finally {
    for (const archivo of [origen, destino]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        // se ignora
      }
    }
  }
}

/** Devuelve 'video', 'audio', 'imagen' o null segun la extension */
export function tipoDeArchivo(extension) {
  const e = (extension || '').toLowerCase().replace(/^\./, '')
  if (['mp4', 'm4v', 'webm', 'mov', 'mkv', '3gp', 'avi'].includes(e)) return 'video'
  if (['mp3', 'm4a', 'ogg', 'opus', 'aac', 'flac', 'wav'].includes(e)) return 'audio'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return 'imagen'
  return null
}


/** Limpia un nombre de archivo de los caracteres prohibidos */
function limpiarNombre(texto, largo = 60) {
  return String(texto || 'archivo')
    .replace(/[\\/:*?"<>| -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, largo)
}

/** MediaFire no lo soporta yt-dlp: se saca el enlace directo del HTML */
export async function resolverMediafire(url, maxBytes) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`MediaFire respondio ${res.status}`)

  const html = await res.text()
  const coincidencia = html.match(/https:\/\/download\d+\.mediafire\.com\/[^"'<>\\s]+/)

  if (!coincidencia) {
    throw new Error('No se encontro el enlace de descarga (puede ser privado o estar caducado)')
  }

  const enlace = coincidencia[0].replace(/&amp;/g, '&')
  const buffer = await bajarArchivo(enlace, { maxBytes })

  const nombreUrl = decodeURIComponent(new URL(enlace).pathname.split('/').pop() || 'archivo')
  const titulo = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s*-\s*MediaFire\s*$/i, '').trim()
  const nombre = limpiarNombre(titulo || nombreUrl)

  return {
    buffer,
    nombre: nombre.includes('.') ? nombre : `${nombre}.zip`,
    extension: (nombre.split('.').pop() || 'zip').toLowerCase(),
    plataforma: 'mediafire',
    titulo: titulo || nombre,
    autor: '',
    thumb: null,
    duracion: null,
    bytes: buffer.length,
  }
}

/** Google Drive: enlace directo de export, con pagina de confirmacion para archivos grandes */
export async function resolverGdrive(url, maxBytes) {
  const id = url.match(/[?&]id=([\w-]+)/)?.[1] ?? url.match(/\/d\/([\w-]+)/)?.[1]
  if (!id) throw new Error('No se pudo obtener el ID del archivo de Google Drive')

  const directo = `https://drive.google.com/uc?export=download&id=${id}`
  const res = await fetch(directo, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  const tipo = res.headers.get('content-type') || ''

  if (!tipo.includes('text/html')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > maxBytes) throw new Error('El archivo supera el tamano maximo permitido')
    const nombre = limpiarNombre(id)
    return {
      buffer,
      nombre: `${nombre}.bin`,
      extension: 'bin',
      plataforma: 'gdrive',
      titulo: nombre,
      autor: '',
      thumb: null,
      duracion: null,
      bytes: buffer.length,
    }
  }

  // Pagina de confirmacion: se reintenta con el token que devuelve
  const html = await res.text()
  const accion = html.match(/action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
  const uuid = html.match(/name="uuid" value="([^"]+)"/)?.[1]
  const token = html.match(/name="confirm" value="([^"]+)"/)?.[1]

  if (!accion || !uuid) throw new Error('Google Drive no dejo descargar ese archivo')

  const separator = accion.includes('?') ? '&' : '?'
  const final = `${accion}${separator}id=${id}&export=download&confirm=${token ?? 't'}&uuid=${uuid}`
  const buffer = await bajarArchivo(final, { maxBytes })
  const nombre = limpiarNombre(id)

  return {
    buffer,
    nombre: `${nombre}.bin`,
    extension: 'bin',
    plataforma: 'gdrive',
    titulo: nombre,
    autor: '',
    thumb: null,
    duracion: null,
    bytes: buffer.length,
  }
}


/**
 * Descarga un contenido de cualquier plataforma soportada.
 *
 * @param {string} url enlace a descargar
 * @param {{maxMB?:number, soloAudio?:boolean}} opciones
 * @returns {Promise<{buffer:Buffer, nombre:string, extension:string, plataforma:string,
 *   titulo:string, autor:string, thumb:string|null, duracion:number|null, bytes:number}>}
 */
export async function descargarContenido(url, { maxMB = 25, soloAudio = false } = {}) {
  const plataforma = detectarPlataforma(url)
  const maxBytes = Math.round(maxMB * 1024 * 1024)

  if (plataforma === 'mediafire') return resolverMediafire(url, maxBytes)
  if (plataforma === 'gdrive') return resolverGdrive(url, maxBytes)

  if (plataforma === 'directo') {
    const buffer = await bajarArchivo(url, { maxBytes })
    const ruta = new URL(url)
    const nombreUrl = decodeURIComponent(ruta.pathname.split('/').pop() || 'archivo')
    const extension = (nombreUrl.split('.').pop() || 'bin').toLowerCase()
    return {
      buffer,
      nombre: limpiarNombre(nombreUrl),
      extension,
      plataforma,
      titulo: nombreUrl,
      autor: '',
      thumb: null,
      duracion: null,
      bytes: buffer.length,
    }
  }

  const instancia = await obtenerMotor()
  const info = await infoYtdlp(instancia, url)

  const eleccion = elegirFormato(info, { maxBytes, soloAudio })
  if (!eleccion) throw new Error('No se encontro ningun formato descargable en ese enlace')

  const archivo = await bajarConYtdlp(instancia, url, eleccion.selector, { soloAudio })
  const buffer = fs.readFileSync(archivo)
  const extension = (path.extname(archivo).replace('.', '') || eleccion.como?.ext || 'mp4').toLowerCase()

  try {
    fs.unlinkSync(archivo)
  } catch {
    // si no se puede borrar, se ignora
  }

  const titulo = limpiarNombre(info.title || info.id || 'descarga')
  const autor = info.uploader || info.channel || info.creator || ''

  return {
    buffer,
    nombre: `${titulo}.${extension}`,
    extension,
    plataforma: plataforma === 'desconocido' ? (info.extractor_key || 'web') : plataforma,
    titulo,
    autor,
    thumb: info.thumbnail || null,
    duracion: info.duration ?? null,
    bytes: buffer.length,
  }
}

/** Descarga la miniatura y la pasa a JPEG (WhatsApp no acepta webp) */
export async function miniaturaJpeg(url) {
  if (!url) return null
  try {
    const buffer = await bajarArchivo(url, { maxBytes: 4 * 1024 * 1024 })
    const { default: sharp } = await import('sharp')
    return await sharp(buffer).jpeg({ quality: 72 }).toBuffer()
  } catch {
    return null
  }
}

/** Mime type a partir de la extension */
export function mimeDe(extension) {
  const mapa = {
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mkv: 'video/x-matroska', '3gp': 'video/3gpp', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg',
    aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    pdf: 'application/pdf', apk: 'application/vnd.android.package-archive',
  }
  return mapa[extension] || 'application/octet-stream'
}

/** Arma el pie de foto del archivo descargado */
function pieDeFoto(resultado) {
  const { titulo, autor, duracion, plataforma, bytes } = resultado
  const lineas = []

  if (titulo) lineas.push(`*${titulo}*`)

  const datos = []
  if (autor) datos.push(`👤 ${autor}`)
  if (duracion) datos.push(`⏱️ ${formatearDuracion(duracion)}`)
  datos.push(`📦 ${(bytes / 1048576).toFixed(1)} MB`)
  lineas.push(datos.join(' • '))
  lineas.push(`_🌐 ${PLATAFORMAS[plataforma] || plataforma}_`)

  return lineas.join('\n')
}

/**
 * Envia el resultado de una descarga a WhatsApp segun su tipo y tamano.
 * Los archivos grandes se envian como documento para no perderlos.
 */
export async function enviarDescarga(sock, jid, msg, resultado) {
  const { buffer, extension } = resultado
  const tipo = tipoDeArchivo(extension)
  const pie = pieDeFoto(resultado)
  const miniatura = resultado.thumb ? await miniaturaJpeg(resultado.thumb) : null

  const limite = (mb) => mb * 1024 * 1024

  if (tipo === 'video' && buffer.length <= limite(LIMITES.video)) {
    await sock.sendMessage(jid, {
      video: buffer,
      mimetype: mimeDe(extension),
      caption: pie,
      ...(miniatura ? { thumbnail: miniatura } : {}),
      quoted: msg,
    })
    return 'video'
  }

  if (tipo === 'audio' && buffer.length <= limite(LIMITES.audio)) {
    const esNotaVoz = Boolean(resultado.ptt)
    await sock.sendMessage(jid, {
      audio: buffer,
      mimetype: esNotaVoz ? 'audio/ogg; codecs=opus' : mimeDe(extension),
      ptt: esNotaVoz,
      ...(esNotaVoz ? {} : { caption: pie }),
      ...(miniatura && !esNotaVoz ? { thumbnail: miniatura } : {}),
      quoted: msg,
    })
    return esNotaVoz ? 'nota de voz' : 'audio'
  }

  if (tipo === 'imagen' && buffer.length <= limite(LIMITES.video)) {
    await sock.sendMessage(jid, {
      image: buffer,
      caption: pie,
      ...(miniatura ? { thumbnail: miniatura } : {}),
      quoted: msg,
    })
    return 'imagen'
  }

  if (buffer.length > limite(LIMITES.documento)) {
    throw new Error('El archivo supera los 100 MB, no se puede enviar por WhatsApp')
  }

  await sock.sendMessage(jid, {
    document: buffer,
    mimetype: mimeDe(extension),
    fileName: resultado.nombre,
    caption: pie,
    quoted: msg,
  })
  return 'documento'
}
