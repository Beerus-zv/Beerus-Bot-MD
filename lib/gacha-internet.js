/**
 * Acceso a internet del gacha: si un personaje no esta en el catalogo,
 * se busca en AniList (API GraphQL publica, sin clave) y se importa con
 * su imagen de portada. Todo falla en silencio: sin red el bot responde
 * como siempre ("No encontre el personaje").
 */
import {
  personajePorNombre,
  obtenerPersonajeGacha,
  agregarPersonajeGacha,
  actualizarRarezaPersonaje,
  listarPersonajesGacha,
  votosPersonaje,
  obtenerAjuste,
  guardarAjuste,
} from '../database/db.js'
import { RAREZAS } from '../database/catalogo.js'
import {
  SERIES_POR_PAGINA,
  FIJOS_ANILIST,
  claveOrdenada,
  elegirCandidato,
  internetApagada,
  nombreParaAniList,
  normalizarNombre,
  personajeDeNodo,
  planRarezas,
  calcularRarezaScore,
  rarezaDesdeScore,
  rarezaDeFavoritos,
  serieDeMedia,
  terminosDeBusqueda,
  varianteCercana,
  distancia,
} from './anilist.js'

const ANILIST = 'https://graphql.anilist.co'
const JIKAN = 'https://api.jikan.moe/v4'

/**
 * Busqueda por nombre: `Page.characters(search:)` devuelve varios candidatos
 * ordenados por parecido, mientras que `Character(search:)` responde 404 si
 * el nombre no coincide palabra por palabra ("Ryomen Sukuna" no existe, pero
 * "Sukuna" si). Con la lista se elige el mejor por nombre + serie.
 */
const CONSULTA = `query ($search: String) {
  Page(page: 1, perPage: 10) {
    characters(search: $search, sort: SEARCH_MATCH) {
      id
      name { full }
      image { large }
      gender
      favourites
      media(perPage: 3, type: ANIME, sort: POPULARITY_DESC) { nodes { title { romaji english } } }
    }
  }
}`

/** Misma ficha pero por id, para los nombres que la busqueda no encuentra */
const CONSULTA_ID = `query ($id: Int) {
  Character(id: $id) {
    id
    name { full }
    image { large }
    gender
    favourites
    media(perPage: 3, type: ANIME, sort: POPULARITY_DESC) { nodes { title { romaji english } } }
  }
}`

/** Nodo de la busqueda de AniList -> candidato con sus titulos de serie */
function candidatoDeBusqueda(nodo) {
  const titulos = (nodo?.media?.nodes || [])
    .flatMap((n) => [n?.title?.romaji, n?.title?.english])
    .filter(Boolean)
  const principal = nodo?.media?.nodes?.[0]?.title
  const g = String(nodo?.gender || '').toLowerCase()
  return {
    id: Number(nodo?.id) || null,
    nombre: String(nodo?.name?.full || '').trim(),
    animes: titulos,
    anime: String(principal?.romaji || principal?.english || '').trim() || 'Desconocido',
    imagen: nodo?.image?.large || null,
    genero: g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null,
    favoritos: Number(nodo?.favourites || 0),
    fuente: 'AniList',
  }
}

/**
 * Busca un personaje en AniList por nombre y devuelve el mejor candidato.
 * Prueba el nombre completo y luego sus palabras (Ryomen -> Sukuna) y
 * `animeEsperado` (la serie del catalogo) desempata nombres repetidos.
 */
async function buscarEnAniList(nombre, animeEsperado = null) {
  const fijo = FIJOS_ANILIST[normalizarNombre(nombre)]
  if (fijo) {
    const personaje = await personajePorId(fijo).catch(() => null)
    if (personaje) return personaje
  }

  const base = nombreParaAniList(nombre)
  if (!base) return null

  for (const termino of terminosDeBusqueda(nombre)) {
    const lista = await candidatosDeBusqueda(termino)
    if (!Array.isArray(lista) || !lista.length) continue
    const elegido = elegirCandidato(base, lista.map(candidatoDeBusqueda), animeEsperado)
    if (elegido) return elegido.candidato
  }
  return null
}

