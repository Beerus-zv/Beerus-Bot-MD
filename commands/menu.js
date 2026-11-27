/**
 * Menus del bot, en dos niveles:
 *
 *   /menu              menu principal: categorias + comandos destacados
 *                      y la ruta /menu <categoria> de cada mundo
 *   /menu <categoria>  menu completo de esa categoria (id, titulo o
 *                      prefijo, sin acentos): todos los comandos con
 *                      su uso y descripcion
 *
 * Cada menu lleva un banner de Beerus al azar (lib/banners-menu.js): el
 * arte cambia de paleta y adorno en cada envio. En el menu principal el
 * banner y el indice van en un solo mensaje: la imagen lleva el menu
 * completo como pie de foto.
 */
import {
  menuPrincipal,
  menuDeCategoria,
  categoriasActivas,
  contarComandos,
  nombreBonito,
} from '../lib/categorias.js'
import { obtenerBannerMenu } from '../lib/banners-menu.js'
import { enviarBotones, botonComando } from '../lib/botones.js'
import { TEMA, ORNAMENTOS, panelLinea, fechaMenu } from '../lib/tema.js'
import { obtenerAjuste } from '../database/db.js'
import { tituloBot, monedaBot, iconoBot, bannerFijado, linkBot } from '../lib/ajustes-bot.js'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { log } from '../lib/logger.js'

const LIMITE_WA = 4096

/** Parte un texto largo en bloques que caben, cortando entre parrafos */
function partir(texto, limite) {
  if (texto.length <= limite) return [texto]

  const bloques = []
  let actual = ''
  for (const parrafo of texto.split('\n\n')) {
    const juntado = actual ? `${actual}\n\n${parrafo}` : parrafo
    if (actual && juntado.length > limite) {
      bloques.push(actual)
      actual = parrafo
    } else {
      actual = juntado
    }
  }
  if (actual) bloques.push(actual)
  return bloques.length ? bloques : [texto]
}

