/**
 * Menus del bot, en dos niveles:
 *
 *   /menu              menu principal: categorias + comandos destacados
 *                      y la ruta /menu <categoria> de cada mundo
 *   /menu <categoria>  menu completo de esa categoria (id, titulo o
 *                      prefijo, sin acentos): todos los comandos con
 *                      su uso y descripcion
 *
 * El banner de Beerus va de portada en el menu principal.
 */
import {
  menuPrincipal,
  menuDeCategoria,
  categoriasActivas,
  contarComandos,
  nombreBonito,
} from '../lib/categorias.js'
import { obtenerAvatarBeerus } from '../lib/avatar.js'
import { TEMA, ORNAMENTOS, panelLinea, fechaMenu } from '../lib/tema.js'
import { obtenerAjuste } from '../database/db.js'

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

  // 0) /menu <categoria>: abre el menu completo de ese mundo
  const pedido = args?.length ? args.join(' ').trim() : ''
  if (pedido) {
    const textoCat = menuDeCategoria(commands, prefijo, pedido)

    if (textoCat) {
      await sock.sendMessage(jid, {
        text:
          `> 🐉 *${TEMA.titulo}* ⚡\n\n${textoCat}\n\n` +
          `${ORNAMENTOS.separador}\n> ✐ vuelve al indice: \`${prefijo}menu\``,
        quoted: msg,
      })
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

  // 1) Banner de Beerus: la portada del menu principal
  let banner = null
  try {
    banner = await obtenerAvatarBeerus()
  } catch (err) {
    console.error('No se pudo obtener la imagen de Beerus:', err)
  }

  // 2) Panel de datos (estilo GataBot: citas con icono y dato)
  const total = contarComandos(commands)
  const nCategorias = categoriasActivas(commands).length

  const datos = {
    modo: obtenerAjuste('modo') ?? TEMA.modo,
    desarrollador: obtenerAjuste('desarrollador') ?? TEMA.desarrollador,
    moneda: TEMA.moneda,
    comandos: `${total} en ${nCategorias} categorias`,
    link: obtenerAjuste('link') ?? TEMA.link,
  }

  const panel = panelLinea(datos)

  // 3) Menu principal como texto: 1 mensaje si cabe, mas si no
  const cabecera =
    `> 🐉 *${TEMA.titulo}* ⚡\n` +
    `> _${TEMA.subtitulo}_\n` +
    `> ⏰ ${fechaMenu()}\n\n` +
    `${ORNAMENTOS.separador}\n` +
    `${panel}\n` +
    `${ORNAMENTOS.separador}\n\n`
  const pie = `\n\n${ORNAMENTOS.separador}\n_${TEMA.lema}._`
  const rotulo = `⚡ *${TEMA.nombre}* — índice\n\n`
  const hueco = LIMITE_WA - cabecera.length - pie.length - rotulo.length - 4 // margen

  const bloques = partir(menuPrincipal(commands, prefijo), hueco)

  // 4) El banner de Beerus ES la portada del menu
  if (banner) {
    try {
      await sock.sendMessage(jid, {
        image: banner,
        caption: `> 🌬 *${TEMA.nombre} — ${TEMA.subtitulo}*\n_${nCategorias} mundos y ${total} comandos. Abre cada mundo con \`${prefijo}menu <categoría>\`_`,
        quoted: msg,
      })
    } catch (err) {
      console.error('No se pudo enviar el banner:', err)
    }
  }

  // 5) El indice en texto: copiable y en partes que WhatsApp acepta
  for (let i = 0; i < bloques.length; i += 1) {
    const esUltimo = i === bloques.length - 1
    const texto =
      (i === 0
        ? cabecera
        : rotulo) +
      bloques[i] +
      (esUltimo ? pie : '')

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  }

  console.log(`[menu] banner ${banner ? 'si' : 'no'} + indice en ${bloques.length} mensaje(s)`)
}
