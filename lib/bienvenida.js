import { obtenerWelcome, configurarWelcome, eliminarWelcome } from '../database/db.js'
import { alertaPromocion, alertaDespedida } from './alertas.js'
import { log } from './logger.js'
import {
  obtenerMetadata,
  esAdmin,
  esGrupo,
  jidComparacion,
  mencionarEnTexto,
  mencionDeParticipantes,
  saneaJidsCrudos,
  tokenMencion,
  telefonoLegible,
} from './grupo.js'

/** Evita saludos duplicados por si el evento se repite */
const saludosRecientes = new Map()

function yaSeSaludo(grupo, jid, tipo) {
  const clave = `${grupo}:${jid}:${tipo}`
  const ahora = Date.now()
  const previo = saludosRecientes.get(clave)

  if (previo && ahora - previo < 10000) return true

  saludosRecientes.set(clave, ahora)

  // Limpieza periodica para no crecer sin control
  if (saludosRecientes.size > 500) {
    for (const [clave, tiempo] of saludosRecientes) {
      if (ahora - tiempo > 60000) saludosRecientes.delete(clave)
    }
  }

  return false
}

/**
 * Procesa el evento 'group-participants.update' de Baileys.
 * action 'add' -> bienvenida, action 'remove' -> despedida.
 */
export async function procesarCambioParticipantes(sock, { id, participants, action } = {}) {
  if (!id?.endsWith('@g.us')) return
  if (action !== 'add' && action !== 'remove') return

  const tipo = action === 'add' ? 'bienvenida' : 'despedida'

  for (const participante of participants || []) {
    const jid = typeof participante === 'string' ? participante : participante?.id
    if (!jid) continue

    // Ignora al propio bot (no se despide de si mismo)
    if (jidComparacion(jid) === jidComparacion(sock.user?.id)) continue
    if (jidComparacion(jid) === jidComparacion(sock.user?.lid)) continue

    if (yaSeSaludo(id, jid, tipo)) continue

    // Participantes del grupo: si el JID es un LID, aqui encontramos su
    // JID de telefono, que es la etiqueta de mencion mas fiable
    let participantes = []
    try {
      const metadata = await obtenerMetadata(sock, id)
      participantes = metadata?.participants || []
    } catch {
      // Sin metadatos se menciona por el JID crudo
    }

    const nombre =
      typeof participante === 'string'
        ? null
        : participante.name ||
          participante.notify ||
          participante.pushName ||
          participante.verifiedName ||
          telefonoLegible(participante.phoneNumber)

    await enviarSaludo(sock, id, tipo, { nombre, jid, participantes })

    // Auto-eventos (promociones / bajas) si estan activados en el grupo
    try {
      if (action === 'add') await alertaPromocion(sock, id, jid, participantes)
      else if (action === 'remove') await alertaDespedida(sock, id, jid)
    } catch (err) {
      log.error('No se pudo enviar el auto-evento de bienvenida', err)
    }
  }
}

/** Textos por defecto con la identidad de Beerus */
export const TEXTOS_POR_DEFECTO = {
  bienvenida:
    '👑 *¡{user}* acaba de entrar en mi reino!*\n💥 Que la destruccion te acompañe, mortal.',
  despedida:
    '💥 *{user}* ha abandonado el reino...*\n🌌 Que la destruccion te acompañe en el mas alla.',
}

const NOMBRES = {
  bienvenida: '👋 *Bienvenida*',
  despedida: '👋 *Despedida*',
}

/**
 * Sustituye las variables del texto: {user}, {nombre}, {jid}, {grupo}
 * Si no hay nombre disponible, {user}/{nombre} se vuelven un token de
 * mención (@<digitos>) para que WhatsApp etiquete al usuario. {jid} y
 * {grupo} nunca muestran el JID crudo: {jid} usa el token de mencion.
 */
