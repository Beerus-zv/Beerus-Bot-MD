/**
 * Sistema de interacciones entre usuarios: /kiss, /slap, /hug y sus primos.
 *
 * - GIFs de anime desde nekos.best (sin clave; todas las acciones son GIF).
 *   Respaldo: kawaii.red (tambien sin clave) para las acciones que comparte.
 * - Los GIF se convierten a sticker animado WebP con ffmpeg (lib/multimedia.js).
 * - Cada interaccion exige mencionar a otro usuario (como el /rob).
 *
 * Textos de las frases: {a} = autor, {b} = victima (tokens de mencion @digitos).
 */
import { stickerDesdeGif } from './multimedia.js'

/** Catalogo de interacciones: la clave es el comando y la categoria del API */
export const INTERACCIONES = [
  {
    clave: 'kiss',
    texto: 'beso',
    frases: [
      '💋 {a} le plantó un beso robado a {b}',
      '💋 {b} no vio venir el beso de {a}',
      '💋 {a} aprovechó el silencio y... ¡beso directo a {b}!',
      '💋 {a} selló su juramento con un beso a {b}',
    ],
    solo: '💋 {a} besa al aire... divina soledad',
  },
  {
    clave: 'hug',
    texto: 'abrazo',
    frases: [
      '🫂 {a} abrazó con fuerza a {b}',
      '🫂 {b} recibió un abrazo inesperado de {a}',
      '🫂 {a} atrapó a {b} en un abrazo de oso',
      '🫂 {a} abraza a {b} hasta que todo va mejor',
    ],
    solo: '🫂 {a} abraza al aire... nadie que consolar',
  },
  {
    clave: 'slap',
    texto: 'bofetada',
    frases: [
      '👋 {a} le cruzó la cara a {b} ¡PAF! 💢',
      '👋 {b} sintió la bofetada real de {a}',
      '👋 {a} dejó la marca de su mano en {b} 😌',
      '👋 ¡PAF! {a} no perdonó nada a {b}',
    ],
    solo: '👋 {a} intenta servirse una bofetada... curioso temerario',
  },
  {
    clave: 'punch',
    texto: 'puñetazo',
    frases: [
      '👊 {a} le metió un puñetazo a {b} ¡el aire salió de la cara!',
      '👊 {b} comió el puño de {a}',
      '👊 {a} giró e impactó el golpe en {b} 💢',
      '👊 {b} quedó mareado por el golpe de {a}',
    ],
    solo: '👊 {a} golpea su propia sombra... KO técnico',
  },
  {
    clave: 'bonk',
    texto: 'bonk',
    frases: [
      '🔨 {a} le dio un bonk a {b} ¡se enmendó de una vez!',
      '🔨 {b} recibió el bonk inicial de {a}',
      '🔨 {a} corrigió con el mazo a {b} ¡BONK!',
      '🔨 Sin meditarlo: {a} manda el bonk directo a {b}',
    ],
    solo: '🔨 {a} se bonkea a sí mismo... el bonk libera pecados',
  },
  {
    clave: 'pat',
    texto: 'palmadita',
    frases: [
      '🫶 {a} dejó una palmadita en la cabeza de {b}',
      '🫶 {b} recibió palmaditas de {a} 🐾',
      '🫶 {a} premió a {b} como un gato fiel',
      '🫶 {a} palmó a {b} con cariño divino',
    ],
    solo: '🫶 {a} se palmó a sí mismo... por lo menos se quiere',
  },
  {
    clave: 'cuddle',
    texto: 'arrimón',
    frases: [
      '🥰 {a} se arrimó tiernamente a {b}',
      '🥰 {b} no puede escapar del arrimón de {a}',
      '🥰 {a} y {b} en modo pelotita de ternura',
      '🥰 {a} tomó a {b} de la manga para su arrimón',
    ],
    solo: '🥰 {a} se arrastra a un rincón con ternura infrahumana',
  },
  {
    clave: 'bite',
    texto: 'mordisco',
    frases: [
      '🦷 {a} le dio un mordisco insoportable a {b} 😖',
      '🦷 {b} acaba de ser mordido por {a}',
      '🦷 {a} sin motivo ni aviso: mordió a {b}',
      '🦷 {b} aprendió a cuidar el brazo de {a}',
    ],
    solo: '🦷 {a} se mordió a sí mismo... y encima se queja',
  },
  {
    clave: 'poke',
    texto: 'picadita',
    frases: [
      '👉 {a} picó a {b} con un dedito insistente',
      '👉 {b} recibe un pica-pica infinito de {a}',
      '👉 {a} molesta a {b} con piquitos',
      '👉 {b}: detente... {a}: *pic*',
    ],
    solo: '👉 {a} se pica a sí mismo... incomodidad autoinfligida',
  },
  {
    clave: 'tickle',
    texto: 'cosquillas',
    frases: [
      '🤡 {a} destrozó a {b} con cosquillas',
      '🤡 {b} no aguanta el ataque de cosquillas de {a}',
      '🤡 {a} lanzó el ataque nivel 1: cosquillas a {b}',
      '🤡 {b} se ríe sin poder evitarlo por {a}',
    ],
    solo: '🤡 {a} se hace cosquillas... sin efecto. Triste gato',
  },
  {
    clave: 'yeet',
    texto: 'yeet',
    frases: [
      '🚀 {a} lanzó a {b} por los aires ¡YEEET! 💨',
      '🚀 {b} va volando por el impulso de {a}',
      '🚀 {a} yeeteó sin explicación a {b}',
      '🚀 {b} aterrizó del yeet de {a}... dice que sin daño',
    ],
    solo: '🚀 {a} se yeetea a sí mismo fuera de la conversación',
  },
  {
    clave: 'shake',
    texto: 'sacudida',
    frases: [
      '🫨 {a} sacudió a {b} como exprimidor',
      '🫨 {b} terminó líquido por la sacudida de {a}',
      '🫨 {a} sacudió a {b} para resetear su cabeza',
      '🫨 {b} quedó con vértigo después de {a}',
    ],
    solo: '🫨 {a} se sacudió a sí mismo... cerebro en modo batido',
  },
  {
    clave: 'kick',
    texto: 'patada',
    frases: [
      '🦵 {a} le metió una patada épica a {b} ¡POW!',
      '🦵 {b} voló por la patada de {a}',
      '🦵 {a} estilo Shaolin: patada a {b}',
      '🦵 {b} aprendió la lección tras la patada de {a}',
    ],
    solo: '🦵 {a} se patea a sí mismo... estilo meteorito',
  },
  {
    clave: 'stare',
    texto: 'acecho',
    frases: [
      '👀 {a} acecha a {b} sin parpadear',
      '👀 {b} siente el escalofrío de la mirada de {a}',
      '👀 {a} clavó la mirada en {b} (malas señales)',
      '👀 {b} trata de ignorar el escalofrío bajo el ojo de {a}',
    ],
    solo: '👀 {a} se acecha en el espejo... reflexión divina',
  },
  {
    clave: 'highfive',
    texto: 'choca los cinco',
    frases: [
      '🖐️ {a} chocó el cinco con {b} ¡TROMP!',
      '🖐️ {b} completó el choca de {a} a escala divina',
      '🖐️ {a} y {b} celebran con un choca los cinco',
      '🖐️ ¡TROMP! {a} reconoce la energía de {b}',
    ],
    solo: '🖐️ {a} choca el cinco con el aire... sin público',
  },
  {
    clave: 'handhold',
    texto: 'mano',
    frases: [
      '🤝 {a} tomó la mano de {b}',
      '🤝 {b} permitió que {a} le sostuviera la mano',
      '🤝 {a} y {b} caminan tomados de la mano',
      '🤝 {a} estrecha la mano de {b} con razón secreta',
    ],
    solo: '🤝 {a} sostiene su propia mano... autoestima nivel DIOS',
  },
  {
    clave: 'baka',
    texto: 'grita baka',
    frases: [
      '😤 {a} gritó BAKA a {b} con todo el coraje anime',
      '😤 {b} quedó marcado como idiota por {a}',
      '😤 Un meme derrámase por {a}: BAKA BAKA a {b}',
      '😤 {a} tachó a {b} de bakas con estilo Tsundere',
    ],
    solo: '😤 {a} se grita BAKA a sí mismo... nivel tsundere最大',
  },
  {
    clave: 'blush',
    texto: 'sonrojo',
    frases: [
      '😊 {a} sonrojó a {b} hasta las orejas',
      '😊 {b} se encendió por el halago de {a}',
      '😊 {a} marcó con fuerza a {b}... roja la piel',
      '😊 {b} se traba frente a lo que hizo {a}',
    ],
    solo: '😊 {a} se sonroja con sus propias palabras... estoic',
  },
  {
    clave: 'cry',
    texto: 'llanto',
    frases: [
      '😭 {a} rompió en lágrimas frente a {b}',
      '😭 {b} es testigo (¿o culpable?) del llanto de {a}',
      '😭 {a} libera su diluvio personal ante {b}',
      '😭 {b} pide refuerzos contra las lágrimas de {a}',
    ],
    solo: '😭 {a} llora rodeado del silencio del universo',
  },
  {
    clave: 'facepalm',
    texto: 'facepalm',
    frases: [
      '🫠 {a} se palmeó la cara por lo que hizo {b}',
      '🫠 {b} provocó el facepalm divino de {a}',
      '🫠 {a} respira hondo frente a las diabluras de {b}',
      '🫠 {a} perdió la fe humana por culpa de {b}',
    ],
    solo: '🫠 {a} se decepciona de sí mismo... la lección empieza en casa',
  },
  {
    clave: 'wave',
    texto: 'saludo',
    frases: [
      '👋 {a} saluda a {b} con toda su energía',
      '👋 {b} devolvió el saludo de {a} con ánimo',
      '👋 {a} movió la mano hasta que {b} se dio cuenta',
      '👋 {a} pasa a saludar a {b} con gracia',
    ],
    solo: '👋 {a} saluda a nadie... hola, vacío',
  },
  // ── Novedades de Neko (nekos.best, 9 categorias gif mas) ──
  {
    clave: 'dance',
    texto: 'baile',
    frases: [
      '🕺 {a} sacó sus pasitos prohibidos para {b}',
      '🕺 {a} baila tan bien que {b} se queda congelado',
      '🕺 {a} reta a {b} a una batalla de baile',
      '🕺 {b} aplaude el show de pasos de {a}',
    ],
    solo: '🕺 {a} baila sola en la pista... el bombo es intangible',
  },
  {
    clave: 'laugh',
    texto: 'risa',
    frases: [
      '😂 {a} muere de risa por lo que hizo {b}',
      '😂 {a} no puede dejar de reírse de {b}',
      '😂 {b} le contó el chiste y {a} explotó en carcajadas',
      '😂 {a} ríe tanto que {b} ya se contagió',
    ],
    solo: '😂 {a} ríe a solas... y nadie sabe de qué',
  },
  {
    clave: 'happy',
    texto: 'felicidad',
    frases: [
      '🎉 {a} salta de felicidad junto a {b}',
      '🎉 {a} celebra con {b} a saltos y gritos',
      '🎉 {b} contó una buena noticia y {a} se puso en modo fiesta',
      '🎉 {a} comparte su alegría con {b}',
    ],
    solo: '🎉 {a} celebra en soledad... también vale',
  },
  {
    clave: 'smile',
    texto: 'sonrisa',
    frases: [
      '😊 {a} sonríe con toda el alma a {b}',
      '😊 {a} ilumina a {b} con su sonrisa',
      '😊 {b} logró arrancarle una sonrisa a {a}',
      '😊 {a} sonríe sin razón... solo porque {b} está ahí',
    ],
    solo: '😊 {a} sonríe en la nada... y es suficiente',
  },
  {
    clave: 'angry',
    texto: 'rabia',
    frases: [
      '😡 {a} se llenó de rabia por culpa de {b}',
      '😡 {b} encendió la furia de {a}... malas noticias',
      '😡 {a} humea al estilo Beerus frente a {b}',
      '😡 {a} ya está contando hasta diez... no funcionó con {b}',
    ],
    solo: '😡 {a} está furioso con el universo entero',
  },
  {
    clave: 'nom',
    texto: 'bocado',
    frases: [
      '😋 {a} devora su comida delante de {b}',
      '😋 {a} da un mordisco mientras {b} mira con hambre',
      '😋 {a} comparte (nada) de su merienda con {b}',
      '😋 {b} se quedó sin bocado: {a} llegó primero',
    ],
    solo: '😋 {a} come solo... nada que compartir',
  },
  {
    clave: 'tableflip',
    texto: 'cara de mesa',
    frases: [
      '😤 {a} vuela la mesa ante lo que hizo {b}',
      '😤 (╯°□°)╯︵ ┻━┻ {a} frente a la lista de {b}',
      '😤 {a} volteó la mesa porque {b} se pasó de línea',
      '😤 {b} presenció el flip de mesa divino de {a}',
    ],
    solo: '😤 {a} voltea la mesa... con nadie como espectador',
  },
  {
    clave: 'thumbsup',
    texto: 'aprobación',
    frases: [
      '👍 {a} aprueba con pulgar lo que hizo {b}',
      '👍 {a} da su visto bueno a {b}',
      '👍 {b} recibió el pulgar divino de {a}',
      '👍 {a} certifica con un pulgar frente a {b}',
    ],
    solo: '👍 {a} se aprueba a sí mismo... también vale',
  },
  {
    clave: 'yawn',
    texto: 'bostezo',
    frases: [
      '🥱 {a} está tan aburrido de {b} que bosteza',
      '🥱 {a} bosteza con drama frente a {b}',
      '🥱 la charla tan larga de {b} no dejó a {a} con los ojos abiertos',
      '🥱 {a} despierta bostezando delante de {b}',
    ],
    solo: '🥱 {a} bosteza y se estira al vacío del universo',
  },
]

