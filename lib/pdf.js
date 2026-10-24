/**
 * Construccion de PDFs sin dependencias nuevas.
 *
 * Los PDF se usan para mangas y galerias (pixiv, nhentai...). Embebe las
 * imagenes tal cual si son JPEG (DCTDecode) y, si no, las convierte a JPEG
 * con sharp antes de incrustarlas.
 */

import sharp from 'sharp'

/** Ancho/alto maximo de una pagina del PDF, en puntos (limite de Adobe: 14400) */
const MAXIMA = 1200

/** Convierte cualquier imagen a un JPEG de calidad razonable */
async function aJpeg(buffer) {
  return sharp(buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
}

/**
 * Crea un PDF con una imagen por pagina.
 *
 * @param {Buffer[]} imagenes imagenes (png, jpg, webp...) en orden
 * @param {{titulo?: string}} opciones titulo opcional para los metadatos
 * @returns {Promise<Buffer>}
 */
export async function crearPdf(imagenes, { titulo = '' } = {}) {
  if (!Array.isArray(imagenes) || !imagenes.length) {
    throw new Error('crearPdf necesita al menos una imagen')
  }

  // Cada pagina: jpeg convertido + dimensiones
  const paginas = []
  for (const original of imagenes.slice(0, 300)) {
    const jpeg = await aJpeg(original)
    const meta = await sharp(jpeg).metadata()
    const w = meta.width || 600
    const h = meta.height || 800
    paginas.push({ jpeg, w, h })
  }

  // Numeracion: 1 = Catalogo, 2 = Pages, y por cada pagina i:
  //   Page = 3+3i, contenido = 4+3i, imagen = 5+3i
  const totalPaginas = paginas.length
  const numPage = (i) => 3 + i * 3
  const numStream = (i) => 4 + i * 3
  const numImagen = (i) => 5 + i * 3
  const totalObjetos = 2 + totalPaginas * 3

  const objetos = []
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>')
  const hijos = paginas.map((_, i) => `${numPage(i)} 0 R`).join(' ')
  objetos.push(`<< /Type /Pages /Kids [${hijos}] /Count ${totalPaginas} >>`)

  for (let i = 0; i < totalPaginas; i++) {
    const { jpeg, w, h } = paginas[i]
    const escala = Math.min(MAXIMA / Math.max(w, h), 1)
    const pw = Math.round(w * escala)
    const ph = Math.round(h * escala)

    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
        `/Resources << /XObject << /I ${numImagen(i)} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${numStream(i)} 0 R >>`
    )

    const stream = `q ${pw} 0 0 ${ph} 0 0 cm /I Do Q`
    const streamBytes = Buffer.from(stream, 'latin1')
    objetos.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, 'latin1'),
        streamBytes,
        Buffer.from('\nendstream', 'latin1'),
      ])
    )

    const cabeceraImagen =
      `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    objetos.push(Buffer.concat([Buffer.from(cabeceraImagen, 'latin1'), jpeg, Buffer.from('\nendstream', 'latin1')]))
  }

  // Ensamblado + tabla xref con los desplazamientos reales
  const trozos = []
  let desplazamiento = 0
  const offsets = new Map()

  const append = (trozo) => {
    trozos.push(trozo)
    desplazamiento += trozo.length
  }

  const cabecera = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')
  append(cabecera)

  for (let n = 1; n <= totalObjetos; n++) {
    const cuerpo = objetos[n - 1] // objetos[] empieza en el objeto 1
    if (cuerpo === undefined) throw new Error(`falta el objeto ${n}`)
    offsets.set(n, desplazamiento)
    append(Buffer.from(`${n} 0 obj\n`, 'latin1'))
    append(Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo + '\n', 'latin1'))
    append(Buffer.from('endobj\n', 'latin1'))
  }

  const inicioXref = desplazamiento
  let xref = `xref\n0 ${totalObjetos + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= totalObjetos; n++) {
    xref += `${String(offsets.get(n)).padStart(10, '0')} 00000 n \n`
  }
  append(Buffer.from(xref, 'latin1'))
  append(
    Buffer.from(
      `trailer\n<< /Size ${totalObjetos + 1} /Root 1 0 R${titulo ? ` /Info << /Title (${titulo.replace(/[()\\]/g, '')}) >>` : ''} >>\nstartxref\n${inicioXref}\n%%EOF\n`,
      'latin1'
    )
  )

  return Buffer.concat(trozos)
}
