/**
 * Panel de configuracion en un solo mensaje (`/config`).
 *
 * Cada ajuste editable es una entrada de `AJUSTES` con la misma forma:
 *
 *   leer()      valor actual ya formateado para mostrar
 *   ejemplo     como se escribe el valor
 *   validar()   normaliza el texto y lo valida; devuelve error o valor
 *   guardar()   escribe el ajuste
 *   reiniciar() vuelve al valor de fabrica
 *   especial    ajustes que necesitan el socket o un archivo (banner, foto)
 *
 * El comando en `commands/socket.js` solo pinta el panel y enruta la escritura,
 * asi que agregar un ajuste es agregar una entrada aca y nada mas.
 *
 * Todo lo que escribe termina en la tabla `ajustes` y se lee en caliente: el
 * panel nunca pide reiniciar.
 */
import { obtenerAjuste } from '../database/db.js'
import {
  CLAVES,
  nombreBot,
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
  pesoStickerBytes,
} from './ajustes-bot.js'

/** Texto que se muestra cuando el ajuste esta en su valor de fabrica */
const FABRICA = '(de fábrica)'

/**
 * Valida una URL http(s).
 * @returns {{ ok: true, valor: string } | { ok: false, error: string }}
 */
function validarUrl(crudo) {
  const valor = crudo.trim()
  if (!/^https?:\/\/\S+$/i.test(valor)) {
    return { ok: false, error: 'El link tiene que empezar con `http://` o `https://` y no tener espacios.' }
  }
  return { ok: true, valor }
}

/**
 * Valida un texto con tope de caracteres y sin saltos de linea.
 * @param {number} max
 * @param {string} que  como se llama el campo, para el mensaje de error
 */
function validarTexto(max, que) {
  return (crudo) => {
    const valor = crudo.trim().replace(/\s+/g, ' ')
    if (!valor) return { ok: false, error: 'Falta el valor.' }
    if (valor.length > max) return { ok: false, error: `El ${que} no puede pasar de ${max} caracteres.` }
    return { ok: true, valor }
  }
}

/**
 * Valida un numero de telefono con codigo de pais.
 * Acepta `+573001234567`, `573001234567` o una mencion (`@573001234567`).
 */
function validarOwner(crudo) {
  const limpio = crudo.replace(/^@/, '').replace(/[^\d]/g, '')
  if (limpio.length < 6) {
    return { ok: false, error: 'Necesito un número con código de país, por ejemplo `573001234567`.' }
  }
  return { ok: true, valor: `${limpio}@s.whatsapp.net` }
}

/** Acepta on/off, si/no, 1/0; null si no es ningun estado reconocible */
function accionBooleana(crudo) {
  const valor = String(crudo ?? '').trim().toLowerCase()
  if (['on', 'si', 'sí', '1', 'true', 'activar', 'activo'].includes(valor)) return true
  if (['off', 'no', '0', 'false', 'desactivar', 'inactivo'].includes(valor)) return false
  return null
}

/** true si el ajuste tiene algo guardado (para marcar "(de fábrica)") */
function guardado(clave) {
  const valor = obtenerAjuste(clave)
  return valor !== null && valor !== undefined && valor !== ''
}

