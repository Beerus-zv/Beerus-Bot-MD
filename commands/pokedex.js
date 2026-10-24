import { pedirJson } from '../lib/internet.js'

/**
 * Consulta a la Pokedex (inspirado en el plugin 'pokedex' de MEGA-MD).
 * Usa la API gratuita pokeapi.co. Uso: /pokedex pikachu
 */
export default async ({ sock, jid, msg, args }) => {
  const nombre = (args?.[0] || '').toLowerCase().trim()

  if (!nombre) {
    await sock.sendMessage(jid, {
      text:
        '⚡ *Pokedex*\n\n' +
        '*Uso:* `/pokedex <pokemon>`\n\n' +
        '*Ejemplos:* `/pokedex pikachu`, `/pokedex charizard`',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: `🔎 Buscando a *${nombre}*...` })

  try {
    const datos = await pedirJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(nombre)}`)

    const tipos = datos.types.map((t) => t.type.name).join(', ')
    const habilidades = datos.abilities.map((h) => h.ability.name).slice(0, 3).join(', ')
    const altura = (datos.height / 10).toFixed(1)
    const peso = (datos.weight / 10).toFixed(1)
    const sprite = datos.sprites?.front_default || datos.sprites?.other?.['official-artwork']?.front_default

    const texto =
      `⚡ *POKEDEX*\n\n` +
      `🔥 *${capitalizar(datos.name)}* (#${datos.id})\n\n` +
      `• *Tipo:* ${capitalizar(tipos)}\n` +
      `• *Altura:* ${altura} m\n` +
      `• *Peso:* ${peso} kg\n` +
      `• *Habilidades:* ${capitalizar(habilidades)}\n\n` +
      (datos.stats?.length
        ? `📊 *Stats:*\n` +
          (datos.stats.map((s) => `- ${etiqueta(s.stat.name)}: ${s.base_stat}`).join('\n'))
        : '')

    if (sprite) {
      await sock.sendMessage(jid, { image: { url: sprite }, caption: texto, quoted: msg })
    } else {
      await sock.sendMessage(jid, { text: texto, quoted: msg })
    }
  } catch (err) {
    const noExiste = String(err?.message).includes('404')
    await sock.sendMessage(jid, {
      text: noExiste
        ? `❓ No encontre a *${nombre}* en la pokedex. Revisa el nombre (en ingles, minusculas).`
        : '❌ Fallo la consulta a la pokedex. Intenta de nuevo mas tarde.',
      quoted: msg,
    })
  }
}

function capitalizar(texto) {
  return String(texto || '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(', ')
}

function etiqueta(tipo) {
  const NOMBRES = {
    hp: 'Vida',
    attack: 'Ataque',
    defense: 'Defensa',
    'special-attack': 'At. especial',
    'special-defense': 'Def. especial',
    speed: 'Velocidad',
  }
  return NOMBRES[tipo] || tipo
}
