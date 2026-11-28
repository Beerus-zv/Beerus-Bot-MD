import { esOwnerMsg } from '../lib/owner.js'
import { estadoLimpiador, limpiarAhora } from '../lib/limpiador.js'
import { log } from '../lib/logger.js'

/**
 * Estado y control del limpiador automatico (solo owner).
 *
 * Uso:
 *   `.limpiador`         estado actual y cuanto se limpio
 *   `.limpiador ahora`   fuerza una pasada en el acto
 *
 * La pasada automatica corre sola cada 30 min (ver lib/limpiador.js), asi que
 * esto es para mirar o para apurar cuando el disco ya esta lleno.
 */
export default async ({ sock, jid, msg, sender, args = [] }) => {
  const citar = msg?.message ? msg : undefined

  if (!esOwnerMsg({ msg, sender, sock })) {
    await sock.sendMessage(jid, {
      text: '⛔ Solo el propietario puede usar el limpiador.',
      quoted: citar,
    })
    return
  }

  const forzar = args.some((a) => /^(ahora|ya|force|run)$/i.test(String(a)))

  try {
    if (forzar) {
      await sock.sendMessage(jid, { text: '🧹 Limpiando...', quoted: citar })
      const resultado = await limpiarAhora()
      await sock.sendMessage(jid, { text: reporte(resultado, true), quoted: citar })
      return
    }

    await sock.sendMessage(jid, { text: reporte(estadoLimpiador(), false), quoted: citar })
  } catch (err) {
    log.error('Error en comando .limpiador', err)
    await sock.sendMessage(jid, {
      text: `❌ Error: ${err?.message || err}`,
      quoted: citar,
    })
  }
}

/** Lineas de la pasada forzada o del estado del servicio */
function reporte(datos, forzado) {
  if (forzado) {
    const detalle = datos.carpetas
      .map((c) => `· ${c.carpeta}: ${c.borrados} borrado(s)${c.motivo ? ` (${c.motivo})` : ''}`)
      .join('\n')

    if (!datos.borrados) {
      return `🧹 *Nada para borrar.*\n${detalle}\n\n_El disco ya está limpio._`
    }

    return (
      `🧹 *Limpieza hecha*\n` +
      `${datos.borrados} archivo(s) · ${datos.liberadosMB} MB liberados · ${(datos.duracionMs / 1000).toFixed(1)}s\n\n` +
      `${detalle}`
    )
  }

  const reglas = datos.reglas
    .map((r) => `· \`${r.carpeta}\` — ${r.edadHoras}h o más de ${r.topeMB} MB`)
    .join('\n')

  return (
    '🧹 *Limpiador automático*\n\n' +
    `Estado: ${datos.activo ? '🟢 activo' : datos.apagado ? '⚪ apagado' : '🔴 detenido'}\n` +
    `Cada: ${datos.intervaloMin} min\n` +
    `Última pasada: ${datos.ultimaPasada ? fecha(datos.ultimaPasada) : 'todavía no'}\n` +
    `Acumulado: ${datos.totalBorrados} archivo(s) · ${datos.totalLiberadosMB} MB\n\n` +
    `*Qué limpia*\n${reglas}\n\n` +
    '_Nunca toca la sesión, la base de datos ni archivos recién usados._\n' +
    '_`/limpiador ahora` fuerza una pasada._'
  )
}

/** Fecha corta y legible: 27/11 14:03 */
function fecha(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '?'
  const dos = (n) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}
