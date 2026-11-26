import { esOwnerMsg } from '../lib/owner.js'
import { actualizarBot } from '../lib/actualizador.js'
import { recargarComandos } from '../lib/loader.js'
import { relanzarEnCaliente } from '../lib/relanzar.js'
import { log } from '../lib/logger.js'

/**
 * Actualiza el bot desde GitHub y aplica los cambios sin intervencion.
 *
 * Solo el owner puede ejecutarlo. Uso: `.update`
 *
 * Dos caminos, porque Node no puede descargar un modulo ya importado:
 *   - cambios solo en `commands/`: se recargan en el acto, el socket ni se
 *     entera y no hay corte.
 *   - cambios en `index.js`, `lib/`, `database/` o dependencias: se lanza un
 *     proceso nuevo que espera a que este muera (y libere el bloqueo de
 *     instancia) y arranca con el codigo nuevo.
 */
export default async ({ sock, jid, msg, sender }) => {
  if (!esOwnerMsg({ msg, sender, sock })) {
    await sock.sendMessage(jid, {
      text: '⛔ Solo el propietario puede actualizar el bot.',
      quoted: safeQuote(msg),
    })
    return
  }

  await sock.sendMessage(jid, {
    text: '🔄 Buscando actualizaciones...',
    quoted: safeQuote(msg),
  })

  try {
    // `forzar`: el comando es una orden explicita. Sin esto, la marca de la
    // ultima comprobacion (6 h) hacia que `.update` no mirara el remoto.
    const resultado = actualizarBot({ forzar: true })

    if (resultado.estado === 'actualizado') {
      const cabecera = `📦 Versión: v${resultado.de} → v${resultado.a}`
      const deps = resultado.dependencias ? '\n📚 Dependencias instaladas.' : ''
      const locales =
        resultado.locales === 'guardados'
          ? '\n💾 Tus cambios locales se guardaron y volvieron a aplicar.'
          : resultado.locales === 'conflicto'
            ? '\n⚠️ Tus cambios locales chocan con el código nuevo: quedaron en `git stash`. Recuperalos con `git stash pop`.'
            : ''

      if (resultado.nucleo) {
        const aviso =
          `✅ *Bot actualizado*\n\n${cabecera}${deps}${locales}\n\n` +
          '♻️ Reiniciando en caliente: el socket vuelve solo en unos segundos.'
        await sock.sendMessage(jid, { text: aviso, quoted: safeQuote(msg) })
        salirConReinicio()
        return
      }

      const recarga = await recargarComandos({ archivos: resultado.archivos })
      const partes = [`✅ *Bot actualizado en caliente*\n\n${cabecera}${deps}${locales}`]
      partes.push(`♻️ Registro recargado (${recarga.total} comandos) sin reiniciar el socket.`)
      if (recarga.nuevos.length) partes.push(`➕ Nuevos: ${recarga.nuevos.join(', ')}`)
      if (recarga.quitados.length) partes.push(`➖ Quitados: ${recarga.quitados.join(', ')}`)
      if (recarga.errores.length) {
        partes.push(`⚠️ No cargaron:\n${recarga.errores.slice(0, 5).map((e) => `· ${e}`).join('\n')}`)
      }
      await sock.sendMessage(jid, { text: partes.join('\n'), quoted: safeQuote(msg) })
      return
    }

    let texto = ''
    switch (resultado.estado) {
      case 'al-dia':
        texto = `✅ El bot ya está actualizado (v${resultado.de || '?'}).`
        break
      case 'cambios-locales':
        texto = `⚠️ Hay actualizaciones, pero no pude guardar tus cambios locales ` +
          `para reaplicarlos (revisá \`git status\`). No se actualizó nada.`
        break
      case 'divergido':
        texto = `⚠️ Hay actualizaciones, pero tu rama tiene commits propios.\n` +
          `El bot no se actualiza solo para no perder cambios.`
        break
      case 'sin-git':
        texto = `❌ No es un repositorio git o git no está instalado.`
        break
      case 'omitido':
        texto = `⚠️ Repositorio en HEAD desacoplado. No se puede actualizar.`
        break
      case 'error':
      default:
        texto = `❌ Error al buscar actualizaciones.`
    }

    await sock.sendMessage(jid, { text: texto, quoted: safeQuote(msg) })
  } catch (err) {
    log.error('Error en comando .update', err)
    await sock.sendMessage(jid, {
      text: `❌ Error: ${err?.message || err}`,
      quoted: safeQuote(msg),
    })
  }
}

/**
 * Lanza el proceso nuevo y termina este.
 *
 * El lanzador espera a que este proceso muera: recien ahi toma el bloqueo y
 * abre el socket, asi no hay dos copias sobre la misma sesion. Si el lanzador
 * no se puede crear, el bot sigue vivo con el codigo viejo y lo dice.
 */
function salirConReinicio() {
  try {
    const lanzador = relanzarEnCaliente({ entrada: 'index.js', esperaMs: 1500 })
    log.sistema(`🔁 Reinicio en caliente programado (lanzador ${lanzador}).`)
  } catch (err) {
    log.error(`No se pudo programar el reinicio: ${err?.message || err}. Reinicia a mano.`)
    return
  }
  // Margen para que el mensaje salga antes de cerrar el socket.
  setTimeout(() => process.exit(0), 1500)
}

/**
 * Devuelve el mensaje original si es seguro para citar (texto), o undefined si no.
 * Tipos seguros: 'conversation', 'extendedTextMessage'.
 */
function safeQuote(msg) {
  if (!msg?.message) return undefined
  const type = Object.keys(msg.message)[0]
  return ['conversation', 'extendedTextMessage'].includes(type) ? msg : undefined
}
