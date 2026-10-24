/**
 * Acceso a internet del gacha: si un personaje no esta en el catalogo,
 * se busca en AniList (API GraphQL publica, sin clave) y se importa con
 * su imagen de portada. Todo falla en silencio: sin red el bot responde
 * como siempre ("No encontre el personaje").
 */
import {
  db,
  personajePorNombre,
  obtenerPersonajeGacha,
  agregarPersonajeGacha,
  listarPersonajesGacha,
  votosPersonaje,
} from '../database/db.js'
import { RAREZAS } from '../database/catalogo.js'

const ANILIST = 'https://graphql.anilist.co'
const JIKAN = 'https://api.jikan.moe/v4'

const CONSULTA = 'query ($search: String) { Character(search: $search) { id name { full } image { large } gender media(perPage: 1) { nodes { title { romaji english } } } } }'

/** Busca un personaje en AniList por nombre y devuelve los datos crudos */
async function buscarEnAniList(nombre) {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: CONSULTA, variables: { search: String(nombre).trim() } }),
  })
  if (!res.ok) return null
  const datos = await res.json()
  const elegido = datos?.data?.Character
  if (!elegido?.id) return null

  const g = String(elegido.gender || '').toLowerCase()
  const genero = g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null
  const serie = elegido.media?.nodes?.[0]?.title
  const anime = String(serie?.romaji || serie?.english || '').trim() || 'Desconocido'

  return {
    nombre: String(elegido.name?.full || nombre).trim(),
    anime,
    imagen: elegido.image?.large || null,
    genero,
    fuente: 'AniList',
  }
}

/** Plan B si AniList esta caido: Jikan (MyAnimeList) */
async function buscarEnJikan(nombre) {
  const url = `${JIKAN}/characters?q=${encodeURIComponent(nombre)}&limit=3`
  const res = await fetch(url)
  if (!res.ok) return null
  const datos = await res.json()
  const lista = Array.isArray(datos?.data) ? datos.data : []
  if (!lista.length) return null

  const limpio = String(nombre).trim().toLowerCase()
  const elegido = lista.find((c) => String(c.name || '').toLowerCase() === limpio) || lista[0]
  if (!elegido?.mal_id) return null

  let genero = null
  try {
    const res2 = await fetch(`${JIKAN}/characters/${elegido.mal_id}`)
    if (res2.ok) {
      const full = await res2.json()
      const g = String(full?.data?.gender || '').toLowerCase()
      if (g.startsWith('f')) genero = 'F'
      else if (g.startsWith('m')) genero = 'M'
    }
  } catch {
    // sin ficha completa: genero queda desconocido
  }

  const anime =
    elegido.anime?.[0]?.anime?.title ||
    elegido.anime?.[0]?.title ||
    elegido.title ||
    'Desconocido'
  const imagen = elegido.images?.jpg?.large_image_url || elegido.images?.jpg?.image_url || null

  return {
    nombre: String(elegido.name || nombre).trim(),
    anime: String(anime).trim() || 'Desconocido',
    imagen: imagen || null,
    genero,
    fuente: 'Jikan (MyAnimeList)',
  }
}

async function buscarEnInternet(nombre) {
  try {
    const anilist = await buscarEnAniList(nombre)
    if (anilist) return anilist
  } catch {
    // AniList caido: probamos con Jikan
  }
  try {
    return await buscarEnJikan(nombre)
  } catch {
    return null
  }
}

/**
 * Busca un personaje en el catalogo y, si no existe, lo importa de
 * internet (AniList, con Jikan de respaldo) y lo deja sembrado en la DB
 * para futuras tiradas. Devuelve { personaje, importado } o null.
 */
export async function buscarOImportar(nombre) {
  const ref = String(nombre || '').trim()
  if (!ref) return null

  const exacto = personajePorNombre(ref)
  if (exacto) return { personaje: exacto, importado: false }

  const crudo = await buscarEnInternet(ref)
  if (!crudo) return null

  // AniList da variantes del nombre (apellidos, romanizacion): si alguna
  // ya vive en el catalogo no creamos duplicados
  const dup = personajePorNombre(crudo.nombre)
  if (dup) return { personaje: dup, importado: false }

  const id = agregarPersonajeGacha({
    nombre: crudo.nombre,
    anime: crudo.anime,
    rareza: 'comun',
    imagen: crudo.imagen,
    genero: crudo.genero,
  })
  const personaje = obtenerPersonajeGacha(id)
  return personaje ? { personaje, importado: true } : null
}

