/**
 * Configuracion central del bot.
 * Todos los valores se pueden ajustar aqui sin tocar el resto del codigo.
 */

/** Nombre del bot (se muestra en los mensajes y en el menu) */
export const BOT_NAME = 'Beerus Bot MD'

/** Prefijos aceptados para los comandos: .comando #comando /comando */
export const PREFIXES = ['.', '#', '/']

/** Alias singular, por comodidad */
export const PREFIX = PREFIXES

/**
 * Actualizacion automatica al iniciar con `npm start` (usa git).
 *
 * DESACTIVADA por defecto: el actualizador hace `git merge` y `npm install`
 * antes de cargar el bot, es decir, ejecuta codigo del repositorio remoto
 * sin revisarlo. Actívala solo si controlas el remoto.
 * También se puede forzar con `--update` o desactivar con `--no-update`.
 * RAMA_ACTUALIZACION: rama a seguir; vacio = la rama en la que esta el bot.
 */
export const AUTO_ACTUALIZAR = false
export const RAMA_ACTUALIZACION = ''

/**
 * Navegador que se muestra en WhatsApp > Dispositivos vinculados.
 * Opciones: 'Firefox', 'Chrome', 'Safari', 'Edge', 'Opera'.
 */
export const NAVEGADOR_WA = 'Firefox'

/** Carpeta de la sesion de WhatsApp */
export const AUTH_DIR = 'auth_info'

/**
 * Metodo de vinculacion (solo cuando la sesion aun no esta registrada):
 *   'preguntar' -> pregunta por consola (QR o codigo)
 *   'qr'        -> siempre muestra el QR
 *   'codigo'    -> codigo de emparejamiento de 8 caracteres
 * Tambien se puede forzar al iniciar: `node index.js --qr` o `node index.js --code`.
 */
export const METODO_VINCULACION = 'preguntar'

/**
 * Numero del bot para el codigo de emparejamiento (opcional).
 * Con codigo de pais, solo digitos. Ej: '5215512345678'. Si queda vacio, se pregunta.
 */
export const NUMERO_VINCULACION = ''

/** Palabras que activan al bot cuando se escriben en un mensaje */
export const MENCIONES_BOT = ['beerus']

/** Si el bot responde a los mensajes que el propio usuario le envia */
export const RESPONDER_A_SI_MISMO = false

/**
 * Autoreact (`.autoreact on` en cada grupo): el bot reacciona con un emoji al azar.
 * AUTOREACT_PROBABILIDAD: probabilidad (0 a 1) de reaccionar a cada mensaje.
 * AUTOREACT_PAUSA_MS: pausa mínima entre dos reacciones del mismo grupo.
 */
export const AUTOREACT_PROBABILIDAD = 0.2
export const AUTOREACT_PAUSA_MS = 20_000

/**
 * Nivel de logs internos de Baileys (JSON de pino): 'silent' | 'warn' | 'info' | 'debug'.
 * Se deja en 'silent' porque los logs legibles de cada mensaje los muestra lib/logger.js.
 */
export const LOG_LEVEL = 'silent'

/** ── Contacto y donaciones ──
 * Se muestran en .dona (info de donaciones) y .info (datos del bot).
 * Cambia el usuario de Instagram por el tuyo real:
 */
export const CONTACTO = {
  /** Usuario de Instagram para que contacten los donantes */
  instagram: 'andresm_zv',
  /** Correo de PayPal para recibir donaciones */
  paypal: 'altozv@gmail.com',
  /** Link de pago (opcional; si esta, se muestra de una) */
  paypalLink: 'https://paypal.me/altozv',
}

/**
 * Banner del menu.
 * Prioridad de fuentes:
 *   1. banners de internet en cache (data/banners/, ver lib/banners-menu.js)
 *   2. busqueda de imagenes (Bing, con DuckDuckGo de respaldo)
 *   3. BANNER_LOCAL -> arte del proyecto (assets/beerus-banner.png) si no hay red
 *
 * Cada banner de internet se recorta a 900x600 y se le escribe encima el
 * titulo del bot; el menu manda uno al azar distinto del anterior.
 */
export const IMAGEN_MENU_INTERNET = true

/**
 * Banner local incluido en el proyecto.
 * Arte de Beerus que se usa como respaldo del menu cuando no hay internet
 * y tambien como foto del bot (precarga de avatar).
 * Ruta relativa a la raiz del proyecto.
 */
export const BANNER_LOCAL = 'assets/beerus-banner.png'

