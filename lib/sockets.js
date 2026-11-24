/**
 * Registro de sockets vivos del proceso.
 *
 * El bot corre una sola sesion de WhatsApp por proceso, pero el registro deja
 * la puerta abierta a sub-bots y hace que `/bots` muestre datos reales en vez
 * de una lista inventada: cada entrada la pone el arranque al conectar y la
 * borra al cerrar.
 */

/** @type {Map<string, {jid:string, nombre:string, rol:string, conectadoEn:number, version?:string, sock?:object}>} */
const SOCKETS = new Map()

/** Da de alta (o refresca) un socket. La clave es su JID. */
export function registrarSocket(sock, { rol = 'principal' } = {}) {
  const jid = sock?.user?.id
  if (!jid) return null
  const previo = SOCKETS.get(jid)
  const entrada = {
    jid,
    nombre: sock.user?.name || sock.user?.verifiedName || jid.split('@')[0],
    rol: previo?.rol || rol,
    conectadoEn: previo?.conectadoEn || Date.now(),
    version: sock.user?.id ? undefined : undefined,
    sock,
  }
  SOCKETS.set(jid, entrada)
  return entrada
}

/** Quita un socket por JID (o por referencia) */
export function quitarSocket(sockOrJid) {
  if (!sockOrJid) return
  if (typeof sockOrJid === 'string') {
    SOCKETS.delete(sockOrJid)
    return
  }
  for (const [jid, entrada] of SOCKETS) {
    if (entrada.sock === sockOrJid) SOCKETS.delete(jid)
  }
}

/** Lista de sockets activos, del mas viejo al mas nuevo */
export function listarSockets() {
  return [...SOCKETS.values()].sort((a, b) => a.conectadoEn - b.conectadoEn)
}

/** Cantidad de sockets activos */
export function contarSockets() {
  return SOCKETS.size
}