/** Peticion GraphQL de una pagina de candidatos; null si la red falla */
async function candidatosDeBusqueda(termino) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: CONSULTA, variables: { search: termino } }),
      })
      if (res.status === 429) {
        // AniList bloquea rafagas: la ventana ronda los 40-60 s
        await esperar429(res, intento)
        continue
      }
      if (!res.ok) return null
      const datos = await res.json()
      return datos?.data?.Page?.characters ?? []
    } catch {
      await esperar(300 * (intento + 1))
    }
  }
  return null
}

/** Ficha concreta de AniList por id (para nombres que la busqueda no halla) */
async function personajePorId(id) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: CONSULTA_ID, variables: { id } }),
      })
      if (res.status === 429) {
        await esperar429(res, intento)
        continue
      }
      if (!res.ok) return null
      const datos = await res.json()
      const nodo = datos?.data?.Character
      return nodo?.id ? candidatoDeBusqueda(nodo) : null
    } catch {
      await esperar(300 * (intento + 1))
    }
  }
  return null
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
    favoritos: 0,
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
    rareza: rarezaDeFavoritos(crudo.favoritos),
    imagen: crudo.imagen,
    genero: crudo.genero,
    favoritos: crudo.favoritos ?? null,
  })
  const personaje = obtenerPersonajeGacha(id)
  return personaje ? { personaje, importado: true } : null
}

/* ─────────── Tiradas directas desde internet ───────────
 * La tirada usa AniList como fuente: se pide una pagina al azar de las que
 * contienen la banda de favoritos de la rareza pedida y se elige un
 * personaje al azar entre los que caen EXACTAMENTE en esa banda.
 * La banda es la misma que usan .serielist/.serieinfo (rarezaDeFavoritos),
 * asi la ficha de la tirada y las listas nunca se contradicen.
 * AniList solo permite llegar a la pagina 100 (5000 personajes).
 *
 * Los rangos salen de medir AniList de verdad (sort FAVOURITES_DESC, 50 por
 * pagina): p1 va de 39.321 a 15.535 favoritos, p2 de 15.402 a 11.623, p4 de
 * 8.757 a 7.102 y de la p5 en adelante ya todo esta por debajo de 7.500.
 * Por eso las bandas altas viven casi todas en las dos primeras paginas.
 */
export const PAGINAS_POR_RAREZA = {
  mitico: [1, 1],
  legendario: [1, 2],
  epico: [1, 2],
  raro: [2, 5],
  comun: [5, 100],
}

/** Rango de paginas de una tirada libre (cualquier rareza) */
export const PAGINAS_TIRADA_LIBRE = [1, 100]

const LISTA_PAGINA = `query ($page: Int) {
  Page(page: $page, perPage: 50) {
    characters(sort: FAVOURITES_DESC) {
      name { full }
      favourites
      gender
      image { large }
      media(perPage: 1, type: ANIME, sort: POPULARITY_DESC) {
        nodes {
          title { romaji }
          meanScore
          popularity
          seasonYear
        }
      }
    }
  }
}`

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms))

/** Espera tras un 429 de AniList: usa retry-after o crece 10 s por intento */
async function esperar429(res, intento = 0) {
  const corto = Number(res?.headers?.get?.('retry-after'))
  const ms = Number.isFinite(corto) && corto > 0 ? corto * 1000 : 10000 * (intento + 1)
  await esperar(Math.min(Math.max(ms, 1000), 65000))
}

/* Cache de paginas de personajes: AniList limita a ~90 peticiones/minuto y
 * una tirada no debe castigarlo. Con 10 min de vida, las tiradas repetidas
 * de la misma banda son instantaneas y siguen viniendo de internet. */
const CACHE_PAGINAS = new Map()
const TTL_PAGINAS = 10 * 60 * 1000
const MAX_PAGINAS = 150

