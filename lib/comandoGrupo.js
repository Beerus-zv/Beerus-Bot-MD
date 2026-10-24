import { obtenerMetadata, esAdmin, esGrupo, resolverObjetivo, buscarParticipante, nombreParticipante } from './grupo.js'
import { registrarAccion } from '../database/db.js'

/**
 * Crea un comando de administración de grupo.
 *
 * @param {object}   opts
 * @param {string}   opts.uso        Texto de ayuda
 * @param {boolean}  opts.soloAdmin  Si requiere que quien ejecuta sea admin
 * @param {boolean}  opts.necesitaObjetivo Si requiere un usuario objetivo
 * @param {string}   opts.accion     Etiqueta para el historial de moderación
 * @param {function} opts.handler    Lógica del comando
 */
export function comandoGrupo(opts) {
  const {
    uso = 'Uso no especificado',
    soloAdmin = true,
    necesitaObjetivo = false,
    accion = null,
    handler,
  } = opts

  return async ({ sock, jid, msg, args, sender }) => {
    // 1) Debe ser un grupo
    if (!esGrupo(jid)) {
      await sock.sendMessage(jid, {
        text: '❌ Este comando solo funciona dentro de un grupo.',
        quoted: msg,
      })
      return
    }

    let metadata
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch (err) {
      console.error('Error obteniendo los metadatos del grupo:', err)
      await sock.sendMessage(jid, {
        text: '❌ No se pudo obtener la información del grupo.',
        quoted: msg,
      })
      return
    }

    // 2) El bot debe ser admin
    if (!esAdmin(metadata, sock.user?.id)) {
      await sock.sendMessage(jid, {
        text: '⚠️ Necesito ser *administrador* del grupo para ejecutar este comando.',
        quoted: msg,
      })
      return
    }

    // 3) Quien ejecuta debe ser admin (opcional según comando)
    if (soloAdmin && !esAdmin(metadata, sender)) {
      await sock.sendMessage(jid, {
        text: '⛔ Solo los *administradores* pueden usar este comando.',
        quoted: msg,
      })
      return
    }

    // 4) Resolver usuario objetivo
    let objetivo = null
    if (necesitaObjetivo) {
      objetivo = resolverObjetivo(metadata, msg, args)
      if (!objetivo) {
        await sock.sendMessage(jid, {
          text: `❓ No encontré al usuario.\n\n${uso}`,
          quoted: msg,
        })
        return
      }
    }

    // 5) Ejecutar
    try {
      await handler({ sock, jid, msg, args, sender, metadata, objetivo })
    } catch (err) {
      console.error(`Error en comando de grupo:`, err)
      await sock.sendMessage(jid, {
        text: '❌ Ocurrió un error al ejecutar el comando. Revisa la consola.',
        quoted: msg,
      })
    }
  }
}

export { obtenerMetadata, esAdmin, resolverObjetivo, buscarParticipante, nombreParticipante, registrarAccion }

