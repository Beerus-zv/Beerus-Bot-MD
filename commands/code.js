/**
 * `/code` - sub-bots: sesiones de WhatsApp que se vinculan desde el chat.
 *
 *   /code                 vincula TU numero (el del remitente) y manda el codigo
 *   /code <numero>        vincula otro numero
 *   /code list            sub-bots guardados y su estado
 *   /code del <numero>    cierra la sesion y borra sus credenciales
 *
 * Abierto: cualquiera puede vincular un numero. Cada sub-bot es una sesion
 * real de WhatsApp con su propio limite de mensajes y su propio riesgo de
 * baneo, por eso hay un tope (`MAX_SUBBOTS`) y cada uno solo lo puede borrar
 * quien lo creo o el owner.
 */
import { esOwnerMsg, pnParaLid } from '../lib/owner.js'
import { prefijosBot } from '../lib/ajustes-bot.js'
import {
  MAX_SUBBOTS,
  crearSubBot,
  eliminarSubBot,
  listarSubBots,
} from '../lib/subbot.js'
import { normalizarNumero, formatearCodigo } from '../lib/vinculacion.js'

const AYUDA =
  '*SUB-BOTS*\n\n' +
  'Vincula un numero como bot propio: responde a los mismos comandos, con su sesion.\n\n' +
  '• `/code` — vincula *tu* numero y te manda el codigo\n' +
  '• `/code <numero>` — vincula otro numero (digitos con codigo de pais)\n' +
  '• `/code list` — sesiones guardadas y su estado\n' +
  '• `/code del <numero>` — cierra la sesion y borra sus credenciales\n\n' +
  'Ejemplo: `/code` o `/code 5215512345678`\n\n' +
  '_El codigo se pide en el WhatsApp de ese numero:_\n' +
  '_Dispositivos vinculados > Vincular un dispositivo > Vincular con numero de telefono._'