/** Personajes de una pagina de AniList (con cache corto y reintento en 429) */
async function personajesDePagina(page) {
  const ahora = Date.now()
  const guardado = CACHE_PAGINAS.get(page)
  if (guardado && ahora - guardado.cuando < TTL_PAGINAS) return guardado.lista

  let lista = null
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: LISTA_PAGINA, variables: { page } }),
      })
      if (res.status === 429) {
        await esperar429(res, intento)
        continue
      }
      if (!res.ok) break
      const datos = await res.json()
      lista = datos?.data?.Page?.characters ?? []
      break
    } catch {
      await esperar(300 * (intento + 1))
    }
  }

  if (Array.isArray(lista) && lista.length) {
    if (CACHE_PAGINAS.size >= MAX_PAGINAS) CACHE_PAGINAS.clear()
    CACHE_PAGINAS.set(page, { cuando: ahora, lista })
  }
  return lista
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

/** Paginas candidatas: al azar dentro de la banda + el centro como seguro */
function paginasCandidatas(rareza) {
  const rango = rareza ? PAGINAS_POR_RAREZA[rareza] : PAGINAS_TIRADA_LIBRE
  if (!rango) return null
  const [desde, hasta] = rango
  const centro = Math.round((desde + hasta) / 2)
  const paginas = []
  for (let i = 0; i < 3; i++) {
    paginas.push(desde + Math.floor(Math.random() * (hasta - desde + 1)))
  }
  paginas.push(centro)
  return paginas
}

/**
 * Barrido de rescate: paginas al azar de todo el top 5000.
 *
 * Las bandas altas viven en muy pocas paginas (mitico entero cabe en la
 * pagina 1), asi que si AniList devuelve una tanda corta o el filtro no
 * encuentra a nadie, una tirada con rareza forzada no puede quedarse seca.
 * Este barrido busca la misma banda en cualquier pagina antes de rendirse.
 */
function paginasDeRescate() {
  const [desde, hasta] = PAGINAS_TIRADA_LIBRE
  const paginas = new Set()
  for (let i = 0; i < 5; i++) {
    paginas.add(desde + Math.floor(Math.random() * (hasta - desde + 1)))
  }
  return [...paginas]
}

/**
 * Tira un personaje directamente de internet (AniList). Sin rareza hace
 * una tirada libre y la rareza se deriva de su score compuesto. Con rareza solo
 * acepta personajes cuya banda EXACTA (rarezaDesdeScore) coincida.
 * Si ya vive en el catalogo reusa su fila; si no, lo importa. Devuelve una
 * fila de la DB o null si la red falla.
 */
export async function tirarDeInternet(rareza = null) {
  const paginas = paginasCandidatas(rareza)
  if (!paginas) return null

  /** Recorre una lista de paginas y devuelve la fila del personaje elegido */
  const recorrer = async (listaPaginas) => {
    for (const page of listaPaginas) {
      const lista = await personajesDePagina(page)
      if (!Array.isArray(lista) || !lista.length) continue

      const elegibles = lista.filter(
        (c) =>
          c?.name?.full &&
          c.image?.large &&
          c.media?.nodes?.[0]?.title?.romaji &&
          (!rareza || rarezaDesdeScore(calcularRarezaScore({
            favoritos: c.favourites,
            media: c.media?.nodes?.[0],
            anio: c.media?.nodes?.[0]?.seasonYear
          })) === rareza),
      )
      if (!elegibles.length) continue

      const elegido = elegibles[Math.floor(Math.random() * elegibles.length)]
      const media = elegido.media?.nodes?.[0]
      const score = calcularRarezaScore({
        favoritos: elegido.favourites,
        media,
        anio: media?.seasonYear
      })
      const suRareza = rarezaDesdeScore(score)
      const susFavoritos = Number(elegido.favourites || 0)
      const dup = filaSimilar(elegido.name.full)
      if (dup) {
        // Ya vive en el catalogo: alineamos su rareza con la banda de AniList
        // (fuente de verdad) respetando los bonus de votos acumulados
        if (dup.rareza !== suRareza || Number(dup.favoritos ?? -1) !== susFavoritos) {
          const votos = votosPersonaje(dup.id)
          const valor = (RAREZAS[suRareza]?.valor ?? 15) + votos * 5
          actualizarRarezaPersonaje(dup.id, suRareza, valor, susFavoritos)
        }
        return obtenerPersonajeGacha(dup.id)
      }

      const id = agregarPersonajeGacha({
        nombre: String(elegido.name.full).trim(),
        anime: String(elegido.media.nodes[0].title.romaji).trim() || 'Desconocido',
        rareza: suRareza,
        imagen: elegido.image.large,
        genero: String(elegido.gender || '').toLowerCase().startsWith('f') ? 'F'
          : String(elegido.gender || '').toLowerCase().startsWith('m') ? 'M' : null,
        favoritos: susFavoritos,
      })
      return obtenerPersonajeGacha(id)
    }
    return null
  }

  const directo = await recorrer(paginas)
  if (directo) return directo

  // Con rareza forzada, si la banda no aparecio en sus paginas se busca en
  // todo el top 5000 antes de devolver null.
  if (rareza) return recorrer(paginasDeRescate())
  return null
}

