/**
 * IA de Beerus: conversa con el Dios de la Destrucción desde WhatsApp.
 *
 * - `/ia <texto>`      conversa (recuerda el contexto del chat)
 * - `/ia nueva`        borra la memoria del chat
 * - `/ia clave <KEY>`  guarda la clave GRATUITA de Gemini AI Studio (solo dueño)
 * - `/ia estado`       muestra si hay clave de Gemini y turnos en memoria
 *
 * También responde cuando mencionan al bot (ver `charlarConBeerus`, que usa index.js).
 */
import {
  preguntarIA,
  preguntarGemini,
  limpiarHistorial,
  claveGemini,
  configClaveGemini,
  obtenerHistorial,
  nombresProveedores,
  MODELO_LIBRE,
} from '../lib/ia.js'
import { log } from '../lib/logger.js'

const AYUDA = `🐱 *Beerus, Dios de la Destrucción*

*Uso:* \`/ia <texto>\` — habla conmigo
     \`/ia nueva\` — olvido la conversación
     \`/ia estado\` — mi estado y la memoria
     \`/ia clave <KEY>\` — clave gratuita de Gemini

_También puedes mencionarme o escribir *beerus* seguido de tu pregunta, y te respondo._

*Tambien:*
• \`/chatgpt <texto>\` — modelo libre (${MODELO_LIBRE})
• \`/gemini <texto>\` — Gemini (clave de AI Studio)

_La clave gratuita se saca en aistudio.google.com y no cuesta nada._`

/** Respuestas de Beerus cuando el servicio de IA falla */
const FALLOS = [
  'Whis está arreglando mi conexión divina. Inténtalo de nuevo en un momento, mortal. 🍮',
  'Me quedé dormido a mitad de la frase. Repite la pregunta, que ahora sí te escucho. 💤',
  'Algo interfirió con mi poder divino. Prueba otra vez en unos segundos.',
]
const fallo = () => FALLOS[Math.floor(Math.random() * FALLOS.length)]

/** Apaga el indicador "escribiendo..." sin que un fallo rompa nada */
async function presencia(sock, jid, estado) {
  try {
    await sock.sendPresenceUpdate(estado, jid)
  } catch {
    // la presencia es solo decorativa
  }
}

/**
 * Pregunta a Beerus y contesta directamente (sin avisos intermedios).
 * Mientras piensa, muestra "escribiendo...". Lo usan /ia, /chatgpt, /gemini y las menciones.
 *
 * @param {object} ctx { sock, jid, msg, pregunta, modo, esGrupo }
 * @returns {Promise<boolean>} true si contestó
 */
export async function charlarConBeerus({ sock, jid, msg, pregunta, modo = 'libre', esGrupo = false }) {
  const chat = msg.key.remoteJid
  // En grupos el historial es compartido: se identifica a quien habla
  const nombre = esGrupo ? msg.pushName || '' : ''

  await presencia(sock, jid, 'composing')
  try {
    let texto
    let aviso = ''
    if (modo === 'gemini') {
      const r = await preguntarGemini(chat, pregunta, nombre)
      texto = r.texto
      if (!r.gemini) aviso = '\n\n_(Sin clave de Gemini: te contesto yo con mi propio poder.)_'
    } else {
      texto = await preguntarIA(chat, pregunta, nombre)
    }
    await sock.sendMessage(jid, { text: `${texto}${aviso}` }, { quoted: msg })
    return true
  } catch (err) {
    log.error('ia · error', err.message)
    await sock.sendMessage(jid, { text: fallo() }, { quoted: msg })
    return false
  } finally {
    await presencia(sock, jid, 'paused')
  }
}

/** Respuesta compartida de /ia, /chatgpt y /gemini */
export async function responderIA(ctx, modo = 'libre') {
  const { sock, jid, msg, args, esGrupo } = ctx
  const pregunta = (args || []).join(' ').trim()

  if (!pregunta) {
    await sock.sendMessage(jid, { text: AYUDA }, { quoted: msg })
    return false
  }
  return charlarConBeerus({ sock, jid, msg, pregunta, modo, esGrupo })
}

export default async (ctx) => {
  const { sock, jid, msg, args, esGrupo } = ctx
  const entrada = (args || []).join(' ').trim()
  const [primera, ...resto] = args || []
  const subcomando = (primera || '').toLowerCase()

  // `/ia` sola: ayuda
  if (!entrada) {
    await sock.sendMessage(jid, { text: AYUDA }, { quoted: msg })
    return
  }

  // `/ia nueva` — borra la memoria del chat
  if (subcomando === 'nueva') {
    limpiarHistorial(msg.key.remoteJid)
    await sock.sendMessage(
      jid,
      { text: '🧹 Listo, ya olvidé todo lo que hablamos. Empecemos de nuevo, mortal.' },
      { quoted: msg }
    )
    return
  }

  // `/ia estado` — configuración y memoria
  if (subcomando === 'estado') {
    const clave = Boolean(claveGemini())
    const turnos = Math.floor(obtenerHistorial(msg.key.remoteJid).length / 2)
    await sock.sendMessage(
      jid,
      {
        text:
          `📊 *Estado de Beerus*\n\n` +
          `• Modelo libre: ${MODELO_LIBRE}\n` +
          `• Proveedores: ${nombresProveedores().join(' → ')}\n` +
          `• Clave de Gemini: ${clave ? '✅ configurada' : '❌ no configurada'}\n` +
          `• Turnos recordados en este chat: ${turnos}`,
      },
      { quoted: msg }
    )
    return
  }

  // `/ia clave <KEY>` — guarda la clave gratuita de Gemini (solo desde el dueño del bot)
  if (subcomando === 'clave') {
    if (!msg.key.fromMe) {
      await sock.sendMessage(
        jid,
        { text: '🔒 Solo el dueño del bot puede guardar la clave (desde el chat propio).' },
        { quoted: msg }
      )
      return
    }

    const nueva = resto.join(' ').trim()
    configClaveGemini(nueva)

    await sock.sendMessage(
      jid,
      {
        text: nueva
          ? '✅ *Clave de Gemini guardada.* `/gemini` ya usa la API oficial de Google.'
          : '🧹 *Clave de Gemini borrada.* `/gemini` vuelve al modelo libre.',
      },
      { quoted: msg }
    )
    return
  }

  await responderIA({ sock, jid, msg, args, esGrupo }, 'libre')
}
