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
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from './logger.js'

const ejecutar = promisify(execFile)

const DIR_YTDLP = path.resolve('data', 'yt-dlp')
const DIR_TMP = path.resolve('data', 'tmp')
const DIR_DATOS = path.resolve('data')

/** Limites practicos de WhatsApp (en MB) */
export const LIMITES = { video: 25, audio: 16, documento: 100 }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

let motor = null

/**
 * Archivo de cookies para yt-dlp (formato Netscape).
 *
 * Instagram, TikTok y compañía frenan las descargas anónimas desde IP de
 * servidor con un 429. Con cookies de una cuenta real el mismo enlace baja.
 * Se busca, en orden: la variable de entorno, el archivo por plataforma y el
 * general. `data/` está fuera de git, así que nada de esto se publica.
 *
 * @param {string} [plataforma] nombre de la plataforma (`instagram`, ...)
 * @returns {string|null} ruta existente o null
 */
export function rutaCookies(plataforma = '') {
  const candidatos = [
    process.env.YTDLP_COOKIES || process.env.BEERUS_COOKIES || '',
    plataforma ? path.join(DIR_DATOS, `cookies-${plataforma}.txt`) : '',
    path.join(DIR_DATOS, 'cookies.txt'),
  ].filter(Boolean)

  for (const ruta of candidatos) {
    try {
      if (fs.statSync(ruta).size > 0) return ruta
    } catch {
      // no existe: se prueba el siguiente
    }
  }
  return null
}

/** Un error de límite de tasa no se arregla reintentando en el acto */
export function esLimiteDeTasa(err) {
  return /HTTP Error 429|Too Many Requests|rate.?limit|login required|empty media response/i.test(
    String(err?.message || err || ''),
  )
}

/** Texto para el usuario cuando la plataforma frena la descarga */
export function mensajeLimite(plataforma = '') {
  const nombre = PLATAFORMAS[plataforma] || plataforma || 'La plataforma'
  return (
    `${nombre} está frenando las descargas desde este servidor (HTTP 429).\n` +
    '_Probá de nuevo en unos minutos._\n' +
    `_Si sigue, cargá cookies de una cuenta en_ \`data/cookies-${plataforma || 'sitio'}.txt\` ` +
    '_(formato Netscape, el que exporta la extensión "Get cookies.txt")._'
  )
}

/**
 * Proxy opcional para las descargas.
 *
 * Instagram (y a veces TikTok) no bloquea el enlace: bloquea la IP del
 * servidor. Pasar solo las descargas por un proxy lo resuelve sin tocar el
 * resto del bot ni montar un resolvedor propio.
 *
 * Se busca, en orden: `PROXY_INSTAGRAM` (por plataforma), `PROXY_DESCARGAS` y
 * `YTDLP_PROXY`. Formato: `http://usuario:clave@host:puerto`.
 *
 * @param {string} [plataforma] nombre de la plataforma (`instagram`, ...)
 * @returns {string|null} proxy configurado o null
 */
export function proxyDescarga(plataforma = '') {
  const candidatos = [
    plataforma ? process.env[`PROXY_${plataforma.toUpperCase()}`] : '',
    process.env.PROXY_DESCARGAS,
    process.env.YTDLP_PROXY,
  ]

  for (const candidato of candidatos) {
    const valor = String(candidato || '').trim()
    if (valor) return valor
  }
  return null
}

/** Argumentos de red comunes: cookies, proxy, reintentos y ritmo */
export function argumentosRed(plataforma = '') {
  const args = ['--no-check-certificates', '--retries', '3', '--fragment-retries', '3', '--socket-timeout', '20']

  const cookies = rutaCookies(plataforma)
  if (cookies) args.push('--cookies', cookies)

  const proxy = proxyDescarga(plataforma)
  if (proxy) args.push('--proxy', proxy)

  // Instagram castiga las ráfagas: un segundo entre pedidos baja los 429
  if (plataforma === 'instagram') args.push('--sleep-requests', '1')

  return args
}

