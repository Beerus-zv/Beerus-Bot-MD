/**
 * Verificacion del bot (npm test).
 *
 * Comprueba, sin conectar con WhatsApp:
 *   1. Sintaxis de los archivos de entrada y de la capa de datos.
 *   2. Que todos los comandos de commands/ se carguen y exporten una funcion.
 *   3. Que el registro de index.js no tenga referencias rotas ni claves duplicadas.
 *   4. Que los alias del menu (NOMBRES_CORTOS) existan de verdad.
 *   5. Que las categorias del menu solo listan comandos registrados.
 *   6. Que el menu se parta en bloques que WhatsApp acepta (<= 4096 caracteres).
 *   7. Que la base de datos cree su esquema (en una carpeta temporal, sin tocar data/).
 *   8. Que el club VIP registre, reconozca y revoque accesos (base temporal).
 *   9. Que .setcardimage guarde y priorice la imagen de una carta (base temporal).
 *  10. Que las interacciones respondan con GIF y no con sticker.
 *  11. Que los retratos del gacha prefieran arte grande y descarten basura.
 *  12. Que el menu baje banners de Beerus de internet y los rote al azar.
 *  13. Que el menu principal salga en un solo mensaje visible (sin botones,
 *      que WhatsApp descarta en esta cuenta).
 *  14. Que los scripts de package.json apunten a archivos existentes.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { cargarComandos } from './lib/loader.js'
import { CATEGORIAS, DESCRIPCIONES, USOS, dividirMenu, menuDeCategoria } from './lib/categorias.js'
import { NOMBRES_CORTOS } from './lib/alias.js'
import { puntuarRetrato, candidatosWiki, retratoAceptable } from './lib/retratos.js'
import {
  ANCHO_BANNER,
  ALTO_BANNER,
  CONSULTAS_BANNERS,
  barajarBanners,
  candidatoAceptable,
  distanciaHuellas,
  huellaImagen,
  imagenesParecidas,
  leerCatalogo,
  medidasAceptables,
  prepararBanner,
  puntuarCandidato,
} from './lib/banners-menu.js'

const RAIZ = path.dirname(fileURLToPath(import.meta.url))
// Sin BOM: algunos editores de Windows lo agregan y rompe JSON.parse
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/^\uFEFF/, '')

let fallos = 0
let comprobaciones = 0

function ok(mensaje) {
  comprobaciones++
  console.log(`✔ ${mensaje}`)
}

function mal(mensaje, detalle = '') {
  comprobaciones++
  fallos++
  console.error(`✘ ${mensaje}${detalle ? `\n   ${detalle}` : ''}`)
}

function seccion(titulo) {
  console.log(`\n── ${titulo} ──`)
}

// ───────────── 1. Sintaxis ─────────────
seccion('Sintaxis')
const ENTRADA = [
  'index.js',
  'iniciar.js',
  'config.js',
  'lib/loader.js',
  'lib/categorias.js',
  'lib/alias.js',
  'lib/retratos.js',
  'lib/anilist.js',
  'lib/banners-menu.js',
  'database/db.js',
  'database/catalogo.js',
  'scripts/refrescar-cartas.mjs',
  'scripts/renovar-banners.mjs',
  'scripts/sincronizar-rarezas.mjs',
  'verify.mjs',
]
for (const archivo of ENTRADA) {
  const r = spawnSync(process.execPath, ['--check', path.join(RAIZ, archivo)], { encoding: 'utf8' })
  if (r.status === 0) ok(archivo)
  else mal(`sintaxis ${archivo}`, (r.stderr || '').trim().split('\n').slice(0, 3).join('\n   '))
}

// ───────────── 2. Carga de comandos ─────────────
seccion('Comandos')
const archivosComando = fs
  .readdirSync(path.join(RAIZ, 'commands'))
  .filter((f) => f.endsWith('.js'))

const comandos = await cargarComandos({ eager: true })
const cargados = Object.keys(comandos)

if (cargados.length === archivosComando.length) ok(`${cargados.length} comandos cargados`)
else mal(`se esperaban ${archivosComando.length} comandos y se cargaron ${cargados.length}`)

const noFuncion = cargados.filter((n) => typeof comandos[n] !== 'function')
if (!noFuncion.length) ok('todos exportan una funcion por defecto')
else mal('comandos sin funcion', noFuncion.join(', '))

const sinDefault = archivosComando.filter(
  (f) => !/export\s+default|export\s*\{[^}]*\bdefault\b[^}]*\}/.test(leer(`commands/${f}`))
)
if (!sinDefault.length) ok('todos los archivos declaran export default')
else mal('archivos sin export default', sinDefault.join(', '))

// ───────────── 3. Registro de index.js ─────────────
seccion('Registro')
const fuente = leer('index.js')
const inicioMapa = fuente.indexOf('const commands = {')
const finMapa = fuente.indexOf('\n}', inicioMapa)

if (inicioMapa === -1 || finMapa === -1) {
  mal('no se encontro el objeto commands en index.js')
} else {
  const lineasMapa = fuente.slice(inicioMapa, finMapa).split(/\r?\n/)
  const claves = []
  for (const linea of lineasMapa) {
    const conValor = linea.match(/^ {2}('[^']+'|"[^"]+"|\d+|[\w$]+):\s*.+?,?\s*$/)
    if (conValor) { claves.push(conValor[1].replace(/^['"]|['"]$/g, '')); continue }
    const corto = linea.match(/^ {2}([\w$]+),\s*$/)
    if (corto) claves.push(corto[1])
  }

  const repetidas = claves.filter((k, i) => claves.indexOf(k) !== i)
  if (!repetidas.length) ok(`${claves.length} entradas sin claves duplicadas`)
  else mal('claves duplicadas en el registro', [...new Set(repetidas)].join(', '))

  const refs = [...fuente.matchAll(/C\.([A-Za-z_$][\w$]*)|C\[['"]([^'"]+)['"]\]/g)].map((m) => m[1] || m[2])
  const rotas = [...new Set(refs)].filter((r) => !(r in comandos))
  if (!rotas.length) ok(`${new Set(refs).size} modulos referenciados y todos existen`)
  else mal('referencias a comandos inexistentes', rotas.join(', '))

  const modulosSinUsar = cargados.filter((n) => !refs.includes(n))
  if (!modulosSinUsar.length) ok('todos los comandos estan registrados')
  else mal('comandos cargados pero no registrados', modulosSinUsar.join(', '))

  // Valores que no vienen del cargador (handlers fabricados: kiss, anal, danbooru...)
  // deben estar declarados en el archivo o el bot revienta al arrancar.
  const valores = []
  for (const linea of lineasMapa) {
    const conValor = linea.match(/^ {2}(?:'[^']+'|"[^"]+"|\d+|[\w$]+):\s*(.+?),?\s*$/)
    if (conValor) { valores.push(conValor[1].trim()); continue }
    const corto = linea.match(/^ {2}([\w$]+),\s*$/)
    if (corto) valores.push(corto[1])
  }
  const sueltos = [
    ...new Set(
      valores.filter(
        (v) => !v.startsWith('C.') && !v.startsWith('C[') && !v.startsWith('conSub(') &&
          !/^\d+$/.test(v) && /^[A-Za-z_$][\w$]*$/.test(v)
      )
    ),
  ]
  const fueraDelMapa = fuente.slice(0, inicioMapa) + fuente.slice(finMapa)
  const indefinidos = sueltos.filter((v) => !new RegExp(`(?:const|let|var)\\s+${v}\\b`).test(fueraDelMapa))
  if (!indefinidos.length) ok(`${sueltos.length} handlers fabricados estan declarados`)
  else mal('identificadores no declarados en el registro', indefinidos.join(', '))

  // Ningun comando debe llamarse por su nombre de archivo suelto:
  // siempre a traves del registro (C.nombre) o el bot revienta al ejecutarlo.
  const lineaInicio = fuente.slice(0, inicioMapa).split(/\r?\n/).length
  const lineaFin = fuente.slice(0, finMapa).split(/\r?\n/).length
  const llamadasSueltas = []
  fuente.split(/\r?\n/).forEach((linea, idx) => {
    const numero = idx + 1
    if (numero >= lineaInicio && numero <= lineaFin) return
    const limpia = linea
      .replace(/\/\/.*$/, '')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
    for (const nombre of cargados) {
      if (new RegExp(`(?<![.\\w$])${nombre.replace(/[^\w$]/g, '')}\\s*\\(`).test(limpia)) {
        llamadasSueltas.push(`${nombre} (linea ${numero})`)
      }
    }
  })
  if (!llamadasSueltas.length) ok('ningun comando se llama fuera del registro')
  else mal('comandos llamados sin C.<nombre>', llamadasSueltas.join(', '))

  // ───────────── 4. Alias del menu ─────────────
  seccion('Alias')
  const registro = new Set(claves)
  const rotos = Object.entries(NOMBRES_CORTOS).filter(([largo, corto]) => !registro.has(largo) || !registro.has(corto))
  if (!rotos.length) ok(`${Object.keys(NOMBRES_CORTOS).length} alias del menu existen en el registro`)
  else mal('alias que apuntan a comandos no registrados', rotos.map(([a, b]) => `${a}->${b}`).join(', '))

  // ───────────── 5. Categorias del menu ─────────────
  seccion('Menu')
  const huerfanos = []
  for (const categoria of CATEGORIAS) {
    for (const nombre of categoria.comandos) {
      if (!registro.has(nombre)) huerfanos.push(`${categoria.id}:${nombre}`)
    }
  }
  if (!huerfanos.length) ok(`${CATEGORIAS.length} categorias apuntan a comandos existentes`)
  else mal('comandos del menu que no existen en el registro', huerfanos.join(', '))

  // La ficha del .gacha en el menu: alias .gc real y descripcion clara
  const indiceFuente = leer('index.js')
  if (/(^|\n)\s*gc:\s*C\.gacha,/.test(indiceFuente)) {
    ok('el menu: .gc es alias real de .gacha (no solo la tirada)')
  } else {
    mal('.gc no apunta al gacha completo', 'index.js deberia tener "gc: C.gacha"')
  }

  const descGacha = String(DESCRIPCIONES.gacha || '')
  if (descGacha && !descGacha.includes('/') && /gacha|cartas/i.test(descGacha)) {
    ok(`descripcion del gacha en el menu: "${descGacha}"`)
  } else {
    mal('la descripcion del .gacha es confusa o trae un prefijo fijo', descGacha)
  }

  const usoGacha = String(USOS.gacha || '')
  if (usoGacha.includes('help') && usoGacha.split('|').length <= 10) {
    ok(`usos del .gacha legibles: ${usoGacha}`)
  } else {
    mal('los usos del .gacha son demasiado largos o no listan help', usoGacha)
  }

  // Registro minimo: .gacha y su alias .gc, tal y como los ve el menu
  const regGacha = { gacha: () => {}, gc: () => {} }
  const menuGacha = menuDeCategoria(regGacha, '.', 'gacha') || ''
  const lineasGacha = menuGacha.split('\n')
  const posLinea = lineasGacha.findIndex((l) => l.includes('`.gacha`'))
  const lineaGacha = posLinea >= 0 ? lineasGacha[posLinea] : ''
  const descGachaMenu = posLinea >= 0 ? lineasGacha[posLinea + 1] || '' : ''
  if (lineaGacha.includes('`.gc`') && descGachaMenu.includes(descGacha)) {
    ok('el menu gacha muestra .gacha y .gc con la descripcion nueva')
  } else {
    mal('el menu gacha no muestra .gacha/.gc con la descripcion nueva', `${lineaGacha} | ${descGachaMenu}`)
  }
  // ───────────── 6. Tamano de los bloques del menu ─────────────
  const falsos = {}
  for (const clave of registro) falsos[clave] = () => {}
  const bloques = dividirMenu(falsos, '/')
  const largos = bloques.filter((b) => b.length > 4096)
  if (!largos.length) ok(`el menu se parte en ${bloques.length} bloque(s) de <= 4096 caracteres`)
  else mal(`hay ${largos.length} bloque(s) de menu demasiado largos (max ${Math.max(...largos.map((b) => b.length))})`)
}

// ───────────── 6b. Menu principal en un solo mensaje ─────────────
seccion('Menu principal')
{
  const menuFuente3 = leer('commands/menu.js')
  const configFuente3 = leer('config.js')
  const indiceFuente3 = leer('index.js')

  // Los botones viven en lib/botones.js: el menu los pide prestados en lugar
  // de armar nativeFlow por su cuenta, asi hay un solo lugar que los dibuja.
  const prohibido = ['relayMessage', 'interactiveMessage', 'nativeFlowMessage', 'quick_reply']
  const sobra = prohibido.filter((x) => menuFuente3.includes(x))
  if (!sobra.length) ok('el menu no arma nativeFlow a mano: pide los botones al modulo')
  else mal('menu.js arma mensajes interactivos por su cuenta', sobra.join(', '))

  if (!configFuente3.includes('MENU_CON_BOTON') && !configFuente3.includes('MENU_CON_LISTA')) {
    ok('no quedan interruptores de menu con botones en config.js')
  } else {
    mal('config.js conserva MENU_CON_BOTON / MENU_CON_LISTA')
  }

  if (fs.existsSync(path.join(RAIZ, 'lib/botones.js')) && indiceFuente3.includes('lib/botones.js')) {
    ok('el modulo de botones existe y el despachador lo engancha')
  } else {
    mal('falta lib/botones.js o su enganche en index.js')
  }

  if (
    menuFuente3.includes('menuPrincipal(commands, prefijo)') &&
    menuFuente3.includes('image: banner.buffer, caption: primera') &&
    menuFuente3.includes('if (banner) {')
  ) {
    ok('el banner lleva el indice completo como pie de foto (1 mensaje)')
  } else {
    mal('el menu principal ya no manda el indice en el pie del banner')
  }

  if (!menuFuente3.includes('sock.relayMessage(') && menuFuente3.includes('sock.sendMessage(jid, { image:')) {
    ok('el menu sale por sendMessage (visible), no por relay')
  } else {
    mal('el menu no usa sendMessage para la imagen')
  }

  if (!/quiereIndice/.test(menuFuente3) || /todos\|all\|completo\|full\|indice/.test(menuFuente3)) {
    ok('el indice completo sigue accesible con .menu (y .menu todos)')
  } else {
    mal('.menu todos quedo roto')
  }
}

// ───────────── 7. Base de datos ─────────────
seccion('Base de datos')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-test-'))
try {
  const script = path.join(tmp, 'db-check.mjs')
  const urlDb = pathToFileURL(path.join(RAIZ, 'database', 'db.js')).href
  fs.writeFileSync(
    script,
    `import { db } from ${JSON.stringify(urlDb)}\n` +
      `const tablas = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get()\n` +
      `console.log(JSON.stringify({ tablas: Number(tablas.n) }))\n` +
      `db.close()\n`
  )
  const r = spawnSync(process.execPath, [script], { cwd: tmp, encoding: 'utf8' })
  const salida = (r.stdout || '').trim().split('\n').pop()
  let datos = null
  try { datos = JSON.parse(salida) } catch { /* salida invalida */ }

  if (r.status !== 0 || !datos) {
    mal('no se pudo abrir la base de datos', (r.stderr || '').trim().split('\n').slice(0, 3).join('\n   '))
  } else if (datos.tablas < 40) {
    mal(`esquema incompleto: ${datos.tablas} tablas`)
  } else {
    ok(`esquema creado (${datos.tablas} tablas) en carpeta temporal`)
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ───────────── 8. Club VIP (funcional, base temporal) ─────────────
seccion('Club VIP')
const tmpVip = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-vip-'))
try {
  const url = (rel) => pathToFileURL(path.join(RAIZ, rel)).href
  const script = path.join(tmpVip, 'vip-check.mjs')
  fs.writeFileSync(
    script,
    `import { db } from ${JSON.stringify(url('database/db.js'))}\n` +
      `import { registrarVip, quitarVip, esVip, jidsDe, listarVip } from ${JSON.stringify(url('lib/vip.js'))}\n` +
      `import { asegurarOwnerVip, OWNER_NUM } from ${JSON.stringify(url('lib/owner.js'))}\n` +
      `const PN = '5215512345678@s.whatsapp.net'\n` +
      `const LID = '15939412181175@lid'\n` +
      `const alta = registrarVip([PN, LID], 'test')\n` +
      `const sock = { user: { id: OWNER_NUM + ':5@s.whatsapp.net' } }\n` +
      `const jids = jidsDe({ msg: { key: { remoteJid: '1@g.us', participant: LID, participantPn: PN } }, sender: LID })\n` +
      `const owner = asegurarOwnerVip(db, { msg: { key: { remoteJid: '1@g.us', participant: '999@lid', fromMe: true } }, sender: '999@lid', sock })\n` +
      `const intruso = asegurarOwnerVip(db, { msg: { key: { remoteJid: '1@g.us', participant: '888@lid' } }, sender: '888@lid', sock })\n` +
      `const filaOwner = db.prepare('SELECT rango FROM vip WHERE jid = ?').get(OWNER_NUM + '@s.whatsapp.net')\n` +
      `const nulos = db.prepare("SELECT COUNT(*) n FROM vip WHERE jid IS NULL OR jid = ''").get().n\n` +
      `const lista = listarVip()\n` +
      `const reconocidos = [PN, LID, '15939412181175:3@lid', '+5215512345678@s.whatsapp.net'].every((j) => esVip([j]))\n` +
      `const baja = quitarVip([PN, LID])\n` +
      `console.log(JSON.stringify({\n` +
      `  nuevos: alta.nuevos,\n` +
      `  jidsDe: jids.includes(PN) && jids.includes(LID),\n` +
      `  reconocidos,\n` +
      `  owner: owner.jids.length > 0 && filaOwner?.rango === 'owner',\n` +
      `  intruso: intruso.jids.length === 0,\n` +
      `  nulos: Number(nulos),\n` +
      `  unaVez: lista.filter((f) => f.rango === 'owner').length === 1,\n` +
      `  baja: baja === 2 && !esVip([PN]) && !esVip([LID]),\n` +
      `}))\n` +
      `db.close()\n`
  )
  const r = spawnSync(process.execPath, [script], { cwd: tmpVip, encoding: 'utf8' })
  const salida = (r.stdout || '').trim().split('\n').pop()
  let datos = null
  try { datos = JSON.parse(salida) } catch { /* salida invalida */ }

  if (r.status !== 0 || !datos) {
    mal('no se pudo probar el club VIP', (r.stderr || '').trim().split('\n').slice(0, 3).join('\n   '))
  } else {
    if (datos.nuevos === 2) ok('VIP: el alta guarda telefono y LID')
    else mal('VIP: el alta no guardo los 2 JIDs', `nuevos=${datos.nuevos}`)

    if (datos.jidsDe && datos.reconocidos) ok('VIP: acceso reconocido por PN, LID y sufijo de dispositivo')
    else mal('VIP: no reconoce algun formato de JID', JSON.stringify(datos))

    if (datos.owner && datos.intruso) ok('VIP: el owner entra como owner y los demas no')
    else mal('VIP: falla la deteccion del owner', JSON.stringify(datos))

    if (datos.nulos === 0 && datos.unaVez) ok('VIP: sin filas rotas ni duplicados en la lista')
    else mal('VIP: filas rotas o duplicadas', JSON.stringify(datos))

    if (datos.baja) ok('VIP: la baja quita el acceso en todos los formatos')
    else mal('VIP: la baja no revoca el acceso', JSON.stringify(datos))
  }
} finally {
  fs.rmSync(tmpVip, { recursive: true, force: true })
}

// ───────────── 9. Imagen de carta (.setcardimage) ─────────────
seccion('Imágenes de carta')
const tmpCarta = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-carta-'))
try {
  const url = (rel) => pathToFileURL(path.join(RAIZ, rel)).href
  const script = path.join(tmpCarta, 'carta-check.mjs')
  fs.writeFileSync(
    script,
    `import fs from 'node:fs'\n` +
      `import { db } from ${JSON.stringify(url('database/db.js'))}\n` +
      `import { buscarPersonaje } from ${JSON.stringify(url('commands/setcardimage.js'))}\n` +
      `import { guardarImagenPersonaje, obtenerImagenPersonaje, rutaImagenCustom } from ${JSON.stringify(url('lib/imagenes.js'))}\n` +
      `const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQ0AAGXxAgHk0o1vAAAAAElFTkSuQmCC', 'base64')\n` +
      `db.prepare("INSERT INTO gacha_personajes (nombre, anime, rareza, valor) VALUES ('Gojo Satoru','Jujutsu Kaisen','legendario',100)").run()\n` +
      `const p = db.prepare("SELECT * FROM gacha_personajes WHERE nombre = 'Gojo Satoru'").get()\n` +
      `const encontrado = buscarPersonaje('gojo')?.id === p.id\n` +
      `await guardarImagenPersonaje(p, PNG)\n` +
      `const ruta = rutaImagenCustom(p)\n` +
      `const guardado = fs.existsSync(ruta)\n` +
      `const enDb = db.prepare('SELECT imagen FROM gacha_personajes WHERE id = ?').get(p.id)?.imagen === ruta\n` +
      `const bytes = await obtenerImagenPersonaje({ ...p, imagen: 'https://no-existe.invalid/x.jpg' })\n` +
      `const jpeg = bytes?.slice(0, 3).toString('hex') === 'ffd8ff'\n` +
      `console.log(JSON.stringify({ encontrado, guardado, enDb, jpeg }))\n` +
      `db.close()\n`
  )
  const r = spawnSync(process.execPath, [script], { cwd: tmpCarta, encoding: 'utf8' })
  const salida = (r.stdout || '').trim().split('\n').pop()
  let datos = null
  try { datos = JSON.parse(salida) } catch { /* salida invalida */ }

  if (r.status !== 0 || !datos) {
    mal('no se pudo probar .setcardimage', (r.stderr || '').trim().split('\n').slice(0, 3).join('\n   '))
  } else {
    if (datos.encontrado) ok('setcardimage: encuentra personajes por nombre parcial')
    else mal('setcardimage: no resuelve el nombre parcial')

    if (datos.guardado && datos.enDb) ok('setcardimage: guarda la imagen y la registra en la base')
    else mal('setcardimage: no guarda la imagen', JSON.stringify(datos))

    if (datos.jpeg) ok('setcardimage: la imagen guardada se usa antes que la URL vieja')
    else mal('setcardimage: la imagen guardada no tiene prioridad', JSON.stringify(datos))
  }
} finally {
  fs.rmSync(tmpCarta, { recursive: true, force: true })
}

// ───────────── 10. Interacciones (GIF, no sticker) ─────────────
seccion('Interacciones')
{
  const cmd = leer('commands/interaccion.js')
  const lib = leer('lib/interacciones.js')
  const usaGif = /gifPlayback:\s*true/.test(cmd) && /gifDeInteraccion/.test(cmd)
  const sinSticker = !/enviarSticker|stickerDeInteraccion/.test(cmd + lib)
  const exporta = /export\s+async\s+function\s+gifDeInteraccion/.test(lib)

  if (usaGif && sinSticker && exporta) ok('las interacciones responden con GIF (gifPlayback), no con sticker')
  else mal('las interacciones no usan GIF', [!usaGif && 'falta gifPlayback', !sinSticker && 'sigue usando stickers', !exporta && 'falta gifDeInteraccion'].filter(Boolean).join(', '))

  // Un solo mensaje: la frase va de pie de foto del GIF, con las menciones
  // adentro. Antes salian dos (texto + GIF) y quedaba feo en el chat.
  const gifConFrase = /gifPlayback:\s*true,[\s\S]{0,200}?caption:\s*frase,[\s\S]{0,120}?mentions:\s*\[quien,\s*objetivoJid\]/.test(cmd)
  if (gifConFrase) {
    ok('la interaccion sale en un solo mensaje: GIF con la frase de pie y las menciones')
  } else {
    mal('la interaccion sigue partida en frase + GIF, o el GIF va sin menciones')
  }

  const nsfwCmd = leer('commands/nsfw-interaccion.js')
  const nsfwSingle = /caption:\s*frase,[\s\S]{0,120}?mentions,/.test(nsfwCmd)
  const nsfwAnimadas =
    /const FUENTES_ANIMADAS = \[[^\]]*gelbooru/.test(nsfwCmd) &&
    /ANIMADAS\.includes\(p\.extension\)/.test(nsfwCmd) &&
    /coincide\(p, tags\)/.test(nsfwCmd)
  if (nsfwSingle) {
    ok('las acciones NSFW contestan con la frase de pie de foto y las menciones adentro')
  } else {
    mal('las acciones NSFW siguen mandando la frase aparte del media')
  }
  if (nsfwAnimadas) {
    ok('las acciones NSFW buscan el tag animado en los boorus que sirven GIF y exigen que el tag coincida')
  } else {
    mal('las acciones NSFW no buscan el tag animado o no verifican el tag del post')
  }
}

// ───────────── 11. Retratos de alta calidad ─────────────
seccion('Retratos del gacha')
{
  const gojo = {
    url: 'https://static.wikia.nocookie.net/jujutsu-kaisen/images/e/ef/Satoru_Gojo.png',
    titulo: 'Satoru Gojo | Jujutsu Kaisen Wiki | Fandom',
    ancho: 1200,
    alto: 1800,
  }
  const bueno = puntuarRetrato('Satoru Gojo', 'Jujutsu Kaisen', gojo)
  const cosplay = puntuarRetrato('Satoru Gojo', 'Jujutsu Kaisen', { ...gojo, titulo: 'Satoru Gojo cosplay Jujutsu Kaisen' })
  const miniatura = puntuarRetrato('Satoru Gojo', 'Jujutsu Kaisen', { ...gojo, ancho: 230, alto: 345 })
  const otro = puntuarRetrato('Satoru Gojo', 'Jujutsu Kaisen', { ...gojo, titulo: 'Naruto Uzumaki', url: 'https://x.test/naruto.png' })

  if (bueno > 100) ok('retratos: la imagen oficial grande puntua alto')
  else mal('retratos: no puntua bien el arte oficial', String(bueno))

  if (cosplay < bueno - 100) ok('retratos: descarta cosplay y figuras')
  else mal('retratos: acepta cosplay', `${cosplay} vs ${bueno}`)

  if (miniatura === -Infinity) ok('retratos: descarta miniaturas de menos de 500 px')
  else mal('retratos: acepta miniaturas', String(miniatura))

  if (otro === -Infinity) ok('retratos: exige el nombre del personaje')
  else mal('retratos: acepta imagenes de otro personaje', String(otro))

  const slugs = candidatosWiki('Shingeki no Kyojin: The Final Season')
  if (slugs.includes('attackontitan')) ok('retratos: reconoce el wiki de Shingeki no Kyojin')
  else mal('retratos: no reconoce el wiki de Shingeki no Kyojin', slugs.join(', '))

  const temporada = candidatosWiki('Jujutsu Kaisen 2nd Season')
  if (temporada.includes('jujutsu-kaisen')) ok('retratos: quita el sufijo de temporada del anime')
  else mal('retratos: no limpia la temporada', temporada.join(', '))

  if (retratoAceptable(400, 400) && retratoAceptable(287, 911) && !retratoAceptable(230, 345)) {
    ok('retratos: acepta 400x400 y cuerpos enteros, rechaza miniaturas de AniList')
  } else {
    mal('retratos: umbral de calidad mal ajustado')
  }

  const fuente = leer('lib/imagenes.js')
  const posAlta = fuente.indexOf('buscarRetrato(')
  const posUrl = fuente.indexOf('// 2) URL guardada')
  if (posAlta > 0 && posUrl > 0 && posAlta < posUrl) ok('retratos: se intentan antes que la URL vieja de AniList')
  else mal('retratos: la URL vieja se usa antes que el retrato grande', `alta=${posAlta} url=${posUrl}`)

  if (fs.existsSync(path.join(RAIZ, 'scripts/refrescar-cartas.mjs'))) ok('retratos: existe el script de refresco (npm run cartas)')
  else mal('retratos: falta scripts/refrescar-cartas.mjs')
}

// ───────────── 12. Series del gacha ─────────────
seccion('Series del gacha')
{
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-series-'))
  const script = path.join(carpeta, 'series-check.mjs')
  const urlDb = pathToFileURL(path.join(RAIZ, 'database', 'db.js')).href
  const urlGacha = pathToFileURL(path.join(RAIZ, 'commands', 'gacha.js')).href

  fs.writeFileSync(
    script,
    `import { db, listarAnimesGacha } from ${JSON.stringify(urlDb)}\n` +
      `import gacha from ${JSON.stringify(urlGacha)}\n` +
      `const ins = db.prepare("INSERT INTO gacha_personajes (nombre, anime, rareza, valor) VALUES (?,?,?,?)")\n` +
      `for (let i = 1; i <= 35; i++) ins.run('PJ ' + i, 'Serie ' + String(i).padStart(2, '0'), 'comun', 15)\n` +
      `ins.run('Luffy', 'One Piece', 'mitico', 600)\n` +
      `ins.run('Zoro', 'One Piece', 'mitico', 600)\n` +
      `ins.run('Nami', 'One Piece', 'raro', 40)\n` +
      `ins.run('Ace', 'ONE PIECE', 'comun', 15)\n` +
      `ins.run('Gojo', 'Jujutsu Kaisen', 'legendario', 250)\n` +
      `ins.run('Yuji', 'Jujutsu Kaisen', 'epico', 100)\n` +
      `ins.run('Naruto', 'Naruto', 'raro', 40)\n` +
      `ins.run('Sasuke', 'Naruto Shippuden', 'epico', 100)\n` +
      `const series = listarAnimesGacha()\n` +
      `const mensajes = []\n` +
      `const sock = { sendMessage: async (j, m) => { mensajes.push(m.text || '') } }\n` +
      `let n = 0\n` +
      `const correr = async (args) => { await gacha({ sock, jid: 'g@g.us', msg: {}, args, sender: 'u' + (++n) + '@s.whatsapp.net' }); return mensajes[mensajes.length - 1] || '' }\n` +
      `const lista1 = await correr(['serielist'])\n` +
      `const lista2 = await correr(['serielist', '2'])\n` +
      `const infoExacta = await correr(['serieinfo', 'One Piece'])\n` +
      `const infoAmbigua = await correr(['serieinfo', 'Serie'])\n` +
      `const infoNaruto = await correr(['serieinfo', 'naruto'])\n` +
      `const infoNada = await correr(['serieinfo', 'zzzz'])\n` +
      `console.log(JSON.stringify({ series, lista1, lista2, infoExacta, infoAmbigua, infoNaruto, infoNada }))\n` +
      `db.close()\n`
  )

  const r = spawnSync(process.execPath, [script], {
    cwd: carpeta,
    encoding: 'utf8',
    env: { ...process.env, BEERUS_GACHA_LOCAL: '1' }, // series desde el catalogo local, sin red
  })
  const salida = (r.stdout || '').trim().split('\n').pop()
  let datos = null
  try { datos = JSON.parse(salida) } catch { /* salida invalida */ }

  if (r.status !== 0 || !datos) {
    mal('no se pudo probar .serielist / .serieinfo', (r.stderr || '').trim().split('\n').slice(0, 4).join('\n   '))
  } else {
    const series = datos.series || []
    const bienFormadas = series.every((s) => typeof s.anime === 'string' && Number.isFinite(s.personajes))
    const onePiece = series.find((s) => s.anime.toLowerCase() === 'one piece')
    const suma = series.reduce((a, s) => a + (s.personajes || 0), 0)

    if (bienFormadas && onePiece?.personajes === 4 && suma === 43) {
      ok(`las series se cuentan bien (${series.length} series, ${suma} personajes)`)
    } else {
      mal('listarAnimesGacha no devuelve anime + personajes', `${series.length} series, suma ${suma}, onePiece=${onePiece?.personajes}`)
    }

    if (series[0]?.personajes === 4 && series[0]?.anime === 'One Piece') {
      ok('las series salen ordenadas por cantidad de personajes')
    } else {
      mal('las series no salen ordenadas por cantidad', series.slice(0, 3).map((s) => `${s.anime}:${s.personajes}`).join(', '))
    }

    if (/Series del catálogo/.test(datos.lista1) && datos.lista1.includes('1-30 de 39') && datos.lista1.includes('`.serielist 2`')) {
      ok('.serielist pagina el catalogo (1-30 de 39)')
    } else {
      mal('.serielist no pagina o no avisa la siguiente pagina', datos.lista1.slice(0, 160))
    }

    if (
      datos.lista1.length <= 4096 &&
      !datos.lista1.includes('undefined') &&
      !datos.lista2.includes('undefined') &&
      datos.lista2.includes('31-39 de 39') &&
      datos.lista2 !== datos.lista1
    ) {
      ok('.serielist pagina 2 trae el resto sin desbordar WhatsApp')
    } else {
      mal('.serielist pagina mal o repite la pagina 1', `${datos.lista1.length} chars | ${datos.lista2.slice(0, 80)}`)
    }

    if (
      datos.infoExacta.includes('One Piece') &&
      datos.infoExacta.includes('4 personajes') &&
      ['Luffy', 'Zoro', 'Nami', 'Ace'].every((n) => datos.infoExacta.includes(n))
    ) {
      ok('.serieinfo lista los personajes de la serie exacta')
    } else {
      mal('.serieinfo no lista los personajes', datos.infoExacta.slice(0, 200))
    }

    if (datos.infoAmbigua.includes('coincide con 35 series') && datos.infoAmbigua.includes('Serie 01')) {
      ok('.serieinfo pide precision cuando hay varias coincidencias')
    } else {
      mal('.serieinfo no avisa de coincidencias multiples', datos.infoAmbigua.slice(0, 160))
    }

    if (datos.infoNaruto.includes('Naruto') && datos.infoNaruto.includes('1 personaje')) {
      ok('.serieinfo encuentra la serie sin importar mayusculas')
    } else {
      mal('.serieinfo falla al buscar en minusculas', datos.infoNaruto.slice(0, 160))
    }

    if (datos.infoNada.includes('No encontré la serie')) {
      ok('.serieinfo avisa cuando la serie no existe')
    } else {
      mal('.serieinfo no avisa de serie inexistente', datos.infoNada.slice(0, 120))
    }

    if (datos.lista1.length && datos.infoExacta.length && datos.lista1.length <= 4096 && datos.infoExacta.length <= 4096) {
      ok('los mensajes de series caben en WhatsApp')
    } else {
      mal('mensajes de series demasiado largos', `${datos.lista1.length} / ${datos.infoExacta.length}`)
    }
  }

  try { fs.rmSync(carpeta, { recursive: true, force: true }) } catch { /* temporal */ }
}

// ───────────── 11b. Series desde AniList ─────────────
seccion('Series en internet')
{
  const anilist = await import('./lib/anilist.js')

  // La rareza ya no es una franja de favoritos: pesa tambien la serie y el
  // lugar del personaje en su reparto.
  const componentes =
    Math.round(anilist.popularidadDelPersonaje(1000) * 10) / 10 === 60 &&
    Math.round(anilist.popularidadDeLaSerie(100000) * 10) / 10 === 60 &&
    anilist.importanciaEnLaSerie(500, 1000) === 50 &&
    anilist.importanciaEnLaSerie(1000, 1000) === 100 &&
    Math.abs(
      (anilist.PESOS_RAREZA.personaje + anilist.PESOS_RAREZA.serie + anilist.PESOS_RAREZA.importancia) - 1,
    ) < 1e-9
  if (componentes) {
    ok('el score mezcla popularidad del personaje, popularidad de la serie e importancia (pesos suman 1)')
  } else {
    mal('los componentes del score de rareza no miden lo que dicen')
  }

  // Mismo personaje, misma serie: el que manda en el reparto sube de banda.
  const lider = anilist.calcularRarezaScore({
    favoritos: 9000,
    media: { popularity: 200000 },
    serieMaximo: 9000,
  })
  const extra = anilist.calcularRarezaScore({
    favoritos: 900,
    media: { popularity: 200000 },
    serieMaximo: 9000,
  })
  if (lider > extra && anilist.rarezaDesdeScore(lider) !== anilist.rarezaDesdeScore(extra)) {
    ok('un protagonista supera a un secundario de su misma serie con menos favoritos')
  } else {
    mal('la importancia dentro de la serie no mueve la rareza', `${lider} vs ${extra}`)
  }

  // Mismos favoritos, series distintas: pesa la popularidad de la serie.
  const serieGrande = anilist.calcularRarezaScore({
    favoritos: 3000,
    media: { popularity: 700000 },
    serieMaximo: 3000,
  })
  const serieChica = anilist.calcularRarezaScore({
    favoritos: 3000,
    media: { popularity: 1200 },
    serieMaximo: 3000,
  })
  if (serieGrande > serieChica) {
    ok('entre dos personajes igual de queridos gana el de la serie mas popular')
  } else {
    mal('la popularidad de la serie no influye en la rareza', `${serieGrande} vs ${serieChica}`)
  }

  const bandas = [
    [60, 'comun'],
    [61, 'raro'],
    [70, 'raro'],
    [71, 'epico'],
    [78, 'epico'],
    [79, 'legendario'],
    [84, 'legendario'],
    [85, 'mitico'],
    [100, 'mitico'],
  ]
  const malas = bandas.filter(([score, esperada]) => anilist.rarezaDesdeScore(score) !== esperada)
  if (!malas.length) {
    ok('la rareza sale de los cortes del score compuesto')
  } else {
    mal('bandas de rareza mal calculadas', malas.map(([s]) => `${s}->${anilist.rarezaDesdeScore(s)}`).join(', '))
  }

  const serie = anilist.serieDeMedia({
    id: 16498,
    idMal: 16498,
    title: { romaji: 'Shingeki no Kyojin' },
    favourites: 80569,
    seasonYear: 2013,
    coverImage: { medium: 'https://img.test/a.jpg' },
  })
  if (
    serie?.titulo === 'Shingeki no Kyojin' &&
    serie.idMal === 16498 &&
    serie.favoritos === 80569 &&
    serie.anio === 2013 &&
    serie.imagen === 'https://img.test/a.jpg' &&
    anilist.serieDeMedia(null) === null &&
    anilist.serieDeMedia({ id: 1 }) === null &&
    anilist.serieDeMedia({ id: 2, title: { romaji: 'Sin MAL' } }).idMal === null
  ) {
    ok('la serie se normaliza con titulo, idMal, favoritos, año y portada')
  } else {
    mal('serieDeMedia no normaliza la serie', JSON.stringify(serie))
  }

  const pj = anilist.personajeDeNodo(
    {
      name: { full: 'Levi' },
      image: { large: 'https://img.test/levi.jpg' },
      gender: 'Male',
      favourites: 38845,
      media: { nodes: [{ meanScore: 85, popularity: 350000, seasonYear: 2013 }] },
    },
    { serieMaximo: 38845 },
  )
  if (
    pj?.nombre === 'Levi' &&
    pj.rareza === 'mitico' &&
    pj.genero === 'M' &&
    pj.imagen === 'https://img.test/levi.jpg' &&
    anilist.personajeDeNodo({}) === null
  ) {
    ok('el personaje se normaliza con rareza y genero')
  } else {
    mal('personajeDeNodo no normaliza el personaje', JSON.stringify(pj))
  }

  if (anilist.SERIES_POR_PAGINA === 30 && anilist.PERSONAJES_POR_SERIE === 30) {
    ok('las paginas del listado caben en WhatsApp (30 + 30)')
  } else {
    mal('tamaños de pagina raros', `${anilist.SERIES_POR_PAGINA} / ${anilist.PERSONAJES_POR_SERIE}`)
  }

  const gachaFuente = leer('commands/gacha.js')
  if (
    gachaFuente.includes('listarSeriesInternet(') &&
    gachaFuente.includes('personajesDeSerieInternet(') &&
    gachaFuente.includes('completarPersonajesSeries(') &&
    gachaFuente.includes('listarAnimesGacha()') &&
    /serielist[\s\S]{0,1600}listarSeriesInternet\(/.test(gachaFuente) &&
    /serielist[\s\S]{0,2000}completarPersonajesSeries\(/.test(gachaFuente) &&
    /serieinfo[\s\S]{0,1600}personajesDeSerieInternet\(/.test(gachaFuente) &&
    /s\.personajes/.test(gachaFuente)
  ) {
    ok('.serielist y .serieinfo tiran de AniList, cuentan personajes y guardan el catalogo local de respaldo')
  } else {
    mal('gacha.js no consulta AniList en los listados o perdio el respaldo local')
  }

  const antes = process.env.BEERUS_GACHA_LOCAL
  process.env.BEERUS_GACHA_LOCAL = '1'
  const apagada = anilist.internetApagada()
  if (antes === undefined) delete process.env.BEERUS_GACHA_LOCAL
  else process.env.BEERUS_GACHA_LOCAL = antes

  if (apagada) ok('BEERUS_GACHA_LOCAL=1 apaga la red (pruebas y modo sin internet)')
  else mal('BEERUS_GACHA_LOCAL no apaga las consultas a internet')

  const internet = await import('./lib/gacha-internet.js')
  process.env.BEERUS_GACHA_LOCAL = '1'
  try {
    if ((await internet.contarPersonajesSerie(0)) === null) {
      ok('sin idMal no se pide el conteo de personajes')
    } else {
      mal('contarPersonajesSerie(0) deberia devolver null')
    }

    const series = [
      { id: 1, idMal: 16498, titulo: 'Shingeki no Kyojin' },
      { id: 2, idMal: null, titulo: 'Sin idMal' },
    ]
    const devueltas = await internet.completarPersonajesSeries(series)
    if (
      devueltas === series &&
      series.every((s) => !('personajes' in s))
    ) {
      ok('sin internet el conteo no se inventa ni toca las series')
    } else {
      mal('completarPersonajesSeries toco las series sin internet', JSON.stringify(series))
    }
  } finally {
    if (antes === undefined) delete process.env.BEERUS_GACHA_LOCAL
    else process.env.BEERUS_GACHA_LOCAL = antes
  }
}

// ───────────── 11c. Rarezas coherentes del gacha ─────────────
seccion('Rarezas del gacha')
{
  const anilist = await import('./lib/anilist.js')
  const internet = await import('./lib/gacha-internet.js')

  const rangos = internet.PAGINAS_POR_RAREZA || {}
  const esperadas = ['comun', 'raro', 'epico', 'legendario', 'mitico']
  const faltan = esperadas.filter((r) => !Array.isArray(rangos[r]))
  const malos = esperadas.filter((r) => {
    const [a, b] = rangos[r] || []
    return !(a >= 1 && b <= 100 && a <= b)
  })
  if (!faltan.length && !malos.length) {
    ok('cada rareza tiene su rango de paginas dentro del tope de AniList (100)')
  } else {
    mal('rangos de paginas invalidos', [...faltan, ...malos].join(', '))
  }

  if (
    Array.isArray(internet.PAGINAS_TIRADA_LIBRE) &&
    internet.PAGINAS_TIRADA_LIBRE[0] === 1 &&
    internet.PAGINAS_TIRADA_LIBRE[1] === 100
  ) {
    ok('la tirada libre recorre todo el catalogo de AniList')
  } else {
    mal('PAGINAS_TIRADA_LIBRE mal definido', JSON.stringify(internet.PAGINAS_TIRADA_LIBRE))
  }

  const fuente = leer('lib/gacha-internet.js')
  if (
    fuente.includes('calcularRarezaScore(') &&
    fuente.includes('rarezaDesdeScore(') &&
    /meanScore|popularity|seasonYear/.test(fuente) &&
    !fuente.includes('RANGOS_POR_RAREZA') &&
    !fuente.includes('enBanda(')
  ) {
    ok('la tirada usa el score compuesto de rareza con datos de AniList')
  } else {
    mal('la tirada no usa el score compuesto o conserva bandas solapadas')
  }

  if (
    fuente.includes('characters(search: $search, sort: SEARCH_MATCH)') &&
    fuente.includes('elegirCandidato(') &&
    fuente.includes('nombreParaAniList(') &&
    fuente.includes('buscarEnAniList(fila.nombre, fila.anime)')
  ) {
    ok('la busqueda por nombre usa candidatos de AniList y desempata con la serie')
  } else {
    mal('la busqueda por nombre no usa Page.characters o no pasa la serie')
  }

  if (
    anilist.nombreParaAniList('Darwis') === 'Darkness' &&
    anilist.nombreParaAniList('Rocksmith') === 'Xebec Rocks' &&
    anilist.nombreParaAniList('Whitebeard') === 'Newgate Edward' &&
    anilist.nombreParaAniList('Levi') === 'Levi' &&
    anilist.FIJOS_ANILIST?.kaido === 46109
  ) {
    ok('los alias y las fichas fijas del catalogo se traducen al nombre real de AniList')
  } else {
    mal('los alias de AniList no se aplican', JSON.stringify(anilist.ALIAS_ANILIST))
  }

  const terminos = anilist.terminosDeBusqueda('Monkey D. Luffy') || []
  if (
    terminos[0] === 'Monkey D. Luffy' &&
    terminos.includes('luffy') &&
    terminos.includes('monkey') &&
    anilist.terminosDeBusqueda('Darwis')[0] === 'Darkness' &&
    anilist.terminosDeBusqueda('L')[0] === 'L Lawliet'
  ) {
    ok('la busqueda prueba el nombre completo y luego sus palabras')
  } else {
    mal('terminosDeBusqueda no genera las variantes', JSON.stringify(terminos))
  }

  const sukuna = anilist.elegirCandidato(
    'Ryomen Sukuna',
    [
      { nombre: 'Sukuna', favoritos: 11929, animes: ['Jujutsu Kaisen'] },
      { nombre: 'Sukuna Gojou', favoritos: 41, animes: ['Otro anime'] },
      { nombre: 'Yuuji Itadori', favoritos: 21238, animes: ['Jujutsu Kaisen'] },
    ],
    'Jujutsu Kaisen',
  )
  const lelouch = anilist.elegirCandidato(
    'Lelouch vi Britannia',
    [{ nombre: 'Lelouch Lamperouge', favoritos: 28242, animes: ['Code Geass: Hangyaku no Lelouch'] }],
    'Code Geass',
  )
  const patrick = anilist.elegirCandidato(
    'Patrick Star',
    [{ nombre: 'Patrick Ashbatten', favoritos: 182, animes: ['Akuyaku Reijou Level 99'] }],
    'SpongeBob',
  )
  const ezio = anilist.elegirCandidato(
    'Ezio Auditore',
    [{ nombre: 'Chloe Auditore', favoritos: 16, animes: [] }],
    'Assassins Creed',
  )
  if (
    sukuna?.candidato?.nombre === 'Sukuna' &&
    lelouch?.candidato?.nombre === 'Lelouch Lamperouge' &&
    patrick === null &&
    ezio === null &&
    anilist.puntuarCandidato('Sukuna', { nombre: 'Sukuna' }) === 100
  ) {
    ok('elegirCandidato resuelve Ryomen Sukuna y Lelouch y rechaza homonimos de otra serie')
  } else {
    mal(
      'elegirCandidato empareja mal',
      JSON.stringify({ sukuna, lelouch, patrick, ezio }),
    )
  }

  const gachaFuente = leer('commands/gacha.js')
  const desde = gachaFuente.indexOf("sub === 'random'")
  const hasta = gachaFuente.indexOf("sub === 'video'")
  const bloque = desde >= 0 && hasta > desde ? gachaFuente.slice(desde, hasta) : ''
  const tirada = bloque.indexOf('tirarDeInternet(rarezaBuscada)')
  if (
    tirada >= 0 &&
    tirada < bloque.indexOf('listarPersonajesGacha()') &&
    /if \(!personaje && !filtro\) personaje = await tirarDeInternet\(\)/.test(bloque)
  ) {
    ok('la tirada intenta internet primero y solo cae al catalogo local si no hay red')
  } else {
    mal('la tirada no prioriza internet o perdio la tirada libre de respaldo')
  }

  // La tirada y las listas tienen que decidir la banda con la MISMA funcion:
  // si la tirada usara una franja de favoritos y las listas el score, la
  // misma carta aparecerraria con dos rarezas distintas.
  const usaMisma =
    /rarezaDesdeScore\(\s*calcularRarezaScore\(/.test(fuente.replace(/\s+/g, ' ')) &&
    !/rarezaDeFavoritos\(/.test(fuente.slice(fuente.indexOf('export async function tirarDeInternet')))
  if (usaMisma) {
    ok('la tirada y las listas deciden la banda con el mismo score')
  } else {
    mal('la tirada puede dar una rareza distinta a la de las listas')
  }

  // Bug que llego a produccion: filaSimilar usaba `distancia` sin importarla,
  // asi que cualquier tirada de un personaje que no estuviera ya en el
  // catalogo moria con ReferenceError. Un import que falta no es error de
  // sintaxis, asi que hay que revisarlo a mano.
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
  const bloqueImport = fuente.slice(0, fuente.indexOf("} from './anilist.js'"))
  const sinImportar = Object.keys(anilist).filter((nombre) => {
    const seUsa = new RegExp(`\\b${nombre}\\s*\\(`).test(sinComentarios)
    const estaImportado = new RegExp(`\\b${nombre}\\b`).test(bloqueImport)
    return seUsa && !estaImportado
  })
  if (!sinImportar.length) {
    ok('gacha-internet importa todo lo que usa de anilist.js')
  } else {
    mal('gacha-internet usa funciones de anilist.js sin importarlas', sinImportar.join(', '))
  }

  const tiradaFuente = fuente.slice(fuente.indexOf('export async function tirarDeInternet'))
  if (
    /async function personajesDePagina\(page\)/.test(fuente) &&
    fuente.includes('CACHE_PAGINAS') &&
    fuente.includes('res.status === 429') &&
    tiradaFuente.includes('personajesDePagina(page)')
  ) {
    ok('las paginas de la tirada se cachean y respetan el 429 de AniList')
  } else {
    mal('la tirada no cachea paginas o no respeta el limite de AniList')
  }

  if (anilist.normalizarNombre('Levi Ackerman!') === 'leviackerman') {
    ok('normalizarNombre deja el nombre comparable')
  } else {
    mal('normalizarNombre no limpia el nombre', anilist.normalizarNombre('Levi Ackerman!'))
  }

  if (
    anilist.claveOrdenada('Monkey D. Luffy') === anilist.claveOrdenada('Luffy Monkey') &&
    anilist.claveOrdenada('Monkey D. Luffy') === 'luffymonkey' &&
    anilist.claveOrdenada('Gojo Satoru') !== anilist.claveOrdenada('Sakura')
  ) {
    ok('claveOrdenada empareja variantes de nombre sin confundir personas')
  } else {
    mal('claveOrdenada no empareja variantes', anilist.claveOrdenada('Monkey D. Luffy'))
  }

  const porOrden = new Map([
    ['bakugoukatsuki', { favoritos: 9000 }],
    ['sakuraharuno', { favoritos: 2899 }],
    ['onepieceluffy', { favoritos: 35999 }],
  ])
  const bakugo = anilist.varianteCercana(anilist.claveOrdenada('Katsuki Bakugo'), porOrden)
  const sakuraCorta = anilist.varianteCercana(anilist.claveOrdenada('Sakura'), porOrden)
  if (bakugo?.favoritos === 9000 && sakuraCorta === null) {
    ok('varianteCercana empareja Bakugo/Bakugou y no confunde Sakura con Sakura Haruno')
  } else {
    mal('varianteCercana no discrimina variantes', JSON.stringify({ bakugo, sakuraCorta }))
  }

  const indice = new Map([
    ['levi', { favoritos: 38845, media: { popularity: 350000 }, serieMaximo: 38845 }],
    ['luffymonkey', { favoritos: 36000, media: { popularity: 700000 }, serieMaximo: 36000 }],
    ['sakura|cardcaptorsakura', { favoritos: 700, media: { popularity: 50000 }, serieMaximo: 700 }],
    ['sakura', { favoritos: 12000, media: { popularity: 90000 }, serieMaximo: 12000 }],
  ])
  const plan = anilist.planRarezas(
    [
      { id: 1, nombre: 'Levi', anime: 'Shingeki no Kyojin', rareza: 'comun', favoritos: 38845, serie_pop: 350000, importancia: 100 },
      { id: 2, nombre: 'Luffy Monkey', anime: 'One Piece', rareza: 'mitico', favoritos: 36000, serie_pop: 700000, importancia: 100 },
      { id: 3, nombre: 'Sakura', anime: 'Cardcaptor Sakura', rareza: 'epico', favoritos: null, serie_pop: 50000, importancia: 100 },
      { id: 4, nombre: 'Nadie', anime: 'Desconocida', rareza: 'comun' },
    ],
    indice,
  )
  const levi = plan.find((p) => p.id === 1)
  const luffy = plan.find((p) => p.id === 2)
  const sakura = plan.find((p) => p.id === 3)
  if (
    plan.length === 3 &&
    levi?.rareza === 'mitico' &&
    levi.cambia === true &&
    luffy?.cambia === false &&
    luffy?.favoritos === 36000 &&
    sakura?.rareza === 'raro' &&
    sakura.cambia === true &&
    sakura?.importancia === 100 &&
    !plan.some((p) => p.id === 4)
  ) {
    ok('planRarezas corrige solo lo que cambia, respeta la serie exacta y empareja variantes')
  } else {
    mal('planRarezas no calcula bien los cambios', JSON.stringify(plan))
  }

  const sincroFuente = fuente.slice(fuente.indexOf('export async function sincronizarRarezas'))
  if (
    sincroFuente.includes('planRarezas(filas, indice, maximos)') &&
    sincroFuente.includes('actualizarRarezaPersonaje(') &&
    sincroFuente.includes('guardarAjuste(CLAVE_SYNC') &&
    sincroFuente.includes('internetApagada()') &&
    sincroFuente.includes('duplicados') &&
    sincroFuente.includes('sinDatos')
  ) {
    ok('la sincronizacion reescribe rareza, valor y favoritos y avisa de duplicados y filas sin datos')
  } else {
    mal('sincronizarRarezas no esta cableada o no respeta el modo sin red')
  }
}

// ───────────── 11d. Sincronizacion de rarezas (DB) ─────────────
seccion('Sincronizacion de rarezas')
{
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-rareza-'))
  const script = path.join(carpeta, 'rareza-check.mjs')
  const urlDb = pathToFileURL(path.join(RAIZ, 'database', 'db.js')).href
  const urlInternet = pathToFileURL(path.join(RAIZ, 'lib', 'gacha-internet.js')).href

  fs.writeFileSync(
    script,
    `import { db, agregarPersonajeGacha, obtenerPersonajeGacha, actualizarRarezaPersonaje, guardarAjuste, obtenerAjuste } from ${JSON.stringify(urlDb)}\n` +
      `import { sincronizarRarezas } from ${JSON.stringify(urlInternet)}\n` +
      `const id = agregarPersonajeGacha({ nombre: 'Levi', anime: 'Shingeki no Kyojin', rareza: 'comun', favoritos: 38845 })\n` +
      `const antes = obtenerPersonajeGacha(id)\n` +
      `actualizarRarezaPersonaje(id, 'mitico', 600, 38845)\n` +
      `const despues = obtenerPersonajeGacha(id)\n` +
      `guardarAjuste('prueba_sync', 123)\n` +
      `const ajuste = obtenerAjuste('prueba_sync')\n` +
      `const offline = await sincronizarRarezas()\n` +
      `console.log(JSON.stringify({ antes, despues, ajuste, offline }))\n` +
      `db.close()\n`,
  )

  const r = spawnSync(process.execPath, [script], {
    cwd: carpeta,
    encoding: 'utf8',
    env: { ...process.env, BEERUS_GACHA_LOCAL: '1' },
  })
  const salida = (r.stdout || '').trim().split('\n').pop()
  let datos = null
  try { datos = JSON.parse(salida) } catch { /* salida invalida */ }

  try { fs.rmSync(carpeta, { recursive: true, force: true }) } catch { /* temporal */ }

  if (r.status !== 0 || !datos) {
    mal('no se pudo probar la DB de rarezas', (r.stderr || '').trim().split('\n').slice(0, 4).join('\n   '))
  } else {
    if (datos.antes?.favoritos === 38845) {
      ok('gacha_personajes guarda los favoritos de AniList')
    } else {
      mal('la columna favoritos no se rellena', JSON.stringify(datos.antes))
    }

    if (
      datos.despues?.rareza === 'mitico' &&
      datos.despues?.valor === 600 &&
      datos.despues?.favoritos === 38845
    ) {
      ok('actualizarRarezaPersonaje reescribe rareza, valor y favoritos')
    } else {
      mal('actualizarRarezaPersonaje no actualiza la fila', JSON.stringify(datos.despues))
    }

    if (Number(datos.ajuste) === 123) {
      ok('la fecha de la ultima sincronizacion se guarda en ajustes')
    } else {
      mal('no se guardan los ajustes de sincronizacion', JSON.stringify(datos.ajuste))
    }

    if (datos.offline === null) {
      ok('sin internet la sincronizacion no toca el catalogo')
    } else {
      mal('sincronizarRarezas deberia devolver null sin red', JSON.stringify(datos.offline))
    }
  }

  const gachaFuente = leer('commands/gacha.js')
  if (
    /sub === 'sync'/.test(gachaFuente) &&
    gachaFuente.includes('sincronizarRarezas({ forzar: true })') &&
    gachaFuente.includes('esOwnerMsg({ msg, sender, sock })')
  ) {
    ok('.gacha sync (owner) relanza la sincronizacion')
  } else {
    mal('falta el comando owner .gacha sync o no comprueba el owner')
  }

  const indexFuente = leer('index.js')
  const apertura = indexFuente.indexOf("connection === 'open'")
  if (apertura >= 0 && indexFuente.indexOf('sincronizarRarezas()', apertura) > apertura) {
    ok('el bot sincroniza las rarezas al conectar (1 vez al dia)')
  } else {
    mal('index.js no sincroniza las rarezas al conectar')
  }

  const pkgSync = JSON.parse(leer('package.json'))
  if (
    pkgSync.scripts?.rarezas?.includes('sincronizar-rarezas.mjs') &&
    fs.existsSync(path.join(RAIZ, 'scripts', 'sincronizar-rarezas.mjs'))
  ) {
    ok('existe el script npm run rarezas')
  } else {
    mal('falta npm run rarezas')
  }
}

// ───────────── 12. Banners del menu ─────────────
seccion('Banners del menu')
{
  if (CONSULTAS_BANNERS.length >= 5 && CONSULTAS_BANNERS.every((c) => /beerus/i.test(c))) {
    ok(`${CONSULTAS_BANNERS.length} busquedas de banners de Beerus`)
  } else {
    mal('las consultas de banners no son de Beerus', CONSULTAS_BANNERS.join(' | '))
  }

  const wallpaper = { url: 'https://wallpapercave.com/wp/beerus-hakai.jpg', titulo: 'Beerus Hakai wallpaper 4k' }
  const render = { url: 'https://x.test/beerus/render.png', titulo: 'Beerus render png' }
  const cosplay = { url: 'https://x.test/beerus-cosplay.jpg', titulo: 'Beerus cosplay' }
  const otro = { url: 'https://x.test/goku-4k.jpg', titulo: 'Goku wallpaper 4k' }
  const gif = { url: 'https://x.test/beerus.gif', titulo: 'Beerus gif' }

  if (candidatoAceptable(wallpaper) && candidatoAceptable(render)) {
    ok('banners: acepta arte de Beerus')
  } else {
    mal('banners: rechaza arte de Beerus valido')
  }

  if (!candidatoAceptable(cosplay) && !candidatoAceptable(otro) && !candidatoAceptable(gif)) {
    ok('banners: descarta cosplay, otros personajes y GIF')
  } else {
    mal('banners: acepta candidatos que no son arte de Beerus')
  }

  if (Number.isFinite(puntuarCandidato(render))) {
    ok('banners: puntua los candidatos de busqueda')
  } else {
    mal('banners: no puntua los candidatos de busqueda')
  }

  if (medidasAceptables(1920, 1080) && medidasAceptables(900, 600) && medidasAceptables(800, 450)) {
    ok('banners: acepta imagenes de 800 px o mas')
  } else {
    mal('banners: rechaza imagenes grandes validas')
  }

  if (!medidasAceptables(300, 200) && !medidasAceptables(1000, 3000) && !medidasAceptables(1000, 200)) {
    ok('banners: descarta miniaturas y tiras verticales')
  } else {
    mal('banners: acepta medidas que no sirven para el recorte')
  }

  // La misma imagen puede venir de varios sitios con distinta URL
  try {
    const origen = await sharp(path.join(RAIZ, 'assets/beerus-banner.png')).png().toBuffer()
    const grande = await sharp(origen).resize(1470, 968).jpeg().toBuffer()
    const a = await huellaImagen(origen)
    const b = await huellaImagen(grande)
    const otra = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#22d3ee' },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="900" height="600"><circle cx="200" cy="180" r="150" fill="#000"/><rect x="500" y="300" width="300" height="200" fill="#fff"/></svg>'
          ),
        },
      ])
      .png()
      .toBuffer()
    const c = await huellaImagen(otra)

    if (a.length === 64 && imagenesParecidas(a, b)) {
      ok('banners: reconoce la misma imagen aunque cambie de tamano')
    } else {
      mal('banners: no reconoce la misma imagen reescalada', `${distanciaHuellas(a, b)} bits`)
    }

    if (!imagenesParecidas(a, c)) ok('banners: distingue dos imagenes distintas')
    else mal('banners: cree que dos imagenes distintas son la misma')
  } catch (err) {
    mal('banners: no se pudo calcular la huella de las imagenes', err.message)
  }

  const barajado = barajarBanners([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a', () => 0.5)
  if (barajado.length === 2 && barajado.every((b) => b.id !== 'a') && new Set(barajado.map((b) => b.id)).size === 2) {
    ok('el banner anterior nunca se repite')
  } else {
    mal('el barajado repite o incluye el banner anterior', barajado.map((b) => b.id).join(', '))
  }

  try {
    const origen = await sharp(path.join(RAIZ, 'assets/beerus-banner.png')).png().toBuffer()
    const jpg = await prepararBanner(origen)
    const meta = await sharp(jpg).metadata()
    if (meta.width === ANCHO_BANNER && meta.height === ALTO_BANNER && jpg.length > 20000) {
      ok(`el texto y el marco se escriben sobre la imagen (${ANCHO_BANNER}x${ALTO_BANNER})`)
    } else {
      mal('el banner compuesto no sale a 900x600', `${meta.width}x${meta.height} ${jpg.length}B`)
    }
  } catch (err) {
    mal('no se pudo componer un banner', err.message)
  }

  const catalogo = leerCatalogo()
  if (Array.isArray(catalogo)) ok(`catalogo de banners legible (${catalogo.length} en cache)`)
  else mal('el catalogo de banners no devuelve una lista')

  const menuFuente = leer('commands/menu.js')
  if (menuFuente.includes('obtenerBannerMenu(') && !menuFuente.includes('obtenerAvatarBeerus')) {
    ok('menu.js usa el banner aleatorio de internet')
  } else {
    mal('menu.js no usa obtenerBannerMenu')
  }

  if (menuFuente.includes('banner.buffer') && menuFuente.includes('image: banner.buffer')) {
    ok('el menu manda la imagen del banner en el mensaje')
  } else {
    mal('el menu no envia banner.buffer como imagen')
  }

  if (fs.existsSync(path.join(RAIZ, 'scripts/renovar-banners.mjs'))) ok('existe el script de banners (npm run banners)')
  else mal('falta scripts/renovar-banners.mjs')
}

// ───────────── 13. Scripts de package.json ─────────────
seccion('package.json')
const pkg = JSON.parse(leer('package.json'))
const destinos = Object.entries(pkg.scripts || {})
  .flatMap(([, cmd]) => [...cmd.matchAll(/node\s+(?:--[\w-]+\s+)*([\w./-]+\.(?:js|mjs|cjs))/g)].map((m) => m[1]))
const inexistentes = [...new Set(destinos)].filter((d) => !fs.existsSync(path.join(RAIZ, d)))
if (!inexistentes.length) ok(`${new Set(destinos).size} scripts apuntan a archivos existentes`)
else mal('scripts que apuntan a archivos inexistentes', inexistentes.join(', '))

if (!pkg.engines?.node?.includes('22')) {
  mal(`engines.node="${pkg.engines?.node}" no cubre node:sqlite (>=22.13)`)
} else {
  ok(`engines.node = ${pkg.engines.node}`)
}

// La version vive solo en package.json; lib/tema.js la lee de ahi
if (/^\d+\.\d+\.\d+$/.test(String(pkg.version))) {
  ok(`version ${pkg.version}`)
} else {
  mal('la version no tiene formato x.y.z', String(pkg.version))
}

const bloqueo = JSON.parse(leer('package-lock.json'))
if (bloqueo.version === pkg.version && bloqueo.packages?.['']?.version === pkg.version) {
  ok('package-lock.json sincronizado con package.json')
} else {
  mal('package-lock.json quedo en otra version', `${bloqueo.version} / ${bloqueo.packages?.['']?.version}`)
}

const temaFuente = leer('lib/tema.js')
if (/package\.json/.test(temaFuente) && temaFuente.includes('version: VERSION')) {
  ok('el bot muestra la version de package.json (sin numeros duplicados)')
} else {
  mal('lib/tema.js no lee la version de package.json')
}

// El menu principal tiene que enseñar esa version en el panel de datos
const temaMod = await import('./lib/tema.js')
const panelPrueba = temaMod.panelLinea({ modo: 'Premium', version: temaMod.TEMA.version, comandos: '1 comando' })
const menuFuenteVer = leer('commands/menu.js')
if (
  temaMod.TEMA.version === pkg.version &&
  panelPrueba.includes('*Versión:*') &&
  panelPrueba.includes(temaMod.TEMA.version) &&
  menuFuenteVer.includes('version: TEMA.version')
) {
  ok(`el menu muestra la version ${pkg.version}`)
} else {
  mal('el menu no muestra la version de package.json', panelPrueba)
}

// ───────────── 15. Stickers: la firma deja el WebP valido ─────────────
seccion('Stickers')

{
  const { firmarSticker, chunksWebp, esWebpAnimado } = await import('./lib/multimedia.js')

  // sharp escribe un WebP estatico como `VP8 ` sin VP8X. Un chunk EXIF solo es
  // legal si un VP8X lo declara, asi que la firma tiene que agregarlo delante.
  const plano = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 90, b: 140 } },
  })
    .webp({ quality: 80 })
    .toBuffer()

  const firmado = firmarSticker(plano)
  const trozos = chunksWebp(firmado)
  const primero = trozos[0]?.nombre
  const ultimo = trozos[trozos.length - 1]?.nombre
  const vp8x = trozos.find((c) => c.nombre === 'VP8X')

  if (primero === 'VP8X' && vp8x?.datos[0] & 0x08) {
    ok('el sticker estatico lleva VP8X con el bit de EXIF')
  } else {
    mal('el sticker estatico no declara el EXIF en un VP8X', trozos.map((c) => c.nombre.trim()).join(','))
  }

  if (ultimo === 'EXIF') ok('el EXIF queda como ultimo chunk')
  else mal('el EXIF no esta al final', ultimo)

  const anchoLeido = vp8x ? vp8x.datos.readUIntLE(4, 3) + 1 : 0
  const altoLeido = vp8x ? vp8x.datos.readUIntLE(7, 3) + 1 : 0
  if (anchoLeido === 640 && altoLeido === 480) ok('el VP8X declara el lienzo real (640x480)')
  else mal('el VP8X declara otro lienzo', `${anchoLeido}x${altoLeido}`)

  if (firmado.readUInt32LE(4) + 8 === firmado.length) ok('el tamano RIFF cuadra con el archivo')
  else mal('el tamano RIFF no cuadra', `${firmado.readUInt32LE(4) + 8} vs ${firmado.length}`)

  const decodificado = await sharp(firmado).metadata()
  if (decodificado.format === 'webp' && decodificado.width === 640) {
    ok('el sticker firmado sigue decodificando')
  } else {
    mal('el sticker firmado no decodifica', decodificado.format)
  }

  // Firmar dos veces no debe duplicar VP8X ni EXIF
  const otraVez = chunksWebp(firmarSticker(firmado)).map((c) => c.nombre.trim())
  const unVp8x = otraVez.filter((n) => n === 'VP8X').length === 1
  const unExif = otraVez.filter((n) => n === 'EXIF').length === 1
  if (unVp8x && unExif) ok('firmar dos veces no duplica chunks')
  else mal('firmar dos veces duplica chunks', otraVez.join(','))

  // PNG con transparencia: sharp ya escribe VP8X/ALPH, hay que conservarlos
  const conAlfa = await sharp({
    create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .webp({ quality: 80 })
    .toBuffer()
  const firmadoAlfa = firmarSticker(conAlfa)
  const vp8xAlfa = chunksWebp(firmadoAlfa).find((c) => c.nombre === 'VP8X')
  const bitsAlfa = vp8xAlfa ? vp8xAlfa.datos[0] : 0
  if (bitsAlfa & 0x08 && bitsAlfa & 0x10) ok('el sticker con alfa conserva ALPHA y suma EXIF')
  else mal('el sticker con alfa pierde banderas del VP8X', `0x${bitsAlfa.toString(16)}`)

  if (!esWebpAnimado(firmado)) ok('el estatico sigue marcado como estatico')
  else mal('un estatico quedo marcado como animado')

  // Animado real, si hay ffmpeg: el VP8X tiene que conservar ANIM (0x02)
  const hayFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
  if (hayFfmpeg) {
    const tmpAnim = path.join(os.tmpdir(), `verify-anim-${process.pid}.webp`)
    spawnSync(
      'ffmpeg',
      [
        '-y', '-f', 'lavfi', '-i', 'testsrc2=size=128x128:rate=8',
        '-t', '1', '-c:v', 'libwebp', '-quality', '50', '-loop', '0', tmpAnim,
      ],
      { stdio: 'ignore' }
    )
    if (fs.existsSync(tmpAnim)) {
      const animado = firmarSticker(fs.readFileSync(tmpAnim))
      const bits = chunksWebp(animado)[0]
      const animFlag = bits?.nombre === 'VP8X' && bits.datos[0] & 0x02 && bits.datos[0] & 0x08
      if (animFlag && esWebpAnimado(animado)) ok('el sticker animado conserva ANIM y suma EXIF')
      else mal('el sticker animado pierde la animacion al firmarse')
      fs.rmSync(tmpAnim, { force: true })
    }
  }
}

// ───────────── 16. Manos de mesa: en el grupo y de ver una vez ─────────────
seccion('Manos en el grupo')

{
  const modulo = await import('./lib/mano-grupo.js')
  const fuente = leer('lib/mano-grupo.js')
  const unoFuente = leer('commands/uno.js')
  const pokerFuente = leer('commands/poker.js')

  if (typeof modulo.enviarManoEnGrupo === 'function') ok('lib/mano-grupo.js exporta enviarManoEnGrupo')
  else mal('lib/mano-grupo.js no exporta enviarManoEnGrupo')

  if (fuente.includes('viewOnce: true')) ok('la mano viaja como mensaje de ver una vez')
  else mal('la mano no se manda con viewOnce')

  if (fuente.includes('AVISO_PRIVADO') && fuente.includes('este mensaje solo es visible para ti')) {
    ok('el pie avisa que el mensaje solo lo ve su dueno')
  } else {
    mal('falta el aviso "este mensaje solo es visible para ti"')
  }

  // La tarjeta tiene que salir como PNG de verdad, con el texto dibujado
  const png = await modulo.renderizarTarjeta({
    titulo: 'UNO · tu mano',
    subtitulo: '3 cartas',
    lineas: ['R7  Rojo 7', 'AS  Azul Salta'],
    pie: 'Jugá con /uno R7',
  })
  const esPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const info = await sharp(png).metadata()
  if (esPng && info.format === 'png' && info.width === 760 && info.height > 200) {
    ok(`la tarjeta sale PNG ${info.width}x${info.height}`)
  } else {
    mal('la tarjeta no es un PNG valido', `${info.format} ${info.width}x${info.height}`)
  }

  // Ninguno de los dos juegos puede volver a escribir por privado
  const privados = ['enviarPrivado', 'jidPrivado', 'enviarProgresoPrivado', 'enviarManoDM']
  const fugas = privados.filter((n) => unoFuente.includes(n) || pokerFuente.includes(n))
  if (!fugas.length) ok('ni UNO ni el póker escriben por privado')
  else mal('todavía hay entrega por privado', fugas.join(', '))

  if (unoFuente.includes('enviarManoEnGrupo') && pokerFuente.includes('enviarManoEnGrupo')) {
    ok('los dos juegos entregan la mano en el grupo')
  } else {
    mal('algún juego no entrega la mano en el grupo')
  }

  // La orden de jugar ya no puede rebotar al privado
  const rebotes = ['van por privado', 'en mi chat privado']
  const dichos = rebotes.filter((frase) => unoFuente.includes(frase) || pokerFuente.includes(frase))
  if (!dichos.length) ok('las jugadas se aceptan en el grupo, sin rebote al privado')
  else mal('quedan mensajes que mandan al privado', dichos.join(' / '))
}

// ───────────── 17. Boorus NSFW: el archivo que llega ─────────────
// ───────────── 17. Botones: el id es el comando ─────────────
seccion('Botones')
{
  const modulo = await import('./lib/botones.js')
  const fuente = leer('lib/botones.js')
  const indexFuente = leer('index.js')

  const esperadas = ['enviarBotones', 'botonComando', 'botonUrl', 'botonCopiar', 'respuestaDeBoton']
  const faltan = esperadas.filter((n) => typeof modulo[n] !== 'function')
  if (!faltan.length) ok('lib/botones.js exporta la capa completa')
  else mal('faltan funciones en lib/botones.js', faltan.join(', '))

  // Baileys no arma este mensaje desde sendMessage (revienta en
  // prepareWAMessageMedia), asi que tiene que salir por relayMessage.
  if (fuente.includes('generateWAMessageFromContent') && fuente.includes('relayMessage')) {
    ok('los botones se arman a mano y salen por relayMessage')
  } else {
    mal('los botones no usan generateWAMessageFromContent + relayMessage')
  }

  const enviados = []
  const sock = {
    user: { id: '999@s.whatsapp.net' },
    relayMessage: async (jid, message, opciones) => {
      enviados.push({ jid, message, opciones })
      return 'OK'
    },
    sendMessage: async (jid, content) => {
      enviados.push({ jid, content })
      return { key: { id: 'FALLBACK' } }
    },
  }

  // Cuatro botones: solo pasan tres, y cada uno vuelve como comando literal
  const salio = await modulo.enviarBotones({
    sock,
    jid: '1203630@g.us',
    titulo: 'Prueba',
    texto: 'Elegí una opción',
    pie: 'Atajos',
    botones: [
      modulo.botonComando('MP3', '/audio https://youtu.be/x'),
      modulo.botonComando('Video', '/video https://youtu.be/x'),
      modulo.botonComando('Menú', '/menu juegos'),
      modulo.botonComando('Cuarto', '/cuarto'),
    ],
  })

  const envoltorio = enviados[0]?.message?.viewOnceMessage?.message
  if (envoltorio?.messageContextInfo?.deviceListMetadataVersion === 2 && envoltorio?.interactiveMessage) {
    ok('el interactive va envuelto en viewOnceMessage (el servidor lo descarta suelto)')
  } else {
    mal('el interactiveMessage no viaja con el envoltorio viewOnceMessage')
  }

  const flujo = envoltorio?.interactiveMessage?.nativeFlowMessage
  if (salio && flujo?.buttons?.length === modulo.MAX_BOTONES) {
    ok(`el mensaje sale como nativeFlow con ${modulo.MAX_BOTONES} botones`)
  } else {
    mal('no salió un interactiveMessage con nativeFlow', `${salio} ${flujo?.buttons?.length}`)
  }

  // Sin el nodo <biz> el servidor acepta el envío y el cliente no dibuja nada.
  const biz = (enviados[0]?.opciones?.additionalNodes || []).find((n) => n.tag === 'biz')
  const bizInteractivo = biz?.content?.find((n) => n.tag === 'interactive')
  const flujoDelNodo = bizInteractivo?.content?.find((n) => n.tag === 'native_flow')
  if (
    biz?.attrs?.actual_actors === '2' &&
    bizInteractivo?.attrs?.type === 'native_flow' &&
    flujoDelNodo?.attrs?.name === 'mixed' &&
    biz.content?.some((n) => n.tag === 'quality_control')
  ) {
    ok('el envío lleva el nodo biz de los interactivos')
  } else {
    mal('falta el nodo biz: WhatsApp entrega el mensaje y el cliente no lo dibuja')
  }

  const ids = (flujo?.buttons || []).map((b) => {
    try {
      return JSON.parse(b.buttonParamsJson).id
    } catch {
      return ''
    }
  })
  if (ids[0] === '/audio https://youtu.be/x' && ids[1] === '/video https://youtu.be/x' && ids[2] === '/menu juegos') {
    ok('el id de cada botón es el comando completo que hay que ejecutar')
  } else {
    mal('algún botón no devuelve el comando como id', ids.join(' | '))
  }

  // Respuestas que tienen que resolver al mismo comando
  const casos = [
    ['native flow', { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: '/uno join' }) } } }, '/uno join'],
    ['plantilla', { templateButtonReplyMessage: { selectedId: '/menu juegos' } }, '/menu juegos'],
    ['botones viejos', { buttonsResponseMessage: { selectedButtonId: '/poker join' } }, '/poker join'],
    ['lista', { listResponseMessage: { singleSelectReply: { selectedRowId: '/audio voz x' } } }, '/audio voz x'],
  ]
  const rotos = casos.filter(([, mensaje, esperado]) => modulo.respuestaDeBoton({ message: mensaje }) !== esperado)
  if (!rotos.length) ok('las cuatro formas de respuesta devuelven el comando')
  else mal('alguna respuesta a botón no se lee', rotos.map((c) => c[0]).join(', '))

  if (modulo.respuestaDeBoton({ message: { conversation: 'hola' } }) === null) {
    ok('un texto normal no se confunde con un botón')
  } else {
    mal('un texto normal se leyó como botón')
  }

  if (indexFuente.includes('respuestaDeBoton({ message: m })')) {
    ok('index.js ejecuta el botón como si fuera texto escrito')
  } else {
    mal('index.js no pasa los botones por respuestaDeBoton')
  }

  // Si relayMessage falla el mensaje igual llega, con los comandos escritos
  const antes = enviados.length
  const sinBotones = await modulo.enviarBotones({
    sock: {
      user: { id: '999@s.whatsapp.net' },
      relayMessage: async () => {
        throw new Error('sin relay')
      },
      sendMessage: async (jid, content) => {
        enviados.push({ jid, content })
        return { key: { id: 'TXT' } }
      },
    },
    jid: '1203630@g.us',
    texto: 'Elegí',
    botones: [modulo.botonComando('MP3', '/audio x')],
  })
  const respaldo = enviados[enviados.length - 1]?.content?.text || ''
  if (!sinBotones && enviados.length > antes && respaldo.includes('/audio x')) {
    ok('si el botón no sale, el comando queda escrito en el texto')
  } else {
    mal('el respaldo sin botones no lista el comando', respaldo)
  }

  // Los comandos que ganaron botones tienen que mandarlos de verdad
  const usan = ['commands/audio.js', 'commands/video.js', 'commands/menu.js', 'commands/uno.js', 'commands/poker.js']
  const sinUso = usan.filter((rel) => !leer(rel).includes('enviarBotones'))
  if (!sinUso.length) ok('audio, video, menú, UNO y póker usan los botones')
  else mal('algún comando quedó sin botones', sinUso.join(', '))

  // El prefijo se puede cambiar en caliente: un botón con "/" fijo deja de
  // funcionar en cuanto el owner pone otro.
  const conPrefijo = ['commands/audio.js', 'commands/video.js', 'commands/uno.js', 'commands/poker.js']
  const fijos = conPrefijo.filter((rel) => {
    const texto = leer(rel)
    return !texto.includes("PREFIX?.[0] ?? '/'") || !texto.includes('${prefijo}')
  })
  if (!fijos.length) ok('los botones usan el prefijo activo, no una barra fija')
  else mal('algún botón tiene el prefijo fijo', fijos.join(', '))
}