/** Acorta una ruta larga para que quepa en el panel */
function rutaCorta(ruta) {
  const texto = String(ruta || '')
  if (/^https?:\/\//i.test(texto)) return 'url'
  return texto.split(/[\\/]/).pop() || texto
}

/**
 * Ajustes que se pueden cambiar desde el panel.
 *
 * El orden es el que se ve en el mensaje: los que se tocan seguido arriba.
 */
export const AJUSTES = [
  {
    id: 'nombre',
    icono: '🏷️',
    etiqueta: 'Nombre del bot',
    ejemplo: '/config 1 Beerus Bot MD',
    leer: () => nombreBot(),
    esFabrica: () => !guardado(CLAVES.nombre),
    validar: validarTexto(40, 'nombre'),
    guardar: (valor) => fijarAjuste(CLAVES.nombre, valor),
    reiniciar: () => fijarAjuste(CLAVES.nombre, ''),
  },
  {
    id: 'icono',
    icono: '🎴',
    etiqueta: 'Icono del menú',
    ejemplo: '/config 2 🐱',
    leer: () => iconoBot(),
    esFabrica: () => !guardado(CLAVES.icono),
    validar: (crudo) => {
      const valor = crudo.trim().slice(0, 8)
      if (!valor) return { ok: false, error: 'Falta el emoji.' }
      return { ok: true, valor }
    },
    guardar: (valor) => fijarAjuste(CLAVES.icono, valor),
    reiniciar: () => fijarAjuste(CLAVES.icono, ''),
  },
  {
    id: 'prefijos',
    icono: '⌨️',
    etiqueta: 'Prefijos',
    ejemplo: '/config 3 . / #',
    leer: () => prefijosBot().join(' '),
    esFabrica: () => !guardado(CLAVES.prefijos),
    validar: (crudo) => {
      const lista = String(crudo)
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean)
      if (!lista.length) return { ok: false, error: 'No encontré prefijos. Ejemplo: `. /`' }
      const largo = lista.find((p) => p.length > 4)
      if (largo) return { ok: false, error: `El prefijo \`${largo}\` pasa de 4 caracteres.` }
      return { ok: true, valor: [...new Set(lista)] }
    },
    guardar: (valor) => fijarPrefijos(valor.join(' ')),
    reiniciar: () => resetPrefijos(),
  },
  {
    id: 'owner',
    icono: '👤',
    etiqueta: 'Owner del bot',
    ejemplo: '/config 4 573001234567',
    leer: () => {
      const valor = obtenerAjuste(CLAVES.owner)
      return valor ? String(valor).split('@')[0] : '(de fábrica)'
    },
    esFabrica: () => !guardado(CLAVES.owner),
    validar: validarOwner,
    guardar: (valor) => fijarAjuste(CLAVES.owner, valor),
    reiniciar: () => fijarAjuste(CLAVES.owner, ''),
  },
  {
    id: 'link',
    icono: '🔗',
    etiqueta: 'Link del menú',
    ejemplo: '/config 5 https://ejemplo.com',
    leer: () => linkBot() || '(sin link)',
    esFabrica: () => !guardado(CLAVES.link),
    validar: validarUrl,
    guardar: (valor) => fijarAjuste(CLAVES.link, valor),
    reiniciar: () => fijarAjuste(CLAVES.link, ''),
  },
  {
    id: 'moneda',
    icono: '💠',
    etiqueta: 'Nombre de la moneda',
    ejemplo: '/config 6 créditos',
    leer: () => monedaBot(),
    esFabrica: () => !guardado(CLAVES.moneda),
    validar: validarTexto(20, 'nombre de la moneda'),
    guardar: (valor) => fijarAjuste(CLAVES.moneda, valor),
    reiniciar: () => fijarAjuste(CLAVES.moneda, ''),
  },
  {
    id: 'privado',
    icono: '🔒',
    etiqueta: 'Modo privado',
    ejemplo: '/config 7 on',
    leer: () => (modoPrivado() ? 'ON' : 'OFF'),
    esFabrica: () => !guardado(CLAVES.privado),
    validar: (crudo) => {
      const estado = accionBooleana(crudo)
      if (estado === null) return { ok: false, error: 'Usa `on`/`off` (o `si`/`no`).' }
      return { ok: true, valor: estado ? '1' : '0', texto: estado ? 'ON' : 'OFF' }
    },
    guardar: (valor) => fijarAjuste(CLAVES.privado, valor),
    reiniciar: () => fijarAjuste(CLAVES.privado, '0'),
  },
  {
    id: 'banner',
    icono: '🖼️',
    etiqueta: 'Banner del menú',
    ejemplo: '/config 8 (responde a una imagen)',
    leer: () => (bannerFijado() ? `fijo (${rutaCorta(bannerFijado())})` : 'al azar'),
    esFabrica: () => !bannerFijado(),
    // Descarga la imagen y escribe un archivo: lo resuelve socket.js
    especial: 'banner',
    validar: validarUrl,
    guardar: (valor) => fijarAjuste(CLAVES.banner, valor),
    reiniciar: () => fijarAjuste(CLAVES.banner, ''),
  },
  {
    id: 'username',
    icono: '🪪',
    etiqueta: 'Nombre de perfil',
    ejemplo: '/config 9 Beerus',
    leer: () => usernameBot() || '(por defecto)',
    esFabrica: () => !guardado(CLAVES.username),
    // Lo aplica WhatsApp, no la base: lo resuelve socket.js
    especial: 'username',
    validar: validarTexto(25, 'nombre de perfil'),
    guardar: (valor) => fijarAjuste(CLAVES.username, valor),
    reiniciar: () => fijarAjuste(CLAVES.username, ''),
  },
  {
    id: 'foto',
    icono: '📸',
    etiqueta: 'Foto de perfil',
    ejemplo: '/config 10 (responde a una imagen)',
    leer: () => 'la que tenga puesta WhatsApp',
    esFabrica: () => true,
    // WhatsApp no permite dejar el perfil sin foto: no hay reset
    especial: 'foto',
    sinReset: true,
    validar: validarUrl,
    guardar: () => {},
    reiniciar: () => {},
  },
  {
    id: 'peso',
    icono: '⚖️',
    etiqueta: 'Peso máximo del sticker',
    ejemplo: '/config 11 500',
    leer: () => `${Math.round(pesoStickerBytes() / 1024)} KB`,
    esFabrica: () => !guardado(CLAVES.pesoSticker),
    validar: (crudo) => {
      const kb = Number.parseInt(String(crudo).replace(/[^\d]/g, ''), 10)
      if (!Number.isFinite(kb)) {
        return { ok: false, error: 'Necesito un número en KB. Ejemplo: `500`.' }
      }
      if (kb < 100 || kb > 1024) {
        return { ok: false, error: 'El peso tiene que estar entre 100 y 1024 KB.' }
      }
      return { ok: true, valor: String(kb), texto: `${kb} KB` }
    },
    guardar: (valor) => fijarAjuste(CLAVES.pesoSticker, valor),
    reiniciar: () => fijarAjuste(CLAVES.pesoSticker, ''),
  },
]

