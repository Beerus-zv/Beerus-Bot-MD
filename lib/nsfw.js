/**
 * Motor de busqueda NSFW (modo imagen anime de los boorus keyless).
 *
 * GataBot-MD y MEGA-MD usan waifu.pics/rule34.xxx, pero estan bloqueados o
 * muertos desde esta red; las fuentes vivas y sin clave son:
 *   1. yande.re      (anime, JSON post.json)
 *   2. konachan.com  (anime, JSON post.json)
 *   3. danbooru      (anime, /posts.json, su propio esquema)
 *   4. gelbooru.com  (DAPI, exige api_key/user_id)
 *   5. e621.net      (respaldo amplio; exige User-Agent propio)
 *   6. tbib.org      (espejo enorme de danbooru/yande; enlace construido)
 *   7. hypnohub.net  (DAPI)
 *   8. xbooru.com    (DAPI, catalogo occidental)
 *   9. rule34.xxx    (DAPI con api_key/user_id propios; apagada sin key)
 *
 * El modo NSFW debe estar activado en el chat (/nsfw on por un admin):
 * aqui solo vive la busqueda y descarga, politicas en commands/nsfw.js.
 */
import { bajarArchivo } from './descargas.js'
import { log } from './logger.js'
import {
  GELBOORU_API_KEY,
  GELBOORU_USER_ID,
  RULE34_API_KEY,
  RULE34_USER_ID,
} from '../config.js'

const UA = { 'User-Agent': 'BeerusBotMD/1.0 (bot de WhatsApp; busqueda de imagen)' }

/** Extensiones que WhatsApp acepta como imagen o video directo */
const EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'webp']
// webm queda fuera a proposito: WhatsApp solo reproduce video H.264 en MP4 y
// el cliente muestra una burbuja vacia con VP8/VP9. Esos posts se descartan
// y la tirada elige otro.
const EXT_VIDEO = ['gif', 'mp4']

/** Tope de descarga por imagen (las JPEG reducidas pasan bien) */
const MAX_BYTES = 24 * 1024 * 1024

/**
 * Paginas que se piden al azar.
 *
 * Sin esto cada llamada bajaba siempre el mismo primer bloque de 50 posts, asi
 * que dos `/r34 burnice` seguidos devolvian casi las mismas imagenes. Pidiendo
 * una pagina al azar cambia el bloque entero; el tope evita pedir paginas que
 * ya no existen (los boorus devuelven lista vacia y se cae a la pagina 1).
 */
const MAX_PAGINAS = 20

/**
 * Cuantas fuentes se consultan por busqueda.
 *
 * Una sola fuente son 50 posts, y la seleccion de calidad siempre sacaba los
 * mismos seis: la variedad tiene que salir de un pool mas grande. Se piden los
 * bloques de varias fuentes (hosts distintos, en paralelo) y se juntan.
 */
const MAX_FUENTES = 3

/**
 * Paginas por fuente. Muchos tags solo tienen una o dos paginas, asi que con
 * una sola se agotaba el pool enseguida y la seleccion volvia siempre al mismo
 * top. Dos bloques por fuente duplican el material sin disparar peticiones.
 */
const PAGINAS_POR_FUENTE = 2

/**
 * Memoria de lo ya enviado, por chat y consulta.
 *
 * La pagina al azar reparte mucho, pero con pocos posts por tag todavia puede
 * tocar la misma imagen dos veces seguidas. Esto la descarta hasta que la
 * lista se agota. Se anota el id del post y el hash del archivo: el mismo arte
 * vive espejado en tbib, danbooru y yande con ids distintos, y sin el hash se
 * mandaba dos veces como si fuera otra imagen.
 */
const VISTOS = new Map()
const MAX_VISTOS_POR_CLAVE = 300
const MAX_CLAVES = 200

/** Claves con las que se reconoce un post ya enviado */
function clavesDe(post) {
  const claves = []
  if (post?.id !== undefined && post?.id !== null) claves.push(String(post.id))
  const hash = String(post?.hash || '').toLowerCase()
  if (hash) claves.push(`h:${hash}`)
  return claves
}