// ───────────── 17b. Descargas frenadas por la plataforma ─────────────
seccion('Descargas limitadas')
{
  const descargas = await import('./lib/descargas.js')
  const fuente = leer('lib/descargas.js')
  const comando = leer('lib/comando-descarga.js')
  const audio = leer('commands/audio.js')
  const video = leer('commands/video.js')

  // El error exacto que llega cuando Instagram corta por IP de servidor
  const real = new Error(
    'ERROR: [Instagram] DFSMLcsB_T2: Unable to download webpage: ' +
      'HTTP Error 429: Too Many Requests (caused by <HTTPError 429: Too Many Requests>)',
  )
  if (descargas.esLimiteDeTasa(real)) ok('el 429 de Instagram se reconoce como limite de tasa')
  else mal('el 429 no se detecta y se reintenta al pedo')

  if (!descargas.esLimiteDeTasa(new Error('No se encontro ningun formato descargable'))) {
    ok('un enlace roto no se confunde con un limite de tasa')
  } else {
    mal('cualquier error se toma como limite de tasa')
  }

  const aviso = descargas.mensajeLimite('instagram')
  if (/429/.test(aviso) && /data\/cookies-instagram\.txt/.test(aviso)) {
    ok('el aviso dice que freno la plataforma y donde dejar las cookies')
  } else {
    mal('el aviso de limite no explica nada', aviso.slice(0, 80))
  }

  // Las cookies se enganchan solas desde data/, sin tocar codigo
  const ruta = path.join(RAIZ, 'data', 'cookies-instagram.txt')
  const existia = fs.existsSync(ruta)
  const previo = process.env.YTDLP_COOKIES
  try {
    if (!existia) {
      fs.mkdirSync(path.dirname(ruta), { recursive: true })
      fs.writeFileSync(ruta, '# Netscape HTTP Cookie File\n')
    }
    delete process.env.YTDLP_COOKIES

    const encontrada = descargas.rutaCookies('instagram')
    const args = descargas.argumentosRed('instagram')
    if (encontrada === ruta && args.includes('--cookies') && args.includes('--sleep-requests')) {
      ok('las cookies de data/ se pasan solas y en Instagram se frena el ritmo')
    } else {
      mal('las cookies de data/ no se enganchan', String(encontrada))
    }
  } finally {
    if (!existia) fs.rmSync(ruta, { force: true })
    if (previo === undefined) delete process.env.YTDLP_COOKIES
    else process.env.YTDLP_COOKIES = previo
  }

  if (fuente.includes("'--impersonate'") && fuente.includes('10000 * intento')) {
    ok('un 429 espera de verdad y reintenta como navegador real')
  } else {
    mal('el reintento por 429 no espera ni cambia de perfil')
  }

  const avisados = [comando, audio, video].filter((t) => t.includes('esLimiteDeTasa'))
  if (avisados.length === 3) ok('descarga, audio y video avisan del limite, no de un enlace caido')
  else mal('algun comando sigue culpando al enlace', `${avisados.length}/3`)
}

