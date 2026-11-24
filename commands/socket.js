/**
 * Configuracion del socket y del bot (`/setbotname`, `/setbotprefix`, `/self`, ...).
 *
 * Todos los comandos de esta familia comparten un archivo porque comparten la
 * misma puerta: solo el owner escribe. Los valores quedan en la tabla
 * `ajustes` (lib/ajustes-bot.js) y se leen en caliente desde index.js y el
 * menu, asi que un cambio aplica sin reiniciar.
 *
 *   /socket                    estado de la configuracion
 *   /bots                      sesiones activas del proceso
 *   /prefix                    prefijos que acepta el bot
 *   /join <link|codigo>        unir el bot a un grupo
 *   /logout confirmar          cerrar la sesion de WhatsApp
 *   /self on|off               modo privado (ignora grupos)
 *   /setbotname <nombre>       nombre visible
 *   /setbotowner <@user|num>   owner del bot
 *   /setbotlink <url|reset>    link del menu
 *   /setbotcurrency <nombre>   nombre de la moneda
 *   /setbotprefix <. / #>      prefijos aceptados
 *   /setbanner <url|reset>     banner fijo del menu
 *   /seticon <emoji|reset>     icono que precede al nombre
 *   /setimage [url|reset]      foto de perfil del socket
 *   /setusername <nombre>      nombre de perfil (pushname)
 */
import { esOwnerMsg } from '../lib/owner.js'
import { obtenerMetadata } from '../lib/grupo.js'
import { descargarMedia, obtenerCitado } from '../lib/multimedia.js'
import { listarSockets, contarSockets } from '../lib/sockets.js'
import { TEMA, VERSION } from '../lib/tema.js'
import {
  CLAVES,
  nombreBot,
  tituloBot,
  linkBot,
  monedaBot,
  iconoBot,
  bannerFijado,
  usernameBot,
  modoPrivado,
  prefijosBot,
  fijarPrefijos,
  resetPrefijos,
  fijarAjuste,
  fijarModoPrivado,
  ownerConfigurado,
} from '../lib/ajustes-bot.js'

const SEPARADOR = '*··········································*'

const AYUDA =
  '⚙️ *Configuración del socket*\n\n' +
  '• `/socket` — estado actual\n' +
  '• `/bots` — sesiones activas\n' +
  '• `/prefix` — prefijos aceptados\n' +
  '• `/join <link>` — unir el bot a un grupo\n' +
  '• `/self on|off` — modo privado\n' +
  '• `/setbotname <nombre>`\n' +
  '• `/setbotowner <@usuario>`\n' +
  '• `/setbotlink <url|reset>`\n' +
  '• `/setbotcurrency <nombre>`\n' +
  '• `/setbotprefix <prefijos>`\n' +
  '• `/setbanner <url|reset>`\n' +
  '• `/seticon <emoji|reset>`\n' +
  '• `/setimage [url|reset]`\n' +
  '• `/setusername <nombre>`\n' +
  '• `/logout confirmar`\n\n' +
  '_Los cambios son solo del owner y se aplican sin reiniciar._'

/** Respuesta corta de error de permisos */
const SOLO_OWNER = '❌ Solo el owner puede cambiar la configuración del bot.'

/** "on"/"off"/"si"/"no" -> booleano; null si no se reconoce */
function accionBooleana(texto) {
  const t = String(texto || '').toLowerCase()
  if (['on', 'activar', 'enable', 'si', 'sí', '1'].includes(t)) return true
  if (['off', 'desactivar', 'disable', 'no', '0'].includes(t)) return false
  return null
}

/** Milisegundos a "2h 14m" */
function duracion(ms) {
  const minutos = Math.floor(ms / 60000)
  const horas = Math.floor(minutos / 60)
  const dias = Math.floor(horas / 24)
  if (dias) return `${dias}d ${horas % 24}h`
  if (horas) return `${horas}h ${minutos % 60}m`
  return `${Math.max(1, minutos)}m`
}

/** Saca el codigo de invitacion de un link de grupo o de un codigo pelado */
function codigoInvitacion(texto) {
  const limpio = String(texto || '').trim()
  if (!limpio) return null
  const enlace = limpio.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,})/)
  if (enlace) return enlace[1]
  if (/^[A-Za-z0-9]{10,}$/.test(limpio)) return limpio
  return null
}