/** Anota un post como ya enviado en ese chat para esa consulta */
export function marcarVisto(clave, id, hash = '') {
  if (!clave) return
  const claves = clavesDe({ id, hash })
  if (!claves.length) return

  let registro = VISTOS.get(clave)
  if (!registro) {
    if (VISTOS.size >= MAX_CLAVES) {
      VISTOS.delete(VISTOS.keys().next().value)
    }
    registro = { ids: new Set(), orden: [] }
    VISTOS.set(clave, registro)
  }

  for (const marca of claves) {
    if (registro.ids.has(marca)) continue
    registro.ids.add(marca)
    registro.orden.push(marca)
  }
  while (registro.orden.length > MAX_VISTOS_POR_CLAVE) {
    registro.ids.delete(registro.orden.shift())
  }
}

/**
 * Descarta los posts ya enviados en ese chat para esa consulta.
 * Si no queda ninguno, olvida la memoria y devuelve la lista completa:
 * es preferible repetir antes que quedarse sin imagen.
 */
export function sinRepetir(clave, posts) {
  const registro = VISTOS.get(clave)
  if (!registro || !registro.ids.size) return posts

  const nuevos = posts.filter((p) => !clavesDe(p).some((marca) => registro.ids.has(marca)))
  if (nuevos.length) return nuevos

  VISTOS.delete(clave)
  return posts
}

/** Tags por defecto cuando no se especifican (que siempre tienen material) */
export const TAGS_AZAR = [
  'hentai',
  'neko',
  'thighhighs',
  'genshin_impact',
  'asuka_langley',
  'marin_kitagawa',
  'lingerie',
  'ass',
  'pussy',
]

const pedir = (url) => fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) })

