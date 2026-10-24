import { gestionarSaludo } from '../lib/bienvenida.js'

/**
 * Configura el saludo de bienvenida del grupo.
 * /welcome on | off | texto <mensaje> | imagen <url> | audio <url> | reset | status | test
 */
export default async (ctx) => {
  await gestionarSaludo(ctx, 'bienvenida')
}
