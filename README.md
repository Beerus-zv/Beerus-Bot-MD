<div align="center">

<img src="assets/beerus-banner.png" alt="Beerus Bot MD" width="100%" style="border-radius:30px;"/>

<br>

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=900&size=22&pause=800&color=FF4D6D&center=true&vCenter=true&width=780&lines=🐱+Bot+de+WhatsApp+multi-dispositivo+con+Baileys;⚡+155+comandos+•+Gacha+anime+•+Poker+•+UNO;🤖+IA+de+Beerus+sin+clave+de+API;🛡️+Moderación+•+Economía+•+Descargas" alt="Typing SVG" />

<br>

<p>
  <img src="https://img.shields.io/badge/🐱%20Versión-2.5.0-FF4D6D?style=for-the-badge&logo=github&logoColor=black&labelColor=0d0d0d" alt="Version"/>
  <img src="https://img.shields.io/badge/⚡%20Node.js-22.13%2B-10B981?style=for-the-badge&logo=nodedotjs&logoColor=white&labelColor=065F46" alt="Node"/>
  <img src="https://img.shields.io/badge/📜%20Licencia-MIT-8B5CF6?style=for-the-badge&logo=opensourceinitiative&logoColor=white&labelColor=5B21B6" alt="License"/>
</p>

<p>
  <img src="https://img.shields.io/badge/💬%20Baileys-7.0%20RC-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=128C7E" alt="Baileys"/>
  <img src="https://img.shields.io/badge/🗄️%20Base%20de%20datos-SQLite-F7B731?style=for-the-badge&logo=sqlite&logoColor=white&labelColor=8a5c00" alt="SQLite"/>
  <img src="https://img.shields.io/badge/🎮%20Comandos-155-FF6B9D?style=for-the-badge&logo=electron&logoColor=white&labelColor=3d0a20" alt="Comandos"/>
</p>

<p>
  <img src="https://img.shields.io/github/stars/Beerus-zv/Beerus-Bot-MD?style=social" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/Beerus-zv/Beerus-Bot-MD?style=social" alt="Forks"/>
  <img src="https://komarev.com/ghpvc/?username=Beerus-zv&label=Visitas&color=FF4D6D&style=for-the-badge" alt="Views"/>
</p>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

</div>

---

<div align="center">

## 📋 En Resumen

</div>

**Beerus Bot MD** es un bot de WhatsApp **multi-dispositivo, open source (MIT)** y sin
Puppeteer ni `whatsapp-web.js`: habla el protocolo directamente con **Baileys** y guarda
todo en **SQLite**. Trae gacha anime, póker, UNO, economía, moderación de grupos,
descargas y una IA con la personalidad de Beerus que funciona **sin clave de API**.

