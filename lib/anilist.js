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
 * Bandas de rareza por favoritos de AniList.
 *
 * AniList no publica una tabla de rarezas, asi que la unica senal honesta de
 * "cuanto se quiere a este personaje" son sus favoritos. El corte esta
 * calibrado contra el catalogo real (369 personajes con datos), y con estos
 * pisos el reparto queda:
 *
 *   48 % comun · 26 % raro · 17 % epico · 7 % legendario · 1,6 % mitico
 *
 * Eso es la forma de una piramide de gacha. Antes el corte era 15000/8000/
 * 2500/750, con lo que el 75 % del catalogo salia mitico y la etiqueta no
 * significaba nada: un secundario de relleno valia lo mismo que Lelouch.
 *
 * `puntaje` es el piso de la misma banda en la escala 0-100 que devuelve
 * `calcularRarezaScore`, para que las dos vias (favoritos y score) nunca se
 * contradigan.
 */
export const BANDAS_RAREZA = [
  { rareza: 'mitico', favoritos: 30000, puntaje: 88 },
  { rareza: 'legendario', favoritos: 20000, puntaje: 76 },
  { rareza: 'epico', favoritos: 12500, puntaje: 62 },
  { rareza: 'raro', favoritos: 7500, puntaje: 44 },
]

/**
 * Escalones de puntaje en orden ascendente, derivados de BANDAS_RAREZA.
 * El ultimo escalon es una cola artificial para que un personaje con muchos
 * mas favoritos que el piso mitico siga subiendo en vez de topar en 88.
 */
const ESCALONES = [
  { rareza: 'comun', favoritos: 0, puntaje: 0 },
  ...[...BANDAS_RAREZA].reverse(),
  { rareza: 'mitico', favoritos: 60000, puntaje: 100 },
]

/** Piso y techo de puntaje de una rareza (el techo es exclusivo) */
function rangoPuntaje(rareza) {
  const indice = ESCALONES.findIndex((e) => e.rareza === rareza)
  if (indice < 0) return { piso: 0, techo: ESCALONES[1].puntaje }
  const siguiente = ESCALONES.slice(indice + 1).find((e) => e.rareza !== rareza)
  return { piso: ESCALONES[indice].puntaje, techo: siguiente ? siguiente.puntaje : 100 }
}

/**
 * Bonus por contexto de la serie, en puntos de puntaje (-1 a 8).
 *
 * A proposito NO puede cambiar la banda: solo reordena dentro de ella. Antes
 * la popularidad de la serie era el factor principal (una serie de 300.000
 * seguidores daba 50 de los 55 puntos de mitico), asi que cualquier personaje
 * de One Piece, Naruto o AoT nacia mitico aunque tuviera 300 favoritos.
 */
function bonusDeSerie(media, anio) {
  const pop = Number(media?.popularity || media?.pop || 0)
  const ptsPop = pop >= 400000 ? 4 : pop >= 150000 ? 2.5 : pop >= 50000 ? 1 : 0

  // Puntuacion media de la serie (60-100) -> 0 a 3 puntos
  const mean = Number(media?.meanScore || media?.mean || 0)
  const ptsSerie = mean > 0 ? (mean / 100) * 3 : 0

  // Anio: reciente suma un poco, clasico de los 80/90 resta
  const y = Number(anio || 0)
  const ptsAnio = y >= 2020 ? 1 : y >= 2010 ? 0.5 : y <= 1990 ? -1 : 0

  return ptsPop + ptsSerie + ptsAnio
}

/**
 * Score de rareza (0-100).
 *
 * Base: interpolacion logaritmica entre los pisos de banda. Logaritmica
 * porque los favoritos de AniList se mueven en ordenes de magnitud (de 50 a
 * 40.000) y en escala lineal todas las bandas bajas se aplastan contra 0.
 *
 * La banda que sale de este score es SIEMPRE la misma que da
 * `rarezaDeFavoritos`: el bonus de serie se recorta al rango de la banda.
 * El parametro `media` existe para desempatar dentro de la banda (orden del
 * .gachaboard), no para subir de tier.
 */
export function calcularRarezaScore({ favoritos = 0, media = null, anio = null } = {}) {
  const f = Math.max(0, Number(favoritos) || 0)

  let indice = ESCALONES.length - 1
  while (indice > 0 && f < ESCALONES[indice].favoritos) indice -= 1

  const bajo = ESCALONES[indice]
  const alto = ESCALONES[Math.min(indice + 1, ESCALONES.length - 1)]

  let puntaje = bajo.puntaje
  const rango = Math.log10(Math.max(1, alto.favoritos)) - Math.log10(Math.max(1, bajo.favoritos))
  if (rango > 0 && f > bajo.favoritos) {
    const avance = (Math.log10(Math.max(1, f)) - Math.log10(Math.max(1, bajo.favoritos))) / rango
    puntaje = bajo.puntaje + Math.min(1, Math.max(0, avance)) * (alto.puntaje - bajo.puntaje)
  }

  const { piso, techo } = rangoPuntaje(rarezaDesdeScore(puntaje))
  const conBonus = puntaje + bonusDeSerie(media, anio)
  return Math.round(Math.min(Math.max(conBonus, piso), techo - 1))
}

/** De score (0-100) a rareza. Misma banda que rarezaDeFavoritos. */
export function rarezaDesdeScore(score) {
  const s = Number(score) || 0
  for (const banda of BANDAS_RAREZA) if (s >= banda.puntaje) return banda.rareza
  return 'comun'
}

/** Banda de rareza segun los favoritos de AniList */
export function rarezaDeFavoritos(favoritos) {
  const f = Math.max(0, Number(favoritos) || 0)
  for (const banda of BANDAS_RAREZA) if (f >= banda.favoritos) return banda.rareza
  return 'comun'
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

/** Nodo de AniList (Media.characters) -> personaje con rareza calculada */
export function personajeDeNodo(nodo) {
  const nombre = String(nodo?.name?.full || '').trim()
  if (!nombre) return null
  const favoritos = Number(nodo?.favourites || 0)
  const g = String(nodo?.gender || '').toLowerCase()
  
  // Obtener info de la serie desde media (si disponible)
  const media = nodo?.media?.nodes?.[0]
  
  return {
    nombre,
    imagen: nodo?.image?.large || null,
    favoritos,
    genero: g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null,
    // Usar el nuevo sistema de rareza basado en score compuesto
    rareza: rarezaDesdeScore(calcularRarezaScore({
      favoritos,
      media,
      anio: media?.seasonYear || null
    })),
  }
}

/**
 * Plan de actualizacion de rarezas: compara las filas del catalogo con el
 * indice de AniList y devuelve solo las que tienen datos.
 * El indice puede traer dos claves: `nombre|anime` (exacta) y `nombre`.
 * Cada entrada: { id, nombre, rareza, favoritos, cambia }.
 */
export function planRarezas(filas = [], indice = new Map()) {
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
    const score = calcularRarezaScore({ favoritos, media: dato.media || null, anio: dato.anio })
    const rareza = rarezaDesdeScore(score)
    plan.push({
      id: fila.id,
      nombre: fila.nombre,
      rareza,
      favoritos,
      cambia: fila.rareza !== rareza || Number(fila.favoritos ?? -1) !== favoritos,
    })
  }
  return plan
}