export function renderSaludo(texto, { nombre = '', jid = '', grupo = '', token = '' } = {}) {
  const usuario = (token ? token : nombre) || tokenMencion(jid) || 'Alguien'
  return String(texto)
    .replace(/\{user\}/gi, usuario)
    .replace(/\{nombre\}/gi, usuario)
    .replace(/\{jid\}/gi, token || tokenMencion(jid) || jid || '')
    .replace(/\{grupo\}/gi, grupo || '')
}

/**
 * Envia el saludo de bienvenida o despedida de un grupo.
 * @returns {Promise<boolean>} true si se envio
 */
export async function enviarSaludo(sock, grupo, tipo = 'bienvenida', { nombre, jid, participantes = [] } = {}) {
  if (tipo !== 'bienvenida' && tipo !== 'despedida') tipo = 'bienvenida'
  const config = obtenerWelcome(grupo, tipo)
  if (!config || !config.activo) return false

  // Mejor forma de mencionar al usuario en este grupo
  const mencion = mencionDeParticipantes(participantes, jid) || {
    token: tokenMencion(jid),
    jid,
  }

  let texto = renderSaludo(config.texto || TEXTOS_POR_DEFECTO[tipo], {
    nombre,
    jid,
    grupo,
    token: mencion.token,
  })

  // Por si un texto personalizado lleva JIDs crudos: 123456@lid -> @123456
  const limpio = saneaJidsCrudos(texto)
  texto = limpio.texto

  const contenido = { text: texto }

  // ── Foto de perfil del usuario ──
  // Se intenta con el JID resuelto (telefono) y con el JID crudo; si ninguna
  // funciona, cae a la imagen configurada por el admin. Si el saludo lleva
  // audio configurado, este tiene prioridad sobre la foto.
  let imagen = null
  try {
    imagen = { url: await sock.profilePictureUrl(mencion.jid, 'image') }
  } catch {
    if (jid && jid !== mencion.jid) {
      try {
        imagen = { url: await sock.profilePictureUrl(jid, 'image') }
      } catch {
        // Sin foto disponible
      }
    }
  }

  if (config.audio) {
    contenido.audio = { url: config.audio }
    contenido.caption = texto
    delete contenido.text
  } else if (imagen) {
    contenido.image = imagen
    contenido.caption = texto
    delete contenido.text
  } else if (config.imagen) {
    contenido.image = { url: config.imagen }
    contenido.caption = texto
    delete contenido.text
  }

  const menciones = mencionarEnTexto(texto, [mencion.jid, ...limpio.jids])
  if (menciones) contenido.mentions = menciones

  await sock.sendMessage(grupo, contenido)
  return true
}

/**
 * Gestion del comando de configuracion de bienvenidas/despedidas.
 * `tipo` es 'bienvenida' o 'despedida'.
 */