// ───────────── 17c. Resolvedor externo de descargas ─────────────
seccion('Resolvedor externo')
{
  const http = await import('node:http')
  const descargas = await import('./lib/descargas.js')
  const fuente = leer('lib/descargas.js')

  if (fuente.includes('API_DESCARGAS') && fuente.includes('/api/instagram')) {
    ok('el resolvedor externo se configura por entorno')
  } else {
    mal('no hay soporte de resolvedor externo')
  }

  // Servidor de mentira con la forma que devuelve el resolvedor real
  const media = Buffer.alloc(20000, 7)
  const pedidos = []
  const servidor = http.createServer((req, res) => {
    pedidos.push(req.url)

    if (req.url.startsWith('/api/instagram')) {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          status: true,
          titulo: 'Reel de prueba',
          video: `http://127.0.0.1:${servidor.address().port}/media.mp4`,
          items: [],
        }),
      )
      return
    }

    if (req.url.startsWith('/api/social/audio')) {
      res.setHeader('x-title', 'Tema%20de%20prueba')
      res.setHeader('content-type', 'audio/mpeg')
      res.end(media)
      return
    }

    res.setHeader('content-type', 'video/mp4')
    res.end(media)
  })

  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const previo = process.env.API_DESCARGAS
  const previaClave = process.env.API_DESCARGAS_CLAVE

  try {
    process.env.API_DESCARGAS = base
    process.env.API_DESCARGAS_CLAVE = 'clave-de-prueba'

    const video = await descargas.descargarContenido('https://www.instagram.com/reel/PRUEBA/', { maxMB: 5 })
    if (video.extension === 'mp4' && video.bytes === media.length && video.titulo === 'Reel de prueba') {
      ok('el video llega desde el resolvedor, sin tocar yt-dlp')
    } else {
      mal('el video no llegó del resolvedor', `${video.extension} ${video.bytes} ${video.titulo}`)
    }

    const audio = await descargas.descargarContenido('https://www.instagram.com/reel/PRUEBA/', {
      maxMB: 5,
      soloAudio: true,
    })
    if (audio.extension === 'mp3' && audio.titulo === 'Tema de prueba') {
      ok('el audio llega desde el resolvedor con su título')
    } else {
      mal('el audio no llegó del resolvedor', `${audio.extension} ${audio.titulo}`)
    }

    if (pedidos.some((p) => p.includes('plataforma=instagram'))) {
      ok('el pedido de audio lleva la plataforma en la URL')
    } else {
      mal('el pedido de audio no lleva la plataforma')
    }
  } finally {
    await new Promise((listo) => servidor.close(listo))
    if (previo === undefined) delete process.env.API_DESCARGAS
    else process.env.API_DESCARGAS = previo
    if (previaClave === undefined) delete process.env.API_DESCARGAS_CLAVE
    else process.env.API_DESCARGAS_CLAVE = previaClave
  }
}

