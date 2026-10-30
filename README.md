# Beerus Bot MD

<p align="center">
  <img src="assets/beerus-banner.png" alt="Beerus Bot MD" width="600">
</p>

Bot de WhatsApp multi-dispositivo escrito en Node.js sobre
[Baileys](https://github.com/WhiskeySockets/Baileys). Sin navegador, sin Puppeteer,
sin `whatsapp-web.js`: habla el protocolo directamente y guarda todo en SQLite.

---

## Contenido

- [Qué trae](#qué-trae)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Vincular WhatsApp](#vincular-whatsapp)
- [Uso](#uso)
- [Comandos](#comandos)
- [Configuración](#configuración)
- [Scripts](#scripts)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Datos y almacenamiento](#datos-y-almacenamiento)
- [Problemas comunes](#problemas-comunes)
- [Licencia](#licencia)

---

## Qué trae

| Área | Qué incluye |
| --- | --- |
| Administración de grupos | Ban, kick, promote, demote, mute, antilink, antispam, antidelete, advertencias, bienvenidas, horarios, `hidetag`, encuestas, creación y configuración de grupos |
| Economía y casino | Monedas, diario, trabajo, robo, depósito, retiro, ranking, casino (slots, coinflip, apuestas), ruleta |
| Gacha anime | Tiradas, rarezas, colección, harem, intercambios, venta, mercado, tabla de valor, catálogo alimentado desde AniList y Fandom |
| Juegos | UNO completo, póker (Texas hold'em), ahorcado, ta-te-ti, adivinar el número, sopa de letras, verdad o reto |
| Multimedia | Stickers estáticos y animados, stickers de vídeo, `toimg`, audio, efectos, retratos, remini, QR |
| Descargas | yt-dlp para YouTube/TikTok/Instagram/Facebook, scraper propio para MediaFire y Google Drive, Pinterest, Pixiv, Spotify, cuevana |
| Internet | Búsqueda web, Wikipedia, clima, traducción, letras, IP, acortador, Pokedex, lectura de URLs, previews |
| IA | Chat con personalidad propia y proveedores externos (Gemini, ChatGPT, DALLE) |
| Perfiles y social | Perfil, nivel, XP, cumpleaños, matrimonios, ship, interacciones (kiss, hug, slap, pat...) |
| VIP | Club con acceso por usuario, badges y boosts |
| NSFW | Apagado por defecto, se habilita por chat con `/nsfw on` |

Extras de infraestructura:

- **Sesión en SQLite** (`lib/auth-state.js`): una sola base en vez de ~1400 archivos de llaves.
- **Carga paralela de comandos** (`lib/loader.js`): un archivo roto no tumba el bot.
- **Anti-delete, autoread y autoreact** configurables por chat.
- **Logs legibles** en consola con tipos `MSG · CMD · OUT · SEC · SYS · WARN · ERR`.
- **Menú con banners rotativos** descargados de internet y respaldo local.
- **Verificación sin conectar** a WhatsApp (`npm test`).
- **Mapa de dependencias** del repositorio (`npm run graphify`).

---

## Requisitos

| Requisito | Detalle |
| --- | --- |
| Node.js | **22.13 o superior**. Usa `node:sqlite`, que no existe en versiones anteriores |
| npm | Incluido con Node |
| ffmpeg | **Debe estar en el `PATH`**. Lo usan stickers de vídeo, `toimg`, audio e interacciones |
| git | Opcional. Solo lo necesita el actualizador automático |
| Internet | Para descargas, banners, gacha y proveedores de IA |

Instalar ffmpeg:

```bash
# Windows (winget)
winget install Gyan.FFmpeg

# Windows (chocolatey)
choco install ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

Comprobar que quedó accesible:

```bash
ffmpeg -version
node -v
```

---

## Instalación

```bash
# 1. Clonar
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD

# 2. Dependencias
npm install

# 3. Verificar que todo carga (no conecta con WhatsApp)
npm test

# 4. Arrancar
npm start
```

`npm start` ejecuta `iniciar.js`, que revisa si hay actualización, la aplica y
luego carga `index.js`. El actualizador viene **desactivado** por defecto porque
hace `git merge` y `npm install` sin revisar el código remoto; se activa en
`config.js` o con `--update`.

Para desarrollo, sin actualizador:

```bash
npm run dev
```

---

## Vincular WhatsApp

La primera vez no existe sesión, así que el bot pregunta cómo vincular:

```
preguntar -> QR o código de emparejamiento
qr        -> siempre QR
codigo    -> código de 8 caracteres
```

También se puede forzar al arrancar:

```bash
node index.js --qr      # QR en consola
node index.js --code    # código de emparejamiento
```

Para el código de emparejamiento hace falta el número del bot con código de país
y solo dígitos. Se puede dejar fijo en `config.js`:

```js
export const NUMERO_VINCULACION = '5215512345678'
```

**QR** — WhatsApp → Dispositivos vinculados → Vincular un dispositivo → escanear.

**Código** — WhatsApp → Dispositivos vinculados → Vincular con número de teléfono
→ introducir el código de 8 caracteres que muestra la consola.

La sesión queda en `auth_info/` como base SQLite. Borrar esa carpeta obliga a
vincular de nuevo.

> Una sola instancia por sesión. Si el bot ya está corriendo, un segundo proceso
> no puede usar la misma sesión: `lib/instancia.js` toma un bloqueo y avisa.

---

## Uso

Prefijos aceptados: `.` `#` `/`

```
.ping
#menu
/menu gacha
```

El bot también responde cuando lo mencionan por nombre (`beerus` por defecto),
aunque el mensaje no empiece por prefijo.

`/menu` manda el menú completo en un solo mensaje; `/menu <categoría>` manda solo
esa categoría. Cada comando tiene además un nombre corto, y el nombre largo del
archivo sigue funcionando: `.waifuinfo` y `.winfo` hacen lo mismo.

---

## Comandos

Resumen por categoría. El listado real y actualizado sale siempre de `/menu`.

| Categoría | Comandos | Ejemplos |
| --- | --- | --- |
| 🛠️ Generales | 8 | `ping` `menu` `help` `dado` `stickers` `stats` |
| 👑 Administración de grupos | 49 | `group` `bot` `ban` `kick` `promote` `hidetag` `antilink` `advertencia` `welcome` `modos` |
| 🎨 Multimedia | 8 | `sticker` `stickervideo` `video` `audio` `qr` `efecto` `toimg` |
| 💰 Economía y casino | 12 | `daily` `work` `economy` `casino` `rob` `deposit` `withdraw` `leaderboard` `roulette` `crime` |
| 🎰 Gacha anime | 26 | `gacha` `c` `collection` `gachaboard` `claim` `give` `sell` `trade` `setcardimage` |
| 👑 VIP de Beerus | 5 | `vip` `vipmenu` `vipbadge` `vipboost` `gachaclaim` |
| 🃏 Juegos | 8 | `uno` `poker` `ahorcado` `tateti` `adivinar` `sopa` `truthordare` |
| 🧰 Utilidades | 9 | `calcular` `topcount` `pfp` `dalle` `remini` `inspect` `traducir` |
| 🌐 Internet | 12 | `buscar` `wiki` `clima` `traducir` `letra` `ip` `acortar` `leerurl` `pokedex` |
| 📥 Descargas | 15 | `descargar` `youtube` `tiktok` `instagram` `mediafire` `pixiv` `spotifysearch` `igstory` `cuevana` |
| 🎭 Entretenimiento | 10 | `truthordare` `ship` `compliment` `joke` `8ball` `curiosidad` `advice` |
| ⭐ Personales | 3 | `notes` `afk` `history` |
| 📖 Perfiles | 20 | `profile` `level` `marry` `divorce` `birthdays` `setbirth` `setdesc` |
| 🤖 IA de Beerus | 3 | `ia` `chatgpt` `gemini` |
| 💞 Interacciones | 31 | `kiss` `hug` `slap` `pat` `dance` `cuddle` |
| 🔞 NSFW *(off por defecto)* | 33 | `nsfw on` para habilitar |

Modos por chat (`/modos` muestra el estado de todos):

```
/bot on|off            el bot ignora todo menos /bot on
/economia on|off       economía y casino no responden
/gacha on|off          gacha y waifu no responden
/onlyadmin on|off      solo responden administradores
/autoread on|off       marca los mensajes como leídos
/antilink on|off       castiga enlaces de otros grupos
/autoreact on|off      reacciona con emoji al azar
/nsfw on|off           contenido NSFW en este chat
```

---

## Configuración

Todo vive en `config.js`, sin tocar el resto del código.

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `BOT_NAME` | `'Beerus Bot MD'` | Nombre en mensajes y menú |
| `PREFIXES` | `['.', '#', '/']` | Prefijos de comando |
| `AUTO_ACTUALIZAR` | `false` | Actualiza desde git al arrancar |
| `RAMA_ACTUALIZACION` | `''` | Rama a seguir; vacío = la actual |
| `NAVEGADOR_WA` | `'Firefox'` | Navegador que aparece en Dispositivos vinculados |
| `AUTH_DIR` | `'auth_info'` | Carpeta de la sesión |
| `METODO_VINCULACION` | `'preguntar'` | `preguntar` \| `qr` \| `codigo` |
| `NUMERO_VINCULACION` | `''` | Número para el código de emparejamiento |
| `MENCIONES_BOT` | `['beerus']` | Palabras que activan al bot |
| `RESPONDER_A_SI_MISMO` | `false` | Responde a sus propios mensajes |
| `AUTOREACT_PROBABILIDAD` | `0.2` | Probabilidad de reaccionar a cada mensaje |
| `AUTOREACT_PAUSA_MS` | `20000` | Pausa mínima entre reacciones del mismo grupo |
| `LOG_LEVEL` | `'silent'` | Nivel de logs internos de Baileys |
| `CONTACTO` | — | Instagram y PayPal para `.dona` y `.info` |
| `IMAGEN_MENU_INTERNET` | `true` | Banners del menú desde internet |
| `BANNER_LOCAL` | `'assets/beerus-banner.png'` | Respaldo sin red y avatar |

Variables de entorno:

| Variable | Efecto |
| --- | --- |
| `BEERUS_NO_UPDATE=1` | Igual que `--no-update`: arranca sin actualizador |

Banderas de arranque: `--qr`, `--code`, `--update`, `--no-update`.

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Arranca con comprobación de actualización (`iniciar.js`) |
| `npm run dev` | Arranca con `--watch`, sin actualizador |
| `npm test` | Verificación completa sin conectar a WhatsApp |
| `npm run check` | Solo sintaxis de las entradas y de la capa de datos |
| `npm run cartas` | Refresca las cartas del gacha |
| `npm run banners` | Renueva los banners del menú |
| `npm run rarezas` | Sincroniza rarezas con el catálogo externo |
| `npm run graphify` | Genera el mapa de dependencias en `graphify-out/` |

`npm test` (`verify.mjs`) comprueba: sintaxis, carga de los 155 comandos,
registro sin referencias rotas ni claves duplicadas, alias válidos, categorías
del menú, partición del menú en bloques que WhatsApp acepta, creación del
esquema SQLite en una carpeta temporal, club VIP, imagen de carta, interacciones
con GIF, retratos del gacha y banners.

`npm run graphify` escribe tres archivos en `graphify-out/`:

```
index.html   visor interactivo (canvas, sin CDN): nodos, aristas, búsqueda, capas
GRAPH.md     índice textual: hubs, huérfanos, ciclos, listado por carpeta
graph.json   nodos y aristas para consultas
```

Consulta puntual sin releer el código:

```bash
node scripts/graphify.mjs query gacha
```

---

## Estructura del proyecto

```
Beerus-Bot-MD/
├── index.js               conexión, enrutado de mensajes y registro de comandos
├── iniciar.js             lanzador con actualizador opcional
├── config.js              toda la configuración
├── verify.mjs             verificación sin conectar (npm test)
├── commands/              un archivo por comando; exporta async (ctx) => {}
├── lib/                   lógica compartida (grupos, descargas, imágenes, IA, juegos)
├── database/db.js         esquema y consultas SQLite
├── scripts/               mantenimiento: cartas, banners, rarezas, graphify
├── assets/                arte local del bot
├── data/                  base de datos, catálogo y binario de yt-dlp (ignorado por git)
└── auth_info/             sesión de WhatsApp (ignorada por git)
```

Contrato de un comando — `commands/ping.js`:

```js
export default async ({ sock, jid, msg, args }) => {
  await sock.sendMessage(jid, { text: 'pong' }, { quoted: msg })
}
```

El nombre del archivo es el nombre del comando. Los alias cortos viven en
`lib/alias.js` y el registro en `index.js`; `lib/loader.js` solo carga y valida.

---

## Datos y almacenamiento

| Ruta | Contenido | En git |
| --- | --- | --- |
| `data/beerus.db` | SQLite: chats, usuarios, economía, gacha, moderación, VIP | No |
| `data/personajes/` | Imágenes de cartas en caché | No |
| `data/banners/` | Banners del menú en caché | No |
| `data/fandom-wikis.json` | Índice de wikis para los retratos | No |
| `data/yt-dlp/` | Binario de yt-dlp, se descarga solo la primera vez | No |
| `data/tmp/` | Temporales de descarga | No |
| `auth_info/` | Sesión de WhatsApp | No |
| `logs/` | Logs de ejecución | No |

Respaldar el bot es copiar `data/` y `auth_info/`. Sin `auth_info/` hay que
vincular el número otra vez; sin `data/` se pierde la economía y el gacha.

---

## Problemas comunes

**`FFMPEG_ERROR` o stickers que fallan** — ffmpeg no está en el `PATH`.
Comprobar con `ffmpeg -version` y reiniciar la terminal después de instalarlo.

**`node:sqlite` no existe** — Node es anterior a 22.13. Actualizar Node.

**El bot no conecta y avisa de sesión en uso** — hay otra instancia corriendo con
la misma sesión. Cerrarla antes de arrancar otra.

**Se cerró la sesión de WhatsApp** — borrar `auth_info/` y volver a vincular.

**Descargas fallan en YouTube** — yt-dlp se queda viejo rápido. Borrar
`data/yt-dlp/` y reiniciar para que baje la versión nueva.

**El menú sale sin imagen** — sin internet usa `assets/beerus-banner.png`;
si tampoco aparece, revisar que `BANNER_LOCAL` apunte al archivo existente.

**Un comando no carga** — la consola dice cuál y por qué al arrancar. `npm test`
lo lista completo sin arrancar el bot.

---

## Licencia

MIT. Ver [package.json](package.json).

Autor: **Beerus_zv**
