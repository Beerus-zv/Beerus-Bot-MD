import { gestionarSaludo } from '../lib/bienvenida.js'

/**
 * Configura el saludo de despedida del grupo.
 * /bye on | off | texto <mensaje> | imagen <url> | audio <url> | reset | status | test
 */
export default async (ctx) => {
  await gestionarSaludo(ctx, 'despedida')
}
