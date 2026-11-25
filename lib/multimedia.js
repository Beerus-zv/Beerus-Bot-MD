// ───────────── Multimedia ─────────────
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import {
  proto,
  normalizeMessageContent,
  downloadMediaMessage as descargarMediaBaileys,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} from '@whiskeysockets/baileys'

export const TMP_DIR = path.join(process.cwd(), 'tmp')

// ───────────── Sticker con audio ─────────────
/**
 * WhatsApp no tiene un mensaje que sea sticker con audio adentro.
 *
 *   optional StickerMessage stickerMessage = 26;
 *   optional AudioMessage   audioMessage   = 8;
 *
 * Son dos tipos distintos del mismo `Message`: el servidor acepta uno por
 * mensaje y descarta el mensaje entero cuando llegan los dos juntos. Por eso
 * se manda el sticker y despues su audio como nota de voz citándolo.
 *
 * Lo que sí se lee de un sticker recibido es el audio que algunos clientes
 * mandan aparte (campo 8 hermano) o metido en el WebP; se guarda por hash
 * para que /tovideo lo encuentre.
 */
const CAMPO_AUDIO_STICKER = 26

/** Varint de protobuf. Devuelve null si el bloque viene truncado. */
function leerVarint(bytes, posicion) {
  let valor = 0
  let desplazamiento = 0
  let i = posicion

  while (i < bytes.length) {
    const byte = bytes[i++]
    // Sin operadores de bits: un varint de 64 bits desborda los 32 de JS
    valor += (byte & 0x7f) * 2 ** desplazamiento
    if ((byte & 0x80) === 0) return { valor, pos: i }

    desplazamiento += 7
    if (desplazamiento > 63) return null
  }
  return null
}

/**
 * Busca un campo length-delimited dentro de un mensaje protobuf ya codificado.
 * Alcanza para lo que hace falta aca: leer el campo 26 sin el esquema.
 *
 * @returns {Uint8Array|null} los bytes del campo, o null si no esta
 */
function extraerCampo(bytes, numero) {
  let pos = 0

  while (pos < bytes.length) {
    const clave = leerVarint(bytes, pos)
    if (!clave) return null
    pos = clave.pos

    const campo = Math.floor(clave.valor / 8)
    const tipo = clave.valor % 8

    if (tipo === 0) {
      const salto = leerVarint(bytes, pos)
      if (!salto) return null
      pos = salto.pos
      continue
    }
    if (tipo === 1) {
      pos += 8
      continue
    }
    if (tipo === 5) {
      pos += 4
      continue
    }
    // 3 y 4 son grupos, waProto no los usa
    if (tipo !== 2) return null

    const largo = leerVarint(bytes, pos)
    if (!largo) return null
    pos = largo.pos

    const fin = pos + largo.valor
    if (fin > bytes.length) return null

    if (campo === numero) return bytes.subarray(pos, fin)
    pos = fin
  }
  return null
}

/** Los bytes del sub-mensaje, venga como Buffer o como Reader de protobufjs */
function bytesDelLector(entrada, largo) {
  if (entrada instanceof Uint8Array) {
    return largo ? entrada.subarray(0, largo) : entrada
  }

  const buf = entrada?.buf
  if (buf instanceof Uint8Array) {
    const inicio = entrada.pos ?? 0
    const fin = largo ? inicio + largo : (entrada.len ?? buf.length)
    return buf.subarray(inicio, fin)
  }
  return null
}

/**
 * Campos que declara el proto de StickerMessage (WhatsApp 2.3000.x):
 * 1..13, 16..23. Cualquier otro numero es un campo que el proto no conoce y
 * que protobufjs tira al decodificar.
 */
const CAMPOS_STICKER = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23])

/** Recorre un mensaje protobuf y devuelve sus campos con el bloque de datos. */
function recorrerCampos(bytes) {
  const campos = []
  let pos = 0

  while (pos < bytes.length) {
    const clave = leerVarint(bytes, pos)
    if (!clave) break
    pos = clave.pos

    const campo = Math.floor(clave.valor / 8)
    const tipo = clave.valor % 8

    if (tipo === 0) {
      const valor = leerVarint(bytes, pos)
      if (!valor) break
      campos.push({ campo, tipo, largo: valor.pos - pos, datos: bytes.subarray(pos, valor.pos) })
      pos = valor.pos
      continue
    }
    if (tipo === 1) {
      campos.push({ campo, tipo, largo: 8 })
      pos += 8
      continue
    }
    if (tipo === 5) {
      campos.push({ campo, tipo, largo: 4 })
      pos += 4
      continue
    }
    if (tipo !== 2) break

    const largo = leerVarint(bytes, pos)
    if (!largo) break
    pos = largo.pos

    const fin = pos + largo.valor
    if (fin > bytes.length) break

    campos.push({ campo, tipo, largo: largo.valor, datos: bytes.subarray(pos, fin) })
    pos = fin
  }

  return campos
}

/** Intenta leer un bloque como AudioMessage. null si no lo parece. */
function decodificarAudio(tipoAudio, bloque) {
  try {
    const audio = tipoAudio.decode(bloque)
    if (audio?.url || audio?.mediaKey || audio?.fileSha256) return audio
  } catch {
    /* no era un AudioMessage */
  }
  return null
}

