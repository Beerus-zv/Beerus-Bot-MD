/**
 * .remini — mejora calidad de imagen (HD/enhance)
 * Uso: responde a una imagen o envía imagen con `.remini`
 */
import FormData from 'form-data'

export default async ({ sock, jid, msg }) => {
  const quoted = msg.quoted || msg
  let media = quoted?.msg?.media || quoted?.msg?.message?.image || ''
  if (!media && msg.msg?.media) media = msg.msg

  if (!media) {
    return await sock.sendMessage(jid, {
      text: '❓ Responde a una imagen o envía imagen con `.remini`', quoted: msg,
    })
  }

  try {
    await sock.sendMessage(jid, { text: '🐈 Mejorando calidad...', quoted: msg })
    const tempPath = await sock.downloadAndSaveMediaMessage(media, 'remini_input.jpg', false)
    const form = new FormData()
    const fs = await import('fs')
    const stream = fs.createReadStream(tempPath)
    form.append('image', stream, { filename: 'enhance_image_body.jpg', contentType: 'image/jpeg' })
    form.append('model_version', '1', { 'Content-Transfer-Encoding': 'binary', contentType: 'multipart/form-data; charset=utf-8' })

    const res = await fetch('https://inferenceengine.vyro.ai/enhance.vyro', {
      method: 'POST',
      body: form,
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'okhttp/4.9.3',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip',
      },
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    
    await sock.sendMessage(jid, {
      image: buf,
      caption: '✨ *ReMini* — imagen mejorada',
    }, { quoted: msg })
    
    // Cleanup temp
    try { fs.unlinkSync(tempPath) } catch (_) {}
  } catch (e) {
    console.error(e)
    await sock.sendMessage(jid, { text: '❌ Falló al mejorar la imagen.', quoted: msg })
  }
}