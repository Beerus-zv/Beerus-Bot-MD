import sharp from 'sharp'
import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
} from '../lib/multimedia.js'

/** Filtros disponibles (inspirados en los plugins blur/grayscale/sepia/invert/sharpen de MEGA-MD) */
export const EFECTOS = {
  blur: 'Desenfoque suave',
  gris: 'Escala de grises',
  sepia: 'Tono sepia antiguo',
  invertir: 'Colores invertidos',
  pixelar: 'Estilo minecraft / pixel',
  sacudir: 'Desenfoque de movimiento',
  nitidez: 'Mas definido',
  contraste: 'Mas contraste',
  espejo: 'Imagen invertida',
  rotar: 'Giro de 90 grados',
  paleta: 'Colores ceniza',
}

export const AYUDA =
  `🎨 *Efectos de imagen*\n\n` +
  `*Uso:* responde a una imagen con \`/efecto ${'<tipo>'}\`\n\n` +
  Object.entries(EFECTOS).map((n) => `• \`${n[0]}\` — ${n[1]}`).join('\n')

/**
 * Aplica filtros a una imagen usando sharp, todo local.
 */
export default async ({ sock, jid, msg, args }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, { text: `${AYUDA}\n\n❌ Responde a una *imagen*.`, quoted: msg })
    return
  }

  const tipo = detectarTipoMedia(fuente.mensaje)
  if (tipo !== 'image') {
    await sock.sendMessage(jid, { text: '❌ Los efectos solo funcionan con *imágenes*. Usa `/stickervideo` para videos.', quoted: msg })
    return
  }

  const efecto = (args?.[0] || 'blur').toLowerCase()
  if (!EFECTOS[efecto]) {
    await sock.sendMessage(jid, { text: `❓ Ese efecto no existe. ${AYUDA}`, quoted: msg })
    return
  }

  await sock.sendMessage(jid, { text: `⏳ Aplicando *${efecto}*...` })

  try {
    const buffer = await descargarMedia(sock, fuente.mensaje)
    const resultado = await aplicar(buffer, efecto)

    await sock.sendMessage(jid, { image: resultado, caption: `🎨 Efecto: *${efecto}*\n_${EFECTOS[efecto]}_`, quoted: msg })
  } catch (err) {
    console.error('Error aplicando el efecto:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo procesar la imagen. Intenta con otra (mejor en jpg/png) o un efecto más suave.',
      quoted: msg,
    })
  }
}

/** Devuelve el buffer con el filtro aplicado */
async function aplicar(buffer, efecto) {
  const base = sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })

  switch (efecto) {
    case 'blur':
      return base.blur(15).jpeg({ quality: 92 }).toBuffer()
    case 'gris':
      return base.grayscale().jpeg({ quality: 92 }).toBuffer()
    case 'sepia':
      return base.modulate({ saturation: 0.6 }).tint({ r: 112, g: 66, b: 20 }).jpeg({ quality: 92 }).toBuffer()
    case 'invertir':
      return base.negate().jpeg({ quality: 92 }).toBuffer()
    case 'pixelar':
      return pixelar(buffer)
    case 'sacudir':
      return base.blur(2).sharpen({ sigma: 2 }).jpeg({ quality: 95 }).toBuffer()
    case 'nitidez':
      return base.sharpen({ sigma: 3 }).jpeg({ quality: 95 }).toBuffer()
    case 'contraste':
      return base.normalize().modulate({ saturation: 1.2 }).jpeg({ quality: 92 }).toBuffer()
    case 'espejo':
      return base.flop().jpeg({ quality: 92 }).toBuffer()
    case 'rotar':
      return base.rotate(90).jpeg({ quality: 92 }).toBuffer()
    case 'paleta':
      return base.modulate({ saturation: 0.2, lightness: 10 }).jpeg({ quality: 92 }).toBuffer()
    default:
      return base.jpeg({ quality: 92 }).toBuffer()
  }
}

/** pixelar: reduce a 10x10 y vuelve a escalar */
async function pixelar(buffer) {
  const mini = await sharp(buffer).resize(10, 10, { fit: 'inside' }).png().toBuffer()
  return sharp(mini).resize(1024, 1024, { fit: 'inside', kernel: 'nearest' }).png().toBuffer()
}