/**
 * Comprueba que el motor de descargas este sano, desde donde corre el bot.
 *
 * Distingue las tres causas que se confunden entre si: el binario no esta, la
 * red no sale, o la plataforma frena la IP de este servidor. Sin esto, un 429
 * y un yt-dlp roto se ven igual en el chat.
 *
 * La prueba de red es un `fetch` normal y no un extractor: si el control
 * dependiera de YouTube, un bloqueo de YouTube se leeria como "red caida".
 *
 * @param {{url?: string}} [opciones] enlace a probar ademas de la red
 * @returns {Promise<{version: string|null, red: {ok: boolean, detalle: string},
 *   enlace: {ok: boolean, motivo: string}|null, proxy: string|null, cookies: string|null}>}
 */
export async function probarMotor({ url = '' } = {}) {
  const resultado = {
    version: null,
    red: { ok: false, detalle: '' },
    enlace: null,
    proxy: proxyDescarga('instagram'),
    cookies: rutaCookies('instagram'),
  }

  let instancia
  try {
    instancia = await obtenerMotor()
    resultado.version = String(await instancia.execPromise(['--version'])).trim()
  } catch (err) {
    resultado.red.detalle = `no se pudo cargar yt-dlp: ${err?.message || err}`
    return resultado
  }

  resultado.red = await alcanzar('https://www.instagram.com/')

  /** Metadatos con margen corto: esto es un diagnostico, no una descarga */
  const sonda = async (destino) => {
    try {
      const salida = await instancia.execPromise([
        '-J', '--no-playlist', '--no-warnings', '--skip-download',
        '--retries', '0', '--socket-timeout', '10',
        ...argumentosRed(detectarPlataforma(destino)),
        destino,
      ])
      const datos = JSON.parse(salida.trim().split('\n')[0])
      return { ok: true, motivo: datos?.title || datos?.id || 'ok' }
    } catch (err) {
      const texto = String(err?.message || err)
      const ultima = texto.split('\n').filter(Boolean).pop() || 'error desconocido'
      return { ok: false, motivo: ultima.replace(/^ERROR:\s*/i, '') }
    }
  }

  if (url) resultado.enlace = await sonda(url)

  return resultado
}

