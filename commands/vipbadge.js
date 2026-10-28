import { db } from '../database/db.js'
import { asegurarOwnerVip } from '../lib/owner.js'
import { jidsDe, filaVip } from '../lib/vip.js'

const BENEFICIOS = {
  owner: 'Todos los comandos + boost y claim',
  vip: 'Comandos exclusivos + boost y claim mensual',
}

export default async ({ sock, jid, msg, sender }) => {
  // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
  asegurarOwnerVip(db, { sock, msg, sender })

  const fila = filaVip(jidsDe({ msg, sender, sock }))
  if (!fila) {
    return sock.sendMessage(jid, {
      text: '❌ No eres VIP.\n_El owner puede darte acceso con_ `.vip add @usuario`_._',
      quoted: msg,
    })
  }

  await sock.sendMessage(jid, {
    text:
      `👑 *Badge VIP*\n` +
      `Rango: *${fila.rango}*\n` +
      `Estado: Activo ✅\n` +
      `Beneficios: ${BENEFICIOS[fila.rango] || 'Acceso al club'}`,
    quoted: msg,
  })
}
