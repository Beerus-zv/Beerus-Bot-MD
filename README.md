<img src="assets/beerus-banner.png" alt="Beerus Bot MD" width="100%"/>

# Beerus Bot MD

Bot de WhatsApp multi-dispositivo escrito sobre Baileys, con sesión y datos en SQLite. Trae gacha anime, póker, UNO, economía, moderación de grupos, descargas y una IA con la personalidad de Beerus que funciona sin clave de API.

![Versión](https://img.shields.io/badge/version-2.5.0-FF4D6D?style=flat-square)
![Node](https://img.shields.io/badge/node-22.13%2B-10B981?style=flat-square)
![Licencia](https://img.shields.io/badge/license-MIT-8B5CF6?style=flat-square)

![Estrellas](https://img.shields.io/github/stars/Beerus-zv/Beerus-Bot-MD?style=social)
![Forks](https://img.shields.io/github/forks/Beerus-zv/Beerus-Bot-MD?style=social)
![Visitas](https://komarev.com/ghpvc/?username=Beerus-zv&label=Visitas&color=FF4D6D&style=for-the-badge)

<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=900&size=22&pause=800&color=FF4D6D&center=true&vCenter=true&width=780&lines=🐱+Bot+de+WhatsApp+multi-dispositivo+con+Baileys;⚡+177+comandos+•+Gacha+anime+•+Poker+•+UNO;🤖+IA+de+Beerus+sin+clave+de+API;🛡️+Moderación+•+Economía+•+Descargas" alt="Typing SVG" />

</div>

## En números

| Dato | Valor |
|:---|:---|
| Comandos | 177 archivos en `commands/`, uno por comando |
| Categorías | 18 |
| Prefijos | `.` `#` `/` |
| Stack | Node.js 22.13+ (ESM), Baileys, `node:sqlite`, sharp, ffmpeg |
| Sesión | Un archivo SQLite en vez de ~1400 sueltos |
| Licencia | MIT |

## Qué es

<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=700&size=18&pause=1000&color=FF4D6D&center=true&vCenter=true&width=700&lines=Bot+multi-dispositivo+sobre+Baileys;Sin+navegador+•+Sin+Puppeteer+•+Solo+el+protocolo;177+comandos+•+18+categorías+•+SQLite" alt="Que es" />

</div>

Se conecta a WhatsApp como un dispositivo vinculado más, usando `@whiskeysockets/baileys` y nada de automatización de navegador. No levanta Chromium, no gasta 800 MB de RAM en un navegador y no se rompe cuando WhatsApp cambia el DOM.

Por dentro hay tres piezas: un enrutador de mensajes, un registro de comandos y una capa de datos. Cada comando es un archivo en `commands/` que exporta una función.

## Cómo está armado

- **Sesión en SQLite** (`lib/auth-state.js`): escrituras atómicas. Si el proceso muere a mitad de un lote, la llave entra entera o no entra. El esquema de 1400 archivos no garantiza eso.
- **Carga perezosa de comandos** (`lib/loader.js`): al arrancar solo se leen los nombres de archivo; cada comando se compila la primera vez que alguien lo usa. El arranque no toca 177 archivos, y `npm test` sí los carga todos para validarlos.
- **Caché de bytecode de V8** (`lib/arranque.js`): el módulo compilado queda en `data/v8-cache/`, así el segundo arranque no vuelve a compilar lo mismo.
- **IA sin clave de API**: tres proveedores gratuitos en cascada. El que falla se aparta un rato para no hacer esperar a nadie. Con clave de Gemini mejora la latencia, pero no es obligatoria.
- **Verificación sin conectar** (`npm test`): sintaxis, carga de los 177 comandos, registro sin referencias rotas, alias válidos, partición del menú y esquema SQLite en carpeta temporal.
- **Mapa de dependencias** (`npm run graphify`): escáner de imports propio, sin dependencias externas, con visor interactivo.
- **Todo en SQLite**: chats, economía, gacha, moderación, VIP y sesión. Respaldar el bot es copiar dos carpetas.

## Características

### Gacha anime

- **Tiradas** con rarezas, valores y probabilidades reales.

  | Rareza | Base | Con garantía | Valor |
  |:---|---:|---:|---:|
  | Común | 62,60 % | 58,25 % | 15 |
  | Raro | 28,00 % | 26,23 % | 45 |
  | Épico | 8,00 % | 12,72 % | 150 |
  | Legendario | 1,25 % | 2,50 % | 600 |
  | Mítico | 0,15 % | 0,30 % | 2500 |

- **Dos garantías** al estilo gacha real: épico o mejor cada 10 tiradas sin uno, y legendario o mítico garantizado en la 90 sin ninguno, con subida gradual desde la 60. Los dos contadores se ven en `.gacha stats`.
- **Rareza por popularidad, serie e importancia**: el score (0-100) mezcla 55 % favoritos del personaje, 20 % popularidad de la serie y 25 % peso del personaje dentro de su reparto. Los dos primeros van en escala logarítmica (`20·log10`), porque los favoritos van de 50 a 40.000 y la popularidad de 1.000 a 900.000. Así un secundario de una serie enorme no nace mítico solo por su serie, y un protagonista de una serie de nicho pesa más que un extra de su mismo reparto.
- **Cortes medidos, no a ojo**: son los cuantiles del pool alcanzable de AniList (5.000 personajes): mítico ≥85, legendario ≥79, épico ≥71, raro ≥61. El reparto queda 1 / 3 / 9 / 27 / 59 % del pool: 47 míticos, 142 legendarios, 427 épicos, 1.281 raros y 2.845 comunes.
- **Roster y tasa de tirada son cosas distintas**: que el 1 % del pool sea mítico y el sorteo dé mítico el 0,15 % es lo normal en un gacha real (los 5★ de un gacha comercial andan en 0,6 % de tirada y son el 30-40 % del roster). Así una tirada alta nunca repite las mismas 11 caras.
- **Colección y harem** por usuario, con tabla de valor y favoritos.
- **Mercado**: vender, intercambiar, regalar y reclamar cartas.
- **Catálogo externo**: los personajes y series se resuelven contra AniList y las wikis de Fandom, con caché en `data/personajes/`.
- **Imagen de carta propia** por personaje (`.setcardimage`).
- **Retratos**: prefiere arte grande y descarta basura. La validación corre en `npm test`.

### Economía

- Monedas, XP y niveles con ranking por grupo y global.
- `daily`, `work`, `rob`, `pay`, `deposit`, `withdraw`, `crime`.
- **Casino**: slots, coinflip y apuestas. **Ruleta** y **póker** mueven la misma economía.
- Todo queda en `economia_log`, para auditar movimientos raros.

### Juegos

- **UNO** completo con reglas, turnos y validación de jugadas.
- **Póker Texas hold'em** con mesas, botes y apuestas.
- Ahorcado, ta-te-ti, adivinar el número, sopa de letras, verdad o reto.
- Las jugadas se entregan **por privado** cuando el juego lo pide (`lib/privado.js`), resolviendo el LID del jugador a número real.

### Grupos y moderación

- Ban, kick, promote, demote, mute, `hidetag`, encuestas, invitaciones.
- **Antilink** con whitelist y acción configurable (kick o aviso).
- **Antispam**, **antidelete** y **antipalabras**.
- **Advertencias** con límite configurable y acciones automáticas.
- **Bienvenidas y despedidas** configurables con imagen.
- **Modos por chat**: `/bot`, `/economia`, `/gacha`, `/onlyadmin`, `/autoread`, `/autoreact`, `/nsfw`. Cada uno se prende y apaga sin reiniciar.

### Descargas y multimedia

- **yt-dlp** para YouTube, TikTok, Instagram y Facebook. El binario se descarga solo la primera vez en `data/yt-dlp/`.
- **Scraper propio** para MediaFire y Google Drive, que yt-dlp no cubre.
- Pinterest, Pixiv, Spotify, igstory, cuevana, búsqueda de TikTok.
- Stickers estáticos y animados, stickers de vídeo, `toimg`, `tovideo`, audio, efectos, QR, remini.

### Internet y utilidades

- Búsqueda web, Wikipedia, clima, traducción, letras, IP, acortador, Pokedex.
- Lectura de URLs con preview (título, descripción, imagen).
- Calculadora, contador de mensajes, perfiles, cumpleaños, matrimonios, `ship`.

### Sub-bots

`/code` vincula un número como bot propio. Cada sub-bot abre su sesión en `data/subbots/<numero>/`, con su reconexión y su límite de mensajes de WhatsApp, y responde a los mismos comandos. Los sub-bots guardados vuelven solos al reiniciar. `/code list` los muestra y `/code del <numero>` borra uno.

## IA de Beerus

<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=900&size=24&pause=1000&color=FF4D6D&center=true&vCenter=true&width=700&lines=🤖+IA+DE+BEERUS;🐱+El+Dios+de+la+Destrucción+en+tu+grupo;⚡+Sin+clave+de+API+•+Memoria+por+chat" alt="IA" />

</div>

Personalidad de Beerus: soberbio, perezoso, fanático del pudín. Responde en el idioma del chat y en formato WhatsApp, con memoria por chat.

| Acción | Cómo |
|:---|:---|
| Conversar | `/ia ¿quién ganaría, Goku o Vegeta?` |
| Borrar memoria del chat | `/ia nueva` |
| Ver estado del proveedor | `/ia estado` |
| Guardar clave de Gemini (solo dueño) | `/ia clave <API_KEY>` |

Los tres proveedores gratuitos no piden cuenta ni clave. Gemini es opcional y solo mejora la latencia; sin clave el bot funciona igual.

## Juegos disponibles

| Juego | Descripción |
|:------|:------------|
| UNO | Juego completo por turnos, con reglas y validación |
| Póker | Texas hold'em con mesas y botes |
| Ahorcado | Adivina la palabra letra por letra |
| Ta-te-ti | Tres en línea |
| Adivinar | Adivina el número secreto |
| Sopa de letras | Encuentra las palabras escondidas |
| Ruleta | Gira y apuesta |
| Slots / Coinflip | Tragamonedas y cara o cruz |
| Verdad o reto | El clásico de grupo |

## Seguridad y sesión

- **No hay servidor central**: el bot corre en tu máquina o tu hosting y nada sale de ahí salvo las peticiones que cada comando necesita (descargas, clima, IA).
- **La sesión es tuya**: `auth_info/` guarda las llaves de WhatsApp en SQLite y está en `.gitignore`. Nunca se sube al repositorio.
- **Una instancia por sesión**: `lib/instancia.js` toma un bloqueo. Un segundo proceso con la misma sesión avisa en vez de corromper las llaves.
- **Escrituras atómicas**: una transacción por lote en lugar de 1400 archivos sueltos.
- **Actualizador apagado por defecto**: ejecuta `git merge` y `npm install` del remoto, así que viene desactivado. Se activa a mano en `config.js` o con `--update`.
- **Sin telemetría**: no hay analytics ni ping a servidores propios.

Usá un número dedicado para el bot. Un número limpio y con uso tranquilo es más estable que uno personal lleno de grupos.

## Instalación

Elegí tu plataforma y desplegá el acordeón.

<details open>
<summary><b>Windows</b></summary>

<br>

**Paso 1: instalar Node.js** desde https://nodejs.org/ (LTS, 22.13 o superior). Marcá "Add to PATH" durante la instalación.

```bash
node -v
npm -v
```

**Paso 2: instalar ffmpeg** (obligatorio para stickers de vídeo, `toimg` y audio):

```powershell
winget install Gyan.FFmpeg
```

o con Chocolatey:

```powershell
choco install ffmpeg -y
```

Comprobar que quedó en el `PATH` (cerrá y abrí la terminal):

```bash
ffmpeg -version
```

**Paso 3: clonar e instalar**

```bash
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD
npm install
```

**Paso 4: verificar** (no conecta a WhatsApp, no toca `data/`)

```bash
npm test
```

**Paso 5: arrancar**

```bash
npm start
```

**Errores comunes en Windows:**

<details>
<summary>Error al instalar <code>sharp</code></summary>

```bash
npm uninstall sharp
npm install sharp --os=win32 --cpu=x64
npm rebuild sharp
```

</details>

<details>
<summary><code>FFMPEG_ERROR</code> en stickers o <code>toimg</code></summary>

ffmpeg no está en el `PATH`. Instalalo, cerrá la terminal y abrí una nueva. Verificá con `ffmpeg -version` dentro de la misma terminal donde corrés el bot.

</details>

<details>
<summary>Error de permisos en npm (PowerShell)</summary>

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

</details>

<details>
<summary><code>node:sqlite</code> no existe</summary>

Node es anterior a 22.13. Actualizá Node: `node:sqlite` guarda la sesión y los datos, no hay respaldo para versiones viejas.

</details>

</details>

<details>
<summary><b>Android (Termux)</b></summary>

<br>

Instalá Termux desde F-Droid, no desde Play Store: https://f-droid.org/packages/com.termux/

```bash
pkg update && pkg upgrade -y
pkg install nodejs git ffmpeg -y
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD
npm install
npm test
npm start
```

**Para mantenimiento:**

```bash
cd Beerus-Bot-MD
git pull
npm install
npm start
```

Si `npm install` falla por conflicto de versiones, empezar limpio:

```bash
rm -rf node_modules package-lock.json
npm install
```

Termux suele traer Node actualizado. Verificá con `node -v` que sea 22.13 o superior antes de instalar las dependencias.

</details>

<details>
<summary><b>Linux / macOS</b></summary>

<br>

**Linux (Debian / Ubuntu):**

```bash
sudo apt update && sudo apt install nodejs npm ffmpeg git -y
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD
npm install
npm test
npm start
```

**macOS:**

```bash
brew install node ffmpeg git
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD
npm install
npm test
npm start
```

Comprobar la versión de Node:

```bash
node -v   # necesita 22.13 o superior
```

</details>

<details>
<summary><b>Hosting con panel (Pterodactyl o similar)</b></summary>

<br>

1. Crear el servidor con **Node.js 22** como runtime.
2. Subir el repositorio o clonarlo desde la consola: `git clone <repo> .`
3. Comando de arranque: `node iniciar.js` (o `npm start`).
4. Instalar dependencias una primera vez: `npm install`.
5. Abrir la consola: el bot pregunta QR o código de 8 dígitos.

En paneles la consola suele ser limitada. Para el código de emparejamiento cargá antes tu número en `config.js` (`NUMERO_VINCULACION`) y usá `node index.js --code`.

</details>

## Vincular WhatsApp

La primera vez no hay sesión, así que el bot pregunta cómo vincular:

```text
1. Código QR
2. Código de 8 dígitos
```

También se puede forzar al arrancar:

```bash
node index.js --qr      # QR en consola
node index.js --code    # código de emparejamiento
```

**QR**: WhatsApp → Dispositivos vinculados → Vincular un dispositivo → escanear.

**Código**: WhatsApp → Dispositivos vinculados → Vincular con número de teléfono → introducir el código de 8 caracteres que muestra la consola.

El número del bot se puede dejar fijo en `config.js`:

```js
export const NUMERO_VINCULACION = '5215512345678'  // código de país, solo dígitos
```

> [!WARNING]
> Una sola instancia por sesión. Si el bot ya está corriendo, un segundo proceso no puede usar `auth_info/`: el bloqueo de `lib/instancia.js` lo detecta y avisa.

## Configuración

Todo vive en `config.js`, sin tocar el resto del código.

| Clave | Por defecto | Qué hace |
|:---|:---|:---|
| `BOT_NAME` | `'Beerus Bot MD'` | Nombre en mensajes y menú |
| `PREFIXES` | `['.', '#', '/']` | Prefijos de comando |
| `AUTO_ACTUALIZAR` | `false` | Actualiza desde git al arrancar |
| `RAMA_ACTUALIZACION` | `''` | Rama a seguir; vacío = la actual |
| `NAVEGADOR_WA` | `'Firefox'` | Navegador en Dispositivos vinculados |
| `AUTH_DIR` | `'auth_info'` | Carpeta de la sesión |
| `METODO_VINCULACION` | `'preguntar'` | `preguntar`, `qr` o `codigo` |
| `NUMERO_VINCULACION` | `''` | Número para el código de emparejamiento |
| `MENCIONES_BOT` | `['beerus']` | Palabras que activan al bot |
| `RESPONDER_A_SI_MISMO` | `false` | Responde a sus propios mensajes |
| `AUTOREACT_PROBABILIDAD` | `0.2` | Probabilidad de reaccionar |
| `AUTOREACT_PAUSA_MS` | `20000` | Pausa mínima entre reacciones del mismo grupo |
| `LOG_LEVEL` | `'silent'` | Nivel de logs internos de Baileys |
| `CONTACTO` | — | Instagram y PayPal para `.dona` y `.info` |
| `IMAGEN_MENU_INTERNET` | `true` | Banners del menú desde internet |
| `BANNER_LOCAL` | `'assets/beerus-banner.png'` | Respaldo sin red y avatar |
| `GELBOORU_API_KEY` | — | Credencial del DAPI de Gelbooru |
| `GELBOORU_USER_ID` | — | `user_id` que acompaña a la key |
| `RULE34_API_KEY` | — | Credencial del DAPI de rule34.xxx (sin ella la fuente queda apagada) |
| `RULE34_USER_ID` | `2` | `user_id` que acompaña a la key de rule34.xxx |

**Banderas de arranque:**

```bash
node index.js --qr          # forzar QR
node index.js --code        # forzar código de emparejamiento
node iniciar.js --update    # actualizar antes de arrancar
node iniciar.js --no-update # arrancar sin actualizador
```

**Variables de entorno:**

| Variable | Efecto |
|:---|:---|
| `BEERUS_NO_UPDATE=1` | Igual que `--no-update` |
| `GELBOORU_API_KEY` | Sobrescribe la key de Gelbooru de `config.js` |
| `GELBOORU_USER_ID` | Sobrescribe el `user_id` de Gelbooru |
| `RULE34_API_KEY` | Sobrescribe la key de rule34.xxx de `config.js` |
| `RULE34_USER_ID` | Sobrescribe el `user_id` de rule34.xxx |

**Modos por chat** (`/modos` muestra el estado de todos):

```bash
/bot on|off            # el bot ignora todo menos /bot on
/economia on|off        # economía y casino no responden
/gacha on|off           # gacha y waifu no responden
/onlyadmin on|off       # solo responden administradores
/autoread on|off        # marca los mensajes como leídos
/antilink on|off        # castiga enlaces de otros grupos
/autoreact on|off       # reacciona con emoji al azar
/nsfw on|off            # contenido NSFW en este chat
```

## Requisitos del sistema

| Componente | Versión | Descripción |
|:-----------|:--------|:------------|
| Node.js | 22.13+ | Obligatorio: usa `node:sqlite` |
| NPM | 10+ | Viene con Node |
| FFmpeg | Última | Multimedia, stickers de vídeo y audio |
| Git | Opcional | Solo para el actualizador |

| Recurso | Sugerido |
|:-----------|:--------|
| RAM | 512 MB mínimo, 1 GB recomendado |
| Almacenamiento | 1.5 GB libres (dependencias, caché de cartas y banners) |
| Internet | Necesaria para descargas, gacha, banners e IA |

## Uso y ejecución

Prefijos aceptados: `.` `#` `/`

```bash
.ping
#menu
/menu gacha
```

El bot también responde cuando lo mencionan por su nombre (`beerus` por defecto), aunque el mensaje no lleve prefijo.

`/menu` manda el menú completo en un solo mensaje; `/menu <categoría>` manda solo esa categoría. Cada comando tiene un nombre corto y el nombre largo del archivo sigue funcionando: `.waifuinfo` y `.winfo` hacen lo mismo.

**En producción, con PM2:**

```bash
npm install -g pm2
pm2 start iniciar.js --name "BeerusBot"
pm2 logs BeerusBot
pm2 save
```

## Estructura del proyecto

```text
Beerus-Bot-MD/
├── commands/            177 comandos, un archivo por comando
├── lib/                 lógica compartida
│   ├── loader.js            carga perezosa de comandos
│   ├── arranque.js          caché de bytecode de V8
│   ├── auth-state.js        sesión de WhatsApp en SQLite
│   ├── grupo.js             metadata, admins, JIDs y LID
│   ├── sockets.js           registro de sockets vivos
│   ├── subbot.js            sub-bots de /code
│   ├── economia.js          monedas, XP y niveles
│   ├── poker.js / uno.js    motores de juego
│   ├── privado.js           entrega de jugadas por privado
│   ├── descargas.js         yt-dlp + scraper propio
│   ├── imagenes.js          gacha, retratos y caché
│   ├── ia.js / ia-proveedores.js  IA de Beerus
│   └── logger.js            logs legibles en consola
├── database/
│   └── db.js            esquema y consultas SQLite
├── scripts/             mantenimiento: cartas, banners, rarezas, graphify
├── assets/              arte local del bot
├── data/                base de datos, caché y yt-dlp (no se sube)
├── auth_info/           sesión de WhatsApp (no se sube)
├── index.js             conexión, enrutado y registro de comandos
├── iniciar.js           lanzador con actualizador opcional
├── config.js            toda la configuración
└── verify.mjs           verificación sin conectar (npm test)
```

**Contrato de un comando**: cualquier archivo nuevo en `commands/`:

```js
// commands/ejemplo.js  ->  se registra como /ejemplo
export default async ({ sock, jid, msg, args }) => {
  const texto = args.join(' ').trim() || 'sin argumentos'
  await sock.sendMessage(jid, { text: `Recibí: ${texto}` }, { quoted: msg })
}
```

El nombre del archivo es el nombre del comando. Los alias cortos viven en `lib/alias.js`, el registro en `index.js` y `lib/loader.js` solo resuelve la ruta y compila el archivo la primera vez que se invoca.

## Scripts

| Comando | Qué hace |
|:--------|:---------|
| `npm start` | Arranca con comprobación de actualización (`iniciar.js`) |
| `npm run dev` | Arranca con `--watch`, sin actualizador |
| `npm test` | Verificación completa sin conectar a WhatsApp |
| `npm run verify` | Igual que `npm test`, con el aviso de API experimental apagado |
| `npm run check` | Solo sintaxis de las entradas y de la capa de datos |
| `npm run cartas` | Refresca las cartas del gacha |
| `npm run banners` | Renueva los banners del menú |
| `npm run rarezas` | Sincroniza rarezas con el catálogo externo |
| `npm run graphify` | Genera el mapa de dependencias en `graphify-out/` |

**Qué valida `npm test`** (`verify.mjs`): sintaxis, carga de los 177 comandos, registro sin referencias rotas ni claves duplicadas, alias del menú que existan de verdad, categorías que solo listan comandos registrados, partición del menú en bloques que WhatsApp acepta (≤ 4096 caracteres), creación del esquema SQLite en carpeta temporal, club VIP, imagen de carta, interacciones con GIF, retratos del gacha y banners.

**Mapa de dependencias** (`npm run graphify`), con escáner de imports propio y sin dependencias externas:

```text
graphify-out/
├── index.html   visor interactivo: nodos, aristas, búsqueda, filtros por capa
├── GRAPH.md     índice textual: hubs, huérfanos, ciclos, listado por carpeta
└── graph.json   nodos y aristas para consultas
```

Consulta puntual sin releer el código:

```bash
node scripts/graphify.mjs query gacha
```

## Comandos

Resumen por categoría. El listado real y actualizado sale siempre de `/menu`.

| Categoría | Nº | Ejemplos |
|:---|:--:|:---|
| Generales | 9 | `ping` `menu` `help` `dado` `stickers` `stats` |
| Administración de grupos | 58 | `group` `bot` `ban` `kick` `promote` `hidetag` `antilink` `welcome` `modos` |
| Multimedia | 9 | `sticker` `stickervideo` `stickeraudio` `video` `audio` `qr` `efecto` `toimg` `tovideo` |
| Economía y casino | 18 | `daily` `work` `economy` `casino` `rob` `deposit` `withdraw` `leaderboard` `crime` |
| RPG | 12 | `rpg` `hunt` `mine` `fish` `adventure` `dungeon` `heal` `shop` `inventory` |
| Gacha anime | 26 | `gacha` `c` `collection` `gachaboard` `claim` `give` `sell` `trade` |
| VIP | 5 | `vip` `vipmenu` `vipbadge` `vipboost` `gachaclaim` |
| Juegos | 8 | `uno` `poker` `ahorcado` `tateti` `adivinar` `sopa` `truthordare` |
| Utilidades | 13 | `calcular` `toimg` `tovideo` `pfp` `topcount` `dalle` `remini` `inspect` `traducir` |
| Internet | 12 | `buscar` `wiki` `clima` `letra` `ip` `acortar` `leerurl` `pokedex` |
| Descargas | 19 | `descargar` `youtube` `tiktok` `instagram` `mediafire` `pixiv` `spotifysearch` |
| Entretenimiento | 10 | `truthordare` `ship` `compliment` `joke` `8ball` `curiosidad` |
| Personales | 3 | `notes` `afk` `history` |
| Perfiles | 21 | `profile` `level` `marry` `divorce` `birthdays` `setbirth` |
| Socket y configuración | 16 | `socket` `bots` `code` `prefix` `self` `join` `logout` `setbotname` |
| IA | 3 | `ia` `chatgpt` `gemini` |
| Interacciones | 31 | `kiss` `hug` `slap` `pat` `dance` `cuddle` |
| NSFW (off por defecto) | 38 | `/nsfw on` para habilitar. `/r34` junta 3 boorus, 2 páginas cada uno, y no repite lo ya enviado |

## Sistema de actualización

El actualizador usa git y corre antes de cargar el bot, así que `index.js` arranca ya con el código nuevo:

1. `git fetch` del repositorio remoto.
2. `git pull --ff-only` si hay commits nuevos.
3. `npm install` si cambió `package.json` o `package-lock.json`.
4. Arranca el bot.

Nunca pisa trabajo local: si hay cambios sin guardar en archivos versionados, o si la rama local divergió, se queda quieto y avisa.

> [!WARNING]
> El actualizador ejecuta código del repositorio remoto sin que lo revises, por eso viene apagado (`AUTO_ACTUALIZAR = false`). Activalo solo si controlás el remoto.

**Actualizar a mano:**

```bash
git pull
npm install    # solo si cambió package.json
npm start
```

## Problemas comunes

<details>
<summary><code>FFMPEG_ERROR</code> o stickers que fallan</summary>

<br>

ffmpeg no está en el `PATH`. Comprobar:

```bash
ffmpeg -version
```

Después de instalarlo hay que cerrar y abrir la terminal (o reiniciar el panel) para que el `PATH` nuevo se aplique al proceso del bot.

</details>

<details>
<summary><code>node:sqlite</code> no existe</summary>

<br>

Node es anterior a 22.13. Actualizar:

```bash
node -v
```

`node:sqlite` es el motor de la sesión y de la base de datos; no hay alternativa para versiones viejas.

</details>

<details>
<summary>El bot avisa que la sesión está en uso</summary>

<br>

Hay otra instancia corriendo con el mismo `auth_info/`. Cerrar la otra antes de arrancar esta. En paneles, revisar que no haya un proceso duplicado.

</details>

<details>
<summary>Se cerró la sesión de WhatsApp</summary>

<br>

```bash
rm -rf auth_info
npm start
```

Y vincular de nuevo.

</details>

<details>
<summary>Las descargas de YouTube fallan</summary>

<br>

yt-dlp se queda viejo rápido. Borrar el binario para que se descargue la versión nueva:

```bash
rm -rf data/yt-dlp
npm start
```

</details>

<details>
<summary>El menú sale sin imagen</summary>

<br>

Sin internet usa `assets/beerus-banner.png`. Si tampoco aparece, revisar que `BANNER_LOCAL` apunte a un archivo existente y que `assets/` no se haya borrado.

</details>

<details>
<summary>Un comando no carga</summary>

<br>

La consola dice cuál y por qué al arrancar. Para el listado completo sin arrancar el bot:

```bash
npm test
```

</details>

<details>
<summary><code>npm install</code> falla por conflicto de versiones</summary>

<br>

```bash
rm -rf node_modules package-lock.json
npm install
```

</details>

## Contribuir

1. Fork del repositorio.
2. Rama nueva: `git checkout -b feat/mi-comando`.
3. Un comando por archivo en `commands/`, exportando `async (ctx) => {}`.
4. `npm test` en verde antes de abrir el PR.
5. PR con qué hace y cómo probarlo.

Convención de commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## Creador

**Beerus_zv**. Desarrollo, mantenimiento y arte del bot.

[GitHub](https://github.com/Beerus-zv) · [Instagram](https://instagram.com/andresm_zv)

## Apoyar el proyecto

Si el bot te sirve, el proyecto se mantiene con donaciones: [PayPal](https://paypal.me/altozv).

- Dejar una estrella en el repositorio.
- Reportar bugs con el log de la consola.
- Mandar un PR con un comando nuevo.

## Licencia

MIT: usá, modificá y compartí. Ver [package.json](package.json).
