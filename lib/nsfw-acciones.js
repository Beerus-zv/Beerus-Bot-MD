/**
 * Catalogo de acciones NSFW (estilo Neko): frase con mencion + media del
 * tag correspondiente en los boorus keyless.
 *
 * Cada accion:
 *   - clave, texto      para el listado de /nsfw-interaccion
 *   - frases            plantillas pareja ({a} autor, {b} victima)
 *   - solo              plantilla cuando la victima es uno mismo
 *   - tags              tags reales de booru para el media, el primero manda
 *                       (danbooru/gelbooru comparten vocabulario; yande.re y
 *                       e621 usan otros nombres para lo mismo)
 *   - imagen            true para las tiradas sueltas (ass, pussy, neko)
 *                       que no llevan mencion ni frase
 *
 * La frase y el media tienen que ser alusivos a la accion: la frase nombra lo
 * que pasa y el post trae el tag en su lista (sin ese filtro un booru que no
 * conoce el tag devuelve cualquier cosa).
 */
export const ACCIONES_NSFW = [
  {
    clave: 'anal',
    texto: 'anal',
    frases: [
      '🍑 {a} se la mete a {b} por detrás sin avisar',
      '🍑 {a} abre a {b} en dos y entra hasta el fondo',
      '🍑 {a} deja a {b} gimiendo por la puerta de atrás',
    ],
    solo: '🍑 {a} se la mete solo... el fondo queda vacío',
    tags: ['anal', 'anal_sex'],
  },
  {
    clave: 'blowjob',
    texto: 'mamada',
    frases: [
      '💬 {a} se traga la polla de {b} hasta la garganta',
      '💬 {a} se arrodilla y se la mama a {b} sin respirar',
    ],
    solo: '💬 {a} chupa sus propios dedos... no es lo mismo',
    tags: ['blowjob', 'fellatio'],
  },
  {
    clave: 'boobjob',
    texto: 'rusa',
    frases: [
      '🤍 {a} le hace una rusa a {b} entre las tetas',
      '🤍 {a} aprieta las tetas y atrapa la polla de {b}',
    ],
    solo: '🤍 {a} aprieta las tetas contra el aire... prometedor',
    tags: ['paizuri', 'breast_press'],
  },
  {
    clave: 'cowgirl',
    texto: 'montada',
    frases: [
      '🤠 {a} se monta encima de {b} y cabalga sin freno',
      '🤠 {a} se sienta sobre {b} y marca el ritmo',
    ],
    solo: '🤠 {a} monta la almohada... gimnasia triste',
    tags: ['cowgirl_position', 'girl_on_top'],
  },
  {
    clave: 'cum',
    texto: 'corrida',
    frases: [
      '💥 {a} se corre encima de {b} y lo deja pegado',
      '💥 {a} le acaba a {b} en la cara',
    ],
    solo: '💥 {a} se corre al aire... mancha la sábana',
    tags: ['cum', 'cum_on_body'],
  },
  {
    clave: 'cummouth',
    texto: 'corrida en la boca',
    frases: [
      '🥣 {a} se corre dentro de la boca de {b}',
      '🥣 {a} le llena la boca a {b} y la obliga a tragar',
    ],
    solo: '🥣 {a} se corre en su propia mano... merienda sola',
    tags: ['cum_in_mouth', 'cum_in_mouth_external'],
  },
  {
    clave: 'cumshot',
    texto: 'corrida al aire',
    frases: [
      '🌋 {a} apunta y se corre encima de {b}',
      '🌋 {a} termina a chorros sobre el cuerpo de {b}',
    ],
    solo: '🌋 {a} dispara contra la pared... puntería divina',
    tags: ['cumshot', 'facial'],
  },
  {
    clave: 'fap',
    texto: 'paja en solitario',
    frases: [
      '🙌 {a} se hace una paja mirando a {b}',
      '🙌 {a} se masturba pensando en {b}',
    ],
    solo: '🙌 {a} se hace la paja del siglo... a solas',
    tags: ['masturbation', 'female_masturbation'],
  },
  {
    clave: 'footjob',
    texto: 'paja con los pies',
    frases: [
      '🦶 {a} le hace una paja a {b} con los pies',
      '🦶 {a} atrapa la polla de {b} entre los pies',
    ],
    solo: '🦶 {a} se frota los pies... sin objetivo',
    tags: ['footjob'],
  },
  {
    clave: 'fuck',
    texto: 'follada',
    frases: [
      '🔥 {a} se folla a {b} hasta dejarlo temblando',
      '🔥 {a} y {b} cogen como si no hubiera mañana',
    ],
    solo: '🔥 {a} se folla la almohada... nada nuevo',
    tags: ['sex', 'vaginal', 'penetration'],
  },
  {
    clave: 'grabboobs',
    texto: 'agarre de tetas',
    frases: [
      '🖐️ {a} le agarra las tetas a {b} y no las suelta',
      '🖐️ {a} aprieta las tetas de {b} con las dos manos',
    ],
    solo: '🖐️ {a} se agarra las tetas... consuelo propio',
    tags: ['breast_hold', 'grabbing_breasts'],
  },
  {
    clave: 'grope',
    texto: 'manoseo',
    frases: [
      '🫳 {a} le mete mano a {b} por debajo de la ropa',
      '🫳 {a} manosea a {b} hasta dejarlo caliente',
    ],
    solo: '🫳 {a} se manosea a sí mismo... digno',
    tags: ['groping', 'grope'],
  },
  {
    clave: 'handjob',
    texto: 'paja a otro',
    frases: [
      '✋ {a} le hace una paja a {b} hasta que suelte',
      '✋ {a} le mueve la mano a {b} con calma',
    ],
    solo: '✋ {a} se la mueve despacio... práctica',
    tags: ['handjob', 'penis_grab'],
  },
  {
    clave: 'lickass',
    texto: 'lamer el culo',
    frases: [
      '👅 {a} le lame el culo a {b} sin quejarse',
      '👅 {a} se come el culo de {b} hasta dejarlo mojado',
    ],
    solo: '👅 {a} se lame el dedo... no llega',
    tags: ['anilingus', 'ass_licking'],
  },
  {
    clave: 'lickdick',
    texto: 'lamida',
    frases: [
      '👅 {a} le lame la polla a {b} de arriba abajo',
      '👅 {a} se pasa la lengua por la polla de {b}',
    ],
    solo: '👅 {a} lame su propia mano... fantasía',
    tags: ['licking_penis', 'fellatio'],
  },
  {
    clave: 'lickpussy',
    texto: 'lamer el coño',
    frases: [
      '👅 {a} le come el coño a {b} hasta que grite',
      '👅 {a} le lame el coño a {b} sin prisa',
    ],
    solo: '👅 {a} se lame los dedos... sabe a poco',
    tags: ['cunnilingus', 'licking_pussy'],
  },
  {
    clave: 'sixnine',
    texto: 'posturas 69',
    frases: [
      '🔄 {a} y {b} se enganchan en un 69 perfecto',
      '🔄 {a} y {b} se comen mutuamente en 69',
    ],
    solo: '🔄 {a} intenta un 69 solo... imposible',
    tags: ['sixty_nine', '69_position'],
  },
  {
    clave: 'spank',
    texto: 'nalgada',
    frases: [
      '✋ {a} le pega una nalgada a {b} que resuena',
      '✋ {a} deja rojas las nalgas de {b}',
    ],
    solo: '✋ {a} se pega nalgadas solo... le gusta',
    tags: ['spanked', 'spanking'],
  },
  {
    clave: 'squirt',
    texto: 'chorro',
    frases: [
      '💦 {a} hace squirt en la cara de {b}',
      '💦 {a} se corre a chorros encima de {b}',
    ],
    solo: '💦 {a} se moja la mano... diluvio propio',
    tags: ['squirting', 'female_squirting'],
  },
  {
    clave: 'suckballs',
    texto: 'chupada de bolas',
    frases: [
      '⚽ {a} le chupa las bolas a {b} sin asco',
      '⚽ {a} se mete las bolas de {b} en la boca',
    ],
    solo: '⚽ {a} no alcanza... mala suerte',
    tags: ['ball_sucking', 'ball_suck', 'balls_sucking'],
  },
  {
    clave: 'suckboobs',
    texto: 'chupada de tetas',
    frases: [
      '🍼 {a} le chupa las tetas a {b} como un bebé',
      '🍼 {a} se cuelga de las tetas de {b}',
    ],
    solo: '🍼 {a} se chupa su propia teta... autoabasto',
    tags: ['breast_sucking', 'nipple_suck', 'nipple_sucking'],
  },
  {
    clave: 'undress',
    texto: 'encuerada',
    frases: [
      '🪢 {a} le saca la ropa a {b} prenda por prenda',
      '🪢 {a} deja a {b} desnudo en dos segundos',
    ],
    solo: '🪢 {a} se desnuda delante de todos... obvio',
    tags: ['undressing', 'undressed'],
  },
  {
    clave: 'yuri',
    texto: 'tijeras',
    frases: [
      '✂️ {a} y {b} se frotan los coños',
      '✂️ {a} y {b} hacen tijeras hasta acabar',
    ],
    solo: '✂️ {a} intenta tijeras sola... no corta',
    tags: ['tribadism', 'yuri'],
  },
  // ── Imagenes sueltas (sin mencion, estilo /hentai) ──
  {
    clave: 'ass',
    texto: 'trasero',
    frases: [],
    solo: '',
    tags: ['ass', 'bare_ass'],
    imagen: true,
  },
  {
    clave: 'pussy',
    texto: 'vagina',
    frases: [],
    solo: '',
    tags: ['pussy', 'spread_pussy'],
    imagen: true,
  },
  {
    clave: 'nekomimi',
    texto: 'neko',
    frases: [],
    solo: '',
    tags: ['neko', 'cat_ears'],
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
