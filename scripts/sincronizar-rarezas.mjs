/**
 * Recalcula las rarezas del catalogo del gacha desde AniList.
 *
 * El catalogo se sembro con rarezas a mano y las tiradas viejas usaban
 * bandas solapadas: los personajes ya reclamados se quedaban con la
 * rareza antigua en .gachaboard y .gacha collection.
 *
 * Uso:
 *   npm run rarezas                 # sincroniza (omite si ya se hizo hoy)
 *   npm run rarezas -- --forzar     # fuerza la pasada completa
 *
 * Tambien corre solo al arrancar el bot (una vez al dia) y con
 * `.gacha sync` (owner).
 */
import {
  contarPersonajesGacha,
  listarPersonajesGacha,
} from '../database/db.js'
import { sincronizarRarezas } from '../lib/gacha-internet.js'

const args = process.argv.slice(2)
const forzar = args.includes('--forzar') || args.includes('--force')

console.log(`[rarezas] ${contarPersonajesGacha()} personajes en el catalogo`)
console.log('[rarezas] leyendo AniList (hasta 100 paginas)...')

const inicio = Date.now()
const resultado = await sincronizarRarezas({
  forzar,
  alProgreso: ({ page, paginas, personajes }) => {
    if (page % 10 === 0 || page === paginas) {
      console.log(`  · pagina ${page}/${paginas} (${personajes} nombres indexados)`)
    }
  },
})

if (!resultado) {
  console.log('[rarezas] sin internet: no se toco nada (BEERUS_GACHA_LOCAL=1?)')
  process.exit(1)
}

if (resultado.omitido) {
  console.log('[rarezas] ya se sincronizo hoy; usa --forzar para repetir')
  process.exit(0)
}

const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
console.log(
  `[rarezas] ${resultado.actualizados} corregidas de ${resultado.revisados} ` +
    `(${resultado.encontrados} con datos en AniList) en ${segundos}s`
)

const porRareza = new Map()
for (const p of listarPersonajesGacha()) {
  porRareza.set(p.rareza, (porRareza.get(p.rareza) || 0) + 1)
}
console.log(
  '[rarezas] reparto actual: ' +
    [...porRareza.entries()].map(([r, n]) => `${r} ${n}`).join(' · ')
)