/** Descarga una imagen desde URL http(s) con tope de tamaño */
async function imagenDesdeUrl(url) {
  const respuesta = await fetch(url, { redirect: 'follow' })
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  const tipo = respuesta.headers.get('content-type') || ''
  if (!/^image\//i.test(tipo)) throw new Error(`no es una imagen (${tipo || 'sin tipo'})`)
  const buffer = Buffer.from(await respuesta.arrayBuffer())
  if (buffer.length > 8 * 1024 * 1024) throw new Error('la imagen pasa de 8 MB')
  return buffer
}

/** Estado completo en texto */
function estadoConfig() {
  const prefijos = prefijosBot().join(' ')
  const owner = ownerConfigurado() || 'owner de config.js'
  return (
    `⚙️ *${tituloBot()}*\n\n` +
    `• *Nombre:* ${nombreBot()}\n` +
    `• *Owner:* ${owner}\n` +
    `• *Link:* ${linkBot() || '(sin link)'}\n` +
    `• *Moneda:* ${monedaBot()}\n` +
    `• *Prefijos:* ${prefijos}\n` +
    `• *Icono:* ${iconoBot()}\n` +
    `• *Banner:* ${bannerFijado() ? 'fijo' : 'al azar'}\n` +
    `• *Usuario:* ${usernameBot() || '(por defecto)'}\n` +
    `• *Modo privado:* ${modoPrivado() ? 'ON' : 'OFF'}\n` +
    `• *Versión:* ${VERSION}\n\n` +
    `${SEPARADOR}\n_${AYUDA.split('\n')[0]}_\n_Cambia con_ \`/setbotname\`, \`/setbotprefix\`, \`/self\`_..._`
  )
}

export default async ({ sock, jid, msg, args, sender }) => {
  const accion = String(args[0] || 'estado').toLowerCase()
  const resto = args.slice(1)
  const texto = resto.join(' ').trim()
  const esOwner = esOwnerMsg({ sock, msg, sender })
  const responder = (t, extra = {}) => sock.sendMessage(jid, { text: t, quoted: msg, ...extra })

  // ── Lectura: nadie necesita permisos para consultar ──
  if (['estado', 'status', 'info', 'socket', 'config'].includes(accion)) {
    return responder(estadoConfig())
  }

  if (['help', 'ayuda'].includes(accion)) return responder(AYUDA)

  if (accion === 'prefix' || accion === 'prefijo' || accion === 'prefijos') {
    const lista = prefijosBot()
    return responder(
      `⌨️ *Prefijos activos*\n\n${lista.map((p) => `• \`${p}\``).join('\n')}\n\n` +
        `_Ejemplo:_ \`${lista[0]}menu\`\n_Solo el owner los cambia con_ \`/setbotprefix\`.`
    )
  }

  if (accion === 'bots' || accion === 'sockets') {
    const lista = listarSockets()
    if (!lista.length) {
      return responder('📡 No hay sockets registrados en este proceso todavía.')
    }
    const lineas = lista.map((s, i) => {
      const jidCorto = s.jid.split('@')[0]
      return (
        `${i + 1}. *${s.nombre}*\n` +
        `   • JID: \`${jidCorto}\`\n` +
        `   • Rol: ${s.rol}\n` +
        `   • Conectado: hace ${duracion(Date.now() - s.conectadoEn)}`
      )
    })
    return responder(
      `📡 *Sockets activos* (${contarSockets()})\n\n${lineas.join('\n\n')}\n\n` +
        `_Versión ${VERSION} · ${TEMA.titulo}_`
    )
  }

  // ── Escritura: de aqui en adelante, solo owner ──
  if (!esOwner) return responder(SOLO_OWNER)

  switch (accion) {
    case 'self': {
      const estado = accionBooleana(resto[0])
      if (estado === null) {
        return responder(
          `🔒 *Modo privado:* ${modoPrivado() ? 'ON' : 'OFF'}\n\n` +
            'Uso: `/self on` (solo privado) o `/self off` (normal).'
        )
      }
      fijarModoPrivado(estado)
      return responder(
        estado
          ? '🔒 *Modo privado activado.* El bot solo responde en chats privados.'
          : '🔓 *Modo privado desactivado.* El bot vuelve a responder en grupos.'
      )
    }

    case 'setbotname':
    case 'botname': {
      if (!texto) {
        return responder(`🏷️ *Nombre actual:* ${nombreBot()}\n\nUso: \`/setbotname Beerus Bot MD\``)
      }
      if (texto.length > 40) return responder('❌ El nombre no puede pasar de 40 caracteres.')
      fijarAjuste(CLAVES.nombre, texto)
      return responder(`✅ *Nombre cambiado a:* ${texto}`)
    }

    case 'setbotowner':
    case 'setowner': {
      if (!texto) {
        return responder(
          `👤 *Owner actual:* ${ownerConfigurado() || 'el de config.js'}\n\n` +
            'Uso: `/setbotowner @usuario` o `/setbotowner 573001234567`'
        )
      }
      const mencion = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      const crudo = mencion || texto.replace(/^@/, '').replace(/[^\d]/g, '')
      if (!crudo || String(crudo).replace(/\D/g, '').length < 6) {
        return responder('❌ Necesito una mención o un número con código de país.')
      }
      const valor = String(crudo).includes('@') ? crudo : `${crudo}@s.whatsapp.net`
      fijarAjuste(CLAVES.owner, valor)
      return responder(
        `✅ *Owner registrado:* \`${valor.split('@')[0]}\`\n\n` +
          '_Se usa para mostrar y para el alta automática en el club VIP._'
      )
    }

    case 'setbotlink':
    case 'setlink': {
      if (!texto) return responder(`🔗 *Link actual:* ${linkBot() || '(sin link)'}`)
      if (['reset', 'borrar', 'del'].includes(texto.toLowerCase())) {
        fijarAjuste(CLAVES.link, '')
        return responder('🔗 Link restablecido al valor de fábrica.')
      }
      if (!/^https?:\/\//i.test(texto)) return responder('❌ El link tiene que empezar con http:// o https://')
      fijarAjuste(CLAVES.link, texto)
      return responder(`🔗 *Link cambiado:* ${texto}`)
    }

    case 'setbotcurrency':
    case 'setcurrency': {
      if (!texto) return responder(`💠 *Moneda actual:* ${monedaBot()}\n\nUso: \`/setbotcurrency créditos\``)
      if (texto.length > 20) return responder('❌ El nombre de la moneda no puede pasar de 20 caracteres.')
      fijarAjuste(CLAVES.moneda, texto)
      return responder(`💠 *Moneda cambiada a:* ${texto}`)
    }

    case 'setbotprefix':
    case 'setprefix': {
      if (!texto) {
        return responder(
          `⌨️ *Prefijos actuales:* ${prefijosBot().join(' ')}\n\n` +
            'Uso: `/setbotprefix .` o `/setbotprefix . / #`\n' +
            'Para volver a los de fábrica: `/setbotprefix reset`'
        )
      }
      if (['reset', 'default', 'borrar'].includes(texto.toLowerCase())) {
        const lista = resetPrefijos()
        return responder(`✅ *Prefijos restablecidos:* ${lista.join(' ')}`)
      }
      const lista = fijarPrefijos(texto)
      if (!lista) {
        return responder('❌ No encontré prefijos válidos. Ejemplo: `/setbotprefix . /`')
      }
      return responder(
        `✅ *Prefijos cambiados:* ${lista.map((p) => `\`${p}\``).join(' ')}\n\n` +
          `_Ejemplo:_ \`${lista[0]}menu\``
      )
    }

    case 'setbanner':
    case 'setmenubanner': {
      if (!texto) {
        return responder(
          `🖼️ *Banner:* ${bannerFijado() ? 'fijo' : 'al azar'}\n\n` +
            'Uso: `/setbanner <url de imagen>`\nPara volver al aleatorio: `/setbanner reset`'
        )
      }
      if (['reset', 'aleatorio', 'random', 'borrar'].includes(texto.toLowerCase())) {
        fijarAjuste(CLAVES.banner, '')
        return responder('🖼️ Banner restablecido: vuelve a elegirse al azar en cada menú.')
      }
      if (!/^https?:\/\//i.test(texto)) return responder('❌ Necesito una URL de imagen (http/https).')
      try {
        await imagenDesdeUrl(texto)
      } catch (err) {
        return responder(`❌ No pude leer esa imagen: ${err.message}`)
      }
      fijarAjuste(CLAVES.banner, texto)
      return responder('✅ *Banner fijado.* El menú va a usar esta imagen hasta que lo cambies.')
    }

    case 'seticon': {
      if (!texto) return responder(`🎴 *Icono actual:* ${iconoBot()}\n\nUso: \`/seticon 👑\``)
      if (['reset', 'borrar'].includes(texto.toLowerCase())) {
        fijarAjuste(CLAVES.icono, '')
        return responder(`🎴 Icono restablecido a ${TEMA.emoji}`)
      }
      fijarAjuste(CLAVES.icono, texto.slice(0, 8))
      return responder(`✅ *Icono cambiado a:* ${texto.slice(0, 8)}`)
    }

    case 'setusername': {
      if (!texto) return responder(`👤 *Nombre de perfil actual:* ${usernameBot() || '(por defecto)'}`)
      if (texto.length > 25) return responder('❌ El nombre de perfil no puede pasar de 25 caracteres.')
      if (typeof sock.updateProfileName !== 'function') {
        return responder('❌ Esta sesión de Baileys no permite cambiar el nombre de perfil.')
      }
      try {
        await sock.updateProfileName(texto)
      } catch (err) {
        return responder(`❌ WhatsApp rechazó el cambio: ${err.message}`)
      }
      fijarAjuste(CLAVES.username, texto)
      return responder(`✅ *Nombre de perfil cambiado a:* ${texto}`)
    }

    case 'setimage':
    case 'setpfp': {
      const pedido = resto.join(' ').trim()

      if (['reset', 'borrar', 'quitar'].includes(pedido.toLowerCase())) {
        return responder(
          '❌ WhatsApp no permite dejar el perfil sin foto. Para cambiarla: ' +
            '`/setimage <url>` o responde a una imagen con `/setimage`.'
        )
      }

      if (!pedido) {
        // Sin argumento: se toma la imagen citada o la del propio mensaje
        const fuente = obtenerCitado(msg) ? obtenerCitado(msg) : msg
        const tieneImagen =
          fuente?.message?.imageMessage || msg?.message?.imageMessage
        if (!tieneImagen) {
          return responder(
            '🖼️ Responde a una imagen con `/setimage`, o usa `/setimage <url>`.\n' +
              'Para quitarla no se puede: WhatsApp no permite dejar el perfil sin foto.'
          )
        }
        try {
          const buffer = await descargarMedia(sock, fuente)
          await sock.updateProfilePicture(sock.user.id, buffer)
          return responder('✅ *Foto de perfil actualizada.*')
        } catch (err) {
          return responder(`❌ No pude cambiar la foto: ${err.message}`)
        }
      }

      if (!/^https?:\/\//i.test(pedido)) return responder('❌ Necesito una URL de imagen o una imagen citada.')
      try {
        const buffer = await imagenDesdeUrl(pedido)
        await sock.updateProfilePicture(sock.user.id, buffer)
        return responder('✅ *Foto de perfil actualizada.*')
      } catch (err) {
        return responder(`❌ No pude cambiar la foto: ${err.message}`)
      }
    }

    case 'join':
    case 'unir': {
      const codigo = codigoInvitacion(texto)
      if (!codigo) {
        return responder(
          '🔗 Uso: `/join https://chat.whatsapp.com/XXXXXXXXXXX`\n' +
            'o `/join XXXXXXXXXXX` con el código pelado.'
        )
      }
      if (typeof sock.groupAcceptInvite !== 'function') {
        return responder('❌ Esta sesión no permite unirse a grupos por invitación.')
      }
      try {
        const grupoJid = await sock.groupAcceptInvite(codigo)
        const metadata = await obtenerMetadata(sock, grupoJid).catch(() => null)
        const nombre = metadata?.subject || 'el grupo'
        return responder(`✅ *Unido a ${nombre}.*`)
      } catch (err) {
        return responder(
          `❌ No pude unirme: ${err.message}\n\n` +
            '_Suele ser un enlace vencido, revocado o un grupo donde el bot ya está._'
        )
      }
    }

    case 'logout': {
      if (String(resto[0] || '').toLowerCase() !== 'confirmar') {
        return responder(
          '⚠️ `/logout` cierra la sesión de WhatsApp del bot y hay que volver a vincular.\n\n' +
            'Si es lo que quieres: `/logout confirmar`'
        )
      }
      if (typeof sock.logout !== 'function') {
        return responder('❌ Esta sesión no permite cerrar sesión por comando.')
      }
      await responder('👋 *Cerrando sesión.* El bot queda desvinculado.')
      await sock.logout().catch(() => {})
      return
    }

    default:
      return responder(
        `❓ No conozco \`${accion}\`.\n\n${AYUDA}`
      )
  }
}