/** ¿Se llega al sitio desde este servidor? Devuelve el HTTP o el error de red */
async function alcanzar(dir, timeoutMs = 10_000) {
  try {
    const respuesta = await fetch(dir, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    // Cualquier respuesta HTTP prueba que hay salida; el codigo se informa.
    return { ok: true, detalle: `HTTP ${respuesta.status}` }
  } catch (err) {
    const causa = err?.cause?.code || err?.name || 'sin respuesta'
    return { ok: false, detalle: String(causa) }
  }
}

/**
 * Servidor externo de descargas (opcional).
 *
 * Instagram frena la IP del servidor donde corre el bot, no el enlace. Un
 * resolvedor propio —o uno compatible— contesta desde su IP con su sesión, y
 * el bot solo baja el archivo que le devuelve:
 *
 *   GET {API_DESCARGAS}/api/instagram?url=<enlace>
 *   → { status, titulo, video, thumbnail, items: [{ url, thumbnail }] }
 *
 *   GET {API_DESCARGAS}/api/social/audio?url=<enlace>&plataforma=instagram
 *   → el mp3 en el cuerpo, con `x-title` en las cabeceras
 *
 * Se configura con `API_DESCARGAS` y, si el servidor la pide,
 * `API_DESCARGAS_CLAVE` (viaja como `x-api-key`). Sin configurar, no se usa.
 */
function servidorExterno() {
  const base = String(process.env.API_DESCARGAS || '').trim().replace(/\/+$/, '')
  if (!base) return null
  return { base, clave: String(process.env.API_DESCARGAS_CLAVE || '').trim() }
}

/** Cabeceras hacia el resolvedor: identidad de navegador + clave si hay */
function cabecerasExternas(clave) {
  const cabeceras = { 'user-agent': UA, accept: 'application/json, */*' }
  if (clave) cabeceras['x-api-key'] = clave
  return cabeceras
}

/** Baja un recurso del resolvedor con el mismo perfil que la consulta */
async function bajarDelServidor(url, cabeceras, maxBytes) {
  const respuesta = await fetch(url, {
    headers: cabeceras,
    signal: AbortSignal.timeout(120000),
  })
  if (!respuesta.ok) throw new Error(`el servidor respondió ${respuesta.status}`)

  const buffer = Buffer.from(await respuesta.arrayBuffer())
  if (buffer.length > maxBytes) throw new Error('el archivo supera el límite de WhatsApp')
  if (buffer.length < 10000) throw new Error('el servidor devolvió un archivo vacío')

  return buffer
}

/**
 * Resuelve una descarga con el servidor externo, si está configurado.
 *
 * @returns {Promise<object|null>} resultado listo para `enviarDescarga`, o
 *   null cuando no hay servidor configurado (se sigue con yt-dlp)
 */
async function resolverExterno(url, { plataforma, soloAudio, maxBytes }) {
  const servidor = servidorExterno()
  if (!servidor) return null

  // El endpoint de video que conocemos es el de Instagram; el de audio sirve
  // para cualquier plataforma.
  if (!soloAudio && plataforma !== 'instagram') return null

  const cabeceras = cabecerasExternas(servidor.clave)
  const ruta = soloAudio
    ? `/api/social/audio?url=${encodeURIComponent(url)}&plataforma=${encodeURIComponent(plataforma)}`
    : `/api/instagram?url=${encodeURIComponent(url)}`

  const respuesta = await fetch(servidor.base + ruta, {
    headers: cabeceras,
    signal: AbortSignal.timeout(120000),
  })
  if (!respuesta.ok) throw new Error(`el servidor respondió ${respuesta.status}`)

  if (soloAudio) {
    const buffer = Buffer.from(await respuesta.arrayBuffer())
    if (buffer.length < 10000) throw new Error('el servidor devolvió un audio vacío')
    if (buffer.length > maxBytes) throw new Error('el archivo supera el límite de WhatsApp')

    const titulo = decodeURIComponent(respuesta.headers.get('x-title') || 'audio')
    return {
      buffer,
      nombre: `${limpiarNombre(titulo)}.mp3`,
      extension: 'mp3',
      plataforma,
      titulo,
      autor: '',
      thumb: null,
      duracion: null,
      bytes: buffer.length,
    }
  }

  const datos = await respuesta.json()
  const items = Array.isArray(datos?.items) && datos.items.length
    ? datos.items
    : datos?.video
      ? [{ url: datos.video, thumbnail: datos.thumbnail }]
      : []
  const primero = items.find((item) => item?.url || item?.video)
  if (!datos?.status || !primero) throw new Error(datos?.error || 'el servidor no encontró media')

  const mediaUrl = primero.url || primero.video
  const buffer = await bajarDelServidor(mediaUrl, cabeceras, maxBytes)
  const esVideo = /\.mp4/i.test(mediaUrl) || Boolean(primero.thumbnail)
  const titulo = datos.titulo || 'Instagram'

  return {
    buffer,
    nombre: `${limpiarNombre(titulo)}.${esVideo ? 'mp4' : 'jpg'}`,
    extension: esVideo ? 'mp4' : 'jpg',
    plataforma,
    titulo,
    autor: datos.autor || datos.username || '',
    thumb: datos.thumbnail || primero.thumbnail || null,
    duracion: datos.duracion ?? null,
    bytes: buffer.length,
  }
}

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
    log.sistema('Descargando el binario de yt-dlp (solo la primera vez, ~18 MB)...')
    await YtDlp.downloadFromGithub(binario)
  }

  const instancia = new YtDlp()
  instancia.setBinaryPath(binario)
  motor = instancia
  return instancia
}

