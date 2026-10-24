import { buscarWikipedia, resumenWikipedia } from '../lib/internet.js'

const AYUDA = `📚 *Wikipedia*

*Uso:* \`/wiki <tema>\`

_Ejemplo:_ \`/wiki Dragon Ball Super\`

_Busca articulos de Wikipedia y te muestra el resumen del primero._`

export default async ({ sock, jid, msg, args }) => {
  const consulta = (args || []).join(' ').trim()

  if (!consulta) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, {
    text: `📚 Consultando Wikipedia *${consulta}*...`,
    quoted: msg,
  })

  try {
    const resultados = await buscarWikipedia(consulta, 4)

    if (!resultados.length) {
      await sock.sendMessage(jid, {
        text: `😕 Wikipedia no tiene nada sobre *${consulta}*.`,
        quoted: msg,
      })
      return
    }

    const primero = resultados[0]
    let resumen = ''
    let imagen = null

    try {
      const detalle = await resumenWikipedia(primero.titulo)
      resumen = detalle.extract || primero.resumen
      imagen = detalle.imagen
    } catch {
      resumen = primero.resumen
    }

    const otros = resultados.slice(1)
    const lista =
      otros.length > 0
        ? '\n\n*Otros artículos:*\n' + otros.map((r) => `• ${r.titulo}\n  ${r.url}`).join('\n')
        : ''

    if (imagen) {
      await sock.sendMessage(jid, {
        image: { url: imagen },
        caption: `📚 *${primero.titulo}*\n\n_${resumen}_\n🔗 ${primero.url}${lista}`,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text: `📚 *${primero.titulo}*\n\n_${resumen}_\n🔗 ${primero.url}${lista}`,
      quoted: msg,
    })
  } catch (err) {
    console.error('Error en Wikipedia:', err)
    await sock.sendMessage(jid, {
      text: `💥 *Falló la consulta a Wikipedia.*\n_${err.message}_`,
      quoted: msg,
    })
  }
}
