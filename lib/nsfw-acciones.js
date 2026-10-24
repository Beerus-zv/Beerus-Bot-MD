/**
 * Catalogo de acciones NSFW (estilo Neko): frase con mencion + imagen
 * del tag correspondiente en los boorus keyless.
 *
 * Cada accion:
 *   - clave, texto      para el listado de /nsfw-interaccion
 *   - frases            plantillas pareja ({a} autor, {b} victima)
 *   - solo              plantilla cuando la victima es uno mismo
 *   - tag               tag de booru para la imagen (danbooru/yande.re,
 *                       vocabulario compartido; la cadena de fuentes
 *                       encuentra la que tenga material)
 *   - imagen            true para las tiradas sueltas (ass, pussy, neko)
 *                       que no llevan mencion ni frase
 *
 * La imagen sale del mismo motor de commands/rule34.js
 * (buscarNSFW -> postRecibible -> descargarPost).
 */
import { buscarNSFW, postRecibible, descargarPost } from './nsfw.js'

export const ACCIONES_NSFW = [
  {
    clave: 'anal',
    texto: 'anal',
    frases: [
      '🍑 {a} abre la puerta trasera de {b}... ni el dios destructor es tan directo',
      '🍑 {a} y {b} exploran el camino del fondo... el multiverso bendice el presagio',
    ],
    solo: '🍑 {a} interpreta ambos papeles del anal... talento absoluto',
    tag: 'anal',
  },
  {
    clave: 'blowjob',
    texto: 'mamada',
    frases: [
      '💬 {a} atiende a {b} con la paciencia de un Kaio-shin',
      '💬 {a} condena a {b} a una devocion total bajo el trono',
    ],
    solo: '💬 {a} practica la devocion con su propia mano divina',
    tag: 'blowjob',
  },
  {
    clave: 'boobjob',
    texto: 'rusa',
    frases: [
      '🤍 {a} confirma que el cofre de {b} sirve de altar',
      '🤍 {a} atrapa a {b} entre dos constelaciones',
    ],
    solo: '🤍 {a} estrecha el vacio cosmico... fluido y decepcionante',
    tag: 'paizuri',
  },
  {
    clave: 'cowgirl',
    texto: 'montada',
    frases: [
      '🤠 {a} monta a {b} al estilo vaquero... el carrusel no frena',
      '🤠 {a} sube al carrusel de {b}... ronda infinita',
    ],
    solo: '🤠 {a} monta silla vacia... estilo de carreras tristes',
    tag: 'cowgirl_position',
  },
  {
    clave: 'cum',
    texto: 'corrida',
    frases: [
      '💥 {a} resuelve el asunto sobre {b} con juicio final',
      '💥 {a} termina en {b} marcando territorio',
    ],
    solo: '💥 {a} termina su mision en silencio cosmico',
    tag: 'cum',
  },
  {
    clave: 'cummouth',
    texto: 'corrida en la boca',
    frases: [
      '🥣 {a} termina el postre en la boca de {b}... meseria divina',
      '🥣 {a} obsequia a {b} la merienda del destino',
    ],
    solo: '🥣 {a} bombardea su propia mesa... gourmet absoluto',
    tag: 'cum_in_mouth',
  },
  {
    clave: 'cumshot',
    texto: 'corrida al aire',
    frases: [
      '🌋 {a} dispara con precision de Hakai... {b} recibe sin destruir',
      '🌋 {a} lanza el espiritu heroico hacia {b}',
    ],
    solo: '🌋 {a} practica tiro al blanco celeste... sin objetivo',
    tag: 'cumshot',
  },
  {
    clave: 'fap',
    texto: 'paja en solitario',
    frases: [
      '🙌 {a} anuncia sus asuntos privados mientras {b} observa',
      '🙌 {a} premia a {b} con el choreo del destierro',
    ],
    solo: '🙌 {a} elabora un plan privado de tres actos',
    tag: 'masturbation',
  },
  {
    clave: 'footjob',
    texto: 'paja con los pies',
    frases: [
      '🦶 {a} atiende a {b} con tecnica de pies de artes marciales',
      '🦶 {a} y {b} fusionan pies con telon de fondo',
    ],
    solo: '🦶 {a} solo conoce ballet de salones... sin objeto',
    tag: 'footjob',
  },
  {
    clave: 'fuck',
    texto: 'follada',
    frases: [
      '🔥 {a} y {b} cruzan el umbral del presagio... nada queda igual',
      '🔥 {a} demuestra a {b} por que es el dios de la destruction',
    ],
    solo: '🔥 {a} no tiene con quien cruzar el umbral... paciencia divina',
    tag: 'sex',
  },
  {
    clave: 'grabboobs',
    texto: 'agarre de tetas',
    frases: [
      '🖐️ {a} agarra el tesoro sagrado de {b}... sin pedir permiso',
      '🖐️ {a} explora el territorio de {b} sin mapa',
    ],
    solo: '🖐️ {a} agarra el vacio cosmico... simbolico',
    tag: 'breast_hold',
  },
  {
    clave: 'grope',
    texto: 'manoseo',
    frases: [
      '🫳 {a} explora a {b} como si fuera territorio inexplorado',
      '🫳 {a} deja a {b} sin secretos ni toga',
    ],
    solo: '🫳 {a} tantea su propia toga... fiel estilista',
    tag: 'groping',
  },
  {
    clave: 'handjob',
    texto: 'paja a otro',
    frases: [
      '✋ {a} ofrece sus servicios gourmet a {b}',
      '✋ {a} coordina una operacion de musculo fino sobre {b}',
    ],
    solo: '✋ {a} lava a su sombra... grafico ya solitario',
    tag: 'handjob',
  },
  {
    clave: 'lickass',
    texto: 'lamer el culo',
    frases: [
      '👅 {a} trabaja el territorio trasero de {b} sin remordimiento',
      '👅 {a} firma el contrato del trasero de {b}',
    ],
    solo: '👅 {a} tampoco se atreve con el fondo... se mordio',
    tag: 'anilingus',
  },
  {
    clave: 'lickdick',
    texto: 'lamida',
    frases: [
      '👅 {a} no niega la devocion textual frente a {b}',
      '👅 {a} prescribe a {b} el remedio mas adictivo',
    ],
    solo: '👅 {a} devora su plato favorito... placer culposo',
    tag: 'licking_penis',
  },
  {
    clave: 'lickpussy',
    texto: 'lamer el coño',
    frases: [
      '👅 {a} despliega la lengua entera para {b}',
      '👅 {a} no deja a {b} a medio servicio',
    ],
    solo: '👅 {a} no aporta testigos en su homenaje en soledad',
    tag: 'cunnilingus',
  },
  {
    clave: 'sixnine',
    texto: 'posturas 69',
    frases: [
      '🔄 {a} y {b} inventan la primera hermandad 69 del multiverso',
      '🔄 {a} y {b} giran en perfecta simetria candente',
    ],
    solo: '🔄 {a} intenta un 69 en soledad... falla con estilo',
    tag: 'sixty_nine',
  },
  {
    clave: 'spank',
    texto: 'nalgada',
    frases: [
      '✋ {a} deja su firma roja en {b}... disciplina nivel explosivo',
      '✋ {a} ajusta la respiracion de {b} a golpe firme',
    ],
    solo: '✋ {a} trata sus propias nalgas... entusiasmo total',
    tag: 'spanked',
  },
  {
    clave: 'squirt',
    texto: 'chorro',
    frases: [
      '💦 {a} provoca en {b} el torrente del tribunal divino',
      '💦 {a} y {b} liberan el diluvio',
    ],
    solo: '💦 {a} bautiza su propio altar en soledad',
    tag: 'squirting',
  },
  {
    clave: 'suckballs',
    texto: 'chupada de bolas',
    frases: [
      '⚽ {a} pide el asiento de {b} para un postre verdadero',
      '⚽ {a} desayuna en {b} con permiso divino',
    ],
    solo: '⚽ {a} no consigue material de ese calibre',
    tag: 'ball_sucking',
  },
  {
    clave: 'suckboobs',
    texto: 'chupada de tetas',
    frases: [
      '🍼 {a} reclama su hora de lactancia adulta con {b}',
      '🍼 {a} deja sin postre a {b} por dosificarlo todo',
    ],
    solo: '🍼 {a} protesta sin poder marcar ninguna peticion',
    tag: 'breast_sucking',
  },
  {
    clave: 'undress',
    texto: 'encuerada',
    frases: [
      '🪢 {a} desata la toga de {b} con malicia legalizada',
      '🪢 {a} no deja tela alguna sobre los secretos de {b}',
    ],
    solo: '🪢 {a} se pela a si mismo... arte en dos actos',
    tag: 'undressing',
  },
  {
    clave: 'yuri',
    texto: 'tijeras',
    frases: [
      '✂️ {a} y {b} afinan las tijeras hasta el umbral',
      '✂️ {a} y {b} se espolvorean en perfecta sincronia',
    ],
    solo: '✂️ {a} imita tijeras contra el lecho divino... nadie corta',
    tag: 'tribadism',
  },
  // ── Imagenes sueltas (sin mencion, estilo /hentai) ──
  {
    clave: 'ass',
    texto: 'trasero',
    frases: [],
    solo: '',
    tag: 'ass',
    imagen: true,
  },
  {
    clave: 'pussy',
    texto: 'vagina',
    frases: [],
    solo: '',
    tag: 'pussy',
    imagen: true,
  },
  {
    clave: 'nekomimi',
    texto: 'neko',
    frases: [],
    solo: '',
    tag: 'neko',
    imagen: true,
  },
]

/** Busca la ficha por clave */
export function accionNSFW(clave) {
  return ACCIONES_NSFW.find((a) => a.clave === clave) ?? null
}

/** Elige una frase al azar (mismo formato que fraseInteraccion) */
export function fraseNSFW(clave, autorToken, objetivoToken = '', enSoledad = false) {
  const def = accionNSFW(clave) ?? ACCIONES_NSFW[0]
  const plantillas = enSoledad ? (def.solo ? [def.solo] : []) : def.frases
  if (!plantillas.length) return '' // imagenes sueltas no llevan frase
  const plantilla = plantillas[Math.floor(Math.random() * plantillas.length)]
  return plantilla.replaceAll('{a}', autorToken).replaceAll('{b}', objetivoToken)
}

/** Lineas para el listado de /nsfw-interaccion */
export function listarAccionesNSFW() {
  return ACCIONES_NSFW.map((a) => `▸ \`${a.clave}\` — ${a.texto}`)
}
