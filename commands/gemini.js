/**
 * Comando /gemini: conversa con el modelo Gemini.
 *
 * Con clave gratuita de AI Studio guardada (`/ia clave <KEY>`) usa la API
 * oficial de Google. Sin clave cae al modelo libre de Beerus con un aviso.
 */
import { responderIA } from './ia.js'

export default async (ctx) => responderIA(ctx, 'gemini')