function parchearStickerConAudio() {
  const tipoSticker = proto?.Message?.StickerMessage
  const tipoAudio = proto?.Message?.AudioMessage
  if (!tipoSticker || !tipoAudio || tipoSticker.__audioStickerParcheado) return

  // Al enviar: protobufjs escribe campo por campo lo que declara el proto, asi
  // que el audio del sticker hay que agregarlo a mano en el wire.
  const codificarOriginal = tipoSticker.encode
  tipoSticker.encode = function (mensaje, escritor) {
    escritor = codificarOriginal.call(this, mensaje, escritor)
    if (mensaje?.audioMessage) {
      const bytes = tipoAudio.encode(mensaje.audioMessage).finish()
      escritor.uint32((CAMPO_AUDIO_STICKER << 3) | 2).bytes(bytes)
    }
    return escritor
  }

  const decodificarOriginal = tipoSticker.decode
  tipoSticker.decode = function (entrada, largo) {
    // Antes de decodificar: el Reader avanza y despues no hay vuelta atras
    const crudo = bytesDelLector(entrada, largo)
    const mensaje = decodificarOriginal.call(this, entrada, largo)

    if (mensaje?.audioMessage || !crudo) return mensaje

    // 1) El numero que escribe /stickeraudio
    const bloque = extraerCampo(crudo, CAMPO_AUDIO_STICKER)
    const audioDirecto = bloque && decodificarAudio(tipoAudio, bloque)
    if (audioDirecto) {
      mensaje.audioMessage = audioDirecto
      return mensaje
    }

    // 2) Cualquier campo que el proto no declare: si el bloque se decodifica
    //    como AudioMessage, ese es el audio, venga en el numero que venga.
    const ocultos = recorrerCampos(crudo).filter((campo) => !CAMPOS_STICKER.has(campo.campo))
    if (!ocultos.length) return mensaje

    console.log(
      `[sticker-audio] campos fuera del proto: ${ocultos.map((c) => `${c.campo}/${c.tipo}/${c.largo}`).join(' ')}`
    )

    const candidatos = ocultos.filter((c) => c.tipo === 2).sort((a, b) => b.largo - a.largo)
    for (const candidato of candidatos) {
      const audio = decodificarAudio(tipoAudio, candidato.datos)
      if (!audio) continue

      mensaje.audioMessage = audio
      console.log(`[sticker-audio] audio recuperado del campo ${candidato.campo} (${candidato.largo} B)`)
      break
    }

    return mensaje
  }

  tipoSticker.__audioStickerParcheado = true
}

parchearStickerConAudio()

/**
 * Ultimo recurso para el audio: lo que el propio bot mando.
 *
 * El cliente no siempre copia el campo 26 cuando arma la cita, y el bot se
 * reinicia seguido, asi que el audio se guarda en disco por dos claves:
 *
 *   sha:<sha256 del sticker>  — la trae la cita siempre (fileSha256)
 *   id:<id del mensaje>       — la trae la cita como stanzaId
 *
 * Se lee primero de memoria y despues del disco. Con esto el audio sobrevive
 * reinicios, reenvios y respuestas tardias.
 */
const AUDIO_STICKERS_MAX = 200
const DIR_AUDIO_STICKERS = path.join(process.cwd(), 'data', 'sticker-audio')
const audioDeStickers = new Map()

/** Los bytes que vienen de protobuf, en hex. Acepta Buffer, Uint8Array y string. */
function aHex(valor) {
  if (!valor) return null
  if (Buffer.isBuffer(valor)) return valor.toString('hex')
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('hex')
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor?.data)) return Buffer.from(valor.data).toString('hex')
  return null
}

/** Nombre de archivo seguro para una clave */
function archivoDeClave(clave) {
  return path.join(DIR_AUDIO_STICKERS, `${clave.replace(/[^A-Za-z0-9_-]/g, '_')}.ogg`)
}

/**
 * Claves con las que se puede encontrar el audio de un sticker: por hash del
 * archivo y por id del mensaje citado.
 */
export function clavesAudioDeSticker(stickerMessage, idMensaje) {
  const claves = []

  const hash = aHex(stickerMessage?.fileSha256)
  if (hash) claves.push(`sha:${hash}`)
  if (idMensaje) claves.push(`id:${idMensaje}`)

  return claves
}

/** Guarda el audio del sticker en memoria y en disco, con poda de viejos. */
export function recordarAudioDeSticker(clave, audio) {
  if (!clave || !audio?.length) return

  audioDeStickers.set(clave, audio)
  while (audioDeStickers.size > AUDIO_STICKERS_MAX) {
    audioDeStickers.delete(audioDeStickers.keys().next().value)
  }

  const destino = archivoDeClave(clave)
  fsp
    .mkdir(DIR_AUDIO_STICKERS, { recursive: true })
    .then(() => fsp.writeFile(destino, audio))
    .then(() => podarAudios())
    .catch((err) => console.warn('[sticker-audio] no se pudo guardar el audio:', err?.message))
}