// ───────────── 17d. Actualizador y el ruido de npm ─────────────
seccion('Actualizador limpio')
{
  const actualizador = await import('./lib/actualizador.js')
  const fuente = leer('lib/actualizador.js')

  // Repositorio de verdad en una carpeta temporal: la prueba es el
  // archivo restaurado, no un texto que diga que lo restaura.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-upd-'))
  const enTmp = (args) => spawnSync('git', args, { cwd: tmp, encoding: 'utf8' })
  const lock = path.join(tmp, 'package-lock.json')
  const pkg = path.join(tmp, 'package.json')
  const lockOriginal = '{"name":"t","lockfileVersion":3}\n'

  try {
    enTmp(['init', '--quiet'])
    enTmp(['config', 'user.email', 'test@test'])
    enTmp(['config', 'user.name', 'test'])
    // En Windows el checkout devuelve CRLF y el archivo escrito era LF: la
    // prueba seria un falso negativo por los finales de linea, no por el codigo.
    enTmp(['config', 'core.autocrlf', 'false'])
    fs.writeFileSync(pkg, '{"name":"t","version":"1.0.0"}\n')
    fs.writeFileSync(lock, lockOriginal)
    enTmp(['add', '.'])
    enTmp(['commit', '--quiet', '-m', 'base'])

    // Lo que hace npm en Linux: reescribe el lock con las opcionales del sistema
    fs.writeFileSync(lock, '{"name":"t","lockfileVersion":3,"linux":true}\n')

    const sucios = actualizador.ruidoDeNpm(tmp)
    if (sucios.length === 1 && sucios[0] === 'package-lock.json') {
      ok('el lock que reescribe npm se reconoce como ruido')
    } else {
      mal('el lock sucio no se detecta', JSON.stringify(sucios))
    }

    const descartados = actualizador.descartarRuidoDeNpm(tmp)
    const volvio = fs.readFileSync(lock, 'utf8') === lockOriginal
    const limpio = enTmp(['status', '--porcelain', '--untracked-files=no']).stdout.trim() === ''
    if (descartados.includes('package-lock.json') && volvio && limpio) {
      ok('el ruido se descarta, el arbol queda limpio y el pull no se traba')
    } else {
      mal('el ruido no se descarta', `${volvio} ${limpio}`)
    }

    // Un cambio de verdad no se toca nunca
    fs.writeFileSync(pkg, '{"name":"t","version":"9.9.9","mio":true}\n')
    actualizador.descartarRuidoDeNpm(tmp)
    if (fs.readFileSync(pkg, 'utf8').includes('9.9.9')) {
      ok('un cambio propio fuera de los generados sobrevive intacto')
    } else {
      mal('se descarto un cambio que no era ruido')
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  // El orden importa: limpiar antes del stash y despues del npm install
  const antesDelStash = fuente.indexOf('descartarRuidoDeNpm()')
  const stash = fuente.indexOf("git(['stash', 'push'")
  const npmInstall = fuente.indexOf('npm install --no-audit')
  const despuesDelNpm = fuente.indexOf('descartarRuidoDeNpm()', npmInstall)
  if (antesDelStash > 0 && antesDelStash < stash && despuesDelNpm > npmInstall) {
    ok('se limpia antes del stash y otra vez despues de instalar')
  } else {
    mal('falta una de las dos limpiezas', `${antesDelStash}/${stash}/${despuesDelNpm}`)
  }
}

// ───────────── 17e. Auto limpiador de disco ─────────────
seccion('Auto limpiador')
{
  const limpiador = await import('./lib/limpiador.js')
  const fuente = leer('lib/limpiador.js')

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'beerus-limp-'))
  const viejo = Date.now() - 5 * 24 * 3_600_000
  const muyViejo = Date.now() - 8 * 24 * 3_600_000
  const hace3h = Date.now() - 3 * 3_600_000
  const crear = (rel, bytes = 1024) => {
    const ruta = path.join(raiz, rel)
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    fs.writeFileSync(ruta, Buffer.alloc(bytes, 1))
    return ruta
  }
  const envejecer = (ruta, ms) => fs.utimesSync(ruta, new Date(ms), new Date(ms))
  const existe = (rel) => fs.existsSync(path.join(raiz, rel))

  try {
    const muerto = crear('tmp/viejo.mp4', 4096)
    envejecer(muerto, viejo)
    const vivo = crear('tmp/recien-bajado.mp4', 4096)          // gracia: no se toca
    const sesion = crear('tmp/creds.json', 128)                 // protegido por nombre
    envejecer(sesion, viejo)
    const dentroDeSub = crear('tmp/subbot/sesion.json', 128)    // subcarpeta: no se toca
    envejecer(dentroDeSub, viejo)
    const descarga = crear('data/tmp/dl_viejo.mp4', 2048)
    envejecer(descarga, hace3h)
    const logViejo = crear('logs/viejo.log', 256)
    envejecer(logViejo, muyViejo)
    const logNuevo = crear('logs/hoy.log', 256)

    const reglas = [
      { carpeta: 'tmp', etiqueta: 'tmp', edadMs: 6 * 3_600_000, topeMB: 250 },
      { carpeta: 'data/tmp', etiqueta: 'descargas', edadMs: 2 * 3_600_000, topeMB: 150 },
      { carpeta: 'logs', etiqueta: 'logs', edadMs: 7 * 24 * 3_600_000, topeMB: 60 },
    ]

    const pasada = await limpiador.limpiarAhora({ raiz, reglas })

    if (!existe('tmp/viejo.mp4') && !existe('data/tmp/dl_viejo.mp4') && !existe('logs/viejo.log')) {
      ok('lo que venció por edad se borra en las tres carpetas')
    } else {
      mal('quedó basura vieja sin borrar')
    }

    if (existe('tmp/recien-bajado.mp4') && existe('logs/hoy.log')) {
      ok('lo recién usado se queda quieto (ventana de gracia)')
    } else {
      mal('se borró un archivo recién usado')
    }

    if (existe('tmp/creds.json') && existe('tmp/subbot/sesion.json')) {
      ok('no toca archivos protegidos ni entra en subcarpetas')
    } else {
      mal('se metió donde no debía')
    }

    if (pasada.borrados === 3 && pasada.carpetas.reduce((s, c) => s + c.liberados, 0) === 6400) {
      ok('el reporte cuadra: 3 borrados y los bytes liberados')
    } else {
      mal('el reporte no cuadra', `${pasada.borrados} ${pasada.carpetas.reduce((s, c) => s + c.liberados, 0)}`)
    }

    // Tope de tamaño: 3 archivos viejos de 1 MB con tope de 2 MB dejan 2,
    // y se van los más viejos primero.
    const pesada = 'pesada'
    for (const [nombre, cuando] of [
      ['a.bin', Date.now() - 3 * 3_600_000],
      ['b.bin', Date.now() - 2 * 3_600_000],
      ['c.bin', Date.now() - 3_600_000],
    ]) {
      envejecer(crear(`${pesada}/${nombre}`, 1_048_576), cuando)
    }

    const poda = await limpiador.limpiarAhora({
      raiz,
      reglas: [{ carpeta: pesada, etiqueta: 'pesada', edadMs: 30 * 24 * 3_600_000, topeMB: 2 }],
    })
    const quedan = fs.readdirSync(path.join(raiz, pesada)).sort()
    if (poda.borrados === 1 && quedan.join(',') === 'b.bin,c.bin') {
      ok('el tope de tamaño borra primero lo más viejo')
    } else {
      mal('el tope de tamaño no podó bien', `${poda.borrados} [${quedan.join(',')}]`)
    }

    // Una carpeta que no existe no rompe la pasada
    const sinNada = await limpiador.limpiarAhora({
      raiz,
      reglas: [{ carpeta: 'no-existe', etiqueta: 'x', edadMs: 1000, topeMB: 10 }],
    })
    if (sinNada.carpetas[0].motivo === 'no existe' && sinNada.borrados === 0) {
      ok('una carpeta que no existe se anota y la pasada sigue')
    } else {
      mal('una carpeta inexistente rompe la pasada')
    }
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }

  if (fuente.includes('GRACIA_MINIMA_MS') && fuente.includes('TAMANO_LOTE')) {
    ok('borra por lotes y respeta el piso de seguridad')
  } else {
    mal('falta el borrado por lotes o el piso de seguridad')
  }

  const estado = limpiador.estadoLimpiador()
  if (estado.reglas.length >= 3 && estado.intervaloMin >= 5) {
    ok('el servicio declara sus reglas y su intervalo')
  } else {
    mal('el estado del limpiador está incompleto')
  }
}