/** Busca un ajuste por numero (1..n) o por id (`nombre`, `prefijos`, ...) */
export function buscarAjuste(referencia) {
  const texto = String(referencia ?? '').trim().toLowerCase()
  if (!texto) return null
  if (/^\d+$/.test(texto)) return AJUSTES[Number(texto) - 1] ?? null
  return AJUSTES.find((a) => a.id === texto) ?? null
}

/** Numero que ocupa un ajuste en el panel (1..n) */
export function numeroDe(ajuste) {
  return AJUSTES.indexOf(ajuste) + 1
}


/**
 * Panel completo en un solo mensaje.
 *
 * Diez ajustes con dos lineas cada uno quedan en ~900 caracteres, bien lejos
 * del limite de 4096 de WhatsApp.
 */
export function panelConfig() {
  const lineas = AJUSTES.map((ajuste, i) => {
    const marca = ajuste.esFabrica() && !ajuste.sinReset ? ` ${FABRICA}` : ''
    return `*${i + 1}.* ${ajuste.icono} ${ajuste.etiqueta}\n     \`${ajuste.leer()}\`${marca}`
  })

  return (
    `⚙️ *Configuración de ${nombreBot()}*\n\n` +
    `${lineas.join('\n\n')}\n\n` +
    `*Cambiar:* \`/config <n> <valor>\`\n` +
    `*Volver al valor de fábrica:* \`/config <n> reset\`\n` +
    `_Ejemplo:_ \`/config 1 Beerus Bot MD\`\n` +
    `_Los cambios se aplican al instante, sin reiniciar._`
  )
}

/**
 * Aplica un valor a un ajuste y devuelve el texto de respuesta.
 *
 * Los ajustes `especial` (banner, foto, nombre de perfil) no llegan aca sin
 * valor: `socket.js` los resuelve con el socket y despues llama a `guardar`.
 *
 * @param {object} ajuste entrada de `AJUSTES`
 * @param {string} crudo  texto que escribio el owner
 * @returns {{ ok: boolean, texto: string, valor?: any }}
 */
export function aplicarAjuste(ajuste, crudo) {
  const pedido = String(crudo ?? '').trim()

  if (!pedido) {
    return {
      ok: false,
      texto:
        `❌ Falta el valor.\n\n` +
        `${ajuste.icono} *${ajuste.etiqueta}:* \`${ajuste.leer()}\`\n` +
        `Ejemplo: \`${ajuste.ejemplo}\``,
    }
  }

  const reiniciar = ['reset', 'reiniciar', 'borrar', 'fabrica', 'fábrica', 'default'].includes(
    pedido.toLowerCase()
  )

  if (reiniciar) {
    if (ajuste.sinReset) {
      return { ok: false, texto: `❌ *${ajuste.etiqueta}* no tiene valor de fábrica que reponer.` }
    }
    ajuste.reiniciar()
    return { ok: true, texto: `♻️ *${ajuste.etiqueta}:* \`${ajuste.leer()}\`` }
  }

  const revision = ajuste.validar(pedido)
  if (!revision.ok) return { ok: false, texto: `❌ ${revision.error}` }

  ajuste.guardar(revision.valor)
  const mostrado = revision.texto ?? revision.valor
  return {
    ok: true,
    texto: `✅ *${ajuste.etiqueta}:* \`${mostrado}\``,
    valor: revision.valor,
  }
}
