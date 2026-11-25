/**
 * Bloqueo de instancia unica.
 *
 * Si dos copias del bot se conectan con la misma sesion, WhatsApp cierra una
 * de las dos con el codigo 440 (connectionReplaced). Si el bot reconecta solo,
 * se genera un bucle infinito de "conecta -> desconecta (440) -> conecta".
 *
 * Este bloqueo deja pasar una sola instancia y evita el conflicto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { log } from './logger.js'

const LOCK_DIR = path.resolve('data')
const LOCK_FILE = path.join(LOCK_DIR, 'beerus.lock')

/** Indica si un proceso sigue vivo en el sistema */
function procesoVivo(pid) {
  if (!pid) return false
  try {
    // Intentar enviar señal 0: no mata el proceso, solo verifica si existe
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no existe el proceso (error más común)
    if (err.code === 'ESRCH') return false
    // EPERM = el proceso existe pero no tenemos permiso para señalarlo.
    // En contenedores/Docker/Pterodactyl esto es común y suele indicar
    // que el PID pertenece al host o a otro contenedor, no al bot actual.
    // Para evitar falsos positivos, asumimos que NO está vivo.
    if (err.code === 'EPERM') return false
    // Cualquier otro error (EINVAL, etc.): asumimos que no está vivo
    return false
  }
}

/** Verifica si el PID pertenece al proceso actual del bot */
function esPropioProceso(pid) {
  return pid === process.pid
}

/**
 * Intenta obtener el bloqueo de instancia.
 * @returns {{ok:boolean, pid?:number}} ok=false si ya hay otra instancia viva
 */
export function adquirirBloqueo() {
  try {
    if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true })

    if (fs.existsSync(LOCK_FILE)) {
      const content = fs.readFileSync(LOCK_FILE, 'utf8')
      if (!content.trim()) {
        // Lock file vacío: lo sobrescribimos
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, desde: new Date().toISOString() }))
        return { ok: true }
      }
      const info = JSON.parse(content)
      const pidGuardado = info.pid

      // Si el PID guardado es el mismo que el proceso actual, podemos obtener el bloqueo
      if (esPropioProceso(pidGuardado)) {
        // Actualizar timestamp
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, desde: new Date().toISOString() }))
        return { ok: true }
      }

      // Verificar si el proceso guardado sigue vivo
      if (pidGuardado && procesoVivo(pidGuardado)) {
        // Si el PID es menor a 100, es casi seguro que es del sistema/container, no del bot
        if (pidGuardado < 100) {
          // PID sospechoso: no es un PID típico de Node.js (que suelen ser > 1000)
          // Sobrescribir el lock file
          fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, desde: new Date().toISOString() }))
          return { ok: true }
        }
        return { ok: false, pid: pidGuardado }
      }
    }

    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, desde: new Date().toISOString() })
    )
    return { ok: true }
  } catch (err) {
    // Si el sistema de archivos falla, se sigue sin bloqueo (mejor que no arrancar)
    log.aviso(`No se pudo crear el bloqueo de instancia · ${err.message}`)
    return { ok: true }
  }
}

/** Libera el bloqueo si lo tiene esta misma instancia */
export function liberarBloqueo() {
  try {
    const info = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
    if (info.pid === process.pid) fs.unlinkSync(LOCK_FILE)
  } catch {
    // Nada que liberar
  }
}
