const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms))

const PASOS = [
  ['🕵️ Iniciando secuencia de hackeo...', 1500],
  ['🌐 Conectando al servidor remoto...', 1600],
  ['🛡️ Burlando los firewalls de Zamasu...', 1900],
  ['🏦 Accediendo a la base de datos cifrada...', 2000],
  ['🔑 Descifrando claves de acceso...', 1800],
  ['📂 Descargando datos confidenciales...', 2400],
  ['🚪 Instalando puerta trasera...', 1800],
]

const PROGRESO = 12

function barra(porcentaje) {
  const llenos = Math.round((porcentaje / 100) * PROGRESO)
  return `${'█'.repeat(llenos)}${'░'.repeat(PROGRESO - llenos)} ${porcentaje}%`
}

/**
 * Parodia de "hackeo" paso a paso (basado en el plugin 'hack' de MEGA-MD).
 * Todo es comedia: mensajes progresivos con barras de progreso falsas.
 * Uso: /hack <objetivo>
 */
export default async ({ sock, jid, msg, args }) => {
  const objetivo = (args?.[0] || 'el Universo 7').slice(0, 30)

  try {
    await sock.sendMessage(jid, { text: `🩸 Objetivo fijado: *${objetivo}*`, quoted: msg })

    for (const [texto, espera] of PASOS) {
      await sock.sendMessage(jid, { text: texto })
      await ESPERA(espera)
    }

    for (const porcentaje of [20, 45, 70, 90, 100]) {
      await sock.sendMessage(jid, {
        text:
          porcentaje === 100
            ? `✅ *Secuencia completada* ${barra(porcentaje)}\n\n🧿 Objetivo comprometido. Beerus ha borrado su historial.\n\n😅 _Sí, todo era una broma. ¡Que la destruccion te acompañe!_`
            : `⬛ Robando datos... ${barra(porcentaje)}`,
      })
      if (porcentaje < 100) await ESPERA(1800)
    }
  } catch (err) {
    console.error('Error en la parodia de hackeo:', err)
    await sock.sendMessage(jid, {
      text: '❌ Se interrumpió el hackeo... el objetivo se echó a volar. Intenta de nuevo.',
      quoted: msg,
    })
  }
}
