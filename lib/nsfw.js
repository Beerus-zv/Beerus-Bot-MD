/**
 * Motor de busqueda NSFW (modo imagen anime de los boorus keyless).
 *
 * GataBot-MD y MEGA-MD usan waifu.pics/rule34.xxx, pero estan bloqueados o
 * muertos desde esta red; las fuentes vivas y sin clave son:
 *   1. yande.re    (anime, JSON post.json)
 *   2. konachan.com (anime, JSON post.json)
 *   3. e621.net    (respaldo amplio; exige User-Agent propio)
 *
 * El modo NSFW debe estar activado en el chat (/nsfw on por un admin):
 * aqui solo vive la busqueda y descarga, politicas en commands/nsfw.js.
 */
import { bajarArchivo } from './descargas.js'
import { GELBOORU_API_KEY, GELBOORU_USER_ID } from '../config.js'

const UA = { 'User-Agent': 'BeerusBotMD/1.0 (bot de WhatsApp; busqueda de imagen)' }

/** Extensiones que WhatsApp acepta como imagen o video directo */
const EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'webp']
const EXT_VIDEO = ['gif', 'mp4', 'webm']

/** Tope de descarga por imagen (las JPEG reducidas pasan bien) */
const MAX_BYTES = 16 * 1024 * 1024

/**
 * Paginas que se piden al azar.
 *
 * Sin esto cada llamada bajaba siempre el mismo primer bloque de 50 posts, asi
 * que dos `/r34 burnice` seguidos devolvian casi las mismas imagenes. Pidiendo
 * una pagina al azar cambia el bloque entero; el tope evita pedir paginas que
 * ya no existen (los boorus devuelven lista vacia y se cae a la pagina 1).
 */
const MAX_PAGINAS = 20

function paginaAlAzar() {
  return 1 + Math.floor(Math.random() * MAX_PAGINAS)
}

/**
 * Memoria de lo ya enviado, por chat y consulta.
 *
 * La pagina al azar reparte mucho, pero con pocos posts por tag todavia puede
 * tocar la misma imagen dos veces seguidas. Esto la descarta hasta que la
 * lista se agota.
 */
const VISTOS = new Map()
const MAX_VISTOS_POR_CLAVE = 150
const MAX_CLAVES = 200

/** Anota un post como ya enviado en ese chat para esa consulta */
export function marcarVisto(clave, id) {
  if (!clave || id === undefined || id === null) return

  let registro = VISTOS.get(clave)
  if (!registro) {
    if (VISTOS.size >= MAX_CLAVES) {
      VISTOS.delete(VISTOS.keys().next().value)
    }
    registro = { ids: new Set(), orden: [] }
    VISTOS.set(clave, registro)
  }

  const idTexto = String(id)
  if (registro.ids.has(idTexto)) return

  registro.ids.add(idTexto)
  registro.orden.push(idTexto)
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

  const nuevos = posts.filter((p) => !registro.ids.has(String(p.id)))
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
      const muestra =
        p.jpeg_url && (p.jpeg_file_size ?? MAX_BYTES) <= MAX_BYTES ? p.jpeg_url : p.file_url
      return {
        id: p.id,
        fuente,
        tags: p.tags ?? '',
        score: p.score ?? 0,
        extension: extensionDe(p.file_url),
        muestra,
        url: p.file_url,
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
        fuente: 'e621',
        tags: [...(p.tags?.general ?? []), ...(p.tags?.artist ?? [])].slice(0, 12).join(' '),
        score: p.score?.total ?? 0,
        extension: p.file.ext,
        muestra,
        url: p.file.url,
      }
    })
}

/** Normaliza los posts de gelbooru (dapi JSON) */
function desdeGelbooru(datos) {
  const lista = Array.isArray(datos?.post) ? datos.post : Array.isArray(datos) ? datos : []
  return lista
    .filter((p) => p?.file_url || p?.sample)
    .map((p) => {
      const completa = p.file_url || p.sample
      // gelbooru manda `sample: 1` (bandera, no URL) cuando hay muestra: solo
      // se acepta como respaldo si de verdad es una URL.
      const muestra =
        typeof p.sample === 'string' && /^https?:/i.test(p.sample) && p.sample !== completa
          ? p.sample
          : null
      return {
        id: p.id,
        fuente: 'gelbooru.com',
        tags: p.tags ?? '',
        score: Number(p.score) || 0,
        extension: extensionDe(completa),
        muestra: muestra || completa,
        url: completa,
      }
    })
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
        tags: p.tag_string ?? '',
        score: p.score ?? 0,
        extension: String(p.media_asset?.file_ext ?? extensionDe(completa)),
        muestra: reducida || completa,
        url: completa,
      }
    })
}

/**
 * Busca posts explicitos por tags en la cadena de boorus.
 * @param {string} consulta tags separados por espacios (vacios = tag al azar)
 * @param {{fuente?: string}} opciones fueme preferida (se prueba primero)
 * @returns {Promise<{tags: string, fuente: string|null, posts: Array}>}
 */
