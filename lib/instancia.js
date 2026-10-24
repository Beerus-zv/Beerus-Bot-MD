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

const LOCK_DIR = path.resolve('data')
const LOCK_FILE = path.join(LOCK_DIR, 'beerus.lock')

/** Indica si un proceso sigue vivo en el sistema */
function procesoVivo(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM = existe pero no tenemos permiso (proceso de otro usuario)
    return err.code === 'EPERM'
  }
}

/**
 * Intenta obtener el bloqueo de instancia.
 * @returns {{ok:boolean, pid?:number}} ok=false si ya hay otra instancia viva
 */
export function adquirirBloqueo() {
  try {
    if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true })

    if (fs.existsSync(LOCK_FILE)) {
      const info = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
      if (info.pid && info.pid !== process.pid && procesoVivo(info.pid)) {
        return { ok: false, pid: info.pid }
      }
    }

    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, desde: new Date().toISOString() })
    )
    return { ok: true }
  } catch (err) {
    // Si el sistema de archivos falla, se sigue sin bloqueo (mejor que no arrancar)
    console.warn('No se pudo crear el bloqueo de instancia:', err.message)
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
