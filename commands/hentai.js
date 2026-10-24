/**
 * /hentai: imagen NSFW al azar (tag por defecto). Requiere el modo NSFW
 * activado en el chat (/nsfw on, admins) — mismo motor que /rule34.
 */
import { ejecutarBusqueda } from './rule34.js'

export default async (ctx) => ejecutarBusqueda(ctx, { azar: true })
