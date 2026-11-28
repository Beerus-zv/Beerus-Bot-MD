import { esOwnerMsg } from '../lib/owner.js'
import { probarMotor, esLimiteDeTasa, PLATAFORMAS, detectarPlataforma } from '../lib/descargas.js'
import { log } from '../lib/logger.js'

/**
 * Diagnostico del motor de descargas (solo owner).
 *
 * Uso:
 *   `.dltest`                          prueba el motor y la salida a internet
 *   `.dltest <enlace>`                 ademas prueba ese enlace
 *
 * Separa las tres causas que en el chat se ven iguales: el binario no esta, el
 * servidor no sale a internet, o la plataforma frena la IP del servidor.
 */
export default async ({ sock, jid, msg, sender, args = [] }) => {
  const citar = msg?.message ? msg : undefined

  if (!esOwnerMsg({ msg, sender, sock })) {
    await sock.sendMessage(jid, {
      text: '⛔ Solo el propietario puede probar el motor de descargas.',
      quoted: citar,
    })
    return
  }

  const enlace = args.find((a) => /^https?:\/\//i.test(String(a))) || ''
  await sock.sendMessage(jid, { text: '🔬 Probando el motor de descargas...', quoted: citar })

  try {
    const prueba = await probarMotor({ url: enlace })
    await sock.sendMessage(jid, { text: informe(prueba, enlace), quoted: citar })
  } catch (err) {
    log.error('Error en comando .dltest', err)
    await sock.sendMessage(jid, { text: `❌ Error: ${err?.message || err}`, quoted: citar })
  }
}

/** Oculta las credenciales de un proxy antes de mostrarlo */
function proxyVisible(proxy) {
  if (!proxy) return 'sin proxy'
  return proxy.replace(/\/\/[^/@]+@/, '//***:***@')
}

/** Arma el mensaje con el veredicto */
function informe(prueba, enlace) {
  const lineas = [
    '🔬 *Motor de descargas*\n',
    `yt-dlp: ${prueba.version ? `\`${prueba.version}\`` : '❌ no carga'}`,
    `Cookies: ${prueba.cookies ? `\`${nombreCorto(prueba.cookies)}\`` : 'ninguna'}`,
    `Proxy: ${proxyVisible(prueba.proxy)}`,
    `Red (instagram.com): ${prueba.red.ok ? `✅ ${prueba.red.detalle}` : `❌ ${recortar(prueba.red.detalle)}`}`,
  ]

  if (enlace) {
    const plataforma = PLATAFORMAS[detectarPlataforma(enlace)] || 'Enlace'
    lineas.push(
      `${plataforma}: ${prueba.enlace.ok ? `✅ ${recortar(prueba.enlace.motivo)}` : `❌ ${recortar(prueba.enlace.motivo)}`}`,
    )
  }

  lineas.push('', `*Veredicto*\n${veredicto(prueba, enlace)}`)
  return lineas.join('\n')
}

/** Qué está roto, en una frase, con la salida concreta */
function veredicto(prueba, enlace) {
  if (!prueba.version) {
    return '❌ yt-dlp no arranca desde el servidor. Revisá `data/yt-dlp/` y volvé a intentar: se descarga solo.'
  }

  if (!prueba.red.ok) {
    return (
      `❌ El servidor no llega a Instagram (${recortar(prueba.red.detalle)}). ` +
      'El problema es la red del hosting, no las descargas.'
    )
  }

  if (!enlace) {
    return '✅ El motor responde y el servidor sale a internet. Pasá un enlace: `.dltest <url>`.'
  }

  if (prueba.enlace.ok) {
    return '✅ Ese enlace baja bien desde acá. Si el bot falla con el mismo, el que se quedó sin aire es el proceso.'
  }

  if (esLimiteDeTasa({ message: prueba.enlace.motivo }) || /429|too many requests/i.test(prueba.enlace.motivo)) {
    const arreglos = []
    if (!prueba.cookies) arreglos.push('cargá cookies en `data/cookies-instagram.txt`')
    if (!prueba.proxy) arreglos.push('pasá las descargas por un proxy con `PROXY_DESCARGAS`')
    arreglos.push('o apuntá `API_DESCARGAS` a un resolvedor propio')

    return (
      '⏳ La plataforma está frenando *la IP de este servidor*, no el enlace.\n' +
      `_Arreglos: ${arreglos.join(' · ')}._`
    )
  }

  return `❌ El enlace falla por su cuenta (no es límite de tasa):\n_${recortar(prueba.enlace.motivo, 200)}_`
}

const nombreCorto = (ruta) => String(ruta).split(/[\\/]/).pop()
const recortar = (texto, max = 120) => {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio
}