/** Devuelve el audio guardado para una clave, de memoria o de disco. */
export async function audioRecordadoDeSticker(clave) {
  if (!clave) return null

  const enMemoria = audioDeStickers.get(clave)
  if (enMemoria?.length) return enMemoria

  try {
    const enDisco = await fsp.readFile(archivoDeClave(clave))
    if (!enDisco.length) return null

    audioDeStickers.set(clave, enDisco)
    return enDisco
  } catch {
    return null
  }
}

/** Deja solo los AUDIO_STICKERS_MAX archivos mas nuevos */
async function podarAudios() {
  try {
    const nombres = await fsp.readdir(DIR_AUDIO_STICKERS)
    if (nombres.length <= AUDIO_STICKERS_MAX) return

    const conFecha = await Promise.all(
      nombres.map(async (nombre) => {
        const ruta = path.join(DIR_AUDIO_STICKERS, nombre)
        const info = await fsp.stat(ruta).catch(() => null)
        return { ruta, fecha: info?.mtimeMs ?? 0 }
      })
    )

    conFecha.sort((a, b) => a.fecha - b.fecha)
    for (const { ruta } of conFecha.slice(0, conFecha.length - AUDIO_STICKERS_MAX)) {
      await fsp.unlink(ruta).catch(() => {})
    }
  } catch {
    /* la poda es opcional: si falla, no rompe nada */
  }
}

/**
 * Contexto de la cita (stanzaId, participante, quotedMessage) del mensaje.
 * Sirve para saber a que sticker responde el comando.
 */
export function contextoDeCita(msg) {
  const contenido = normalizeMessageContent(msg?.message)
  if (!contenido) return null

  // El contextInfo de la cita puede vivir en cualquiera de los tipos de mensaje
  for (const clave of Object.keys(contenido)) {
    const info = contenido[clave]?.contextInfo
    if (info?.quotedMessage) return info
  }
  return null
}

/**
 * Devuelve el mensaje citado (quoted) de un mensaje, si existe.
 * Normalice el contenido antes de leerlo para ver a traves de
 * los envoltorios de efimero (implicit RFM) y ver una vez.
 */
export function obtenerCitado(msg) {
  return contextoDeCita(msg)?.quotedMessage ?? null
}

/**
 * Devuelve el sticker al que responde el comando, o el propio mensaje si es
 * un sticker. Sirve para /toimg y /tovideo.
 *
 * @returns {object|null} contenido con `.stickerMessage`, o null
 */
export function stickerRespondido(msg) {
  const citado = obtenerCitado(msg)
  if (citado?.stickerMessage) return citado
  if (msg?.message?.stickerMessage) return msg.message
  return null
}

/**
 * Guarda el audio de un sticker que llega con el campo 26 adentro.
 *
 * Los stickers que manda el propio bot ya quedan guardados al enviarlos. Este
 * es para los que llegan de afuera: se reenvia uno viejo, el audio queda en
 * disco por hash y /tovideo lo encuentra aunque la cita no copie el campo.
 *
 * @returns {Promise<boolean>} true si hay audio guardado
 */
export async function capturarAudioDeSticker(sock, msg) {
  const contenido = normalizeMessageContent(msg?.message)
  const sticker = contenido?.stickerMessage
  if (!sticker) return false

  const claves = clavesAudioDeSticker(sticker)

  // El audio de un sticker con sonido viaja hermano en el Message; algunos
  // clientes lo mandan anidado dentro del sticker.
  const audioMessage = contenido.audioMessage ?? sticker.audioMessage

  if (!audioMessage) {
    // Deja ver que trae el mensaje cuando no hay audio: sirve para saber si
    // el sonido viaja en el mensaje o no.
    console.log(
      `[sticker-audio] sticker recibido sin audio · ${claves[0]?.slice(0, 16) ?? 'sin hash'} · claves: ${Object.keys(contenido).join(',')}`
    )
    return false
  }

  if (!claves.length) return false

  // Ya lo tenemos: no se vuelve a bajar
  if (await audioRecordadoDeSticker(claves[0])) return true

  try {
    const audio = await descargarMedia(sock, { audioMessage })
    if (!audio?.length) return false

    for (const clave of claves) recordarAudioDeSticker(clave, audio)
    console.log(
      `[sticker-audio] capturado al recibir (${(audio.length / 1024).toFixed(0)} KB) · ${claves.join(' · ')}`
    )
    return true
  } catch (err) {
    console.warn('[sticker-audio] no pude bajar el audio del sticker recibido:', err?.message)
    return false
  }
}

/**
 * Detecta el tipo de multimedia presente en un mensaje.
 * @returns {'image' | 'video' | 'audio' | 'document' | null}
 */
export function detectarTipoMedia(mensaje) {
  const contenido = normalizeMessageContent(mensaje?.message ?? mensaje)
  if (!contenido) return null
  if (contenido.imageMessage) return 'image'
  if (contenido.videoMessage) return 'video'
  if (contenido.audioMessage) return 'audio'
  if (contenido.documentMessage) return 'document'
  if (contenido.stickerMessage) return 'image'
  return null
}

/**
 * Resuelve el mensaje del que se debe tomar el archivo:
 * 1) el mensaje citado (respuesta), si contiene multimedia
 * 2) el propio mensaje del comando, si viene con multimedia y caption
 */
export function resolverFuenteMedia(msg) {
  const citado = obtenerCitado(msg)
  if (citado && detectarTipoMedia(citado)) {
    return { mensaje: citado, citado: true }
  }
  if (detectarTipoMedia(msg?.message)) {
    return { mensaje: msg.message, citado: false }
  }
  return null
}