export async function gestionarSaludo({ sock, jid, msg, args = [], sender }, tipo = 'bienvenida') {
  if (tipo !== 'bienvenida' && tipo !== 'despedida') tipo = 'bienvenida'
  const accion = (args?.[0] || 'status').toLowerCase()
  const resto = (args || []).slice(1)

  const etiqueta = NOMBRES[tipo]

  const ayuda =
    `${etiqueta} — *${tipo === 'bienvenida' ? 'Bienvenidas' : 'Despedidas'}*\n\n` +
    `*Uso:*\n` +
    `• \`/${tipo} on\` — Activa los saludos en este grupo\n` +
    `• \`/${tipo} off\` — Desactiva los saludos\n` +
    `• \`/${tipo} texto <mensaje>\` — Personaliza el texto\n` +
    `• \`/${tipo} imagen <url>\` — Imagen del saludo\n` +
    `• \`/${tipo} audio <url>\` — Audio del saludo\n` +
    `• \`/${tipo} reset\` — Vuelve al texto por defecto\n` +
    `• \`/${tipo} status\` — Muestra la configuracion\n` +
    `• \`/${tipo} test\` — Envia una prueba\n\n` +
    `_Variables: {user} {nombre} {jid} {grupo}_`

  // En grupos solo los administradores pueden configurar
  if (esGrupo(jid)) {
    try {
      const metadata = await obtenerMetadata(sock, jid)
      if (!esAdmin(metadata, sender)) {
        await sock.sendMessage(jid, {
          text: '⛔ Solo los *administradores* pueden usar este comando.',
          quoted: msg,
        })
        return
      }
    } catch (err) {
      log.error('No se pudo obtener la información del grupo', err)
      await sock.sendMessage(jid, {
        text: '❌ No se pudo obtener la información del grupo.',
        quoted: msg,
      })
      return
    }
  }

  const actual = obtenerWelcome(jid, tipo)

  if (accion === 'on' || accion === 'activar' || accion === 'enable') {
    configurarWelcome(jid, tipo, { activo: true })
    await sock.sendMessage(jid, {
      text: `✅ *${etiqueta} activada* en este grupo.`,
      quoted: msg,
    })
    return
  }

  if (accion === 'off' || accion === 'desactivar' || accion === 'disable') {
    configurarWelcome(jid, tipo, { activo: false })
    await sock.sendMessage(jid, {
      text: `🔕 *${etiqueta} desactivada* en este grupo.`,
      quoted: msg,
    })
    return
  }

  if (accion === 'texto' || accion === 'text' || accion === 'set') {
    const texto = resto.join(' ').trim()
    if (!texto) {
      await sock.sendMessage(jid, {
        text: `❓ Escribe el texto del saludo.\n\n${ayuda}`,
        quoted: msg,
      })
      return
    }
    configurarWelcome(jid, tipo, { texto, activo: true })
    await sock.sendMessage(jid, {
      text: `✅ Texto de ${etiqueta.toLowerCase()} guardado:\n\n${texto}`,
      quoted: msg,
    })
    return
  }

  if (accion === 'imagen' || accion === 'image') {
    const url = resto[0]
    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(jid, {
        text: `❓ Necesito una URL de imagen.\n\n${ayuda}`,
        quoted: msg,
      })
      return
    }
    configurarWelcome(jid, tipo, { imagen: url, activo: true })
    await sock.sendMessage(jid, {
      text: `🖼️ Imagen de ${etiqueta.toLowerCase()} configurada.`,
      quoted: msg,
    })
    return
  }

  if (accion === 'audio') {
    const url = resto[0]
    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(jid, {
        text: `❓ Necesito una URL de audio.\n\n${ayuda}`,
        quoted: msg,
      })
      return
    }
    configurarWelcome(jid, tipo, { audio: url, activo: true })
    await sock.sendMessage(jid, {
      text: `🎵 Audio de ${etiqueta.toLowerCase()} configurado.`,
      quoted: msg,
    })
    return
  }

  if (accion === 'reset' || accion === 'default') {
    eliminarWelcome(jid, tipo)
    await sock.sendMessage(jid, {
      text: `♻️ ${etiqueta} vuelve al texto por defecto.`,
      quoted: msg,
    })
    return
  }

  if (accion === 'test' || accion === 'probar') {
    const enviado = await enviarSaludo(sock, jid, tipo, {
      nombre: 'Beerus',
      jid: sender,
    })
    if (!enviado) {
      await sock.sendMessage(jid, {
        text: `⚠️ Los saludos están desactivados o no hay configuracion.\n_Usa \`/${tipo} on\` primero._`,
        quoted: msg,
      })
    }
    return
  }

  // Status por defecto
  const activo = Boolean(actual?.activo)
  const estado = activo
    ? `🟢 *Activo*\n\n` +
      `📝 Texto:\n${actual.texto || TEXTOS_POR_DEFECTO[tipo]}\n\n` +
      (actual.imagen ? `🖼️ Imagen: ${actual.imagen}\n` : '') +
      (actual.audio ? `🎵 Audio: ${actual.audio}\n` : '')
    : `🔴 *Desactivado*\n\n${actual ? `📝 Texto:\n${actual.texto || TEXTOS_POR_DEFECTO[tipo]}\n\n` : '_Vacio._'}`

  await sock.sendMessage(jid, {
    text: `${etiqueta}\n\n${estado}\n\n${ayuda}`,
    quoted: msg,
  })
}
