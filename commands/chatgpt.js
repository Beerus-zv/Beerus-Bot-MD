/**
 * Comando /chatgpt: conversa con el modelo libre de Beerus (GPT-OSS 20B,
 * sin clave via Pollinations). La conversacion continua (con memoria) se
 * lleva en historial por chat: /ia nueva la reinicia.
 */
import { responderIA } from './ia.js'

export default async (ctx) => responderIA(ctx, 'libre')