async function pedirJson(url) {
  const respuesta = await pedir(url)
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${url.split('/')[2]}`)
  return respuesta.json()
}

/** extension de una url de post: '.../algo.png' -> 'png' */
function extensionDe(urlLarga) {
  return (/\.([a-z0-9]{2,4})(?:\?|$)/i.exec(urlLarga) ?? [])[1]?.toLowerCase() ?? ''
}

/** hash del archivo en minusculas: sirve para no mandar el mismo arte dos veces */
function hashDe(valor) {
  const texto = String(valor || '').toLowerCase()
  return /^[a-f0-9]{16,64}$/.test(texto) ? texto : ''
}

/** Busca el tag mas cercano en yande.re (autocompletado) para un termino suelto.
 *  Si se pasan palabras de contexto (hint), prefiere los tags que las contengan. */
async function autocompletarTag(termino, hint = []) {
  try {
    const datos = await pedirJson('https://yande.re/tag.json?name=' + encodeURIComponent(termino + '*') + '&limit=12')
    if (!Array.isArray(datos) || !datos.length) return null
    const normHint = hint.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
    let candidatos = datos.filter((t) => t?.name)
    if (normHint.length) {
      const filtrados = candidatos.filter((t) => {
        const n = t.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        return normHint.every((h) => n.includes(h))
      })
      if (filtrados.length) candidatos = filtrados
    }
    const mejor = candidatos
      .sort((a, b) => (b.post_count ?? b.count ?? 0) - (a.post_count ?? a.count ?? 0))[0]
    return mejor?.name ?? null
  } catch {
    return null
  }
}

/** Normaliza los posts de yande.re / konachan (mismo esquema Moebooru) */
function desdeMoebooru(datos, fuente) {
  return datos
    .filter((p) => p?.file_url)
    .map((p) => {
      // jpeg_url es la misma imagen re-comprimida a JPEG: si el original es un
      // PNG de 20 MB, esa version entra sin perder resolucion.
      const muestra = p.jpeg_url || p.file_url
      return {
        id: p.id,
        fuente,
        hash: hashDe(p.md5),
        tags: p.tags ?? '',
        score: p.score ?? 0,
        extension: extensionDe(p.file_url),
        muestra,
        url: p.file_url,
        ancho: Number(p.width) || 0,
        alto: Number(p.height) || 0,
        bytes: Number(p.file_size) || 0,
      }
    })
}

/** Normaliza los posts de e621 */
function desdeE621(datos) {
  return (datos?.posts ?? [])
    .filter((p) => p?.file?.url)
    .map((p) => {
      const muestra =
        p.sample?.url && (p.sample?.size ?? p.file?.size ?? 0) <= MAX_BYTES
          ? p.sample.url
          : p.file.url
      return {
        id: p.id,
        fuente: 'e621.net',
        hash: hashDe(p.file?.md5 || p.md5),
        // Lista completa: el filtro por tag de las interacciones compara
        // contra esta cadena y un recorte dejaba fuera el tag buscado.
        tags: [...(p.tags?.general ?? []), ...(p.tags?.artist ?? [])].join(' '),
        score: p.score?.total ?? 0,
        extension: p.file.ext,
        muestra,
        url: p.file.url,
        ancho: Number(p.file?.width) || 0,
        alto: Number(p.file?.height) || 0,
        bytes: Number(p.file?.size) || 0,
      }
    })
}

/** Normaliza los posts de gelbooru y sus clones (dapi JSON) */
function desdeGelbooru(datos, fuente = 'gelbooru.com') {
  const lista = Array.isArray(datos?.post) ? datos.post : Array.isArray(datos) ? datos : []
  return lista
    .filter((p) => p && (p.file_url || p.sample_url || p.sample))
    .map((p) => {
      const esUrl = (v) => typeof v === 'string' && /^https?:/i.test(v)
      // gelbooru manda `sample: 1` (bandera, no URL) y la muestra real en
      // `sample_url`; los clones viejos usan `sample` como URL. Sin esta copia
      // un original de 30 MB se quedaba sin respaldo y el post se descartaba.
      const completa = [p.file_url, p.sample_url, p.sample].find(esUrl) || null
      if (!completa) return null
      const muestra = [p.sample_url, p.sample].find((v) => esUrl(v) && v !== completa) || null
      return {
        id: p.id,
        fuente,
        // gelbooru publica el md5 del archivo en `md5`, no en `hash`: con el
        // se reconoce el mismo arte espejado en danbooru y demas boorus.
        hash: hashDe(p.hash || p.md5),
        tags: p.tags ?? '',
        score: Number(p.score) || 0,
        extension: extensionDe(completa),
        muestra: muestra || completa,
        url: completa,
        ancho: Number(p.width) || 0,
        alto: Number(p.height) || 0,
        bytes: Number(p.file_size) || 0,
      }
    })
    .filter(Boolean)
}

function desdeDanbooru(datos) {
  return (Array.isArray(datos) ? datos : [])
    .filter((p) => p?.file_url || p?.large_file_url)
    .map((p) => {
      // file_url es el original; large_file_url solo si no hay original
      const completa = p.file_url || p.large_file_url
      const reducida = (p.media_asset?.variants ?? []).find((v) => /720x|sample/.test(v?.type ?? '') || (v?.file_ext ?? '') === 'jpg')?.url
      return {
        id: p.id,
        fuente: 'danbooru.donmai.us',
        hash: hashDe(p.md5),
        tags: p.tag_string ?? '',
        score: p.score ?? 0,
        extension: String(p.media_asset?.file_ext ?? extensionDe(completa)),
        muestra: reducida || completa,
        url: completa,
        ancho: Number(p.image_width) || 0,
        alto: Number(p.image_height) || 0,
        bytes: Number(p.file_size) || 0,
      }
    })
}

/**
 * Normaliza los posts de tbib.org.
 *
 * Su DAPI no devuelve `file_url` (solo directorio + nombre), asi que la url se
 * arma: `/images/<dir>/<archivo>` para el original y
 * `/samples/<dir>/sample_<archivo>` para la copia reducida.
 */
function desdeTbib(datos) {
  const lista = Array.isArray(datos?.post) ? datos.post : Array.isArray(datos) ? datos : []
  return lista
    .filter((p) => p?.image && p?.directory)
    .map((p) => {
      const completa = `https://tbib.org/images/${p.directory}/${p.image}`
      const muestra = `https://tbib.org/samples/${p.directory}/sample_${p.image}`
      return {
        id: p.id,
        fuente: 'tbib.org',
        hash: hashDe(p.hash),
        tags: p.tags ?? '',
        score: Number(p.score) || 0,
        extension: extensionDe(p.image),
        muestra,
        url: completa,
        ancho: Number(p.width) || 0,
        alto: Number(p.height) || 0,
        bytes: Number(p.file_size) || 0,
      }
    })
}

/**
 * Boorus vivos y sin clave. Cada uno sabe pedir su bloque y normalizarlo; el
 * resto del motor no sabe de esquemas distintos.
 */