/** Obtiene los metadatos del recurso con el json de yt-dlp */
async function infoYtdlp(instancia, url, extras = []) {
  const salida = await instancia.execPromise([
    '-J', '--no-playlist', '--no-warnings', '--skip-download', ...extras, url,
  ])
  return JSON.parse(salida.trim().split('\n')[0])
}

/** Elige el mejor formato que quepa dentro de maxBytes */
export function elegirFormato(info, { maxBytes, soloAudio }) {
  const formatos = info.formats ?? []
  const tam = (f) => f.filesize ?? f.filesize_approx ?? 0
  const usable = (f) => Boolean(f?.url)

  // WhatsApp solo abre H.264 + AAC. YouTube sirve lo mismo en VP9/AV1, que pesa
  // menos y por eso gana en cualquier orden por tamano, pero llega al telefono
  // y no se puede reproducir. Se prefiere avc1/mp4a siempre que exista.
  const h264 = (f) => /^avc1/i.test(f.vcodec || '')
  const aac = (f) => /^mp4a/i.test(f.acodec || '')

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

  // Progresivo: video y audio en un solo archivo (sin ffmpeg)
  const progresivos = formatos
    .filter((f) => usable(f) && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .filter((f) => (f.height ?? 0) <= 1080)
    .sort(
      (a, b) =>
        Number(h264(b)) - Number(h264(a)) ||
        (b.height ?? 0) - (a.height ?? 0) ||
        tam(a) - tam(b),
    )

  const elegido = progresivos.find((f) => tam(f) > 0 && tam(f) <= maxBytes)
  if (elegido) return { selector: elegido.format_id, estimado: tam(elegido), como: elegido }

  // Pistas separadas: se fusionan con ffmpeg (viene con yt-dlp)
  const videos = formatos
    .filter((f) => usable(f) && f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'))
    .filter((f) => (f.height ?? 0) <= 1080)
    .sort((a, b) => Number(h264(b)) - Number(h264(a)) || (b.height ?? 0) - (a.height ?? 0))
  const audios = formatos
    .filter((f) => usable(f) && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a, b) => Number(aac(b)) - Number(aac(a)) || (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))

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
 * YouTube devuelve 403 de forma intermitente, asi que se reintenta. Un 429
 * (límite de tasa) espera mucho más: reintentar en el acto lo empeora.
 */
async function bajarConYtdlp(instancia, url, selector, { soloAudio, extras = [], intentos = 3 }) {
  if (!fs.existsSync(DIR_TMP)) fs.mkdirSync(DIR_TMP, { recursive: true })

  let ultimoError = null

  for (let intento = 1; intento <= intentos; intento++) {
    const marca = Date.now()
    const destino = path.join(DIR_TMP, `dl_${marca}.%(ext)s`)

    const args = [
      '--no-playlist', '--no-warnings', '--no-part', '--newline', ...extras,
      '-f', selector, '-o', destino, url,
    ]
    if (!soloAudio) args.push('--merge-output-format', 'mp4')

    try {
      await instancia.execPromise(args)
    } catch (err) {
      ultimoError = err
      limpiarTmp(marca)
      if (intento < intentos) {
        const espera = esLimiteDeTasa(err) ? 10000 * intento : 1500 * intento
        log.aviso(`descargas · intento ${intento}/${intentos} fallido, reintentando en ${espera / 1000}s...`)
        await new Promise((r) => setTimeout(r, espera))
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
    log.error('ffmpeg no pudo convertir a nota de voz', err)
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

/**
 * Deja un video en la forma que WhatsApp decodifica: H.264 con el indice al
 * principio (`faststart`) y sin timestamps negativos.
 *
 * yt-dlp devuelve webm (VP9/Opus) cuando es el formato mas liviano, y WhatsApp
 * lo manda igual pero el telefono contesta "este video no esta disponible
 * porque hay un problema con el archivo de video": el mensaje entra con su
 * miniatura y su duracion, y no hay forma de abrirlo. Lo mismo pasa con AV1 y
 * HEVC.
 *
 * Aun siendo H.264 el archivo puede fallar: Pinterest sirve mp4 con marca
 * `M4V` y con el primer paquete en DTS negativo (B-frames sin edit list). El
 * decodificador de Android rechaza eso igual. Por eso todo pasa por el muxer
 * de ffmpeg, que reescribe la marca a `isom`, mete el edit list y corre los
 * timestamps con `-avoid_negative_ts make_zero`.
 *
 * Sin recodificar (`-c copy`) cuando el video ya es H.264; solo se recodifica
 * el audio si no es AAC-LC. El muxer de MP4 no escribe por tuberia, asi que va
 * por un directorio temporal que se borra al terminar.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>} el mismo buffer si no hay ffmpeg o si falla
 */
export async function normalizarVideoWhatsApp(buffer) {
  if (!buffer?.length) return buffer
  if (!(await ffmpegDisponible())) return buffer

  // Lo que no es un mp4/webm real (un HTML de error, por ejemplo) no se toca:
  // el llamador decide, pero al menos no se pierde el mensaje de error.
  const firma = buffer.toString('latin1', 4, 8)
  const esMp4 = firma === 'ftyp'
  const esMatroska = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  if (!esMp4 && !esMatroska) return buffer

  let carpeta
  try {
    carpeta = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'beerus-video-'))
    const entrada = path.join(carpeta, `entrada.${esMp4 ? 'mp4' : 'webm'}`)
    const salida = path.join(carpeta, 'salida.mp4')
    await fs.promises.writeFile(entrada, buffer)

    const { video, audio } = await codecsDe(entrada)
    const copiaVideo = video === 'h264'
    const copiaAudio = !audio || (audio.codec === 'aac' && /^LC/i.test(audio.perfil || ''))

    if (!copiaVideo) log.depuracion(`descargas · video en ${video || 'codec desconocido'}, pasando a H.264`)
    if (audio && !copiaAudio) log.depuracion(`descargas · audio en ${audio.codec}/${audio.perfil || '?'}, pasando a AAC-LC`)

    // Los -map explicitos evitan que se cuele una pista de subtitulos o de
    // datos que el telefono no sabe leer.
    const mapa = ['-map', '0:v:0', '-map', '0:a:0?']
    const rapido = [
      '-hide_banner', '-loglevel', 'error',
      '-i', entrada,
      ...mapa,
      '-c:v', 'copy',
      '-c:a', copiaAudio ? 'copy' : 'aac',
      ...(copiaAudio ? [] : ['-b:a', '96k']),
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4', salida,
    ]
    const completo = [
      '-hide_banner', '-loglevel', 'error',
      '-i', entrada,
      ...mapa,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4', salida,
    ]

    try {
      await correrFfmpeg(copiaVideo ? rapido : completo)
    } catch (err) {
      // Un mp4 raro puede rechazar el copiado; recodificar siempre funciona.
      if (!copiaVideo) throw err
      log.aviso(`descargas · el copiado fallo, recodificando · ${err.message}`)
      await correrFfmpeg(completo)
    }

    const listo = await fs.promises.readFile(salida)
    return listo.length ? listo : buffer
  } catch (err) {
    log.aviso(`descargas · no pude normalizar el video · ${err.message}`)
    return buffer
  } finally {
    if (carpeta) await fs.promises.rm(carpeta, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Codec de video y de audio de un archivo, en una sola pasada de ffprobe.
 * `{ video: 'h264', audio: { codec: 'aac', perfil: 'LC' } }`, o null cada uno.
 */
async function codecsDe(archivo) {
  try {
    const { stdout } = await ejecutar(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile', '-of', 'json', archivo],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }
    )
    const pistas = JSON.parse(stdout).streams ?? []
    const v = pistas.find((p) => p.codec_type === 'video')
    const a = pistas.find((p) => p.codec_type === 'audio')
    return {
      video: v ? String(v.codec_name).toLowerCase() : null,
      audio: a
        ? { codec: String(a.codec_name).toLowerCase(), perfil: String(a.profile ?? '') }
        : null,
    }
  } catch {
    return { video: null, audio: null }
  }
}

/** Corre ffmpeg sobre archivos y resuelve cuando termina bien */
function correrFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const proceso = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const errores = []
    const reloj = setTimeout(() => {
      proceso.kill('SIGKILL')
      reject(new Error('FFMPEG_TIMEOUT'))
    }, timeoutMs)
    proceso.stderr.on('data', (d) => errores.push(d))
    proceso.on('error', (err) => {
      clearTimeout(reloj)
      reject(err)
    })
    proceso.on('close', (code) => {
      clearTimeout(reloj)
      if (code === 0) resolve()
      else reject(new Error(`FFMPEG_ERROR_${code}: ${Buffer.concat(errores).toString().slice(-300)}`))
    })
  })
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

  // Un resolvedor externo contesta desde su IP y con su sesión: es la salida
  // cuando Instagram frena la IP del servidor. Si falla, se sigue con yt-dlp.
  if (plataforma !== 'desconocido') {
    try {
      const externo = await resolverExterno(url, { plataforma, soloAudio, maxBytes })
      if (externo) return externo
    } catch (err) {
      log.aviso(`descargas · servidor externo: ${err.message} — sigo con yt-dlp`)
    }
  }

  const instancia = await obtenerMotor()
  let extras = argumentosRed(plataforma)
  let info

  try {
    info = await infoYtdlp(instancia, url, extras)
  } catch (err) {
    // 429: el servidor quedó marcado. Un segundo intento con el perfil de un
    // navegador real y una pausa es lo que suele destrabarlo sin cookies.
    if (!esLimiteDeTasa(err)) throw err

    log.aviso(`descargas · ${plataforma} limitó el pedido (429), reintento como navegador`)
    await new Promise((r) => setTimeout(r, 5000))

    extras = [...extras, '--impersonate', 'chrome', '--sleep-requests', '2']
    try {
      info = await infoYtdlp(instancia, url, extras)
    } catch (err2) {
      throw new Error(mensajeLimite(plataforma))
    }
  }

  const eleccion = elegirFormato(info, { maxBytes, soloAudio })
  if (!eleccion) throw new Error('No se encontro ningun formato descargable en ese enlace')

  let archivo
  try {
    archivo = await bajarConYtdlp(instancia, url, eleccion.selector, { soloAudio, extras })
  } catch (err) {
    if (esLimiteDeTasa(err)) throw new Error(mensajeLimite(plataforma))
    throw err
  }
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
  let { buffer, extension } = resultado
  const tipo = tipoDeArchivo(extension)
  const pie = pieDeFoto(resultado)
  const miniatura = resultado.thumb ? await miniaturaJpeg(resultado.thumb) : null

  const limite = (mb) => mb * 1024 * 1024

  if (tipo === 'video') {
    // yt-dlp puede devolver webm/VP9 y WhatsApp no lo abre. Se normaliza a
    // H.264/AAC antes de decidir el peso, porque la conversion puede moverlo.
    const video = await normalizarVideoWhatsApp(buffer)
    const esMp4 = video.toString('latin1', 4, 8) === 'ftyp'
    if (video.length <= limite(LIMITES.video)) {
      await sock.sendMessage(jid, {
        video,
        mimetype: esMp4 ? 'video/mp4' : mimeDe(extension),
        caption: pie,
        ...(miniatura ? { thumbnail: miniatura } : {}),
        quoted: msg,
      })
      return 'video'
    }
    // Pasa de 25 MB ya convertido: se manda como documento.
    buffer = video
    extension = esMp4 ? 'mp4' : extension
    resultado = { ...resultado, buffer, extension }
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