| | 💎 Detalle |
|:---|:---|
| 🐱 **Qué es** | Bot de WhatsApp con **155 comandos** organizados en 16 categorías (más de 250 nombres contando alias) |
| 🤖 **IA propia** | Personalidad de Beerus con memoria por chat · proveedores gratuitos en cascada · Gemini opcional |
| 🎰 **Gacha** | Tiradas, rarezas, colección, mercado, intercambios y catálogo alimentado desde AniList y Fandom |
| 🃏 **Juegos** | UNO completo, póker (Texas hold'em), ahorcado, ta-te-ti, adivinar, sopa de letras, verdad o reto |
| 🛡️ **Moderación** | Antilink, antispam, antidelete, advertencias, bienvenidas, horarios, `hidetag` |
| 📥 **Contenido** | YouTube, TikTok, Instagram, Facebook, MediaFire, Google Drive, Pinterest, Pixiv, Spotify |
| ⚙️ **Stack** | Node.js 22.13+ (ESM) · Baileys · `node:sqlite` · sharp · ffmpeg |
| 🔐 **Sesión** | Guardada en SQLite: un archivo en vez de ~1400 sueltos |
| 👨‍💻 **Autor** | Beerus_zv · mantenido activamente |
| 📦 **Repositorio** | [github.com/Beerus-zv/Beerus-Bot-MD](https://github.com/Beerus-zv/Beerus-Bot-MD) · Licencia **MIT** |

<div align="center">

### ✨ Lo que lo hace destacar

</div>

- **Sesión en SQLite** (`lib/auth-state.js`): escrituras atómicas. Si el proceso muere a
  mitad de un lote, la llave entra entera o no entra — el esquema de 1400 archivos no
  garantiza eso.
- **Carga perezosa de comandos** (`lib/loader.js`): al arrancar solo se leen los
  nombres de archivo; cada comando se compila la primera vez que alguien lo usa. El
  arranque no toca 210 archivos, y `npm test` sí los carga todos para validarlos.
- **Arranque con caché de bytecode** (`lib/arranque.js`): V8 guarda el módulo compilado
  en `data/v8-cache/`, así el segundo arranque no vuelve a compilar lo mismo.
- **IA sin clave de API**: tres proveedores gratuitos en cascada y un proveedor que falla
  se aparta un rato para no hacer esperar a nadie. Con clave de Gemini mejora, pero no es
  obligatoria.
- **Verificación sin conectar** (`npm test`): sintaxis, carga de los 155 comandos, registro
  sin referencias rotas, alias válidos, partición del menú y esquema SQLite en carpeta
  temporal. Se corre antes de tocar producción.
- **Mapa de dependencias** (`npm run graphify`): escáner de imports propio, sin
  dependencias externas, con visor interactivo.
- **Todo en SQLite**: chats, economía, gacha, moderación, VIP y sesión. Respaldar el bot es
  copiar dos carpetas.

---

<div align="center">

<details open>
<summary><b>🗺️ Tabla de Contenidos — clic para expandir</b></summary>

<br>

| 🔗 Sección | 🔗 Sección | 🔗 Sección |
|:---:|:---:|:---:|
| [📋 En Resumen](#-en-resumen) | [✨ ¿Qué es Beerus Bot?](#-qué-es-beerus-bot-md) | [🌟 Características](#-características) |
| [🤖 IA de Beerus](#-ia-de-beerus) | [🎰 Gacha Anime](#-gacha-anime) | [🎮 Juegos](#-juegos-disponibles) |
| [🛡️ Grupos y Moderación](#-grupos-y-moderación) | [📥 Descargas y Multimedia](#-descargas-y-multimedia) | [🔐 Seguridad y Sesión](#-seguridad-y-sesión) |
| [🚀 Instalación](#-instalación) | [⚙️ Configuración](#-configuración) | [🧩 Comandos](#-comandos) |
| [🔧 Requisitos](#-requisitos-del-sistema) | [📁 Estructura](#-estructura-del-proyecto) | [🛠️ Scripts](#-scripts) |
| [⚡ Actualización](#-sistema-de-actualización) | [❓ Problemas](#-problemas-comunes) | [❤️ Apoyar](#-apoyar-el-proyecto) |

</details>

</div>

---

<div align="center">

## ✨ ¿Qué es Beerus Bot MD?

<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=700&size=18&pause=1000&color=FF4D6D&center=true&vCenter=true&width=700&lines=Bot+multi-dispositivo+sobre+Baileys;Sin+navegador+•+Sin+Puppeteer+•+Solo+el+protocolo;155+comandos+•+16+categorías+•+SQLite" alt="Que es" />

</div>

Beerus Bot MD se conecta a WhatsApp como un **dispositivo vinculado más**, usando
`@whiskeysockets/baileys` y nada de automatización de navegador. Eso significa que no
levanta un Chromium, no gasta 800 MB de RAM en navegador y no se rompe cuando WhatsApp
cambia el DOM.

Por dentro es simple: un enrutador de mensajes, un registro de comandos y una capa de
datos. Cada comando es un archivo en `commands/` que exporta una función.

```js
const BeerusBot = {
  version:     "2.5.0",
  tecnologia:  "Baileys + node:sqlite + sharp + ffmpeg",
  comandos:    155,
  categorias:  16,
  prefijos:    [".", "#", "/"],
  archivos:    210,
  caracteristicas: [
    "🎰 Gacha anime con catálogo desde AniList y Fandom",
    "🃏 UNO completo y póker Texas hold'em por grupos",
    "💰 Economía con casino, robos, depósitos y ranking",
    "🛡️ Moderación: antilink, antispam, antidelete, advertencias",
    "📥 Descargas con yt-dlp + scraper propio",
    "🤖 IA de Beerus sin clave de API",
    "🗄️ Sesión y datos en SQLite",
    "🧩 Verificación y mapa de dependencias incluidos",
  ],
};
```

<div align="center">

<table>
<tr>
<td align="center" width="22%">
  <img src="https://img.shields.io/badge/🎰-GACHA-FF4D6D?style=flat-square&labelColor=0d0d0d" width="100%"/>
  <br><sub><b>Cartas y colección</b></sub>
</td>
<td align="center" width="22%">
  <img src="https://img.shields.io/badge/🎮-JUEGOS-8B5CF6?style=flat-square&labelColor=3b1d8a" width="100%"/>
  <br><sub><b>UNO · Póker · Trivia</b></sub>
</td>
<td align="center" width="22%">
  <img src="https://img.shields.io/badge/🛡️-MODERACIÓN-EC4899?style=flat-square&labelColor=9F1239" width="100%"/>
  <br><sub><b>Control de grupos</b></sub>
</td>
<td align="center" width="22%">
  <img src="https://img.shields.io/badge/🤖-IA-10B981?style=flat-square&labelColor=065F46" width="100%"/>
  <br><sub><b>Beerus conversacional</b></sub>
</td>
</tr>
</table>

</div>

---

<div align="center">

## 🌟 Características

</div>

### 🎰 Gacha Anime

- **Tiradas** con rarezas, valores y probabilidades reales.
- **Colección y harem** por usuario, con tabla de valor y favoritos.
- **Mercado**: vender, intercambiar, regalar y reclamar cartas.
- **Catálogo externo**: los personajes y series se resuelven contra **AniList** y las
  wikis de **Fandom**, con caché en `data/personajes/`.
- **Imagen de carta propia** por personaje (`.setcardimage`).
- **Retratos**: prefiere arte grande y descarta basura (validado en `npm test`).

### 💰 Economía

- Monedas, XP y niveles con ranking por grupo y global.
- `daily`, `work`, `rob`, `pay`, `deposit`, `withdraw`, `crime`.
- **Casino**: slots, coinflip y apuestas. **Ruleta** y **póker** mueven la misma economía.
- Todo con historial (`economia_log`) para auditar movimientos raros.

### 🃏 Juegos

- **UNO** completo con reglas, turnos y validación de jugadas.
- **Póker Texas hold'em** con mesas, botes y apuestas.
- Ahorcado, ta-te-ti, adivinar el número, sopa de letras, verdad o reto.
- Las jugadas se entregan **por privado** cuando el juego lo pide (`lib/privado.js`),
  resolviendo el LID del jugador a número real.

### 🛡️ Grupos y Moderación

- Ban, kick, promote, demote, mute, `hidetag`, encuestas, invitaciones.
- **Antilink** con whitelist y acción configurable (kick o aviso).
- **Antispam**, **antidelete** y **antipalabras**.
- **Advertencias** con límite configurable y acciones automáticas.
- **Bienvenidas y despedidas** configurables con imagen.
- **Modos por chat**: `/bot`, `/economia`, `/gacha`, `/onlyadmin`, `/autoread`,
  `/autoreact`, `/nsfw` — cada uno se prende y apaga sin reiniciar.

### 📥 Descargas y Multimedia

- **yt-dlp** para YouTube, TikTok, Instagram y Facebook. El binario se descarga solo la
  primera vez en `data/yt-dlp/`.
- **Scraper propio** para MediaFire y Google Drive, que yt-dlp no cubre.
- Pinterest, Pixiv, Spotify, igstory, cuevana, búsqueda de TikTok.
- Stickers estáticos y animados, stickers de vídeo, `toimg`, audio, efectos, QR, remini.

### 🌐 Internet y Utilidades

- Búsqueda web, Wikipedia, clima, traducción, letras, IP, acortador, Pokedex.
- Lectura de URLs con preview (título, descripción, imagen).
- Calculadora, contador de mensajes, perfiles, cumpleaños, matrimonios, `ship`.

---

<div align="center">

## 🤖 IA de Beerus

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=900&size=24&pause=1000&color=FF4D6D&center=true&vCenter=true&width=700&lines=🤖+IA+DE+BEERUS;🐱+El+Dios+de+la+Destrucción+en+tu+grupo;⚡+Sin+clave+de+API+•+Memoria+por+chat" alt="IA" />

<br>

![No Key](https://img.shields.io/badge/🔑-SIN_CLAVE_DE_API-00E0A4?style=for-the-badge&labelColor=0d0d0d)
![Cascada](https://img.shields.io/badge/🔁-3_PROVEEDORES_EN_CASCADA-8B5CF6?style=for-the-badge&labelColor=3b1d8a)
![Memoria](https://img.shields.io/badge/🧠-MEMORIA_POR_CHAT-FF6B9D?style=for-the-badge&labelColor=3d0a20)
![Gemini](https://img.shields.io/badge/✨-GEMINI_OPCIONAL-4CC9F0?style=for-the-badge&labelColor=0b3a4a)

</div>

```js
const IA = {
  activacion:   "/ia <texto>  ·  o mencionar al bot",
  personalidad: "Beerus — soberbio, perezoso, fanático del pudín",
  memoria:      "contexto por chat, se borra con /ia nueva",
  proveedores:  ["ch.at (GPT-4o)", "llm7.io", "Pollinations"],
  extra:        "Gemini AI Studio si el dueño guarda su clave",
  responde:     "en el idioma del chat, en formato WhatsApp",
};
```

| Acción | Cómo |
|:---|:---|
| Conversar | `/ia ¿quién ganaría, Goku o Vegeta?` |
| Borrar memoria del chat | `/ia nueva` |
| Ver estado del proveedor | `/ia estado` |
| Guardar clave de Gemini (solo dueño) | `/ia clave <API_KEY>` |

> [!NOTE]
> Los tres proveedores gratuitos no piden cuenta ni clave. Gemini es opcional y solo
> mejora la latencia; sin clave el bot funciona igual.

---

<div align="center">

## 🎮 Juegos Disponibles

</div>

| Juego | Descripción |
|:------|:------------|
| ![UNO](https://img.shields.io/badge/🃏-UNO-FF4D6D?style=for-the-badge) | Juego completo por turnos, con reglas y validación |
| ![Poker](https://img.shields.io/badge/♠️-Póker-10B981?style=for-the-badge) | Texas hold'em con mesas y botes |
| ![Ahorcado](https://img.shields.io/badge/🔤-Ahorcado-FF4500?style=for-the-badge) | Adivina la palabra letra por letra |
| ![Tateti](https://img.shields.io/badge/❌⭕-Ta--te--ti-8A2BE2?style=for-the-badge) | Tres en línea |
| ![Adivinar](https://img.shields.io/badge/🔢-Adivinar-1E90FF?style=for-the-badge) | Adivina el número secreto |
| ![Sopa](https://img.shields.io/badge/🔎-Sopa%20de%20letras-32CD32?style=for-the-badge) | Encuentra las palabras escondidas |
| ![Ruleta](https://img.shields.io/badge/🎡-Ruleta-FFD700?style=for-the-badge) | Gira y apuesta |
| ![Casino](https://img.shields.io/badge/🎰-Slots%20%2F%20Coinflip-A52A2A?style=for-the-badge) | Tragamonedas y cara o cruz |
| ![ToD](https://img.shields.io/badge/😈-Verdad%20o%20Reto-FF69B4?style=for-the-badge) | El clásico de grupo |

---

<div align="center">

## 🔐 Seguridad y Sesión

</div>

- **No hay servidor central**: el bot corre en tu máquina o tu hosting y nada sale de ahí
  salvo las peticiones que cada comando necesita (descargas, clima, IA).
- **La sesión es tuya**: `auth_info/` guarda las llaves de WhatsApp en SQLite y está en
  `.gitignore`. Nunca se sube al repositorio.
- **Una instancia por sesión**: `lib/instancia.js` toma un bloqueo. Un segundo proceso con
  la misma sesión avisa en vez de corromper las llaves.
- **Escrituras atómicas**: una transacción por lote en lugar de 1400 archivos sueltos.
- **Actualizador apagado por defecto**: ejecuta `git merge` y `npm install` del remoto,
  así que viene desactivado. Se activa a mano en `config.js` o con `--update`.
- **Sin telemetría**: no hay analytics, ni ping a servidores propios, ni nada parecido.

> [!TIP]
> Usá un número dedicado para el bot. Un número limpio y con uso tranquilo es más estable
> que uno personal lleno de grupos.

---

<div align="center">

## 🚀 Instalación

Elegí tu plataforma y desplegá el acordeón.

</div>

<details open>
<summary><b>🪟 Windows</b></summary>

<br>

[![Node.js](https://img.shields.io/badge/Node.js-22.13%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)

**Paso 1 — Instalar Node.js** desde **https://nodejs.org/** (LTS, 22.13 o superior).
Marcá **"Add to PATH"** durante la instalación.

```bash
node -v
npm -v
```

**Paso 2 — Instalar ffmpeg** (obligatorio: stickers de vídeo, `toimg`, audio):

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

**Paso 3 — Clonar e instalar**

```bash
git clone https://github.com/Beerus-zv/Beerus-Bot-MD.git
cd Beerus-Bot-MD
npm install
```

**Paso 4 — Verificar** (no conecta a WhatsApp, no toca `data/`)

```bash
npm test
```

**Paso 5 — Arrancar**

```bash
npm start
```

**Errores comunes en Windows:**

<details>
<summary>❌ Error al instalar <code>sharp</code></summary>

```bash
npm uninstall sharp
npm install sharp --os=win32 --cpu=x64
npm rebuild sharp
```

</details>

<details>
<summary>❌ <code>FFMPEG_ERROR</code> en stickers o <code>toimg</code></summary>

ffmpeg no está en el `PATH`. Instalalo, cerrá la terminal y abrí una nueva. Verificá con
`ffmpeg -version` **dentro de la misma terminal** donde corrés el bot.

</details>

<details>
<summary>❌ Error de permisos en npm (PowerShell)</summary>

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

</details>

<details>
<summary>❌ <code>node:sqlite</code> no existe</summary>

Node es anterior a 22.13. Actualizá Node: `node:sqlite` es lo que guarda la sesión y los
datos, no hay respaldo para versiones viejas.

</details>

</details>

<details>
<summary><b>📱 Android (Termux)</b></summary>

<br>

> [!TIP]
> Instalá Termux desde **F-Droid** (no Play Store): https://f-droid.org/packages/com.termux/

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

> [!NOTE]
> Termux suele traer Node actualizado; verificá con `node -v` que sea **22.13 o superior**
> antes de instalar las dependencias.

</details>

<details>
<summary><b>🐧 Linux / macOS</b></summary>

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
<summary><b>☁️ Hosting con panel (Pterodactyl / similar)</b></summary>

<br>

1. Crear el servidor con **Node.js 22** como runtime.
2. Subir el repositorio o clonarlo desde la consola: `git clone <repo> .`
3. Comando de arranque: `node iniciar.js` (o `npm start`).
4. Instalar dependencias una primera vez: `npm install`.
5. Abrir la consola: el bot pregunta **QR** o **código de 8 dígitos**.

> [!IMPORTANT]
> En paneles la consola suele ser limitada: para el código de emparejamiento cargá antes
> tu número en `config.js` (`NUMERO_VINCULACION`) y usá `node index.js --code`.

</details>

---

<div align="center">

## 🔗 Vincular WhatsApp

</div>

La primera vez no hay sesión, así que el bot pregunta cómo vincular:

```yaml
1. Código QR
2. Código de 8 dígitos
```

También se puede forzar al arrancar:

```bash
node index.js --qr      # QR en consola
node index.js --code    # código de emparejamiento
```

**QR** — WhatsApp → Dispositivos vinculados → Vincular un dispositivo → escanear.

**Código** — WhatsApp → Dispositivos vinculados → Vincular con número de teléfono →
introducir el código de 8 caracteres que muestra la consola.

El número del bot se puede dejar fijo en `config.js`:

```js
export const NUMERO_VINCULACION = '5215512345678'  // código de país, solo dígitos
```

> [!WARNING]
> Una sola instancia por sesión. Si el bot ya está corriendo, un segundo proceso no puede
> usar `auth_info/`: el bloqueo de `lib/instancia.js` lo detecta y avisa.

---

<div align="center">

## ⚙️ Configuración

</div>

Todo vive en `config.js`, sin tocar el resto del código.

| Clave | Por defecto | Qué hace |
|:---|:---|:---|
| `BOT_NAME` | `'Beerus Bot MD'` | Nombre en mensajes y menú |
| `PREFIXES` | `['.', '#', '/']` | Prefijos de comando |
| `AUTO_ACTUALIZAR` | `false` | Actualiza desde git al arrancar |
| `RAMA_ACTUALIZACION` | `''` | Rama a seguir; vacío = la actual |
| `NAVEGADOR_WA` | `'Firefox'` | Navegador en Dispositivos vinculados |
| `AUTH_DIR` | `'auth_info'` | Carpeta de la sesión |
| `METODO_VINCULACION` | `'preguntar'` | `preguntar` \| `qr` \| `codigo` |
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

---

<div align="center">

## 🔧 Requisitos del Sistema

</div>

| Componente | Versión | Descripción |
|:-----------|:--------|:------------|
| **Node.js** | 22.13+ | Obligatorio: usa `node:sqlite` |
| **NPM** | 10+ | Viene con Node |
| **FFmpeg** | Última | Multimedia, stickers de vídeo y audio |
| **Git** | Opcional | Solo para el actualizador |

| Recurso | Sugerido |
|:-----------|:--------|
| **RAM** | 512 MB mínimo · 1 GB recomendado |
| **Almacenamiento** | 1.5 GB libres (dependencias + caché de cartas y banners) |
| **Internet** | Necesaria para descargas, gacha, banners e IA |

---

<div align="center">

## 🚀 Uso y Ejecución

</div>

Prefijos aceptados: `.` `#` `/`

```bash
.ping
#menu
/menu gacha
```

El bot también responde cuando lo mencionan por su nombre (`beerus` por defecto), aunque el
mensaje no lleve prefijo.

`/menu` manda el menú completo en un solo mensaje; `/menu <categoría>` manda solo esa
categoría. Cada comando tiene un nombre corto y el nombre largo del archivo sigue
funcionando: `.waifuinfo` y `.winfo` hacen lo mismo.

**En producción, con PM2:**

```bash
npm install -g pm2
pm2 start iniciar.js --name "BeerusBot"
pm2 logs BeerusBot
pm2 save
```

---

<div align="center">

## 📁 Estructura del Proyecto

</div>

```
Beerus-Bot-MD/
├── 📁 commands/           155 comandos, un archivo por comando
├── 📁 lib/                lógica compartida
│   ├── loader.js              carga perezosa de comandos
│   ├── arranque.js            caché de bytecode de V8
│   ├── auth-state.js          sesión de WhatsApp en SQLite
│   ├── grupo.js               metadata, admins, JIDs y LID
│   ├── economia.js            monedas, XP y niveles
│   ├── poker.js / uno.js      motores de juego
│   ├── privado.js             entrega de jugadas por privado
│   ├── descargas.js           yt-dlp + scraper propio
│   ├── imagenes.js            gacha, retratos y caché
│   ├── ia.js / ia-proveedores.js  IA de Beerus
│   └── logger.js              logs legibles en consola
├── 📁 database/
│   └── db.js              esquema y consultas SQLite
├── 📁 scripts/           mantenimiento: cartas, banners, rarezas, graphify
├── 📁 assets/            arte local del bot
├── 📁 data/              base de datos, caché y yt-dlp (no se sube)
├── 📁 auth_info/         sesión de WhatsApp (no se sube)
├── 📄 index.js           conexión, enrutado y registro de comandos
├── 📄 iniciar.js         lanzador con actualizador opcional
├── 📄 config.js          toda la configuración
└── 📄 verify.mjs         verificación sin conectar (npm test)
```

**Contrato de un comando** — cualquier archivo nuevo en `commands/`:

```js
// commands/ejemplo.js  →  se registra como /ejemplo
export default async ({ sock, jid, msg, args }) => {
  const texto = args.join(' ').trim() || 'sin argumentos'
  await sock.sendMessage(jid, { text: `Recibí: ${texto}` }, { quoted: msg })
}
```

El nombre del archivo es el nombre del comando. Los alias cortos viven en `lib/alias.js`,
el registro en `index.js` y `lib/loader.js` solo resuelve la ruta y compila el archivo la
primera vez que se invoca.

---

<div align="center">

## 🛠️ Scripts

</div>

| Comando | Qué hace |
|:--------|:---------|
| `npm start` | Arranca con comprobación de actualización (`iniciar.js`) |
| `npm run dev` | Arranca con `--watch`, sin actualizador |
| `npm test` | Verificación completa sin conectar a WhatsApp |
| `npm run check` | Solo sintaxis de las entradas y de la capa de datos |
| `npm run cartas` | Refresca las cartas del gacha |
| `npm run banners` | Renueva los banners del menú |
| `npm run rarezas` | Sincroniza rarezas con el catálogo externo |
| `npm run graphify` | Genera el mapa de dependencias en `graphify-out/` |

**Qué valida `npm test`** (`verify.mjs`): sintaxis · carga de los 155 comandos · registro
sin referencias rotas ni claves duplicadas · alias del menú que existan de verdad ·
categorías que solo listan comandos registrados · partición del menú en bloques que
WhatsApp acepta (≤ 4096 caracteres) · creación del esquema SQLite en carpeta temporal ·
club VIP · imagen de carta · interacciones con GIF · retratos del gacha · banners.

**Mapa de dependencias** (`npm run graphify`) — escáner de imports propio, sin
dependencias externas:

```
graphify-out/
├── index.html   visor interactivo: nodos, aristas, búsqueda, filtros por capa
├── GRAPH.md     índice textual: hubs, huérfanos, ciclos, listado por carpeta
└── graph.json   nodos y aristas para consultas
```

Consulta puntual sin releer el código:

```bash
node scripts/graphify.mjs query gacha
```

---

<div align="center">

## 🧩 Comandos

</div>

Resumen por categoría. El listado real y actualizado sale siempre de `/menu`.

| Categoría | Nº | Ejemplos |
|:---|:--:|:---|
| 🛠️ Generales | 8 | `ping` `menu` `help` `dado` `stickers` `stats` |
| 👑 Administración de grupos | 49 | `group` `bot` `ban` `kick` `promote` `hidetag` `antilink` `welcome` `modos` |
| 🎨 Multimedia | 8 | `sticker` `stickervideo` `video` `audio` `qr` `efecto` `toimg` |
| 💰 Economía y casino | 12 | `daily` `work` `economy` `casino` `rob` `deposit` `withdraw` `leaderboard` `crime` |
| 🎰 Gacha anime | 26 | `gacha` `c` `collection` `gachaboard` `claim` `give` `sell` `trade` |
| 👑 VIP | 5 | `vip` `vipmenu` `vipbadge` `vipboost` `gachaclaim` |
| 🃏 Juegos | 8 | `uno` `poker` `ahorcado` `tateti` `adivinar` `sopa` `truthordare` |
| 🧰 Utilidades | 9 | `calcular` `topcount` `pfp` `dalle` `remini` `inspect` `traducir` |
| 🌐 Internet | 12 | `buscar` `wiki` `clima` `letra` `ip` `acortar` `leerurl` `pokedex` |
| 📥 Descargas | 15 | `descargar` `youtube` `tiktok` `instagram` `mediafire` `pixiv` `spotifysearch` |
| 🎭 Entretenimiento | 10 | `truthordare` `ship` `compliment` `joke` `8ball` `curiosidad` |
| ⭐ Personales | 3 | `notes` `afk` `history` |
| 📖 Perfiles | 20 | `profile` `level` `marry` `divorce` `birthdays` `setbirth` |
| 🤖 IA | 3 | `ia` `chatgpt` `gemini` |
| 💞 Interacciones | 31 | `kiss` `hug` `slap` `pat` `dance` `cuddle` |
| 🔞 NSFW *(off por defecto)* | 33 | `/nsfw on` para habilitar |

---

<div align="center">

## ⚡ Sistema de Actualización

</div>

El actualizador usa **git** y corre antes de cargar el bot, así que `index.js` arranca ya
con el código nuevo:

1. 🔄 `git fetch` del repositorio remoto
2. 📥 `git pull --ff-only` si hay commits nuevos
3. 📦 `npm install` si cambió `package.json` o `package-lock.json`
4. 🐱 Arranca el bot

Nunca pisa trabajo local: si hay cambios sin guardar en archivos versionados, o si la rama
local divergió, se queda quieto y avisa.

> [!WARNING]
> El actualizador ejecuta código del repositorio remoto sin que lo revises, por eso viene
> **apagado** (`AUTO_ACTUALIZAR = false`). Activalo solo si controlás el remoto.

**Actualizar a mano:**

```bash
git pull
npm install    # solo si cambió package.json
npm start
```

---

<div align="center">

## ❓ Problemas Comunes

</div>

<details>
<summary>❌ <code>FFMPEG_ERROR</code> o stickers que fallan</summary>

<br>

ffmpeg no está en el `PATH`. Comprobar:

```bash
ffmpeg -version
```

Después de instalarlo hay que **cerrar y abrir la terminal** (o reiniciar el panel) para que
el `PATH` nuevo se aplique al proceso del bot.

</details>

<details>
<summary>❌ <code>node:sqlite</code> no existe</summary>

<br>

Node es anterior a 22.13. Actualizar:

```bash
node -v
```

`node:sqlite` es el motor de la sesión y de la base de datos; no hay alternativa para
versiones viejas.

</details>

<details>
<summary>❌ El bot avisa que la sesión está en uso</summary>

<br>

Hay otra instancia corriendo con el mismo `auth_info/`. Cerrar la otra antes de arrancar
esta. En paneles, revisar que no haya un proceso duplicado.

</details>

<details>
<summary>❌ Se cerró la sesión de WhatsApp</summary>

<br>

```bash
rm -rf auth_info
npm start
```

Y vincular de nuevo.

</details>

<details>
<summary>❌ Las descargas de YouTube fallan</summary>

<br>

yt-dlp se queda viejo rápido. Borrar el binario para que se descargue la versión nueva:

```bash
rm -rf data/yt-dlp
npm start
```

</details>

<details>
<summary>❌ El menú sale sin imagen</summary>

<br>

Sin internet usa `assets/beerus-banner.png`. Si tampoco aparece, revisar que
`BANNER_LOCAL` apunte a un archivo existente y que `assets/` no se haya borrado.

</details>

<details>
<summary>❌ Un comando no carga</summary>

<br>

La consola dice cuál y por qué al arrancar. Para el listado completo sin arrancar el bot:

```bash
npm test
```

</details>

<details>
<summary>❌ <code>npm install</code> falla por conflicto de versiones</summary>

<br>

```bash
rm -rf node_modules package-lock.json
npm install
```

</details>

---

<div align="center">

## 🤝 Contribuir

</div>

1. Fork del repositorio.
2. Rama nueva: `git checkout -b feat/mi-comando`.
3. Un comando por archivo en `commands/`, exportando `async (ctx) => {}`.
4. `npm test` en verde antes de abrir el PR.
5. PR con qué hace y cómo probarlo.

Convención de commits: [`Conventional Commits`](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

---

<div align="center">

## 👨‍💻 Creador

</div>

<p align="center">
  <b>Beerus_zv</b><br>
  <sub>Desarrollo · mantenimiento · arte del bot</sub>
</p>

<p align="center">
  <a href="https://github.com/Beerus-zv">
    <img src="https://img.shields.io/badge/GitHub-Beerus--zv-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
  </a>
  <a href="https://instagram.com/andresm_zv">
    <img src="https://img.shields.io/badge/Instagram-@andresm__zv-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"/>
  </a>
</p>

---

<div align="center">

## ❤️ Apoyar el Proyecto

</div>

Si el bot te sirve, el proyecto se mantiene con donaciones:

<p align="center">
  <a href="https://paypal.me/altozv">
    <img src="https://img.shields.io/badge/💙%20PayPal-Donar-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal"/>
  </a>
</p>

- ⭐ Dejar una **estrella** en el repositorio.
- 🐞 Reportar bugs con el log de la consola.
- 🔧 Mandar un PR con un comando nuevo.

---

<div align="center">

## 📜 Licencia

**MIT** — usá, modificá y compartí. Ver [package.json](package.json).

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

<br>

<sub>Hecho con Baileys, SQLite y demasiado café. 🐱</sub>

</div>