/**
 * Descarga el contenido multimedia de un mensaje mediante Baileys.
 * Funciona tanto con un mensaje completo (WAMessage) como con el
 * contenido de un mensaje citado ({ imageMessage: {...}, ... }).
 * Si el media ya expiro (URL 410/404) pide el reupload de Baileys.
 */
export async function descargarMedia(sock, mensaje) {
  if (!mensaje) throw new Error('NO_MEDIA')

  // downloadMediaMessage espera un WAMessage con .message;
  // si llega solo el contenido (ej. quotedMessage) se envuelve.
  const paraDescargar = mensaje.message
    ? { ...mensaje, message: normalizeMessageContent(mensaje.message) }
    : { key: mensaje.key ?? {}, message: mensaje }

  // Sin ctx no hay reupload de media expirada (carnadas 410/404)
  const ctx =
    typeof sock?.updateMediaMessage === 'function'
      ? { reuploadRequest: sock.updateMediaMessage }
      : undefined

  const buffer = await descargarMediaBaileys(paraDescargar, 'buffer', {}, ctx)
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

/**
 * Convierte una imagen (jpg/png/webp) en un sticker WebP de 512x512.
 * Ajusta la calidad para que el sticker no supere 100KB (límite de WhatsApp).
 */
export async function stickerDesdeImagen(buffer) {
  let quality = 90
  let sticker = await sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality })
    .toBuffer()

  // Reducir calidad progresivamente si supera 100KB (límite de WhatsApp para stickers estáticos)
  while (sticker.length > 100 * 1024 && quality > 10) {
    quality -= 10
    sticker = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality })
      .toBuffer()
  }

  return sticker
}

/**
 * Ejecuta ffmpeg con los argumentos indicados y devuelve el stdout como Buffer.
 */
export function ejecutarFfmpeg(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const proceso = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks = []
    const errores = []

    proceso.stdout.on('data', (d) => chunks.push(d))
    proceso.stderr.on('data', (d) => errores.push(d))

    const temporizador = setTimeout(() => {
      proceso.kill('SIGKILL')
      reject(new Error('FFMPEG_TIMEOUT'))
    }, timeoutMs)

    proceso.on('error', (err) => {
      clearTimeout(temporizador)
      reject(err)
    })

    proceso.on('close', (code) => {
      clearTimeout(temporizador)
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(
          new Error(`FFMPEG_ERROR_${code}: ${Buffer.concat(errores).toString().slice(-400)}`)
        )
      }
    })
  })
}

/**
 * Detecta si un WebP contiene animacion (contiene el chunk ANIM/ANMF).
 */
export function esWebpAnimado(buffer) {
  const cabecera = buffer.subarray(0, 512).toString('binary')
  return cabecera.includes('ANIM') || cabecera.includes('ANMF')
}

/**
 * Firma del paquete de stickers.
 *
 * WhatsApp lee el nombre y el autor desde un tag EXIF dentro del propio WebP:
 * un TIFF minimo con el tag 0x5741 ('AW') cuyo valor es el JSON del paquete.
 * Se inyecta como chunk 'EXIF' del contenedor RIFF, asi sirve igual para
 * stickers estaticos (sharp) y animados (ffmpeg) sin reencodear nada.
 */
const PAQUETE_STICKER = {
  nombre: 'Beerus Bot',
  autor: 'Beerus_zv',
  id: 'com.beerusbot.stickers',
}
const TAG_PAQUETE = 0x5741
const CABECERA_TIFF = 26

let exifPaquete = null

/** TIFF little-endian con una sola entrada: tag 0x5741 -> JSON del paquete. */
function exifDePaquete() {
  if (exifPaquete) return exifPaquete

  const json = Buffer.from(
    JSON.stringify({
      'sticker-pack-id': PAQUETE_STICKER.id,
      'sticker-pack-name': PAQUETE_STICKER.nombre,
      'sticker-pack-publisher': PAQUETE_STICKER.autor,
    }),
    'utf8'
  )

  const tiff = Buffer.alloc(CABECERA_TIFF + json.length)
  tiff.write('II', 0, 'ascii') // little-endian
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4) // la IFD0 arranca enseguida
  tiff.writeUInt16LE(1, 8) // una entrada
  tiff.writeUInt16LE(TAG_PAQUETE, 10)
  tiff.writeUInt16LE(7, 12) // tipo UNDEFINED
  tiff.writeUInt32LE(json.length, 14)
  tiff.writeUInt32LE(CABECERA_TIFF, 18) // el JSON va detras de la IFD
  tiff.writeUInt32LE(0, 22) // no hay siguiente IFD
  json.copy(tiff, CABECERA_TIFF)

  exifPaquete = tiff
  return tiff
}

/**
 * Mete el chunk EXIF en un WebP y devuelve el buffer nuevo.
 * Cualquier EXIF previo se descarta: el sticker sale siempre firmado igual.
 */
