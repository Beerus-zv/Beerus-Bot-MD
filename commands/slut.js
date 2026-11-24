/**
 * `/slut [@usuario]` — trabajo nocturno del sótano (economía NSFW).
 *
 *   /slut           sale a la calle por su cuenta
 *   /slut @usuario  se va con el mencionado (los dos cobran)
 *
 * Igual que el resto del sótano: exige `/nsfw on` en el chat y respeta la
 * recarga compartida de 'nsfw'. Paga más que `/crimen` pero la espera es
 * larga y hay probabilidad de que salga mal.
 */
import { nsfwActivo, sumarMonedas, restarMonedas } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'
import { marcarUso } from '../database/db.js'
import { obtenerMetadata, resolverObjetivo, jidUsuario, esGrupo } from '../lib/grupo.js'

const CLAVE_RECARGA = 'nsfw'
const COSTO = 0

/** Frases de éxito y de fracaso, para no repetir el mismo texto */
const EXITOS = [
  'te fuiste con un cliente generoso y volviste con los bolsillos llenos',
  'la noche se portó bien contigo',
  'un tipo pagó de más y no preguntó nada',
  'saliste a la esquina y volviste antes de que amaneciera',
]

const FRACASOS = [
  'el cliente se fue sin pagar',
  'te agarró la policía y tuviste que soltar la mitad',
  'la noche fue un desastre y encima te robaron',
]

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  if (!nsfwActivo(jid)) {
    return sock.sendMessage(jid, {
      text: '🚫 *El modo NSFW está desactivado aquí.*\n_Un admin puede activarlo con_ `/nsfw on`_.',
      quoted: msg,
    })
  }

  const aviso = recargaActiva(quien, CLAVE_RECARGA)
  if (aviso) return sock.sendMessage(jid, { text: aviso, quoted: msg })

  // Acompañante opcional
  let acompanante = null
  if (esGrupo(jid)) {
    const metadata = await obtenerMetadata(sock, jid).catch(() => null)
    const objetivo = metadata ? resolverObjetivo(metadata, msg, args) : null
    if (objetivo?.participante) acompanante = jidUsuario(objetivo.participante.id)
  }
  if (acompanante === jidUsuario(quien)) acompanante = null

  const exito = Math.random() < 0.7

  if (!exito) {
    const perdida = Math.min(80, Math.max(20, Math.floor(Math.random() * 60) + 20))
    const cobrado = restarMonedas(quien, perdida, 'slut', 'noche mala')
    marcarUso(quien, CLAVE_RECARGA)
    return sock.sendMessage(jid, {
      text:
        `💋 *Noche mala:* ${FRACASOS[Math.floor(Math.random() * FRACASOS.length)]}.\n\n` +
        (cobrado ? `▸ Pérdida: *-${perdida}* de oro` : '▸ No tenías oro que perder'),
      quoted: msg,
    })
  }

  const base = Math.floor(Math.random() * 220) + 130
  const ganancia = acompanante ? base * 2 : base
  sumarMonedas(quien, ganancia, 'slut', 'trabajo nocturno')
  if (acompanante) sumarMonedas(acompanante, base, 'slut', 'trabajo nocturno compartido')
  marcarUso(quien, CLAVE_RECARGA)

  return sock.sendMessage(jid, {
    text:
      `💋 *${EXITOS[Math.floor(Math.random() * EXITOS.length)]}.*\n\n` +
      `▸ Ganancia: *+${ganancia}* de oro` +
      (acompanante ? `\n▸ ${acompanante.split('@')[0]} cobró *+${base}*` : ''),
    quoted: msg,
    mentions: acompanante ? [acompanante] : undefined,
  })
}