/* ─────────── Series y personajes desde internet ───────────
 * Las mismas fuentes que las tiradas (AniList) alimentan .serielist y
 * .serieinfo: asi la lista no depende de lo que ya se haya tirado.
 * Todo tiene cache corto y cae al catalogo local si no hay red.
 */
const CONSULTA_SERIES = `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id
      idMal
      title { romaji english }
      favourites
      seasonYear
      coverImage { medium }
    }
  }
}`

const CONSULTA_SERIE = `query ($search: String) {
  Media(search: $search, type: ANIME, isAdult: false) {
    id
    title { romaji english }
    favourites
    meanScore
    popularity
    seasonYear
    coverImage { medium }
    characters(page: 1, perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
      pageInfo { total }
      nodes { name { full } image { large } gender favourites }
    }
  }
}`

/* Cache en memoria: AniList no cambia cada minuto y el bot no debe
 * castigarlo con una peticion por cada .serielist */
const CACHE = new Map()
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX = 200

async function conCache(clave, tarea) {
  const ahora = Date.now()
  const guardado = CACHE.get(clave)
  if (guardado && ahora - guardado.cuando < CACHE_TTL) return guardado.valor

  const valor = await tarea()
  if (valor) {
    if (CACHE.size >= CACHE_MAX) CACHE.clear()
    CACHE.set(clave, { cuando: ahora, valor })
  }
  return valor
}

/** GraphQL a AniList; null si falla o responde con errores */
async function consultar(query, variables) {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) return null
  const datos = await res.json()
  if (Array.isArray(datos?.errors) && datos.errors.length) return null
  return datos?.data || null
}

/**
 * Pagina de series populares de AniList (la misma fuente que las tiradas).
 * Devuelve { series, pagina, paginas, total } o null si no hay internet.
 */
export async function listarSeriesInternet(pagina = 1) {
  if (internetApagada()) return null
  const pedida = Math.max(1, Math.trunc(Number(pagina) || 1))

  const datos = await conCache(`series:${pedida}`, () =>
    consultar(CONSULTA_SERIES, { page: pedida, perPage: SERIES_POR_PAGINA })
  ).catch(() => null)

  const media = datos?.Page?.media
  if (!Array.isArray(media) || !media.length) return null

  const series = media.map(serieDeMedia).filter(Boolean)
  if (!series.length) return null

  const info = datos.Page.pageInfo || {}
  return {
    series,
    pagina: Number(info.currentPage) || pedida,
    paginas: Number(info.lastPage) || pedida,
    total: Number(info.total) || series.length,
  }
}

/**
 * Personajes de una serie segun AniList (los mas queridos primero).
 * Devuelve { serie, personajes, total } o null si no hay internet o no
 * existe la serie.
 */
