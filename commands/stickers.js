import {
  stickerDesdeImagen,
  enviarSticker,
} from '../lib/multimedia.js'
import { obtenerAvatarBeerus } from '../lib/avatar.js'
import { log } from '../lib/logger.js'

/**
 * Envia un sticker aleatorio de Beerus (WebP 512x512).
 * Uso: /stickers
 * Nota: el formato antiguo { type: 'sticker' } no sirve en Baileys:
 * el sticker se envia como { sticker: buffer }.
 */
export default async ({ sock, jid, msg }) => {
  try {
    const imagen = await obtenerAvatarBeerus()
    const sticker = await stickerDesdeImagen(imagen)

    await enviarSticker(sock, jid, sticker, msg)
  } catch (err) {
    log.error('Error creando el sticker aleatorio', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo crear el sticker aleatorio. Intenta de nuevo.',
      quoted: msg,
    })
  }
}
