import { pedirJson } from '../lib/internet.js'

/**
 * Información de un paquete npm (basado en el plugin 'npmstalk' de MEGA-MD).
 * Consume el registro público de npmjs: no necesita clave.
 * Uso: /npm <paquete>
 */
export default async ({ sock, jid, msg, args }) => {
  const paquete = (args?.[0] || '').trim()
  if (!paquete || /[^@a-z0-9_\-.\/]/i.test(paquete)) {
    await sock.sendMessage(jid, {
      text:
        '📦 *Info de paquete npm*\n\n' +
        '*Uso:* `/npm <paquete>`\n\n' +
        '*Ejemplos:* `/npm sharp`, `/npm @whiskeysockets/baileys`',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: '🔎 Consultando el registro npm...' })

  try {
    const datos = await pedirJson(`https://registry.npmjs.org/${encodeURIComponent(paquete).replace('%2F', '/')}`)
    const mejor = datos['dist-tags']?.latest
    const version = datos.versions?.[mejor] || {}

    const creadora =
      version._npmUser?.name ||
      datos.maintainers?.[0]?.name ||
      'desconocido'

    const creado = datos.time?.created ? new Date(datos.time.created).toLocaleDateString('es-ES') : '?'
    const actualizado = datos.time?.[mejor] ? new Date(datos.time[mejor]).toLocaleDateString('es-ES') : '?'

    const texto =
      `📦 *npm — ${datos.name}*\n\n` +
      `${datos.description || '_Sin descripción._'}\n\n` +
      `🏷️ *Última versión:* ${mejor || '—'}\n` +
      (version.dependencies
        ? `🧩 *Dependencias directas:* ${Object.keys(version.dependencies).length}\n`
        : '') +
      (version.unpackedSize ? `📏 *Tamaño desempacado:* ${Math.round(version.unpackedSize / 1024 * 10) / 10} KB\n` : '') +
      `👤 *Mantenedor:* ${creadora}\n` +
      `📜 *Licencia:* ${version.license || datos.license || '—'}\n` +
      `📅 *Creado:* ${creado}\n` +
      `🔄 *Última publicación:* ${actualizado}\n\n` +
      `🔗 ${version.homepage || version.repository?.url?.replace(/^git\+/, '') || `https://www.npmjs.com/package/${datos.name}`}`

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  } catch (err) {
    const noExiste = String(err?.message).includes('404')
    await sock.sendMessage(jid, {
      text: noExiste
        ? `❓ El paquete *${paquete}* no existe en npm.`
        : '❌ Falló la consulta al registro npm. Intenta de nuevo.',
      quoted: msg,
    })
  }
}
