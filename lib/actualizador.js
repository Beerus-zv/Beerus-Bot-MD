/**
 * Actualizador automatico (basado en git).
 *
 * Al iniciar el bot con `npm start`:
 *   1. Consulta el repositorio remoto (git fetch).
 *   2. Si hay commits nuevos, los descarga con `git pull --ff-only`.
 *   3. Si cambiaron package.json / package-lock.json, ejecuta `npm install`.
 *
 * Reglas de seguridad (nunca pierde cambios locales):
 *   - Si no es un repositorio git o no hay git instalado, se omite.
 *   - Si hay cambios locales sin guardar en archivos versionados, no actualiza.
 *   - Si la rama local tiene commits propios (divergio), no actualiza.
 *   - Solo avanza en "fast-forward"; jamas reescribe el historial local.
 *   - Cualquier fallo (sin internet, etc.) solo muestra un aviso y el bot arranca igual.
 *
 * La sesion (auth_info/) y la base de datos (data/) estan en .gitignore,
 * asi que una actualizacion nunca los toca.
 */
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { log } from './logger.js'

const RAIZ = path.resolve('.')
const TIEMPO_GIT_MS = 30_000
const TIEMPO_NPM_MS = 5 * 60_000

/** Ejecuta git y devuelve la salida (lanza error si falla) */
function git(args, timeout = TIEMPO_GIT_MS) {
  return execFileSync('git', args, {
    cwd: RAIZ,
    timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // Nunca pedir usuario/clave por consola: si hace falta, falla y se omite
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
}

/** Version actual segun package.json */
function versionLocal() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version
  } catch {
    return '?'
  }
}

/** Mensaje corto de un error de git/npm */
function motivo(err) {
  const texto = String(err?.stderr || err?.message || err).trim()
  return texto.split('\n').filter(Boolean).slice(-2).join(' | ') || 'error desconocido'
}

/**
 * Busca y aplica actualizaciones.
 * @param {{ rama?: string, remoto?: string }} opciones
 * @returns {{ estado: string, de?: string, a?: string }}
 */
export function actualizarBot({ rama = '', remoto = 'origin' } = {}) {
  if (!fs.existsSync(path.join(RAIZ, '.git'))) {
    log.aviso('Actualizaciones omitidas: la carpeta no es un repositorio git.')
    return { estado: 'sin-git' }
  }

  try {
    git(['--version'])
  } catch {
    log.aviso('Actualizaciones omitidas: git no está instalado.')
    return { estado: 'sin-git' }
  }

  try {
    const ramaActual = rama || git(['rev-parse', '--abbrev-ref', 'HEAD'])

    if (ramaActual === 'HEAD') {
      log.aviso('Actualizaciones omitidas: el repositorio está en HEAD desacoplado.')
      return { estado: 'omitido' }
    }

    log.sistema('🔄 Buscando actualizaciones...')
    git(['fetch', '--quiet', remoto, ramaActual])

    const refRemota = `${remoto}/${ramaActual}`
    // "atras adelante": commits que le faltan / commits propios que el remoto no tiene
    const [atras, adelante] = git(['rev-list', '--left-right', '--count', `${refRemota}...HEAD`])
      .split(/\s+/)
      .map(Number)

    if (!atras) {
      log.sistema(`✅ El bot está actualizado (v${versionLocal()}).`)
      return { estado: 'al-dia' }
    }

    if (adelante) {
      log.aviso(`Hay ${atras} actualización(es), pero tu rama tiene ${adelante} commit(s) propio(s). No se actualiza solo.`)
      return { estado: 'divergido' }
    }

    if (git(['status', '--porcelain', '--untracked-files=no'])) {
      log.aviso(`Hay ${atras} actualización(es), pero tienes cambios locales sin guardar. Haz commit o descártalos para actualizar.`)
      return { estado: 'cambios-locales' }
    }

    const de = versionLocal()
    const antes = git(['rev-parse', 'HEAD'])

    log.sistema(`⬇️  Descargando ${atras} actualización(es)...`)
    git(['merge', '--ff-only', refRemota])

    const archivos = git(['diff', '--name-only', antes, 'HEAD']).split('\n')
    if (archivos.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      log.sistema('📦 Cambiaron las dependencias, instalando...')
      try {
        execSync('npm install --no-audit --no-fund', { cwd: RAIZ, timeout: TIEMPO_NPM_MS, stdio: 'inherit' })
      } catch (err) {
        log.error(`No se pudieron instalar las dependencias (ejecuta "npm install" a mano): ${motivo(err)}`)
      }
    }

    const a = versionLocal()
    log.sistema(`✅ Bot actualizado: v${de} → v${a}`)
    return { estado: 'actualizado', de, a }
  } catch (err) {
    log.aviso(`No se pudo comprobar actualizaciones (${motivo(err)}). Se inicia con la versión actual.`)
    return { estado: 'error' }
  }
}
