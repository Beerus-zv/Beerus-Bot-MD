/**
 * Recompensas por tiempo: `/weekly` y `/monthly`.
 *
 *   /weekly    una vez cada 7 días
 *   /monthly   una vez cada 30 días
 *
 * El último cobro vive en `rpg_cofres` con la clave de la caja, así que
 * sobrevive reinicios y no necesita tabla propia.
 */
import { sumarMonedas, marcarCofre } from '../database/db.js'
import { revisarCaja, tiempoLegible, azar, darItem } from '../lib/rpg.js'

export const CAJAS = {
  weekly: { segundos: 7 * 24 * 3600, nombre: 'semanal', min: 800, max: 1600, item: 'pocion', n: 3 },
  monthly: { segundos: 30 * 24 * 3600, nombre: 'mensual', min: 3000, max: 6000, item: 'gema', n: 3 },
}

/** Fabrica el handler de una caja temporal */
export function fabricarRecompensa(caja) {
  const cfg = CAJAS[caja]
  return async ({ sock, jid, msg, sender }) => {
    const quien = sender || msg.key.participant || jid

    const estado = revisarCaja(quien, `premio:${caja}`, cfg.segundos)
    if (!estado.listo) {
      return sock.sendMessage(jid, {
        text:
          `⏳ *Recompensa ${cfg.nombre}* — ya la cobraste.\n\n` +
          `▸ Vuelve en *${estado.texto}*.\n` +
          `▸ Paga entre ${cfg.min} y ${cfg.max} de oro + regalo.`,
        quoted: msg,
      })
    }

    marcarCofre(quien, `premio:${caja}`)
    const oro = azar(cfg.min, cfg.max)
    sumarMonedas(quien, oro, 'premio', `recompensa ${cfg.nombre}`)
    darItem(quien, cfg.item, cfg.n)

    return sock.sendMessage(jid, {
      text:
        `🎁 *Recompensa ${cfg.nombre}*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Regalo: ${cfg.item} ×${cfg.n}\n\n` +
        `_Vuelve a cobrarla en ${caja === 'weekly' ? '7 días' : '30 días'}._`,
      quoted: msg,
    })
  }
}

/** Estado de las dos cajas, para `/recompensas` */
export function estadoRecompensas(quien) {
  return Object.entries(CAJAS).map(([caja, cfg]) => {
    const estado = revisarCaja(quien, `premio:${caja}`, cfg.segundos)
    return {
      caja,
      nombre: cfg.nombre,
      listo: estado.listo,
      texto: estado.listo ? 'disponible' : `en ${estado.texto}`,
      rango: `${cfg.min}-${cfg.max}`,
    }
  })
}

export { tiempoLegible }

/** `/recompensas` — estado de las dos */
export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || msg.key.participant || jid
  const filas = estadoRecompensas(quien)
  return sock.sendMessage(jid, {
    text:
      '🎁 *Recompensas por tiempo*\n\n' +
      filas
        .map(
          (f) =>
            `${f.listo ? '✅' : '⏳'} *${f.nombre}* — ${f.texto}\n` +
            `    ${f.rango} de oro · \`/${f.caja}\``
        )
        .join('\n\n'),
    quoted: msg,
  })
}
