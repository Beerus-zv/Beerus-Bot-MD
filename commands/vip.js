/**
 * Club VIP: alta, baja y lista de miembros.
 *
 *   /vip                 lista de miembros
 *   /vip add @user       alta (solo owner)
 *   /vip add 5215512345678
 *   /vip remove @user    baja (solo owner)
 *
 * El alta guarda todos los JIDs conocidos de la persona (telefono y LID)
 * para que el acceso funcione aunque WhatsApp entregue el mensaje con
 * cualquiera de los dos formatos.
 */
import { db } from '../database/db.js'
import { esOwnerMsg, asegurarOwnerVip } from '../lib/owner.js'
import { obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import {
  jidsDeParticipante,
  jidsDeTexto,
  jidPrincipal,
  registrarVip,
  quitarVip,
  listarVip,
} from '../lib/vip.js'

const AYUDA =
  '👑 *Club VIP*\n\n' +
  '• `/vip` — lista de miembros\n' +
  '• `/vip add @usuario` — dar acceso (solo owner)\n' +
  '• `/vip remove @usuario` — quitar acceso (solo owner)\n\n' +
  '_Los VIP pueden usar_ `/gachaclaim`, `/vipboost`, `/vipbadge`_._'

const ETIQUETA = { owner: '👑 owner', vip: '⭐ vip' }

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  if (!esGrupo) {
    return sock.sendMessage(jid, { text: '❌ Solo funciona en grupos.', quoted: msg })
  }

  // El owner siempre queda registrado, aunque escriba desde un LID
  asegurarOwnerVip(db, { sock, msg, sender })

  const accion = String(args[0] || 'list').toLowerCase()
  const esOwner = esOwnerMsg({ sock, msg, sender })

  if (accion === 'help' || accion === 'ayuda') {
    return sock.sendMessage(jid, { text: AYUDA, quoted: msg })
  }

  if (accion === 'add' || accion === 'remove') {
    if (!esOwner) {
      return sock.sendMessage(jid, {
        text: `❌ Solo el owner puede usar \`.vip ${accion}\`.`,
        quoted: msg,
      })
    }

    const metadata = await obtenerMetadata(sock, jid).catch(() => null)
    const objetivo = resolverObjetivo(metadata, msg, args.slice(1))
    const jids = objetivo
      ? jidsDeParticipante(objetivo.participante, [objetivo.jid])
      : jidsDeTexto(args[1])

    if (!jids.length) {
      return sock.sendMessage(jid, {
        text: '❓ Uso: `.vip add @usuario` o `.vip add 5215512345678`',
        quoted: msg,
      })
    }

    const destino = jidPrincipal(jids)
    const mencion = tokenMencion(destino)

    if (accion === 'add') {
      const { nuevos } = registrarVip(jids, `Alta manual por ${tokenMencion(sender)}`)
      return sock.sendMessage(jid, {
        text: nuevos
          ? `⭐ *VIP agregado:* ${mencion}\n_Ya puede usar los comandos exclusivos._`
          : `ℹ️ ${mencion} ya era VIP.`,
        quoted: msg,
        mentions: [destino],
      })
    }

    const borrados = quitarVip(jids)
    return sock.sendMessage(jid, {
      text: borrados
        ? `❌ *VIP removido:* ${mencion}`
        : `ℹ️ ${mencion} no estaba registrado en el club.`,
      quoted: msg,
      mentions: [destino],
    })
  }

  // Lista (accion por defecto: 'list', 'lista', 'vip'...)
  const filas = listarVip()
  if (!filas.length) {
    return sock.sendMessage(jid, {
      text: '👑 *Club VIP*\n\nNadie registrado aún.\n_El owner puede agregar con_ `/vip add @usuario`_._',
      quoted: msg,
    })
  }

  const menciones = []
  const lineas = filas.map((fila) => {
    const jidPersona = jidPrincipal([fila.jid]) || fila.jid
    menciones.push(jidPersona)
    return `${ETIQUETA[fila.rango] || '• ' + fila.rango} — ${tokenMencion(jidPersona)}`
  })

  await sock.sendMessage(jid, {
    text: `👑 *Club VIP* (${filas.length})\n\n${lineas.join('\n')}\n\n_Alta/baja:_ \`/vip add @usuario\` \`/vip remove @usuario\``,
    quoted: msg,
    mentions: menciones,
  })
}