/**
 * rule34.xxx contesta {"Missing authentication..."} con 200 cuando la key no
 * vale. Se apaga sola hasta el proximo arranque en vez de gastar una peticion
 * por busqueda para nada.
 */
let rule34SinAuth = false

const FUENTES = [
  {
    nombre: 'yande.re',
    pedir: async (tags, pag, orden) =>
      desdeMoebooru(
        await pedirJson(
          `https://yande.re/post.json?limit=50&page=${pag}&tags=${encodeURIComponent(
            `rating:explicit ${tags}${orden ? ' order:score' : ''}`,
          )}`,
        ),
        'yande.re',
      ),
  },
  {
    nombre: 'danbooru.donmai.us',
    pedir: async (tags, pag, orden) =>
      desdeDanbooru(
        await pedirJson(
          `https://danbooru.donmai.us/posts.json?limit=50&page=${pag}&tags=${encodeURIComponent(
            `${tags} rating:explicit${orden ? ' order:score' : ''}`,
          )}`,
        ),
      ),
  },
  {
    nombre: 'konachan.com',
    pedir: async (tags, pag, orden) =>
      desdeMoebooru(
        await pedirJson(
          `https://konachan.com/post.json?limit=50&page=${pag}&tags=${encodeURIComponent(
            `rating:explicit ${tags}${orden ? ' order:score' : ''}`,
          )}`,
        ),
        'konachan.com',
      ),
  },
  {
    nombre: 'gelbooru.com',
    // gelbooru pagina con `pid`, que empieza en 0, y exige credenciales:
    // sin api_key/user_id el DAPI responde 401.
    pedir: async (tags, pag, orden) =>
      desdeGelbooru(
        await pedirJson(
          `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&api_key=${GELBOORU_API_KEY}&user_id=${GELBOORU_USER_ID}&tags=${encodeURIComponent(
            `${tags} rating:explicit${orden ? ' sort:score:desc' : ''}`,
          )}`,
        ),
      ),
  },
  {
    nombre: 'e621.net',
    pedir: async (tags, pag, orden) =>
      desdeE621(
        await pedirJson(
          `https://e621.net/posts.json?limit=50&page=${pag}&tags=${encodeURIComponent(
            `${tags} rating:explicit${orden ? ' order:score' : ''}`,
          )}`,
        ),
      ),
  },
  {
    nombre: 'tbib.org',
    pedir: async (tags, pag, orden) =>
      desdeTbib(
        await pedirJson(
          `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&tags=${encodeURIComponent(
            `rating:explicit ${tags}${orden ? ' sort:score:desc' : ''}`,
          )}`,
        ),
      ),
  },
  {
    nombre: 'hypnohub.net',
    pedir: async (tags, pag, orden) =>
      desdeGelbooru(
        await pedirJson(
          `https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&tags=${encodeURIComponent(
            `rating:explicit ${tags}${orden ? ' sort:score:desc' : ''}`,
          )}`,
        ),
        'hypnohub.net',
      ),
  },
  {
    nombre: 'xbooru.com',
    pedir: async (tags, pag, orden) =>
      desdeGelbooru(
        await pedirJson(
          `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&tags=${encodeURIComponent(
            `rating:explicit ${tags}${orden ? ' sort:score:desc' : ''}`,
          )}`,
        ),
        'xbooru.com',
      ),
  },
  {
    // rule34.xxx pide user_id y api_key propios (se sacan de
    // https://rule34.xxx/index.php?page=account&s=options). Sin key el DAPI
    // contesta "Missing authentication", asi que la fuente solo entra cuando
    // hay credencial: cero peticiones perdidas mientras falte.
    nombre: 'rule34.xxx',
    disponible: () => Boolean(RULE34_API_KEY) && !rule34SinAuth,
    pedir: async (tags, pag, orden) => {
      const datos = await pedirJson(
        `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&api_key=${RULE34_API_KEY}&user_id=${RULE34_USER_ID}&tags=${encodeURIComponent(
          `rating:explicit ${tags}${orden ? ' sort:score:desc' : ''}`,
        )}`,
      )
      if (typeof datos === 'string' && /missing authentication/i.test(datos)) {
        if (!rule34SinAuth) {
          rule34SinAuth = true
          log.aviso('rule34.xxx rechazó la api_key: fuente apagada hasta el próximo arranque')
        }
        return []
      }
      return desdeGelbooru(datos, 'rule34.xxx')
    },
  },
]

