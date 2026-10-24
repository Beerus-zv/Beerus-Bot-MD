import { clima } from '../lib/internet.js'

const AYUDA = `🌡️ *Clima*

*Uso:* \`/clima <ciudad>\`

_Ejemplo:_ \`/clima Guadalajara\`

_Meteo actual y pronostico de 3 dias (Open-Meteo)._`

export default async ({ sock, jid, msg, args }) => {
  const ciudad = (args || []).join(' ').trim()

  if (!ciudad) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, {
    text: `🌡️ Consultando el clima de *${ciudad}*...`,
    quoted: msg,
  })

  try {
    const datos = await clima(ciudad)

    const pronostico = datos.dias
      .map(
        (d) =>
          `▸ *${d.fecha}* — ${d.descripcion}\n  🌡️ ${d.min}° / ${d.max}°`
      )
      .join('\n')

    const texto =
      `🌡️ *Clima de ${datos.ciudad}*\n\n` +
      `☀️ Ahora: *${datos.temperatura}°C* — ${datos.descripcion}\n` +
      `🤔 Sensacion: *${datos.sensacion}°C*\n` +
      `💧 Humedad: *${datos.humedad}%*\n` +
      `🌬️ Viento: *${datos.viento} km/h*\n\n` +
      `*Pronostico:*\n${pronostico}`

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  } catch (err) {
    console.error('Error consultando el clima:', err)
    const mensaje =
      err.message === 'NO_ENCONTRADA'
        ? `😕 No conozco la ciudad *${ciudad}*.`
        : `💥 *No pude consultar el clima.*\n_${err.message}_`
    await sock.sendMessage(jid, { text: mensaje, quoted: msg })
  }
}
