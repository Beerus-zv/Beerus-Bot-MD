/**
 * Menú VIP Exclusive: comandos del club, solo miembros.
 * Estética alineada con el estilo del bot (citas, ornamentos, Beerus).
 */
import { TEMA, ORNAMENTOS, panelLinea, fechaMenu } from '../lib/tema.js'
import { topEconomia, obtenerEconomia } from '../database/db.js'
import { formatearNumero } from '../lib/economia.js'

const LIMITE_WA = 4096

export default async ({ sock, jid, msg, commands }) => {
  const prefijo = '/'

  const datos = {
    modo: TEMA.modo,
    version: TEMA.version,
    desarrollador: TEMA.desarrollador,
    moneda: TEMA.moneda,
    comandos: 'VIP · Club Exclusive',
    link: TEMA.link,
  }

  const panel = panelLinea(datos)
  const fecha = fechaMenu()

  const cuerpo =
    `> 👑 *${TEMA.titulo}* ⚡\n` +
    `> _${TEMA.subtitulo}_\n` +
    `> ⏰ ${fecha}\n\n` +
    `${ORNAMENTOS.separador}\n` +
    `${panel}\n` +
    `${ORNAMENTOS.separador}\n\n` +
    `✨ *Menú VIP Exclusive*\n\n` +
    `✦ *Miembros del club:*\n` +
    `▸ \`${prefijo}vipbadge\` — tu rango VIP\n` +
    `▸ \`${prefijo}vipboost\` — +500 monedas / +200 exp (1/semana)\n` +
    `▸ \`${prefijo}gachaclaim <nombre>\` — reclamo VIP de personaje (1/mes)\n\n` +
    `✦ *Solo owner:*\n` +
    `▸ \`${prefijo}vip add @user\` — dar acceso\n` +
    `▸ \`${prefijo}vip remove @user\` — quitar acceso\n\n` +
    `✦ *Todos:*\n` +
    `▸ \`${prefijo}vip\` — lista de miembros\n` +
    `▸ \`${prefijo}c\` — reclamar la carta del chat\n` +
    `▸ \`${prefijo}gacha\` — gacha normal\n\n` +
    `_Acceso: solo miembros del club._`

  if (cuerpo.length <= LIMITE_WA) {
    await sock.sendMessage(jid, { text: cuerpo, quoted: msg })
  } else {
    const bloques = []
    let actual = ''
    for (const parrafo of cuerpo.split('\n\n')) {
      const juntado = actual ? `${actual}\n\n${parrafo}` : parrafo
      if (actual && juntado.length > LIMITE_WA) {
        bloques.push(actual)
        actual = parrafo
      } else {
        actual = juntado
      }
    }
    if (actual) bloques.push(actual)
    for (const b of bloques) await sock.sendMessage(jid, { text: b, quoted: msg })
  }
}