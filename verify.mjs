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

const comandos = await cargarComandos()
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

  // WhatsApp descarta en esta cuenta los botones, listas y quick replies:
  // el menu tiene que salir siempre como imagen con pie de foto.
  const prohibido = [
    'relayMessage',
    'interactiveMessage',
    'nativeFlowMessage',
    'quick_reply',
    'single_select',
    'enviarMenuConBoton',
    'BOTON_TODOS',
  ]
  const sobra = prohibido.filter((x) => menuFuente3.includes(x))
  if (!sobra.length) ok('el menu no arma botones ni mensajes interactivos (WhatsApp los descarta)')
  else mal('menu.js sigue armando mensajes que el cliente no dibuja', sobra.join(', '))

  if (!configFuente3.includes('MENU_CON_BOTON') && !configFuente3.includes('MENU_CON_LISTA')) {
    ok('no quedan interruptores de menu con botones en config.js')
  } else {
    mal('config.js conserva MENU_CON_BOTON / MENU_CON_LISTA')
  }

  if (!fs.existsSync(path.join(RAIZ, 'lib/botones.js')) && !indiceFuente3.includes('lib/botones.js')) {
    ok('se borro el modulo de botones y su enganche en el despachador')
  } else {
    mal('quedan restos del modulo de botones')
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

  const bandas = [
    [0, 'comun'],
    [749, 'comun'],
    [750, 'raro'],
    [2499, 'raro'],
    [2500, 'epico'],
    [7999, 'epico'],
    [8000, 'legendario'],
    [14999, 'legendario'],
    [15000, 'mitico'],
    [38845, 'mitico'],
  ]
  const malas = bandas.filter(([fav, esperada]) => anilist.rarezaDeFavoritos(fav) !== esperada)
  if (!malas.length) {
    ok('la rareza sale de la banda de favoritos de AniList')
  } else {
    mal('bandas de rareza mal calculadas', malas.map(([f]) => `${f}->${anilist.rarezaDeFavoritos(f)}`).join(', '))
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

  const pj = anilist.personajeDeNodo({
    name: { full: 'Levi' },
    image: { large: 'https://img.test/levi.jpg' },
    gender: 'Male',
    favourites: 38845,
  })
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
    fuente.includes('rarezaDeFavoritos(c.favourites) === rareza') &&
    /rareza: rarezaDeFavoritos\(crudo\.favoritos\)/.test(fuente) &&
    /CONSULTA = 'query[^']*favourites/.test(fuente) &&
    !fuente.includes('RANGOS_POR_RAREZA') &&
    !fuente.includes('enBanda(')
  ) {
    ok('la tirada usa la misma banda de favoritos que .serielist/.serieinfo')
  } else {
    mal('la tirada no usa rarezaDeFavoritos o conserva bandas solapadas')
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

  const fronteras = [
    [749, 'comun'],
    [750, 'raro'],
    [2499, 'raro'],
    [2500, 'epico'],
    [7999, 'epico'],
    [8000, 'legendario'],
    [14999, 'legendario'],
    [15000, 'mitico'],
  ]
  const cruzan = fronteras.filter(([f, r]) => anilist.rarezaDeFavoritos(f) !== r)
  if (!cruzan.length) {
    ok('los bordes de rareza de la tirada coinciden con los de las listas')
  } else {
    mal('bordes de rareza distintos a las listas', cruzan.map(([f]) => `${f}->${anilist.rarezaDeFavoritos(f)}`).join(', '))
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
    ['levi', { favoritos: 38845 }],
    ['luffymonkey', { favoritos: 36000 }],
    ['sakura|cardcaptorsakura', { favoritos: 900 }],
    ['sakura', { favoritos: 12000 }],
  ])
  const plan = anilist.planRarezas(
    [
      { id: 1, nombre: 'Levi', anime: 'Shingeki no Kyojin', rareza: 'comun', favoritos: 38845 },
      { id: 2, nombre: 'Luffy Monkey', anime: 'One Piece', rareza: 'mitico', favoritos: 36000 },
      { id: 3, nombre: 'Sakura', anime: 'Cardcaptor Sakura', rareza: 'epico', favoritos: null },
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
    !plan.some((p) => p.id === 4)
  ) {
    ok('planRarezas corrige solo lo que cambia, respeta la serie exacta y empareja variantes')
  } else {
    mal('planRarezas no calcula bien los cambios', JSON.stringify(plan))
  }

  const sincroFuente = fuente.slice(fuente.indexOf('export async function sincronizarRarezas'))
  if (
    sincroFuente.includes('planRarezas(filas, indice)') &&
    sincroFuente.includes('actualizarRarezaPersonaje(') &&
    sincroFuente.includes('guardarAjuste(CLAVE_SYNC') &&
    sincroFuente.includes('internetApagada()')
  ) {
    ok('la sincronizacion reescribe rareza, valor y favoritos del catalogo')
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

// ───────────── Resumen ─────────────
console.log('')
if (fallos) {
  console.error(`✘ ${fallos} fallo(s) de ${comprobaciones} comprobaciones`)
  process.exit(1)
}
console.log(`✔ ${comprobaciones} comprobaciones OK`)
