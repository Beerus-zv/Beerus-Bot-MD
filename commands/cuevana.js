/**
 * .cuevana <texto> — busca peliculas/series en Cuevana y Cuevana2 (dos proveedores).
 * Usa fetch nativo + parseo HTML con cheerio (node_modules instalado).
 */

export default async ({ sock, jid, msg, args }) => {
  const query = String(args[0] || '').trim()
  if (!query) {
    return await sock.sendMessage(jid, {
      text: '❓ Uso: `.cuevana <texto>`', quoted: msg,
    })
  }
  try {
    const results = []
    
    // Cuevana3
    const results1 = await searchPage(`https://cuevana3.mu/?s=${encodeURIComponent(query)}`)
    results.push(...results1)
    
    // PelisPlus
    const results2 = await searchPage(`https://pelisplushd.cx/search/?s=${encodeURIComponent(query)}`)
    results.push(...results2)
    
    if (!results.length) {
      await sock.sendMessage(jid, { text: '❌ No se encontraron resultados.', quoted: msg })
      return
    }
    
    const res = results.map((v) =>
      `*🎬 • ${v.title}:* ${v.link}`
    ).join('\n\n───────────────\n\n')
    
    await sock.sendMessage(jid, { text: res, quoted: msg })
  } catch (err) {
    console.error(err)
    await sock.sendMessage(jid, { text: '❌ Error al buscar peliculas.', quoted: msg })
  }
}

async function searchPage(url) {
  // cheerio tarda ~1s en cargar y solo hace falta cuando alguien usa el
  // comando: se importa aqui para no pagarlo en el arranque del bot.
  const { load } = await import('cheerio')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const page = await res.text()
  const $ = load(page)
  const out = []
  $('.results-post > article').each((_, el) => {
    const elJ = $(el)
    const title = elJ.find('header > h2').text().trim()
    const link = elJ.find('.lnk-blk').attr('href') || ''
    out.push({ title, link })
  })
  return out
}