export function firmarSticker(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return buffer
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return buffer

  const trozos = []
  let pos = 12

  while (pos + 8 <= buffer.length) {
    const tipo = buffer.toString('ascii', pos, pos + 4)
    const tam = buffer.readUInt32LE(pos + 4)
    // Un tamaño corrupto se corta aca: mejor un WebP sin firma que uno roto.
    if (tam > buffer.length) break

    const fin = Math.min(pos + 8 + tam + (tam % 2), buffer.length)
    if (tipo !== 'EXIF') trozos.push(buffer.subarray(pos, fin))
    pos = fin
  }

  const exif = exifDePaquete()
  const relleno = exif.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  const cabeceraChunk = Buffer.alloc(8)
  cabeceraChunk.write('EXIF', 0, 'ascii')
  cabeceraChunk.writeUInt32LE(exif.length, 4)

  // El EXIF va al final, que es donde el contenedor WebP lo espera.
  const cabeceraRiff = Buffer.alloc(12)
  cabeceraRiff.write('RIFF', 0, 'ascii')
  cabeceraRiff.write('WEBP', 8, 'ascii')

  const salida = Buffer.concat([cabeceraRiff, ...trozos, cabeceraChunk, exif, relleno])
  salida.writeUInt32LE(salida.length - 8, 4)
  return salida
}

/**
 * Envía un sticker (Buffer WebP) detectando si es animado.
 * quoted se pasa como tercer argumento de Baileys (no dentro del contenido),
 * porque ahi es donde Baileys espera la cita.
 *
 * Devuelve el WAMessage enviado, por si hay que citar algo a continuacion.
 */
export async function enviarSticker(sock, jid, buffer, quoted) {
  const sticker = firmarSticker(buffer)
  const opcionesEnvio = quoted ? { quoted } : undefined
  return sock.sendMessage(
    jid,
    {
      sticker,
      mimetype: 'image/webp',
      isAnimated: esWebpAnimado(sticker),
    },
    opcionesEnvio
  )
}

/**
 * Envía un sticker con su audio adentro, en un solo mensaje.
 *
 * El audio va en `StickerMessage.audioMessage` (campo 26, `oneof audio` del
 * proto oficial). Baileys no lo conoce todavía, así que el campo se cuelga
 * después de armar el mensaje y el codificador parcheado lo escribe en el
 * wire: protobufjs solo serializa los campos que declara, y sin el parche el
 * audio se pierde antes de salir.
 *
 * `segundos` tiene que ser la duración real del sticker: si no cuadra, el
 * cliente reproduce el WebP como GIF mudo.
 */
export async function enviarStickerConAudio(sock, jid, stickerBuffer, audioBuffer, { quoted, segundos } = {}) {
  const opcionesMedia = { upload: sock.waUploadToServer, logger: sock.logger }
  const sticker = firmarSticker(stickerBuffer)

  const [mediaSticker, mediaAudio] = await Promise.all([
    prepareWAMessageMedia({ sticker }, opcionesMedia),
    prepareWAMessageMedia(
      {
        audio: audioBuffer,
        ptt: true,
        mimetype: 'audio/ogg; codecs=opus',
        seconds: segundos,
      },
      opcionesMedia
    ),
  ])

  const contenido = {
    stickerMessage: {
      ...mediaSticker.stickerMessage,
      isAnimated: esWebpAnimado(sticker),
    },
  }

  const mensaje = generateWAMessageFromContent(jid, contenido, {
    quoted,
    userJid: sock.user?.id,
  })

  // fromObject() copia solo campos del proto: el audio se cuelga después de
  // generado el mensaje para que el codificador parcheado lo escriba.
  mensaje.message.stickerMessage.audioMessage = mediaAudio.audioMessage

  await sock.relayMessage(jid, mensaje.message, { messageId: mensaje.key.id })

  // El cliente no siempre copia el campo 26 en la cita y el bot se reinicia:
  // el audio se guarda por hash del sticker y por id del mensaje, en memoria y
  // en disco. /tovideo lo busca por esas mismas claves.
  const hash =
    aHex(mediaSticker.stickerMessage?.fileSha256) ??
    createHash('sha256').update(sticker).digest('hex')
  const claves = [`sha:${hash}`, `id:${mensaje.key.id}`]

  for (const clave of claves) recordarAudioDeSticker(clave, audioBuffer)

  console.log(
    `[stickeraudio] audio guardado (${(audioBuffer.length / 1024).toFixed(0)} KB) · ${claves.join(' · ')}`
  )

  return mensaje
}

/**
 * Convierte un video corto en un sticker animado WebP de 512x512.
 * Devuelve solo el buffer; para la duracion efectiva usa stickerDesdeVideoInfo.
 */
export async function stickerDesdeVideo(buffer, { duracion = 6, fps = 12 } = {}) {
  return (await stickerAnimado(buffer, 'mp4', { duracion, fps })).buffer
}

/**
 * Igual que stickerDesdeVideo pero devuelve `{ buffer, duracion }`.
 *
 * La duracion puede ser menor que la pedida: si el sticker no entra en los
 * 500 KB de WhatsApp, se recorta el clip. Quien adjunte audio tiene que usar
 * esa misma duracion o el sticker queda con sonido desincronizado.
 */
export async function stickerDesdeVideoInfo(buffer, { duracion = 6, fps = 12 } = {}) {
  return stickerAnimado(buffer, 'mp4', { duracion, fps })
}

