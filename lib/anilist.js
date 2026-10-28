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
 * Banda de rareza segun los favoritos de AniList (la misma que usan las
 * tiradas para decidir que personajes entran en cada rareza).
 */
export function rarezaDeFavoritos(favoritos) {
  const f = Number(favoritos || 0)
  if (f >= 15000) return 'mitico'
  if (f >= 8000) return 'legendario'
  if (f >= 2500) return 'epico'
  if (f >= 750) return 'raro'
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
  return {
    nombre,
    imagen: nodo?.image?.large || null,
    favoritos,
    genero: g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null,
    rareza: rarezaDeFavoritos(favoritos),
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
    const rareza = rarezaDeFavoritos(favoritos)
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