export async function personajesDeSerieInternet(nombre) {
  if (internetApagada()) return null
  const ref = String(nombre || '').trim()
  if (!ref) return null

  const datos = await conCache(`serie:${ref.toLowerCase()}`, () =>
    consultar(CONSULTA_SERIE, { search: ref })
  ).catch(() => null)

  const media = datos?.Media
  const serie = serieDeMedia(media)
  if (!serie) return null

  const personajes = (media.characters?.nodes || [])
    .map(personajeDeNodo)
    .filter((p) => p && p.imagen)
    .sort((a, b) => b.favoritos - a.favoritos)
  if (!personajes.length) return null

  return {
    serie,
    personajes,
    total: Number(media.characters?.pageInfo?.total) || personajes.length,
  }
}

/* ─────────── Conteo real de personajes (MyAnimeList) ───────────
 * AniList topa el total en 500 para todas las series, asi que el numero
 * de personajes se pide a Shikimori (espejo publico de MyAnimeList) por
 * idMal. Se cachea 24 h: el listado solo paga la primera consulta.
 */
const SHIKIMORI = 'https://shikimori.one/api/animes'
const TTL_CONTEO = 24 * 60 * 60 * 1000
const TTL_FALLO = 60 * 60 * 1000
const CONCURRENCIA_CONTEO = 4
const INTERVALO_CONTEO = 230
const TIMEOUT_CONTEO = 8000

const CACHE_CONTEO = new Map()
let turnoConteo = 0

/** Reparte los lanzamientos para no pasar el limite de Shikimori (5/s) */
function esperarTurno() {
  const ahora = Date.now()
  const turno = Math.max(ahora, turnoConteo)
  turnoConteo = turno + INTERVALO_CONTEO
  return turno - ahora
}

