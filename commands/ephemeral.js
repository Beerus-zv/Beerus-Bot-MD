import { comandoGrupo } from '../lib/comandoGrupo.js'

const OPCIONES = [
  { valor: 0, etiqueta: 'Desactivado' },
  { valor: 86400, etiqueta: '24 horas' },
  { valor: 604800, etiqueta: '7 días' },
  { valor: 2592000, etiqueta: '30 días' },
]

export default comandoGrupo({
  uso: 'Uso: /ephemeral [0|24h|7d|30d]',
  handler: async ({ sock, jid, msg, args, metadata }) => {
    const entrada = (args[0] || '').toLowerCase()
    const actual = metadata.ephemeralDuration || 0

    // Sin argumento -> muestra el estado actual
    if (!entrada) {
      const actualTexto = OPCIONES.find((o) => o.valor === actual)?.etiqueta ?? `${actual}s`
      await sock.sendMessage(jid, {
        text: `⏱️ *Mensajes efímeros:* ${actualTexto}\n\n*Uso:* \`/ephemeral [0|24h|7d|30d]\``,
        quoted: msg,
      })
      return
    }

    const segundos =
      entrada === '0' || entrada === 'off'
        ? 0
        : entrada === '24h' || entrada === '1d'
          ? 86400
          : entrada === '7d' || entrada === '7'
            ? 604800
            : entrada === '30d' || entrada === '30'
              ? 2592000
              : Number(entrada) || null

    if (segundos === null) {
      await sock.sendMessage(jid, {
        text: '❓ Valor inválido.\n\n*Uso:* `/ephemeral [0|24h|7d|30d]`',
        quoted: msg,
      })
      return
    }

    await sock.groupToggleEphemeral(jid, segundos)

    const etiqueta = OPCIONES.find((o) => o.valor === segundos)?.etiqueta ?? `${segundos}s`
    await sock.sendMessage(jid, {
      text: `⏱️ Mensajes efímeros configurados en *${etiqueta}*`,
      quoted: msg,
    })
  },
})

