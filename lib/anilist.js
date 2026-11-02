/**
 * Utilidades de AniList compartidas por el gacha y sus listados.
 *
 * Aqui solo hay funciones puras (sin red ni base de datos) para poder
 * probarlas sin conexion: normalizan lo que devuelve AniList y calculan
 * la rareza con la misma banda de favoritos que usan las tiradas.
 */

/** Series por pagina de .serielist */
export const SERIES_POR_PAGINA = 30

/** Cuantos personajes enseña .serieinfo */
export const PERSONAJES_POR_SERIE = 30

/** Sin red para pruebas o para forzar el catalogo local */
export function internetApagada() {
  return process.env.BEERUS_GACHA_LOCAL === '1'
}

/** Nombre comparable: minusculas y solo letras/numeros */
export function normalizarNombre(nombre) {
  return String(nombre || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Clave sin orden ni iniciales: "Monkey D. Luffy" y "Luffy Monkey"
 * comparten clave. Sirve para emparejar variantes de AniList.
 */
export function claveOrdenada(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1)
    .sort()
    .join('')
}

/** Distancia de Levenshtein compacta (variantes de escritura) */
export function distancia(a, b) {
  const m = a.length
  const n = b.length
  if (!m || !n) return m || n
  const t = Array.from({ length: 2 }, () => Array(n + 1).fill(0))
  for (let j = 0; j <= n; j++) t[0][j] = j
  for (let i = 1; i <= m; i++) {
    t[i % 2][0] = i
    for (let j = 1; j <= n; j++) {
      t[i % 2][j] = Math.min(
        t[(i - 1) % 2][j] + 1,
        t[i % 2][j - 1] + 1,
        t[(i - 1) % 2][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return t[m % 2][n]
}

/**
 * Variante de escritura mas cercana dentro de un mapa clave -> { favoritos }.
 * Solo acepta diferencias minimas (1 letra, 2 en claves largas) para no
 * confundir personajes distintos.
 */
export function varianteCercana(clave, porClave = new Map()) {
  if (!clave || clave.length < 6) return null
  let mejor = null
  for (const [otra, dato] of porClave) {
    if (Math.abs(otra.length - clave.length) > 2) continue
    const d = distancia(clave, otra)
    const permitido = Math.min(clave.length, otra.length) >= 10 ? 2 : 1
    if (d > permitido) continue
    if (!mejor || d < mejor.distancia || (d === mejor.distancia && dato.favoritos > mejor.favoritos)) {
      mejor = { distancia: d, favoritos: Number(dato.favoritos || 0) }
    }
  }
  return mejor
}

/**
 * Nombres del catalogo que AniList guarda de otra forma. La busqueda de
 * AniList exige coincidir con las palabras del nombre, asi que estas filas
 * nunca entrarian solas: se traducen al personaje real antes de buscar.
 */
export const ALIAS_ANILIST = {
  darwis: 'Darkness',
  rocksmith: 'Xebec Rocks',
  leafa: 'Suguha Kirigaya',
  l: 'L Lawliet',
  whitebeard: 'Newgate Edward',
  ryomensukuna: 'Sukuna',
}

/**
 * Fichas que la busqueda por nombre no encuentra aunque existan (su nombre
 * en AniList es otro y no aparece en los primeros puestos). Se piden por id.
 */
export const FIJOS_ANILIST = {
  kaido: 46109,
}

/** Nombre que hay que pedirle a AniList (alias conocido o el mismo nombre) */
export function nombreParaAniList(nombre) {
  return ALIAS_ANILIST[normalizarNombre(nombre)] || String(nombre || '').trim()
}

/** Palabras comparables: minusculas, sin acentos y de 3 letras o mas */
export function palabras(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2)
}

/**
 * Terminos a probar en AniList, del mas al menos especifico. La busqueda
 * exige todas las palabras ("Ryomen Sukuna" no da nada, "Sukuna" si), asi
 * que el nombre completo va primero y luego cada palabra (la ultima antes).
 */
export function terminosDeBusqueda(nombre) {
  const base = nombreParaAniList(nombre)
  const terminos = [base]
  for (const palabra of palabras(base).reverse()) {
    if (palabra.length >= 4 && !terminos.some((t) => normalizarNombre(t) === palabra)) {
      terminos.push(palabra)
    }
  }
  return terminos.slice(0, 4)
}

/** ¿La serie pedida esta entre los titulos que da AniList para el candidato? */
export function mismaSerie(esperada, titulos = []) {
  const buscadas = palabras(esperada)
  if (!buscadas.length) return false
  return (Array.isArray(titulos) ? titulos : [titulos]).some((titulo) => {
    const otras = new Set(palabras(titulo))
    return buscadas.some((p) => otras.has(p))
  })
}

/**
 * Parecido (0-100) entre el nombre pedido y un candidato de AniList.
 * Suma 25 puntos si el anime del catalogo coincide con el del candidato,
 * que es lo que distingue "Sukuna" de "Sukuna Gojou" en otra serie.
 * Sin coincidencia de nombre no hay puntos aunque el anime cuadre.
 */
export function puntuarCandidato(consultado, candidato, animeEsperado = null) {
  const pedido = String(consultado || '')
  const nombre = String(candidato?.nombre || '')
  const limpioPedido = normalizarNombre(pedido)
  const limpioNombre = normalizarNombre(nombre)
  if (!limpioPedido || !limpioNombre) return 0
  if (limpioPedido === limpioNombre) return 100
  if (claveOrdenada(pedido) === claveOrdenada(nombre)) return 95

  const pedidas = palabras(pedido)
  const tiene = palabras(nombre)
  if (!pedidas.length || !tiene.length) return 0

  const comunes = pedidas.filter((p) => tiene.includes(p))
  const empiezaIgual = pedidas[0] === tiene[0] && pedidas[0].length >= 4
  const contenidas = tiene.every((p) => pedidas.includes(p))
  const cuadraSerie = mismaSerie(animeEsperado, candidato?.animes)

  let puntaje = 0
  if (pedidas.length === 1 && empiezaIgual) {
    // Nombre suelto ("Naruto"): solo sirve si la serie acompaña o no hay serie
    puntaje = animeEsperado && !cuadraSerie ? 50 : 85
  } else if (empiezaIgual) {
    puntaje = comunes.length >= 2 ? 80 + Math.min(10, (comunes.length - 2) * 10) : 50
  } else if (contenidas && pedidas.length > 1) {
    // "Ryomen Sukuna" -> "Sukuna". Con serie del catalogo se exige que cuadre
    // para no confundir "Patrick Star" con el personaje "Patrick".
    puntaje = cuadraSerie ? 85 : animeEsperado ? 40 : 72
  } else if (comunes.length) {
    puntaje = 40 + Math.min(20, (comunes.length / Math.max(pedidas.length, tiene.length)) * 20)
  }

  if (cuadraSerie && puntaje < 75) puntaje = Math.min(99, puntaje + 25)
  return Math.round(puntaje)
}

/** Puntaje minimo para aceptar un candidato de AniList */
export const UMBRAL_CANDIDATO = 70

/**
 * Mejor candidato de una busqueda de AniList, o null si ninguno se parece
 * lo suficiente. En empate gana el mas popular.
 */
export function elegirCandidato(consultado, candidatos = [], animeEsperado = null) {
  let mejor = null
  for (const candidato of Array.isArray(candidatos) ? candidatos : []) {
    if (!candidato?.nombre) continue
    const puntaje = puntuarCandidato(consultado, candidato, animeEsperado)
    if (puntaje < UMBRAL_CANDIDATO) continue
    if (
      !mejor ||
      puntaje > mejor.puntaje ||
      (puntaje === mejor.puntaje &&
        Number(candidato.favoritos || 0) > Number(mejor.candidato.favoritos || 0))
    ) {
      mejor = { candidato, puntaje }
    }
  }
  return mejor
}

/**

/* ─────────── Rarezas: popularidad, serie e importancia ───────────
 *
 * Una rareza de gacha tiene que responder tres preguntas a la vez:
 *
 *   1. ¿Cuanto se quiere a este personaje?      (favoritos propios)
 *   2. ¿Cuanto pesa la serie de la que sale?    (popularidad del anime)
 *   3. ¿Cuanto manda el dentro de esa serie?    (lugar en el reparto)
 *
 * El sistema viejo solo miraba (1). Con eso, un secundario de One Piece con
 * 300 favoritos nacía mitico porque su serie es enorme, y un protagonista de
 * una serie de nicho con 4.000 favoritos caia a raro. Las tres senales ahora
 * se mezclan en un score 0-100 y la banda sale de ahi.
 *
 * Cada componente se mide con la misma vara (0-100):
 *
 *   popularidad del personaje = 20 * log10(favoritos + 1)
 *   popularidad de la serie   = 20 * log10(popularity / 100)
 *   importancia en la serie   = 100 * favoritos / favoritos del que mas tiene
 *
 * La escala logaritmica es obligatoria en las dos primeras: los favoritos de
 * AniList van de 50 a 40.000 y la popularidad de 1.000 a 900.000; en lineal
 * todas las bandas bajas se aplastan contra cero.
 *
 * La importancia es relativa a proposito. Si el pool tiene 40 personajes de
 * una serie y uno concentra el 80 % de los favoritos, ese es la cara de la
 * serie; el que tiene el 3 % es un extra, aunque la serie sea famosa.
 */

/** Pesos del score compuesto; suman 1 */
export const PESOS_RAREZA = { personaje: 0.55, serie: 0.2, importancia: 0.25 }

/** Valores neutrales cuando la ficha no trae serie o no se conoce el reparto */
export const SERIE_NEUTRAL = 40
export const IMPORTANCIA_NEUTRAL = 50

/** Que tan querido es el personaje (0-100): 1.000 favoritos = 60 puntos */
export function popularidadDelPersonaje(favoritos) {
  const f = Math.max(0, Number(favoritos) || 0)
  return Math.max(0, Math.min(100, 20 * Math.log10(f + 1)))
}

/** Que tan popular es la serie (0-100): 100.000 seguidores = 60 puntos */
export function popularidadDeLaSerie(popularidad) {
  const p = Math.max(0, Number(popularidad) || 0)
  if (p <= 100) return 0
  return Math.max(0, Math.min(100, 20 * Math.log10(p / 100)))
}

/**
 * Peso del personaje dentro de su reparto (0-100).
 * `maximo` es el favorito del personaje mas querido de esa misma serie.
 */
export function importanciaEnLaSerie(favoritos, maximo) {
  const f = Math.max(0, Number(favoritos) || 0)
  const max = Math.max(0, Number(maximo) || 0)
  if (!max) return IMPORTANCIA_NEUTRAL
  return Math.max(0, Math.min(100, (f / max) * 100))
}

/**
 * Cortes de rareza sobre el score compuesto.
 *
 * No son a ojo: son los cuantiles medidos sobre el pool alcanzable de AniList
 * (los 5.000 personajes con mas favoritos, 100 paginas de 50). El reparto
 * queda 1 / 3 / 9 / 27 / 59 % del pool, igual que antes, pero calculado sobre
 * el score compuesto y no sobre los favoritos sueltos:
 *
 *   mitico 47 · legendario 142 · epico 427 · raro 1.281 · comun 2.845
 *
 * `puntaje` es el piso de la banda (inclusive).
 */
export const BANDAS_RAREZA = [
  { rareza: 'mitico', puntaje: 85 },
  { rareza: 'legendario', puntaje: 79 },
  { rareza: 'epico', puntaje: 71 },
  { rareza: 'raro', puntaje: 61 },
]

/**
 * Score de rareza (0-100): mezcla de popularidad del personaje, popularidad
 * de la serie e importancia dentro de ella (ver PESOS_RAREZA).
 *
 * @param {{favoritos?: number, media?: object|null, serieMaximo?: number|null, importancia?: number|null}} datos
 *   media: nodo de AniList de la serie (usa `popularity` o `pop`)
 *   serieMaximo: favoritos del personaje mas querido de esa serie
 *   importancia: peso ya calculado (0-100); si viene se usa tal cual
 */
export function calcularRarezaScore({ favoritos = 0, media = null, serieMaximo = null, importancia = null } = {}) {
  const f = Math.max(0, Number(favoritos) || 0)
  const pj = popularidadDelPersonaje(f)
  const pop = Number(media?.popularity ?? media?.pop ?? 0)
  const serie = pop > 0 ? popularidadDeLaSerie(pop) : SERIE_NEUTRAL
  const guardada = Number(importancia)
  const imp = Number.isFinite(guardada) && guardada > 0
    ? Math.max(0, Math.min(100, guardada))
    : serieMaximo
      ? importanciaEnLaSerie(f, serieMaximo)
      : IMPORTANCIA_NEUTRAL

  const score =
    PESOS_RAREZA.personaje * pj + PESOS_RAREZA.serie * serie + PESOS_RAREZA.importancia * imp
  return Math.round(Math.max(0, Math.min(100, score)))
}

/** De score (0-100) a rareza */
export function rarezaDesdeScore(score) {
  const s = Number(score) || 0
  for (const banda of BANDAS_RAREZA) if (s >= banda.puntaje) return banda.rareza
  return 'comun'
}

/**
 * Banda de un personaje cuando solo se conocen sus favoritos (ficha traida
 * por una busqueda suelta, sin reparto de la serie).
 */
export function rarezaDeFavoritos(favoritos) {
  return rarezaDesdeScore(calcularRarezaScore({ favoritos }))
}

/** Nodo de AniList (Page.media o Media) -> serie del menu */
export function serieDeMedia(media) {
  if (!media?.id) return null
  const titulo = String(media.title?.romaji || media.title?.english || '').trim()
  if (!titulo) return null
  return {
    id: Number(media.id),
    idMal: Number(media.idMal) || null,
    titulo,
    favoritos: Number(media.favourites || 0),
    anio: Number(media.seasonYear) || null,
    imagen: media.coverImage?.medium || null,
  }
}

/**
 * Nodo de AniList (Media.characters) -> personaje con rareza calculada.
 * `serieMaximo` sale del mismo reparto: es el que tiene mas favoritos.
 * `media` se pasa cuando el nodo no trae la serie colgada (listado por serie).
 */
export function personajeDeNodo(nodo, { serieMaximo = null, media = null } = {}) {
  const nombre = String(nodo?.name?.full || '').trim()
  if (!nombre) return null
  const favoritos = Number(nodo?.favourites || 0)
  const g = String(nodo?.gender || '').toLowerCase()
  const serie = media ?? nodo?.media?.nodes?.[0]

  return {
    nombre,
    imagen: nodo?.image?.large || null,
    favoritos,
    genero: g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null,
    rareza: rarezaDesdeScore(calcularRarezaScore({ favoritos, media: serie, serieMaximo })),
  }
}

/** El que mas favoritos tiene de un reparto (para la importancia relativa) */
export function maximoDeReparto(personajes = []) {
  let max = 0
  for (const p of Array.isArray(personajes) ? personajes : []) {
    const f = Number(p?.favoritos ?? p?.favourites ?? 0)
    if (f > max) max = f
  }
  return max
}

/**
 * Plan de actualizacion de rarezas: compara las filas del catalogo con el
 * indice de AniList y devuelve solo las que tienen datos.
 * El indice puede traer dos claves: `nombre|anime` (exacta) y `nombre`.
 * Cada entrada: { id, nombre, rareza, favoritos, seriePop, importancia, cambia }.
 */
export function planRarezas(filas = [], indice = new Map(), maximosPorSerie = new Map()) {
  const plan = []
  for (const fila of Array.isArray(filas) ? filas : []) {
    const nombre = normalizarNombre(fila?.nombre)
    if (!nombre) continue
    const anime = normalizarNombre(fila?.anime)
    const dato =
      indice.get(`${nombre}|${anime}`) ||
      indice.get(nombre) ||
      indice.get(claveOrdenada(fila?.nombre)) ||
      null
    if (!dato) continue

    const favoritos = Number(dato.favoritos || 0)
    const serieMaximo = Number(dato.serieMaximo) || Number(maximosPorSerie.get(normalizarNombre(fila?.anime))) || null
    const seriePop = Number(dato.media?.popularity ?? dato.media?.pop ?? 0)
    const score = calcularRarezaScore({ favoritos, media: dato.media || null, serieMaximo })
    const rareza = rarezaDesdeScore(score)
    const importancia = serieMaximo ? Math.round(importanciaEnLaSerie(favoritos, serieMaximo)) : IMPORTANCIA_NEUTRAL
    plan.push({
      id: fila.id,
      nombre: fila.nombre,
      rareza,
      favoritos,
      seriePop: Math.round(seriePop),
      importancia,
      cambia:
        fila.rareza !== rareza ||
        Number(fila.favoritos ?? -1) !== favoritos ||
        Number(fila.serie_pop ?? -1) !== Math.round(seriePop) ||
        Number(fila.importancia ?? -1) !== importancia,
    })
  }
  return plan
}