/**
 * Convierte un GIF en un sticker animado WebP de 512x512 (para reacciones anime).
 */
export async function stickerDesdeGif(buffer, { duracion = 6, fps = 12 } = {}) {
  return (await stickerAnimado(buffer, 'gif', { duracion, fps })).buffer
}

/**
 * Lee la duracion real (segundos) de un archivo de audio con ffprobe.
 * Devuelve null si ffprobe no esta o no puede leer el archivo.
 */
function duracionDeAudio(archivo) {
  return new Promise((resolve) => {
    const proceso = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )

    let salida = ''
    proceso.stdout.on('data', (d) => {
      salida += d
    })
    proceso.on('error', () => resolve(null))
    proceso.on('close', (code) => {
      const valor = Number.parseFloat(salida.trim())
      resolve(code === 0 && Number.isFinite(valor) ? valor : null)
    })
  })
}

/**
 * Chunks que forman parte del formato WebP. Cualquier otro nombre es un
 * agregado de la app que armo el sticker (por ejemplo, el audio).
 */
const CHUNKS_WEBP_CONOCIDOS = new Set([
  'VP8 ',
  'VP8L',
  'VP8X',
  'ALPH',
  'ANIM',
  'ANMF',
  'EXIF',
  'XMP ',
  'ICCP',
])

/**
 * Lista los chunks del contenedor RIFF de un WebP, en orden.
 * @returns {Array<{nombre: string, datos: Buffer}>}
 */
export function chunksWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return []
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return []
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return []

  const chunks = []
  let pos = 12

  while (pos + 8 <= buffer.length) {
    const nombre = buffer.toString('ascii', pos, pos + 4)
    const tam = buffer.readUInt32LE(pos + 4)
    if (tam > buffer.length) break

    const inicio = pos + 8
    const fin = Math.min(inicio + tam, buffer.length)
    chunks.push({ nombre, datos: buffer.subarray(inicio, fin) })

    pos = inicio + tam + (tam % 2)
  }

  return chunks
}

/** Corre ffprobe y devuelve el stdout (vacio si falla) */
function correrFfprobe(args) {
  return new Promise((resolve) => {
    const proceso = spawn('ffprobe', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    let salida = ''
    proceso.stdout.on('data', (d) => {
      salida += d
    })
    proceso.on('error', () => resolve(''))
    proceso.on('close', (code) => resolve(code === 0 ? salida : ''))
  })
}

/** true si el buffer tiene al menos una pista de audio */
async function esAudioBuffer(buffer) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const archivo = path.join(TMP_DIR, `chk_${sello}.bin`)

  try {
    await fsp.writeFile(archivo, buffer)
    const salida = await correrFfprobe([
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=nw=1:nk=1',
      archivo,
    ])
    return salida.includes('audio')
  } catch {
    return false
  } finally {
    try {
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
    } catch {
      /* la limpieza no puede romper nada */
    }
  }
}

/**
 * Busca el audio dentro del propio WebP: los stickers con sonido lo llevan
 * como chunk extra (o pegado despues del RIFF), no en el mensaje.
 *
 * @returns {Promise<{audio: Buffer, origen: string}|null>}
 */
export async function audioDeWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null

  const candidatos = chunksWebp(buffer)
    .filter((c) => !CHUNKS_WEBP_CONOCIDOS.has(c.nombre) && c.datos.length > 512)
    .map((c) => ({ audio: c.datos, origen: `chunk ${c.nombre.trim() || '?'}` }))

  // Datos pegados despues del contenedor RIFF
  const tamRiff = buffer.readUInt32LE(4) + 8
  if (buffer.length > tamRiff + 8) {
    candidatos.push({ audio: buffer.subarray(tamRiff), origen: 'cola del archivo' })
  }

  for (const candidato of candidatos) {
    if (await esAudioBuffer(candidato.audio)) return candidato
  }

  return null
}

/**
 * Duracion en segundos de un buffer de audio o video. null si ffprobe no
 * puede leerlo (o no esta instalado).
 */
export async function duracionDeBuffer(buffer, extension = 'ogg') {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const archivo = path.join(TMP_DIR, `dur_${sello}.${extension}`)

  try {
    await fsp.writeFile(archivo, buffer)
    return await duracionDeAudio(archivo)
  } catch {
    return null
  } finally {
    try {
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
    } catch {
      /* la limpieza no puede romper la respuesta */
    }
  }
}

/**
 * Extrae la pista de audio de un video y la deja en OGG/Opus.
 *
 * El encode calca el perfil de nota de voz de WhatsApp, que es el mismo
 * decodificador que reproduce el audio del sticker: mono, 48 kHz, frames de
 * 60 ms y `-avoid_negative_ts make_zero`. Ese flag es el que importa: los
 * videos traen un offset de arranque que deja timestamps negativos en el
 * OGG, y el decodificador de Android los rechaza con "no se pudo reproducir
 * el sonido del sticker".
 *
 * @returns {Promise<{buffer: Buffer, segundos: number}|null>} null si el video no trae audio
 */