export default async ({ sock, jid, msg, args, commands, PREFIX }) => {
  const prefijo = PREFIX?.[0] ?? '/'

  // Banner de Beerus al azar: cada menu sale con un arte distinto.
  // Se pide una sola vez por menu (el principal y el de categoria comparten).
  let banner = null
  let bannerListo = false
  const tomarBanner = async () => {
    if (bannerListo) return banner
    bannerListo = true
    // Banner fijado con /setbanner: manda sobre el aleatorio
    const fijo = bannerFijado()
    if (fijo) {
      try {
        if (/^https?:\/\//i.test(fijo)) {
          const respuesta = await fetch(fijo, { redirect: 'follow' })
          if (respuesta.ok) banner = { id: 'fijo', buffer: Buffer.from(await respuesta.arrayBuffer()) }
        } else {
          const ruta = isAbsolute(fijo) ? fijo : resolve(fijo)
          banner = { id: 'fijo', buffer: await readFile(ruta) }
        }
      } catch (err) {
        log.error('No se pudo leer el banner fijado, se usa el aleatorio', err.message)
        banner = null
      }
      if (banner) return banner
    }
    try {
      banner = await obtenerBannerMenu()
    } catch (err) {
      log.error('No se pudo obtener el banner del menu', err.message)
    }
    return banner
  }
  // 0) /menu <categoria>: abre el menu completo de ese mundo
  const pedido = args?.length ? args.join(' ').trim() : ''
  // "menu todos" fuerza el indice completo aunque haya lista de botones
  const quiereIndice = /^(todos|all|completo|full|indice)$/i.test(pedido)
  if (pedido && !quiereIndice) {
    const textoCat = menuDeCategoria(commands, prefijo, pedido)

    if (textoCat) {
      const cuerpo =
        `> ${iconoBot()} *${tituloBot()}* ⚡\n\n${textoCat}\n\n` +
        `${ORNAMENTOS.separador}\n> ✐ vuelve al indice: \`${prefijo}menu\``

      const portada = await tomarBanner()
      if (portada && cuerpo.length <= LIMITE_WA) {
        try {
          await sock.sendMessage(jid, { image: portada.buffer, caption: cuerpo, quoted: msg })
          log.depuracion(`menu · banner ${portada.id} + categoria ${pedido}`)
          return
        } catch (err) {
          log.error('No se pudo enviar el banner de la categoria', err)
        }
      }

      await sock.sendMessage(jid, { text: cuerpo, quoted: msg })
      return
    }

    // No matcheo: pista con las categorias disponibles
    const pistas = categoriasActivas(commands)
      .map((c) => `▸ \`${c.id}\` — ${nombreBonito(c.titulo)}`)
      .join('\n')
    await sock.sendMessage(jid, {
      text:
        `❓ No encontré la categoría *${pedido}*.\n\n` +
        `✧ Usa \`${prefijo}menu <categoría>\` con una de estas:\n${pistas}\n\n` +
        `_O \`${prefijo}menu\` para ver el índice._`,
      quoted: msg,
    })
    return
  }

  // 1) Banner del menu (ya elegido al azar). Si fallo, el menu se manda
  //    solo como texto.
  await tomarBanner()

  // 2) Panel de datos (estilo GataBot: citas con icono y dato)
  const total = contarComandos(commands)
  const nCategorias = categoriasActivas(commands).length

  const datos = {
    modo: obtenerAjuste('modo') ?? TEMA.modo,
    version: TEMA.version,
    desarrollador: obtenerAjuste('desarrollador') ?? TEMA.desarrollador,
    moneda: monedaBot(),
    comandos: `${total} en ${nCategorias} categorias`,
    link: linkBot(),
  }

  const panel = panelLinea(datos)

  // 3) Menu principal como texto: 1 mensaje si cabe, mas si no
  const cabecera =
    `> ${iconoBot()} *${tituloBot()}* ⚡\n` +
    `> _${TEMA.subtitulo}_\n` +
    `> ⏰ ${fechaMenu()}\n\n` +
    `${ORNAMENTOS.separador}\n` +
    `${panel}\n` +
    `${ORNAMENTOS.separador}\n\n`
  const pie = `\n\n${ORNAMENTOS.separador}\n_${TEMA.lema}._`
  const rotulo = `⚡ *${tituloBot()}* — índice\n\n`
  const hueco = LIMITE_WA - cabecera.length - pie.length - rotulo.length - 4 // margen

  const bloques = partir(menuPrincipal(commands, prefijo), hueco)

  // 4) Banner + menu principal en UN SOLO mensaje: la portada lleva el
  //    indice completo como pie de foto. Si el menu no cupiera en un
  //    mensaje, el banner lleva el primer bloque y el resto sigue en texto.
  let desde = 0
  if (banner) {
    const primera = `${cabecera}${bloques[0]}${bloques.length === 1 ? pie : ''}`
    try {
      await sock.sendMessage(jid, { image: banner.buffer, caption: primera, quoted: msg })
      desde = 1
    } catch (err) {
      log.error('No se pudo enviar el banner', err)
      desde = 0
    }
  }

  // 5) Bloques que no cupieron en el banner (o todo el indice si no hay banner)
  for (let i = desde; i < bloques.length; i += 1) {
    const esUltimo = i === bloques.length - 1
    const texto =
      (i === 0 ? cabecera : rotulo) +
      bloques[i] +
      (esUltimo ? pie : '')

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  }

  const conBanner = Boolean(banner) && desde === 1
  const enviados = (conBanner ? 1 : 0) + (bloques.length - desde)
  log.depuracion(`menu · banner ${conBanner ? banner.id : 'no'} + indice en ${enviados} mensaje(s)`)

  // Atajo: las tres categorías que más se abren, sin escribir el comando
  await enviarBotones({
    sock,
    jid,
    texto: `⚡ *${tituloBot()}*`,
    pie: 'Atajos del menú',
    botones: [
      botonComando('🃏 Juegos', `${prefijo}menu juegos`),
      botonComando('📥 Descargas', `${prefijo}menu descargas`),
      botonComando('💰 Economía', `${prefijo}menu economia`),
    ],
    quoted: msg,
  })
}