/** Acciones que kawaii.red también sirve (clave -> categoria del respaldo) */
const RESPALDO_KAWAII = {
  kiss: 'kiss',
  hug: 'hug',
  slap: 'slap',
  pat: 'pat',
  punch: 'punch',
  bite: 'bite',
  poke: 'poke',
  cuddle: 'hug',
  blush: 'blush',
}

const F = (url, opciones = {}) => fetch(url, { signal: AbortSignal.timeout(20000), ...opciones })

/** Descarga un GIF de nekos.best para una interaccion */
async function gifDeNekos(clave) {
  const respuesta = await F(`https://nekos.best/api/v2/${clave}?amount=1`)
  if (!respuesta.ok) throw new Error(`nekos.best HTTP ${respuesta.status}`)

  const datos = await respuesta.json()
  const lista = datos?.results ?? []
  if (!lista.length) throw new Error('nekos.best no devolvio resultados')

  const resultado = lista[Math.floor(Math.random() * lista.length)]
  if (!resultado?.url) throw new Error('nekos.best no devolvio url')

  const gif = await F(resultado.url)
  if (!gif.ok) throw new Error(`gif HTTP ${gif.status}`)
  return Buffer.from(await gif.arrayBuffer())
}

/** Descarga un GIF del respaldo kawaii.red para las acciones compartidas */
async function gifDeKawaii(clave) {
  const cat = RESPALDO_KAWAII[clave]
  if (!cat) throw new Error('sin respaldo para esta accion')

  const respuesta = await F(`https://api.kawaii.red/api/gif/${cat}/token=anonymous`)
  if (!respuesta.ok) throw new Error(`kawaii.red HTTP ${respuesta.status}`)

  const url = (await respuesta.json())?.response
  if (!url) throw new Error('kawaii.red sin url')

  const gif = await F(url)
  if (!gif.ok) throw new Error(`gif HTTP ${gif.status}`)
  return Buffer.from(await gif.arrayBuffer())
}