export async function audioDesdeVideo(buffer, { duracion = 6, extension = 'mp4' } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `voz_${sello}.${extension}`)
  const salida = path.join(TMP_DIR, `voz_${sello}.ogg`)

  try {
    await fsp.writeFile(entrada, buffer)

    try {
      await ejecutarFfmpeg(
        [
          '-y',
          '-i', entrada,
          '-t', String(duracion),
          '-vn',
          '-map_metadata', '-1',
          '-ac', '1',
          '-ar', '48000',
          '-c:a', 'libopus',
          '-b:a', '48k',
          '-frame_duration', '60',
          '-application', 'audio',
          '-avoid_negative_ts', 'make_zero',
          '-f', 'ogg',
          salida,
        ],
        timeoutPorPeso(buffer.length, 60000)
      )
    } catch (err) {
      // Un video mudo hace salir a ffmpeg sin pista que mapear.
      // ffmpeg ausente o colgado sí tiene que verse, no disfrazarse de mudo.
      if (err?.code === 'ENOENT' || err?.message === 'FFMPEG_TIMEOUT') throw err
      return null
    }

    const audio = await fsp.readFile(salida)
    if (!audio.length) return null

    // La duracion real manda: si el video era mas corto que lo pedido, el
    // cliente compara el `seconds` del mensaje con el stream y falla al
    // reproducir cuando no cuadran.
    const exacta = await duracionDeAudio(salida)
    return { buffer: audio, segundos: Math.max(1, Math.round(exacta ?? duracion)) }
  } finally {
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}

/**
 * Convierte un sticker WebP en MP4 (H.264 + yuv420p).
 *
 *   - sticker animado: se respeta su duracion (o la que se pase)
 *   - sticker estatico: sale un video corto con el frame repetido
 *   - si se pasa `audio`, se pega como AAC y se corta con -shortest
 *
 * Un ffmpeg viejo no sabe abrir un WebP animado (el demuxer webp llego en la
 * 5.0): decodifica cero frames y libx264 muere con "Invalid argument". Si el
 * primer intento falla, sharp pasa el sticker a GIF (o PNG si es estatico) y
 * se reintenta por ese lado, que no depende del decodificador de ffmpeg.
 *
 * @returns {Promise<Buffer>} el mp4 listo para enviar
 */
export async function videoDesdeSticker(buffer, { audio = null, duracion = null, fps = 15 } = {}) {
  const animado = esWebpAnimado(buffer)
  const opciones = { audio, duracion, fps }

  try {
    return await convertirStickerAMp4(buffer, 'webp', animado, opciones)
  } catch (err) {
    const alterno = await stickerParaFfmpeg(buffer, animado)
    if (!alterno) throw err

    console.warn(`[sticker-video] ffmpeg no pudo con el WebP (${String(err?.message || err).slice(0, 120)}); reintento como ${alterno.extension}`)
    return convertirStickerAMp4(alterno.buffer, alterno.extension, animado, opciones)
  }
}

/**
 * Pasa el WebP a un formato que cualquier ffmpeg entiende.
 * @returns {Promise<{buffer: Buffer, extension: string}|null>}
 */
async function stickerParaFfmpeg(buffer, animado) {
  try {
    const sharp = (await import('sharp')).default
    if (animado) {
      return { buffer: await sharp(buffer, { animated: true }).gif().toBuffer(), extension: 'gif' }
    }
    return { buffer: await sharp(buffer).png().toBuffer(), extension: 'png' }
  } catch (err) {
    console.warn('[sticker-video] tampoco pude convertir el WebP con sharp:', err?.message)
    return null
  }
}