seccion('Boorus NSFW')
{
  const nsfw = await import('./lib/nsfw.js')
  const conFirma = (firma, relleno = 2048) => Buffer.concat([Buffer.from(firma), Buffer.alloc(relleno, 0x20)])

  // Gelbooru sirve el archivo solo con Referer: sin el contesta 200 y una
  // pagina HTML de ~35 KB que terminaba enviada como imagen (burbuja gris).
  if (nsfw.tipoReal(conFirma('<html><body>no hotlink</body></html>')) === null) {
    ok('una pagina HTML disfrazada de 200 OK se rechaza')
  } else {
    mal('el motor NSFW aceptaria una pagina HTML como imagen')
  }

  const firmas = [
    [Buffer.from([0xff, 0xd8, 0xff]), 'imagen', 'jpg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'imagen', 'png'],
    [Buffer.from('GIF89a'), 'video', 'gif'],
    [Buffer.from([0, 0, 0, 0x20]), 'video', 'mp4', 'ftypisom'],
  ]
  const malasFirmas = firmas.filter(([firma, tipo, extension, extra]) => {
    const buffer = extra
      ? Buffer.concat([Buffer.from(firma), Buffer.from(extra), Buffer.alloc(2048, 0x20)])
      : conFirma(firma)
    return nsfw.tipoReal(buffer) !== tipo || nsfw.extensionReal(buffer) !== extension
  })
  if (!malasFirmas.length) {
    ok('la firma del archivo decide tipo y extension (el gif viaja como video)')
  } else {
    mal('la firma del archivo se lee mal', malasFirmas.map((f) => String(f[2])).join(', '))
  }

  // Poco peso = archivo cortado, aunque la firma exista
  if (nsfw.tipoReal(conFirma([0xff, 0xd8, 0xff], 4)) === null) {
    ok('un archivo cortado no pasa como imagen')
  } else {
    mal('un archivo de 7 bytes pasaria como imagen')
  }

  const fuente = leer('lib/nsfw.js')
  if (fuente.includes('Referer:') && fuente.includes('cabecerasDe(') && fuente.includes('headers: cabeceras')) {
    ok('la descarga manda el Referer del booru que sirve el archivo')
  } else {
    mal('la descarga no manda el Referer del booru')
  }

  const rule34 = leer('commands/rule34.js')
  if (
    rule34.includes('await validarMedia(') &&
    rule34.includes('extensionReal(buffer)') &&
    /for \(let intento = 0; intento < 5/.test(rule34)
  ) {
    ok('/r34 valida el archivo, reintenta con otro post y usa la extension real')
  } else {
    mal('/r34 puede mandar un archivo roto o con el mimetype equivocado')
  }

  // WhatsApp solo reproduce video H.264 en MP4: un webm es burbuja vacia
  const recibibles = nsfw.postRecibibles([
    { id: 1, extension: 'webm' },
    { id: 2, extension: 'mp4' },
    { id: 3, extension: 'gif' },
    { id: 4, extension: 'jpg' },
  ])
  if (recibibles.length === 3 && !recibibles.some((p) => p.extension === 'webm') && rule34.includes("=== 'webm'")) {
    ok('los webm se descartan o reconvierten antes de enviar')
  } else {
    mal('un webm podria enviarse tal cual y quedar en burbuja vacia')
  }

  // /r34 tenia que dejar de mandar el post al azar del bloque: la mitad eran
  // bocetos viejos o recortes de 500 px que en WhatsApp se ven blandos.
  const chico = { id: 1, ancho: 800, alto: 1200, score: 900, tags: 'ass' }
  const grande = { id: 2, ancho: 2480, alto: 3508, score: 10, tags: 'ass' }
  const basura = { id: 3, ancho: 4000, alto: 6000, score: 2000, tags: 'lowres sketch' }
  const mejores = nsfw.mejoresPosts([chico, grande, basura], { cantidad: 2 })
  if (
    mejores.length === 1 &&
    mejores[0].id === 2 &&
    nsfw.calidadDeMedia(grande) > nsfw.calidadDeMedia(chico)
  ) {
    ok('la seleccion prefiere la resolucion alta y descarta los posts marcados como basura')
  } else {
    mal('la seleccion de /r34 no separa una imagen nitida de un boceto chico', JSON.stringify(mejores.map((p) => p.id)))
  }

  if (
    nsfw.LADO_MINIMO >= 900 &&
    /orden: 'calidad'/.test(rule34) &&
    rule34.includes('mejoresPosts(') &&
    !/ancho < 200 \|\| alto < 200/.test(rule34)
  ) {
    ok('/r34 pide el booru ordenado por score y descarta lo que baja de 500 px')
  } else {
    mal('/r34 puede volver a elegir al azar de un bloque sin ordenar')
  }

  // Los normalizadores tienen que traer ancho/alto/bytes: sin eso
  // calidadDeMedia solo ve el score y elige a ciegas.
  const conMedidas =
    (fuente.match(/ancho: Number/g) || []).length >= 4 && (fuente.match(/bytes: Number/g) || []).length >= 3
  if (conMedidas) {
    ok('los posts traen ancho, alto y peso de todas las fuentes')
  } else {
    mal('hay normalizadores sin dimensiones y la seleccion elige a ciegas')
  }

  // gelbooru manda `sample: 1` (bandera) y la muestra real en `sample_url`, y
  // el md5 del archivo en `md5`. Sin la muestra un original de 30 MB se
  // descartaba entero; sin el md5 el mismo arte espejado pasaba por nuevo.
  if (/p\.sample_url/.test(fuente) && /p\.hash \|\| p\.md5/.test(fuente)) {
    ok('gelbooru aporta la muestra real y el md5 para el dedupe entre boorus')
  } else {
    mal('gelbooru se quedaria sin copia de respaldo y sin hash')
  }

  // Una sola fuente son 50 posts y la seleccion devolvia siempre los mismos
  // seis: la busqueda tiene que juntar varias fuentes (barajadas) y pedir mas
  // de una pagina por fuente.
  const fuentes = nsfw.NOMBRES_FUENTES || []
  const junta =
    fuentes.length >= 7 &&
    ['tbib.org', 'hypnohub.net', 'danbooru.donmai.us', 'xbooru.com'].every((f) => fuentes.includes(f)) &&
    /elegirFuentes\(/.test(fuente) &&
    /barajar\(FUENTES\.filter/.test(fuente) &&
    /Promise\.all\(seleccion\.map/.test(fuente) &&
    /PAGINAS_POR_FUENTE = 2/.test(fuente)
  if (junta) {
    ok('/r34 junta varias fuentes en paralelo y pide dos paginas por fuente')
  } else {
    mal('/r34 puede volver a depender de una sola fuente y repetir el bloque', fuentes.join(', '))
  }

  // rule34.xxx exige user_id y api_key propios: sin key el DAPI contesta
  // "Missing authentication", asi que la fuente tiene que quedar afuera sola
  // en lugar de gastar peticiones en un 200 con texto.
  const config = await import('./config.js')
  const disponibles = nsfw.fuentesDisponibles()
  const sinKey = !config.RULE34_API_KEY
  const rule34Bien =
    fuentes.includes('rule34.xxx') &&
    disponibles.includes('xbooru.com') &&
    (sinKey ? !disponibles.includes('rule34.xxx') : disponibles.includes('rule34.xxx')) &&
    /api\.rule34\.xxx\/index\.php/.test(fuente) &&
    /api_key=\$\{RULE34_API_KEY\}&user_id=\$\{RULE34_USER_ID\}/.test(fuente)
  if (rule34Bien) {
    ok('rule34.xxx usa api_key/user_id y queda apagada mientras no haya key')
  } else {
    mal('rule34.xxx no respeta la credencial o gasta peticiones sin key', disponibles.join(', '))
  }

  // El mismo arte vive espejado en tbib, danbooru y hypnohub con ids distintos:
  // si la memoria mira solo el id, se manda dos veces como si fuera otra imagen.
  const claveHash = 'prueba:hash'
  const hashCompartido = 'a'.repeat(32)
  nsfw.marcarVisto(claveHash, 1, hashCompartido)
  const trasEnvio = nsfw.sinRepetir(claveHash, [
    { id: 2, hash: hashCompartido },
    { id: 3, hash: 'b'.repeat(32) },
  ])
  if (trasEnvio.length === 1 && trasEnvio[0].id === 3) {
    ok('la memoria de /r34 reconoce el mismo archivo espejado en otro booru')
  } else {
    mal('el mismo archivo espejado con otro id pasaria como imagen nueva', JSON.stringify(trasEnvio.map((p) => p.id)))
  }
}

// ───────────── Resumen ─────────────
console.log('')
if (fallos) {
  console.error(`✘ ${fallos} fallo(s) de ${comprobaciones} comprobaciones`)
  process.exit(1)
}
console.log(`✔ ${comprobaciones} comprobaciones OK`)