/* ─────────── Tiradas directas desde internet ───────────
 * La tirada usa AniList como fuentes: se pide una pagina al azar del
 * rango de paginas correspondiente a la rareza pedida y se elige un
 * personaje al azar entre los que caen en su banda de favoritos.
 * Con eso la rareza mantiene sentido aun importando sobre la marcha.
 */
const RANGOS_POR_RAREZA = {
  mitico: { paginas: [1, 2], min: 15000 },
  legendario: { paginas: [1, 4], min: 8000, max: 22000 },
  epico: { paginas: [3, 12], min: 2500, max: 9500 },
  raro: { paginas: [9, 36], min: 750, max: 4000 },
  comun: { paginas: [30, 65], max: 1100 },
}

const LISTA_PAGINA = 'query ($page: Int) { Page(page: $page, perPage: 50) { characters(sort: FAVOURITES_DESC) { name { full } favourites gender image { large } media(perPage: 1, type: ANIME, sort: POPULARITY_DESC) { nodes { title { romaji } } } } } }'

function normalizarNombre(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function claveOrdenada(n) {
  return String(n || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join('_')
}

/** Distancia de Levenshtein compacta para variantes (Gojo Satoru/Satoru Gojou) */
function distancia(a, b) {
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

/** Busca una fila del catalogo cuyo nombre sea la misma persona (variantes) */
function filaSimilar(nombre) {
  const objetivo = normalizarNombre(nombre)
  const clave = claveOrdenada(nombre)
  for (const fila of listarPersonajesGacha()) {
    const n = normalizarNombre(fila.nombre)
    if (n === objetivo) return fila
    if (claveOrdenada(fila.nombre) === clave) return fila
    const corto = Math.min(n.length, objetivo.length)
    if (corto >= 8 && distancia(n, objetivo) <= 2) return fila
  }
  return null
}

function enBanda(favoritos, rareza) {
  const r = RANGOS_POR_RAREZA[rareza]
  if (!r) return true
  const f = Number(favoritos || 0)
  if (r.min !== undefined && f < r.min) return false
  if (r.max !== undefined && f >= r.max) return false
  return true
}

/**
 * Tira un personaje directamente de internet (AniList) dentro de la banda
 * de favoritos de la rareza pedida. Si ya vive en el catalogo reusa su fila,
 * si no existe lo importa con esa rareza. Devuelve una fila de la DB o null.
 */
export async function tirarDeInternet(rareza) {
  const banda = RANGOS_POR_RAREZA[rareza]
  if (!banda) return null

  for (let intento = 0; intento < 3; intento++) {
    const page = banda.paginas[0] + Math.floor(Math.random() * (banda.paginas[1] - banda.paginas[0] + 1))
    let lista = []
    try {
      const res = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: LISTA_PAGINA, variables: { page } }),
      })
      if (!res.ok) continue
      const datos = await res.json()
      lista = datos?.data?.Page?.characters ?? []
    } catch {
      continue
    }

    const elegibles = lista.filter(
      (c) =>
        c?.name?.full &&
        c.image?.large &&
        c.media?.nodes?.[0]?.title?.romaji &&
        enBanda(c.favourites, rareza),
    )
    if (!elegibles.length) continue

    const elegido = elegibles[Math.floor(Math.random() * elegibles.length)]
    const dup = filaSimilar(elegido.name.full)
    if (dup) {
      // Ya vive en el catalogo: alineamos su rareza con la banda Welch (AniList
      // es la fuente de verdad) respetando los bonus de votos acumulados
      if (dup.rareza !== rareza) {
        const votos = votosPersonaje(dup.id)
        const valor = (RAREZAS[rareza]?.valor ?? 15) + votos * 5
        db.prepare('UPDATE gacha_personajes SET rareza = ?, valor = ? WHERE id = ?').run(rareza, valor, dup.id)
      }
      return obtenerPersonajeGacha(dup.id)
    }

    const id = agregarPersonajeGacha({
      nombre: String(elegido.name.full).trim(),
      anime: String(elegido.media.nodes[0].title.romaji).trim() || 'Desconocido',
      rareza,
      imagen: elegido.image.large,
      genero: String(elegido.gender || '').toLowerCase().startsWith('f') ? 'F'
        : String(elegido.gender || '').toLowerCase().startsWith('m') ? 'M' : null,
    })
    return obtenerPersonajeGacha(id)
  }
  return null
}