/** Reintenta nekos.best y luego pasa a kawaii.red; devuelve el buffer del GIF */
export async function traerGif(clave, reintentos = 2) {
  let ultimoError = null

  for (let i = 0; i < reintentos; i += 1) {
    try {
      return await gifDeNekos(clave)
    } catch (err) {
      ultimoError = err
    }
  }

  try {
    return await gifDeKawaii(clave)
  } catch (err) {
    ultimoError = err
  }

  throw ultimoError ?? new Error('Ninguna fuente de GIF respondio')
}

/**
 * Consigue el GIF de una interaccion y lo convierte a sticker animado WebP.
 */
export async function stickerDeInteraccion(clave) {
  const gif = await traerGif(clave)
  return stickerDesdeGif(gif)
}

/**
 * Elige una frase al azar para la interaccion.
 * @param {string} clave interaccion
 * @param {string} autorToken token de mencion del autor
 * @param {string} objetivoToken token de mencion del objetivo (puede ser '')
 * @param {boolean} enSoledad true si no hay objetivo real (o es el propio autor)
 */
export function fraseInteraccion(clave, autorToken, objetivoToken = '', enSoledad = false) {
  const def = INTERACCIONES.find((i) => i.clave === clave) ?? INTERACCIONES[0]
  const plantillas = enSoledad ? [def.solo] : def.frases
  const plantilla = plantillas[Math.floor(Math.random() * plantillas.length)]

  return plantilla.replaceAll('{a}', autorToken).replaceAll('{b}', objetivoToken)
}