async function pedirRoles(id) {
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_CONTEO)
  try {
    const res = await fetch(`${SHIKIMORI}/${id}/roles`, {
      headers: {
        'User-Agent': 'BeerusBotMD (bot de WhatsApp; +https://github.com)',
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false }
    const roles = await res.json()
    return { ok: true, total: Array.isArray(roles) && roles.length ? roles.length : null }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Cuantos personajes tiene la serie en MyAnimeList (via idMal), o null.
 */
export async function contarPersonajesSerie(idMal) {
  const id = Number(idMal)
  if (!id) return null

  const ahora = Date.now()
  const guardado = CACHE_CONTEO.get(id)
  if (guardado && ahora - guardado.cuando < guardado.ttl) return guardado.valor

  await esperar(esperarTurno())
  let respuesta = await pedirRoles(id)
  if (!respuesta.ok) {
    // Un reintento: Shikimori corta rafagas con 429
    await esperar(900)
    respuesta = await pedirRoles(id)
  }
  const total = respuesta.ok ? respuesta.total : null

  if (CACHE_CONTEO.size > 600) CACHE_CONTEO.clear()
  CACHE_CONTEO.set(id, { cuando: ahora, valor: total, ttl: total ? TTL_CONTEO : TTL_FALLO })
  return total
}

/**
 * Rellena serie.personajes con el total real, con lanzamientos espaciados.
 * Sin internet no toca nada; si una serie falla se queda sin numero.
 */
export async function completarPersonajesSeries(series = []) {
  if (internetApagada()) return series

  const cola = series.filter((s) => Number(s?.idMal))
  const trabajador = async () => {
    while (cola.length) {
      const serie = cola.shift()
      const total = await contarPersonajesSerie(serie.idMal)
      if (Number.isFinite(total)) serie.personajes = total
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA_CONTEO, cola.length) }, () => trabajador())
  )
  return series
}

/* ─────────── Sincronizacion de rarezas del catalogo ───────────
 * El catalogo se sembro con rarezas a mano y las tiradas viejas usaban
 * bandas solapadas, asi que .gachaboard / .gacha collection mostraban
 * rarezas que ya no coinciden con AniList. Esta pasada recorre las 100
 * paginas (5000 personajes mas queridos) y reescribe rareza, valor y
 * favoritos de cada fila. Se guarda la fecha y no se repite en 24 h.
 */
const CLAVE_SYNC = 'gacha_rareza_sync'
const TTL_SYNC = 24 * 60 * 60 * 1000
const PAGINAS_SYNC = 100
const PAUSA_SYNC = 700
const MAX_BUSQUEDAS = 120

/**
 * Recalcula las rarezas del catalogo desde AniList.
 * Devuelve { omitido, paginas, revisados, encontrados, actualizados } o
 * null si no hay red. `forzar` ignora la ventana de 24 h.
 */
export async function sincronizarRarezas({ forzar = false, paginas = PAGINAS_SYNC, alProgreso = null } = {}) {
  if (internetApagada()) return null

  const ultimo = Number(obtenerAjuste(CLAVE_SYNC) || 0)
  if (!forzar && ultimo && Date.now() - ultimo < TTL_SYNC) {
    return { omitido: true, paginas: 0, revisados: 0, encontrados: 0, actualizados: 0, cuando: ultimo }
  }

  const limite = Math.max(1, Math.min(PAGINAS_SYNC, Math.trunc(Number(paginas) || PAGINAS_SYNC)))
  const indice = new Map()
  const porOrden = new Map()
  let leidas = 0

  for (let page = 1; page <= limite; page++) {
    const lista = await personajesDePagina(page)
    if (Array.isArray(lista) && lista.length) {
      leidas++
      for (const c of lista) {
        const nombre = normalizarNombre(c?.name?.full)
        if (!nombre) continue
        const favoritos = Number(c.favourites || 0)
        const media = c.media?.nodes?.[0]
        const anime = normalizarNombre(media?.title?.romaji)
        const anio = Number(media?.seasonYear) || null
        const orden = claveOrdenada(c?.name?.full)

        // Si el mismo nombre sale en varias series se queda el mas popular
        const mediaData = media ? { meanScore: media.meanScore, popularity: media.popularity, seasonYear: media.seasonYear } : null
        for (const clave of [nombre, orden]) {
          if (!clave) continue
          const previo = indice.get(clave)
          if (!previo || favoritos > previo.favoritos) indice.set(clave, { favoritos, media: mediaData, anio })
        }
        if (orden) {
          const previoOrden = porOrden.get(orden)
          if (!previoOrden || favoritos > previoOrden.favoritos) porOrden.set(orden, { favoritos, media: mediaData, anio })
        }
        if (anime) {
          const clave = `${nombre}|${anime}`
          const previoAnime = indice.get(clave)
          if (!previoAnime || favoritos > previoAnime.favoritos) indice.set(clave, { favoritos, media: mediaData, anio })
        }
      }
    }
    if (alProgreso) alProgreso({ page, paginas: limite, personajes: indice.size })
    if (page < limite) await esperar(PAUSA_SYNC)
  }

  const filas = listarPersonajesGacha()
  const plan = planRarezas(filas, indice)
  const conDatos = new Set(plan.map((p) => p.id))

  // Segunda pasada: los que no entraron en el top 5000 se buscan por nombre
  // (con la serie del catalogo para no confundir homonimos)
  const porNombre = new Map(filas.map((f) => [normalizarNombre(f.nombre), f]))
  const pendientes = filas.filter((f) => !conDatos.has(f.id)).slice(0, MAX_BUSQUEDAS)
  const duplicados = []
  for (const fila of pendientes) {
    const crudo = await buscarEnAniList(fila.nombre, fila.anime).catch(() => null)
    if (crudo) {
      // AniList devuelve el mismo personaje que otra fila (Lelouch): no se
      // duplica la rareza, se avisa para limpiar el catalogo a mano.
      const gemelo = porNombre.get(normalizarNombre(crudo.nombre))
      if (gemelo && gemelo.id !== fila.id) {
        duplicados.push({ id: fila.id, nombre: fila.nombre, gemelo: gemelo.nombre })
        await esperar(PAUSA_SYNC)
        continue
      }
      const favoritos = Number(crudo.favoritos || 0)
      const score = calcularRarezaScore({ favoritos })
      const rareza = rarezaDesdeScore(score)
      plan.push({
        id: fila.id,
        nombre: fila.nombre,
        rareza,
        favoritos,
        cambia: fila.rareza !== rareza || Number(fila.favoritos ?? -1) !== favoritos,
      })
    }
    await esperar(PAUSA_SYNC)
  }

  // Tercera pasada: variantes de escritura (Bakugo/Bakugou, Frieza/Freeza).
  // Solo claves ya resueltas y con distancia minima, para no confundir a dos
  // personajes distintos que se llamen parecido.
  const resueltos = new Set([
    ...plan.map((p) => p.id),
    ...duplicados.map((d) => d.id),
  ])
  for (const fila of filas) {
    if (resueltos.has(fila.id)) continue
    const clave = claveOrdenada(fila.nombre)
    const mejor = varianteCercana(clave, porOrden)
    if (!mejor) continue

    const score = calcularRarezaScore({ favoritos: mejor.favoritos })
    const rareza = rarezaDesdeScore(score)
    plan.push({
      id: fila.id,
      nombre: fila.nombre,
      rareza,
      favoritos: mejor.favoritos,
      cambia: fila.rareza !== rareza || Number(fila.favoritos ?? -1) !== mejor.favoritos,
    })
    resueltos.add(fila.id)
  }

  let actualizados = 0
  for (const cambio of plan) {
    if (!cambio.cambia) continue
    const votos = votosPersonaje(cambio.id)
    const valor = (RAREZAS[cambio.rareza]?.valor ?? 15) + votos * 5
    actualizarRarezaPersonaje(cambio.id, cambio.rareza, valor, cambio.favoritos)
    actualizados++
  }

  guardarAjuste(CLAVE_SYNC, String(Date.now()))
  const sinDatos = filas
    .filter((f) => !resueltos.has(f.id))
    .map((f) => f.nombre)
  return {
    omitido: false,
    paginas: leidas,
    revisados: filas.length,
    encontrados: plan.length,
    actualizados,
    duplicados,
    sinDatos,
    cuando: Date.now(),
  }
}

/**
 * Reasigna las rarezas del catalogo sin salir a la red.
 *
 * La banda se calcula con los `favoritos` que ya estan guardados en cada
 * fila, asi que reajustar los cortes no obliga a esperar las 100 paginas de
 * AniList. Se llama al arrancar: la primera vez reescribe el catalogo entero
 * (unos cientos de filas), despues no encuentra nada que cambiar y no escribe.
 *
 * Las filas sin favoritos (las sembradas a mano desde CATALOGO_ANIME) se
 * quedan como estan hasta que `sincronizarRarezas` les traiga datos.
 *
 * @returns {{ revisados: number, actualizados: number, sinDatos: number }}
 */
export function realinearRarezasLocales() {
  const filas = listarPersonajesGacha()
  let actualizados = 0
  let sinDatos = 0

  for (const fila of filas) {
    const favoritos = Number(fila.favoritos)
    // Sin favoritos positivos no hay senal: la fila conserva la rareza que le
    // puso el seed o el admin. Esto tambien evita que un 0 escrito por un
    // sync fallido degrade a comun a un personaje que si es popular.
    if (!Number.isFinite(favoritos) || favoritos <= 0) {
      sinDatos++
      continue
    }

    const rareza = rarezaDeFavoritos(favoritos)
    if (fila.rareza === rareza) continue

    const votos = votosPersonaje(fila.id)
    const valor = (RAREZAS[rareza]?.valor ?? 15) + votos * 5
    actualizarRarezaPersonaje(fila.id, rareza, valor, favoritos)
    actualizados++
  }

  return { revisados: filas.length, actualizados, sinDatos }
}
