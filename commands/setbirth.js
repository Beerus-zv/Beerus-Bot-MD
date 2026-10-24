/**
 * #setbirth DD-MM (también #cumplefecha) y #delbirth — guarda tu fecha de
 * cumpleaños para que el grupo pueda saludarte (tabla cumpleanos).
 */
import { guardarCumpleanos, quitarCumpleanos } from '../database/db.js'

const FECHA = /^([0-3]?\d)\s*[-/.]\s*([0-1]?\d)$/

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid
  const sub = String(args[0] || '').toLowerCase()

  // #setbirth borrar — quita la fecha guardada
  if (sub === 'borrar' || sub === 'del' || sub === 'quitar') {
    const borrado = quitarCumpleanos(quien)
    await sock.sendMessage(jid, {
      text: borrado
        ? '🗑️ *Cumpleaños eliminado.* _El reino ya no sabrá quando pegarte alboroto._'
        : '❓ No tenías cumpleaños guardado.',
      quoted: msg,
    })
    return
  }

  // #setbirth DD-MM
  const m = FECHA.exec(String(args[0] || '').trim())
  if (!m) {
    await sock.sendMessage(jid, {
      text:
        '❓ *Uso:* `/setbirth DD-MM` (p. ej. `/setbirth 07-08`)\n' +
        '— También: `/setbirth borrar` quita tu fecha.',
      quoted: msg,
    })
    return
  }

  const dia = Number(m[1])
  const mes = Number(m[2])

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) {
    await sock.sendMessage(jid, {
      text: '❌ Fecha inválida: el día va 1-31 y el mes 1-12.',
      quoted: msg,
    })
    return
  }

  const fecha = `${new Date().getFullYear()}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  guardarCumpleanos(quien, fecha)

  await sock.sendMessage(jid, {
    text:
      `🎂 *Cumpleaños guardado:* ${dia.toString().padStart(2, '0')}-${mes.toString().padStart(2, '0')}\n` +
      `_Cuando llegue el día, el reino inicia la fiesta._`,
    quoted: msg,
  })
}