/** Nombres de las fuentes con credencial (todas las del catalogo) */
export const NOMBRES_FUENTES = FUENTES.map((f) => f.nombre)

/** Las que pueden responder ahora mismo: rule34.xxx queda afuera sin key */
export function fuentesDisponibles() {
  return FUENTES.filter((f) => !f.disponible || f.disponible()).map((f) => f.nombre)
}

/** Baraja sin tocar la lista original */
function barajar(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Orden de las fuentes de una busqueda.
 *
 * Sin fuente pedida el orden se baraja: antes yande.re iba siempre primero y
 * sus 50 posts tapaban a las demas, asi que todas las busquedas salian del
 * mismo booru. Con fuente pedida (/danbooru, /e621, /rule34) esa va sola; si
 * es una fuente conocida pero sin credencial, la lista vuelve vacia y la
 * busqueda termina sin resultados en vez de caer a otro booru sin avisar.
 */
function elegirFuentes(fuentePedida, cuantas) {
  const activas = barajar(FUENTES.filter((f) => !f.disponible || f.disponible()))
  if (!fuentePedida) return activas.slice(0, Math.max(1, cuantas))

  const conocida = FUENTES.find(
    (f) => f.nombre.includes(fuentePedida) || fuentePedida.includes(f.nombre),
  )
  if (!conocida) return activas.slice(0, Math.max(1, cuantas))
  if (conocida.disponible && !conocida.disponible()) return []
  return [conocida]
}

/**
 * Pide un bloque a una fuente.
 *
 * Ordenar por score trae a los mejores, pero yande.re devuelve en ese orden
 * posts que solo se bajan con cuenta (sin file_url) y el normalizador los
 * descarta. Si la pasada ordenada vuelve vacia se repite sin ordenar, que
 * siempre tiene material.
 */
async function pedirBloque(fuente, tags, pag, orden) {
  try {
    const posts = await fuente.pedir(tags, pag, orden)
    if (posts.length || !orden) return posts
  } catch (err) {
    if (!orden) throw err
  }
  return fuente.pedir(tags, pag, false)
}

/**
 * Busca posts explicitos por tags en la cadena de boorus.
 *
 * Junta bloques de varias fuentes en paralelo (son hosts distintos, asi que no
 * se pisan) para que la seleccion de calidad tenga de donde elegir: con una
 * sola fuente el pool eran 50 posts y siempre ganaban los mismos.
 *
 * @param {string} consulta tags separados por espacios (vacios = tag al azar)
 * @param {{fuente?: string, paginas?: number, exacto?: boolean, orden?: 'calidad', fuentes?: number}} opciones
 *   fuente: booru preferido (se prueba solo ese)
 *   paginas: ventana de paginas al azar por fuente (defecto MAX_PAGINAS)
 *   exacto: solo el tag tal cual, sin autocompletar ni comodines (para tags
 *   de catalogo que ya se sabe que existen)
 *   orden: 'calidad' pide al booru ordenado por score (mejor arte primero)
 *   fuentes: cuantas fuentes juntar (defecto MAX_FUENTES)
 * @returns {Promise<{tags: string, fuente: string|null, fuentes: string[], posts: Array}>}
 */
export async function buscarNSFW(
  consulta = '',
  {
    fuente: fuentePedida = null,
    paginas: topePaginas = MAX_PAGINAS,
    exacto = false,
    orden = null,
    fuentes: cuantasFuentes = MAX_FUENTES,
  } = {},
) {
  const base = consulta.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_')

  // Con consulta explicita: el tag exacto, el comodin (tag*) por si el
  // nombre no coincide exacto (ej. 'emilia' -> 'emilia_(re:zero)'), y los
  // tags individuales (con y sin comodin) para consultas compuestas.
  // Sin consulta (modo azar, /hentai): hasta 3 tags distintos de la lista.
  const partes = base.split('_').filter((t) => t && t !== base)
  const candidatosTags = base
    ? exacto
      ? [base]
      : [base, `${base}*`, ...partes, ...partes.map((t) => `${t}*`)].filter(
          (t, i, a) => t && a.indexOf(t) === i,
        )
    : [...TAGS_AZAR].sort(() => Math.random() - 0.5).slice(0, 3)

  const ventana = Math.max(1, Math.min(topePaginas, MAX_PAGINAS))
  const porFuente = Math.max(1, Math.min(PAGINAS_POR_FUENTE, ventana))
  const ordenar = orden === 'calidad'

  /**
   * Una ronda: cada fuente pide sus paginas (en serie dentro del host, para no
   * gatillar el limite de peticiones) y todas las fuentes van en paralelo.
   * Las fuentes que vuelven vacias reintentan en la pagina 1, que siempre
   * tiene material.
   *
   * Los reintentos con comodin van con una sola fuente y una sola pagina: son
   * apuestas, no vale la pena barrer el booru entero por un tag que quizas no
   * existe.
   */
  const intentar = async (tags, { fuentes: cuantas = cuantasFuentes, paginas: hondo = porFuente } = {}) => {
    const seleccion = elegirFuentes(fuentePedida, cuantas)
    // Fuente pedida sin credencial: no se consulta ninguna otra por detras
    if (!seleccion.length) return { tags, fuente: null, fuentes: [], posts: [], error: null }
    const pool = []
    const porHash = new Set()
    const usadas = []
    let ultimoError = null

    const anotar = (posts) => {
      let nuevos = 0
      for (const p of posts) {
        // El mismo arte vive espejado en varios boorus con id distinto: el
        // hash del archivo es lo unico que los une.
        const marca = p.hash ? `h:${p.hash}` : `${p.fuente}:${p.id}`
        if (porHash.has(marca)) continue
        porHash.add(marca)
        pool.push(p)
        nuevos++
      }
      return nuevos
    }

    const paginasAlAzar = () => {
      const lista = []
      for (let i = 0; i < hondo; i += 1) {
        let pag = 1 + Math.floor(Math.random() * ventana)
        for (let intento = 0; lista.includes(pag) && intento < 10; intento += 1) {
          pag = 1 + Math.floor(Math.random() * ventana)
        }
        if (!lista.includes(pag)) lista.push(pag)
      }
      return lista
    }

    const pedirFuente = async (fuente) => {
      const paginas = paginasAlAzar()
      const posts = []
      for (const pag of paginas) {
        try {
          posts.push(...(await pedirBloque(fuente, tags, pag, ordenar)))
        } catch (err) {
          ultimoError = err
        }
      }
      if (posts.length || paginas.includes(1)) return posts
      // Pagina al azar vacia (el tag tiene menos paginas que la ventana):
      // la primera del tag casi siempre tiene material.
      try {
        return await pedirBloque(fuente, tags, 1, ordenar)
      } catch (err) {
        ultimoError = err
        return []
      }
    }

    const bloques = await Promise.all(seleccion.map((fuente) => pedirFuente(fuente)))
    bloques.forEach((posts, i) => {
      if (!posts.length) return
      if (anotar(posts)) usadas.push(seleccion[i].nombre)
    })

    if (!usadas.length) {
      return { tags, fuente: null, fuentes: [], posts: [], error: ultimoError }
    }
    return { tags, fuente: usadas.join('+'), fuentes: usadas, posts: pool }
  }

  // Primero: autocompletar el tag (ej. 'ram' + hint 're zero' -> 'ram_(re:zero)')
  if (!exacto && base && !base.includes('*')) {
    const partesQuery = base.split(/[_\s]+/).filter(Boolean)
    const resuelto = await autocompletarTag(partesQuery[0] || base, partesQuery.slice(1))
    if (resuelto && resuelto !== base) {
      const resultado = await intentar(resuelto)
      if (resultado.fuente) return resultado
      const resultado2 = await intentar(resuelto + '*', { fuentes: 1, paginas: 1 })
      if (resultado2.fuente) return resultado2
    }
  }

  let primera = true
  for (const tags of candidatosTags) {
    // El tag tal cual merece el barrido completo; los comodines y las palabras
    // sueltas son apuestas y van con una fuente y una pagina.
    const resultado = primera ? await intentar(tags) : await intentar(tags, { fuentes: 1, paginas: 1 })
    primera = false
    if (resultado.fuente) return resultado
  }

  // Ultimo recurso: probar cada palabra del query con comodin
  if (!exacto) {
    for (const parte of base.split(/[_\s]+/).filter(Boolean)) {
      if (parte === base) continue
      const resultado = await intentar(parte + '*', { fuentes: 1, paginas: 1 })
      if (resultado.fuente) return resultado
    }
  }

  return { tags: candidatosTags[0] ?? '', fuente: null, fuentes: [], posts: [], error: null }
}

/** Filtra los posts cuya extension acepta WhatsApp (evita swf/pdf/etc) */
export function postRecibibles(posts, { permitirVideo = true } = {}) {
  const validas = permitirVideo ? [...EXT_IMAGEN, ...EXT_VIDEO] : EXT_IMAGEN
  return posts.filter((p) => validas.includes(p.extension))
}

/** Elige un post al azar que WhatsApp acepte */
export function postRecibible(posts, { permitirVideo = true } = {}) {
  const lista = postRecibibles(posts, { permitirVideo })
  if (!lista.length) return null
  return lista[Math.floor(Math.random() * lista.length)]
}

/**
 * Tags que delatan arte pobre: bocetos, lineart sin terminar, recortes de
 * celuloide y pedidos de corrigeer (bad_id / lowres). Un post con alguno de
 * estos nunca gana el puesto de calidad.
 */
const TAGS_BASURA = ['lowres', 'bad_quality', 'bad_id', 'thumbnail', 'sketch', 'lineart', 'monochrome']

/** Lado corto a partir del cual una imagen se ve nitida en WhatsApp */
export const LADO_MINIMO = 900

/**
 * Puntua un post por calidad visual: primero el lado corto (una imagen de
 * 2480x3508 se ve nitida, una de 800x1200 se ve blanda) y despues el score
 * del booru, que separa el arte trabajado del resto.
 *
 * El lado se topa en 4096 porque arriba de eso WhatsApp igual la reduce (y
 * un escaneo de 10000 px pesa 20 MB y tarda medio minuto en bajar).
 */
export function calidadDeMedia(post) {
  const ancho = Number(post?.ancho) || 0
  const alto = Number(post?.alto) || 0
  const lado = ancho && alto ? Math.min(Math.min(ancho, alto), 4096) : 0
  const score = Math.max(0, Number(post?.score) || 0)
  const bytes = Number(post?.bytes) || 0
  const castigo = TAGS_BASURA.some((t) => String(post?.tags || '').toLowerCase().includes(t)) ? 1200 : 0
  const pesado = bytes > 12 * 1024 * 1024 ? 400 : 0
  return lado + Math.min(score, 800) * 0.8 - castigo - pesado
}

/**
 * Los mejores posts de una lista, de mayor a menor calidad.
 *
 * Si hay suficientes que pasan LADO_MINIMO solo se devuelven esos; si no,
 * se cae al resto ordenado igual (es preferible una imagen de 800 px que
 * quedarse sin nada).
 *
 * @param {Array} posts posts normalizados (necesitan ancho/alto/score)
 * @param {{cantidad?: number, minimo?: number}} opciones
 */
export function mejoresPosts(posts, { cantidad = 5, minimo = LADO_MINIMO } = {}) {
  if (!Array.isArray(posts) || !posts.length) return []

  const limpios = posts.filter(
    (p) => !TAGS_BASURA.some((t) => String(p?.tags || '').toLowerCase().includes(t)),
  )
  const base = limpios.length ? limpios : posts

  const grandes = base.filter((p) => {
    const ancho = Number(p?.ancho) || 0
    const alto = Number(p?.alto) || 0
    return ancho && alto && Math.min(ancho, alto) >= minimo
  })

  const ordenados = [...(grandes.length ? grandes : base)].sort(
    (a, b) => calidadDeMedia(b) - calidadDeMedia(a),
  )
  return ordenados.slice(0, Math.max(1, cantidad))
}

/**
 * Cabeceras extra por booru. Gelbooru sirve el archivo solo si la peticion
 * viene de su propio sitio; sin Referer contesta 200 con una pagina HTML de
 * ~35 KB que WhatsApp no puede mostrar.
 */
function cabecerasDe(fuente) {
  const host = String(fuente || '').replace(/^https?:\/\//, '').split('/')[0]
  return host ? { Referer: `https://${host}/` } : {}
}

/** Un archivo real de booru nunca pesa menos que esto */
const MIN_BYTES = 1024

/**
 * Tipo real del archivo por su firma, no por la extension del post.
 * Devuelve 'imagen', 'video' o null si lo que bajo no es ninguno de los dos
 * (el caso tipico: una pagina HTML de error disfrazada de 200 OK).
 */
export function tipoReal(buffer) {
  return detectar(buffer)?.tipo ?? null
}

/**
 * Extension real del archivo segun su firma.
 * Los boorus a veces etiquetan un webp como jpg; mandar el mimetype de la
 * extension declarada rompe la burbuja en WhatsApp.
 * @returns {string|null} png, jpg, gif, webp, bmp, mp4, webm o null
 */
export function extensionReal(buffer) {
  return detectar(buffer)?.extension ?? null
}

function detectar(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_BYTES) return null

  const texto = (desde, hasta) => buffer.toString('latin1', desde, hasta)
  const empieza = (firma) => firma.every((valor, i) => buffer[i] === valor)

  if (empieza([0xff, 0xd8, 0xff])) return { tipo: 'imagen', extension: 'jpg' }
  if (empieza([0x89, 0x50, 0x4e, 0x47])) return { tipo: 'imagen', extension: 'png' }
  // El GIF viaja como video con gifPlayback: para el envio cuenta como video
  if (texto(0, 3) === 'GIF') return { tipo: 'video', extension: 'gif' }
  if (texto(0, 4) === 'RIFF' && texto(8, 12) === 'WEBP') return { tipo: 'imagen', extension: 'webp' }
  if (texto(0, 2) === 'BM') return { tipo: 'imagen', extension: 'bmp' }
  if (texto(4, 8) === 'ftyp') return { tipo: 'video', extension: 'mp4' }
  if (empieza([0x1a, 0x45, 0xdf, 0xa3])) return { tipo: 'video', extension: 'webm' }

  return null
}

/**
 * Descarga el archivo de un post en la mejor calidad posible:
 *   1. El original (file_url) si no supera el tope.
 *   2. La muestra reducida (720-1500 px) solo como respaldo.
 *
 * Cada url se pide con el Referer de su propio booru: gelbooru (y alguno mas)
 * responde 200 con una pagina HTML de ~35 KB cuando falta el Referer, y ese
 * HTML terminaba enviado como si fuera la imagen (burbuja borrosa de 33 KB en
 * WhatsApp). Por eso despues de bajar se mira la firma real del archivo.
 *
 * @param {object} post post normalizado de buscarNSFW
 * @param {{maxBytes?: number}} opciones tope de peso (los GIF pasan de 10 MB y
 *   tardan una eternidad; el que llama puede pedir un limite mas bajo)
 */
export async function descargarPost(post, { maxBytes = MAX_BYTES } = {}) {
  const tope = Math.min(maxBytes, MAX_BYTES)
  const esUrl = (v) => typeof v === 'string' && /^https?:/i.test(v)
  const completa = esUrl(post.url) ? post.url : esUrl(post.muestra) ? post.muestra : null
  const reducida = esUrl(post.muestra) && post.muestra !== completa ? post.muestra : null
  const cabeceras = { ...UA, ...cabecerasDe(post.fuente) }
  const esperado = ['gif', 'mp4', 'webm'].includes(post.extension) ? 'video' : 'imagen'
  // Originales de 20 MB (PNG de escaneo) tardan medio minuto y terminan
  // reducidos igual: si el post declara ese peso se prueba primero la copia
  // JPEG del booru, que trae la misma resolucion.
  const pesado = (Number(post.bytes) || 0) > 12 * 1024 * 1024
  const urls = pesado ? [reducida, completa] : [completa, reducida]
  let ultimoError = null

  for (const url of urls) {
    if (!url) continue
    try {
      const buffer = await bajarArchivo(url, { maxBytes: tope, headers: cabeceras })
      const tipo = tipoReal(buffer)
      if (!tipo) {
        throw new Error(`el booru devolvio algo que no es imagen ni video (${buffer.length} bytes)`)
      }
      // Un video pedido como imagen (o al reves) rompe la burbuja en WhatsApp
      if (tipo !== esperado) {
        throw new Error(`se esperaba ${esperado} y llego ${tipo}`)
      }
      return buffer
    } catch (err) {
      ultimoError = err
    }
  }

  throw ultimoError ?? new Error('sin url de descarga')
}