/** Solo digitos de un JID ('57320...:5@s.whatsapp.net' -> '57320...') */
function digitos(valor) {
  return String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

/**
 * Numero telefonico del remitente.
 *
 * En grupos el remitente puede llegar como LID (`...@lid`), sin el numero a la
 * vista. Se prueba primero lo que Baileys adjunta (participantPn / senderPn),
 * despues el LID traducido con el mapeo que guarda la sesion.
 *
 * @returns {string|null} digitos con codigo de pais
 */
function numeroDelRemitente({ msg, sender, sock }) {
  const key = msg?.key || {}
  const candidatos = [
    key.participantPn,
    key.senderPn,
    msg?.participantPn,
    key.participantAlt,
    sender,
    key.participant,
    key.remoteJid,
    key.fromMe ? sock?.user?.id : null,
  ]

  for (const crudo of candidatos) {
    if (!crudo) continue
    const texto = String(crudo)
    if (texto.endsWith('@g.us') || texto === 'status@broadcast') continue

    if (texto.endsWith('@lid')) {
      const pn = pnParaLid(digitos(texto))
      if (pn && pn.length >= 8) return pn
      continue
    }

    const numero = digitos(texto)
    if (numero.length >= 8) return numero
  }

  return null
}

/**
 * Manda el codigo solo, en su propio mensaje, y despues las instrucciones.
 *
 * Un mensaje largo no se puede copiar por partes en WhatsApp: con el codigo
 * aislado, mantener pulsado y copiar se lleva exactamente el codigo.
 */
async function enviarCodigo(entregar, codigo, numero, { renovado = false } = {}) {
  await entregar(codigo)

  await entregar(
    `${renovado ? '*Codigo nuevo* — el anterior ya no sirve.' : '*Codigo de vinculacion*'} — ${numero}\n\n` +
      `En el WhatsApp de ese numero:\n` +
      `Ajustes > Dispositivos vinculados > Vincular un dispositivo\n` +
      `> Vincular con numero de telefono.\n\n` +
      `_Copia el codigo del mensaje de arriba. Caduca en ~1 minuto y el bot manda uno nuevo solo; si llega otro, usa el ultimo._`
  )
}

/** Texto de estado para una entrada de `listarSubBots` */
function estadoLegible(entrada) {
  switch (entrada.estado) {
    case 'conectado':
      return 'conectado'
    case 'pendiente':
      return 'esperando el codigo'
    case 'conectando':
      return 'conectando'
    case 'creando':
      return 'abriendo'
    case 'error':
      return `error${entrada.error ? `: ${entrada.error}` : ''}`
    case 'apagado':
      return 'guardado, sin abrir'
    default:
      return entrada.estado
  }
}

export default async ({ sock, jid, msg, args, sender }) => {
  const accion = String(args[0] || '').toLowerCase()
  const resto = args.slice(1)
  const responder = (texto) =>
    sock.sendMessage(jid, { text: texto, quoted: msg }).catch(() => null)

  if (['help', 'ayuda', '?', 'menu'].includes(accion)) {
    return responder(AYUDA)
  }

  // ───────────── Lista ─────────────
  if (['list', 'lista', 'ver', 'estado', 'status'].includes(accion)) {
    const lista = listarSubBots()
    if (!lista.length) {
      return responder(
        `*Sub-bots*\n\nNo hay ninguno guardado.\n\n` +
          `Vincula el tuyo con \`${prefijosBot()[0]}code\`.`
      )
    }

    const lineas = lista.map((s, i) => {
      const dueno = s.dueno ? `@${digitos(s.dueno)}` : 'sin dueño'
      return (
        `${i + 1}. *${s.numero}*\n` +
        `   • Estado: ${estadoLegible(s)}\n` +
        `   • Dueño: ${dueno}`
      )
    })

    return responder(
      `*Sub-bots* (${lista.length}/${MAX_SUBBOTS})\n\n${lineas.join('\n\n')}`
    )
  }

  // ───────────── Borrar ─────────────
  if (['del', 'borrar', 'eliminar', 'quitar', 'logout'].includes(accion)) {
    const numero = normalizarNumero(resto[0])
    if (!numero) return responder('Uso: `/code del <numero>`')

    const sub = listarSubBots().find((s) => s.numero === numero)
    if (!sub) return responder(`No hay un sub-bot con el numero *${numero}*.`)

    const esOwner = esOwnerMsg({ sock, msg, sender })
    const mio =
      sub.dueno &&
      (digitos(sub.dueno) === digitos(sender) ||
        digitos(sub.dueno) === numeroDelRemitente({ msg, sender, sock }))
    if (!esOwner && !mio) {
      return responder('Solo el owner o quien vinculo ese numero puede borrarlo.')
    }

    await eliminarSubBot(numero)
    return responder(
      `Sub-bot *${numero}* eliminado.\n_Sus credenciales se borraron del disco: no vuelve a abrirse._`
    )
  }

  // ───────────── Vincular ─────────────
  // Sin argumento se usa el numero de quien escribe; con argumento, ese.
  const numero = accion ? normalizarNumero(accion) : numeroDelRemitente({ msg, sender, sock })

  if (!numero) {
    return responder(
      accion
        ? `Numero invalido. Usa solo digitos con codigo de pais.\n\n${AYUDA}`
        : `No pude leer tu numero desde este chat (puede llegar como LID).\n\n` +
            `Escribelo a mano:\n\`/code 5215512345678\``
    )
  }

  const previo = listarSubBots().find((s) => s.numero === numero)
  if (previo?.estado === 'conectado') {
    return responder(`El numero *${numero}* ya esta vinculado y conectado.`)
  }

  // Vincular el mismo numero del bot tumba la sesion principal (440).
  if (digitos(sock.user?.id) === numero) {
    return responder(
      `*${numero}* es el numero de este bot.\nVincula otro numero distinto.`
    )
  }

  await responder(`Generando el codigo para *${numero}*...\n_Unos segundos._`)

  // El codigo es personal: en grupos se manda por privado y, si el privado
  // falla (el usuario nunca hablo con el bot), se queda en el chat.
  const entregar = async (texto) => {
    if (jid.endsWith('@g.us') && sender) {
      try {
        await sock.sendMessage(sender, { text: texto })
        return
      } catch {
        // cae al chat de siempre
      }
    }
    await sock.sendMessage(jid, { text: texto, quoted: msg }).catch(() => null)
  }

  let codigoEntregado = false

  const resultado = await crearSubBot(numero, {
    dueno: sender,
    alCodigo: async (codigo, num, { renovado = false } = {}) => {
      codigoEntregado = true
      await enviarCodigo(entregar, codigo, num, { renovado })
    },
    alError: async (error, num) => {
      await entregar(`No se pudo generar el codigo para *${num}*: ${error}`)
    },
  })

  if (!resultado.ok) {
    if (resultado.motivo === 'limite') {
      return responder(
        `Ya hay *${resultado.limite}* sub-bots (el tope).\n` +
          `Borra uno con \`/code del <numero>\` antes de vincular otro.`
      )
    }
    if (resultado.motivo === 'numero') return responder('Numero invalido.')
    return responder(`No se pudo abrir la sesion: ${resultado.error}`)
  }

  if (resultado.estado === 'conectado') {
    return responder(
      `El numero *${numero}* ya tenia sesion guardada y esta conectado.`
    )
  }

  if (!codigoEntregado && resultado.codigo) {
    return enviarCodigo(responder, formatearCodigo(resultado.codigo), numero)
  }

  // El codigo llega por el callback del socket; si no, el aviso de arriba
  // ya explico que se estaba generando. Un socket que todavia abre tarda
  // unos segundos: sin este aviso el comando parecia no hacer nada.
  if (!codigoEntregado) {
    return responder(
      `El socket de *${numero}* esta abriendo; el codigo llega en unos segundos.\n` +
        `_Si no aparece, repite_ \`/code\`_._`
    )
  }

  return null
}