export async function buscarNSFW(consulta = '', { fuente: fuentePedida = null } = {}) {
  const base = consulta.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_')

  // Con consulta explicita: el tag exacto, el comodin (tag*) por si el
  // nombre no coincide exacto (ej. 'emilia' -> 'emilia_(re:zero)'), y los
  // tags individuales (con y sin comodin) para consultas compuestas.
  // Sin consulta (modo azar, /hentai): hasta 3 tags distintos de la lista.
  const partes = base.split('_').filter((t) => t && t !== base)
  const candidatosTags = base
    ? [base, `${base}*`, ...partes, ...partes.map((t) => `${t}*`)]
        .filter((t, i, a) => t && a.indexOf(t) === i)
    : [...TAGS_AZAR].sort(() => Math.random() - 0.5).slice(0, 3)

  const intentar = async (tags) => {
    const pagina = paginaAlAzar()

    const fuentes = [
      {
        nombre: 'yande.re',
        pedir: async (pag) => desdeMoebooru(
          await pedirJson(`https://yande.re/post.json?limit=50&page=${pag}&tags=${encodeURIComponent(`rating:explicit ${tags}`)}`),
          'yande.re',
        ),
      },
      {
        nombre: 'danbooru.donmai.us',
        pedir: async (pag) => desdeDanbooru(
          await pedirJson(`https://danbooru.donmai.us/posts.json?limit=50&page=${pag}&tags=${encodeURIComponent(`${tags} rating:explicit`)}`),
        ),
      },
      {
        nombre: 'konachan.com',
        pedir: async (pag) => desdeMoebooru(
          await pedirJson(`https://konachan.com/post.json?limit=50&page=${pag}&tags=${encodeURIComponent(`rating:explicit ${tags}`)}`),
          'konachan.com',
        ),
      },
      {
        nombre: 'gelbooru.com',
        // gelbooru pagina con `pid`, que empieza en 0, y exige credenciales:
        // sin api_key/user_id el DAPI responde 401.
        pedir: async (pag) => desdeGelbooru(
          await pedirJson(`https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pag - 1}&api_key=${GELBOORU_API_KEY}&user_id=${GELBOORU_USER_ID}&tags=${encodeURIComponent(`${tags} rating:explicit`)}`),
        ),
      },
      {
        nombre: 'e621.net',
        pedir: async (pag) => desdeE621(
          await pedirJson(`https://e621.net/posts.json?limit=50&page=${pag}&tags=${encodeURIComponent(`${tags} rating:explicit`)}`),
        ),
      },
    ]

    // Con fuente preferida (comandos /danbooru, /e621): esa prueba primero,
    // las demas quedan de respaldo
    if (fuentePedida) {
      const preferida = fuentes.findIndex((f) => f.nombre.includes(fuentePedida) || fuentePedida.includes(f.nombre))
      if (preferida > 0) fuentes.unshift(...fuentes.splice(preferida, 1))
    }

    let ultimoError = null

    for (const fuente of fuentes) {
      // La pagina al azar puede caer fuera del tag: si vuelve vacia se
      // reintenta con la primera, que siempre tiene material.
      const paginas = pagina === 1 ? [1] : [pagina, 1]
      for (const pag of paginas) {
        try {
          const posts = await fuente.pedir(pag)
          if (posts.length) return { tags, fuente: fuente.nombre, posts }
        } catch (err) {
          ultimoError = err
        }
      }
    }

    return { tags, fuente: null, posts: [], error: ultimoError }
  }

  // Primero: autocompletar el tag (ej. 'ram' + hint 're zero' -> 'ram_(re:zero)')
  if (base && !base.includes('*')) {
    const partesQuery = base.split(/[_\s]+/).filter(Boolean)
    const resuelto = await autocompletarTag(partesQuery[0] || base, partesQuery.slice(1))
    if (resuelto && resuelto !== base) {
      const resultado = await intentar(resuelto)
      if (resultado.fuente) return resultado
      const resultado2 = await intentar(resuelto + '*')
      if (resultado2.fuente) return resultado2
    }
  }

  for (const tags of candidatosTags) {
    const resultado = await intentar(tags)
    if (resultado.fuente) return resultado
  }

  // Ultimo recurso: probar cada palabra del query con comodin
  for (const parte of base.split(/[_\s]+/).filter(Boolean)) {
    if (parte === base) continue
    const resultado = await intentar(parte + '*')
    if (resultado.fuente) return resultado
  }

  return { tags: candidatosTags[0] ?? '', fuente: null, posts: [], error: null }
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
 * Descarga el archivo de un post en la mejor calidad posible:
 *   1. El original (file_url) si no supera el tope.
 *   2. La muestra reducida (720-1500 px) solo como respaldo.
 */
export async function descargarPost(post) {
  const esUrl = (v) => typeof v === 'string' && /^https?:/i.test(v)
  const completa = esUrl(post.url) ? post.url : esUrl(post.muestra) ? post.muestra : null
  const reducida = esUrl(post.muestra) && post.muestra !== completa ? post.muestra : null
  let ultimoError = null

  if (completa) {
    try {
      return await bajarArchivo(completa, { maxBytes: MAX_BYTES, headers: UA })
    } catch (err) {
      ultimoError = err
    }
  }

  if (reducida) {
    return bajarArchivo(reducida, { maxBytes: MAX_BYTES, headers: UA })
  }

  throw ultimoError ?? new Error('sin url de descarga')
}