/** Un intento de conversion con un archivo de entrada concreto */
async function convertirStickerAMp4(buffer, extension, animado, { audio, duracion, fps }) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `vid_${sello}.${extension}`)
  const audioTmp = path.join(TMP_DIR, `vid_${sello}.ogg`)
  const salida = path.join(TMP_DIR, `vid_${sello}.mp4`)

  try {
    await fsp.writeFile(entrada, buffer)

    const args = ['-y']
    // Un sticker estatico es un solo frame: se repite para que haya video
    if (!animado) args.push('-loop', '1')
    args.push('-i', entrada)

    const conAudio = Boolean(audio?.length)
    if (conAudio) {
      await fsp.writeFile(audioTmp, audio)
      args.push('-i', audioTmp)
    }

    args.push(
      // H.264 no acepta dimensiones impares ni canal alfa
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p'
    )

    if (conAudio) args.push('-c:a', 'aac', '-b:a', '96k', '-shortest')
    else args.push('-an')

    // Sin duracion conocida, un estatico se queda en 3 s
    const segundos = duracion ?? (animado ? null : 3)
    if (segundos) args.push('-t', String(Math.min(segundos, 60)))

    args.push('-movflags', '+faststart', salida)
    await ejecutarFfmpeg(args, 120000)

    return await fsp.readFile(salida)
  } finally {
    for (const archivo of [entrada, audioTmp, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}

/**
 * Convierte un GIF en un MP4 corto para enviarlo como GIF de WhatsApp.
 * WhatsApp reproduce los "GIF" a partir de un MP4 H.264 sin audio
 * (contenido `video` + `gifPlayback: true`).
 */
export async function mp4DesdeGif(buffer, { duracion = 6, fps = 15 } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `gif_${sello}.gif`)
  const salida = path.join(TMP_DIR, `gif_${sello}.mp4`)

  try {
    await fsp.writeFile(entrada, buffer)
    await ejecutarFfmpeg([
      '-y',
      '-i', entrada,
      '-t', String(duracion),
      // Nunca agranda el GIF original y deja alto par (H.264 lo exige)
      '-vf', `scale=w='min(720,iw)':h=-2:flags=lanczos,fps=${fps}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an',
      salida,
    ])
    return await fsp.readFile(salida)
  } finally {
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}

/** Techo real de WhatsApp para un sticker animado, con margen para el EXIF de la firma */
const TOPE_STICKER = 500 * 1024 - 256

/** Timeout de ffmpeg que crece con el peso del archivo de entrada */
function timeoutPorPeso(bytes, base = 90000) {
  const mb = Math.max(0, Number(bytes) || 0) / 1048576
  return Math.min(300000, base + Math.round(mb) * 1500)
}

/**
 * Motor comun de conversion a sticker animado (video o GIF de entrada).
 *
 * Devuelve `{ buffer, duracion }`. El video de origen puede ser largo o
 * pesado: se intenta con la duracion pedida bajando fps y calidad, y si aun
 * asi no entra en los 500 KB de WhatsApp se recorta el clip. La duracion que
 * se devuelve es la que de verdad quedo en el archivo.
 */
async function stickerAnimado(buffer, extension, { duracion = 6, fps = 12 } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `entrada_${sello}.${extension}`)
  const salida = path.join(TMP_DIR, `salida_${sello}.webp`)
  const timeout = timeoutPorPeso(buffer.length)

  // Escalones de calidad: primero se baja el fps, despues el crf (mas peso).
  const escalones = [
    { fps, crf: 30 },
    { fps: Math.min(fps, 10), crf: 36 },
    { fps: Math.min(fps, 8), crf: 42 },
    { fps: Math.min(fps, 6), crf: 48 },
    { fps: Math.min(fps, 5), crf: 55 },
  ]

  // Duraciones de respaldo si ni el escalon mas agresivo entra: se recorta
  // antes que mandar un sticker que WhatsApp va a romper.
  const recortes = [duracion, Math.min(duracion, 8), Math.min(duracion, 6), Math.min(duracion, 4)]
    .filter((d, i, lista) => d > 0 && lista.indexOf(d) === i)

  // Ultimo recurso cuando ni el recorte a 4s entra (video de ruido, muchisimo
  // detalle por frame): 2s a 4 fps y el contenido encogido a 320 dentro del
  // lienzo de 512. El sticker sigue siendo 512x512 para WhatsApp; lo que baja
  // es la resolucion util, que es lo que cuesta bytes.
  const EXTREMO = { duracion: Math.min(duracion, 2), fps: 4, crf: 60, lienzo: 320 }

  try {
    await fsp.writeFile(entrada, buffer)

    const filtroDe = (lienzo) =>
      `scale=${lienzo}:${lienzo}:force_original_aspect_ratio=decrease,` +
      'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,' +
      'format=yuva420p'

    let mejor = null

    /** Corre un intento y devuelve el buffer resultante */
    const intentar = async ({ recorte, fps: fpsI, crf, lienzo = 512 }) => {
      await ejecutarFfmpeg(
        [
          '-y',
          '-i', entrada,
          '-t', String(recorte),
          '-vf', `${filtroDe(lienzo)},fps=${fpsI}`,
          '-loop', '0',
          '-c:v', 'libwebp',
          '-preset', 'default',
          '-crf', String(crf),
          '-compression_level', '6',
          '-an',
          salida,
        ],
        timeout
      )
      return fsp.readFile(salida)
    }

    for (const recorte of recortes) {
      // Con la duracion completa se prueban todos los escalones; en los
      // recortes basta con los dos mas agresivos (ya se sabe que no entra).
      const escalonesEfectivos = recorte === duracion ? escalones : escalones.slice(-2)

      for (const { fps: fpsI, crf } of escalonesEfectivos) {
        const resultado = await intentar({ recorte, fps: fpsI, crf })
        if (resultado.length <= TOPE_STICKER) return { buffer: resultado, duracion: recorte }

        // Respaldo: el mas liviano visto hasta ahora, por si nada entra
        if (!mejor || resultado.length < mejor.buffer.length) {
          mejor = { buffer: resultado, duracion: recorte }
        }
      }
    }

    if (EXTREMO.duracion > 0) {
      const resultado = await intentar({
        recorte: EXTREMO.duracion,
        fps: EXTREMO.fps,
        crf: EXTREMO.crf,
        lienzo: EXTREMO.lienzo,
      })
      if (resultado.length <= TOPE_STICKER) {
        return { buffer: resultado, duracion: EXTREMO.duracion }
      }
      if (!mejor || resultado.length < mejor.buffer.length) {
        mejor = { buffer: resultado, duracion: EXTREMO.duracion }
      }
    }

    // Nada entro en el tope: se devuelve el intento mas liviano y que el
    // llamador decida (mejor un sticker pasado de peso que ninguno).
    console.warn(
      `[sticker] no entro en ${(TOPE_STICKER / 1024).toFixed(0)} KB: ` +
        `${(mejor?.buffer.length / 1024).toFixed(0)} KB en ${mejor?.duracion}s`
    )
    return mejor
  } finally {
    // Limpieza de los archivos temporales
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}