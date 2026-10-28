/**
 * Descarga banners nuevos de Beerus desde internet para el menu.
 *
 * Uso:
 *   npm run banners                 # baja 6 imagenes nuevas
 *   npm run banners -- --cantidad=3
 *   npm run banners -- --limpiar    # borra la cache y baja de cero
 *   npm run banners -- --estado     # solo muestra lo que hay guardado
 *
 * El bot tambien los baja solo cuando el menu se queda sin banners.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  CONSULTAS_BANNERS,
  DIR_BANNERS,
  MAXIMO_BANNERS,
  MINIMO_BANNERS,
  leerCatalogo,
  sincronizarBanners,
  vaciarBanners,
} from '../lib/banners-menu.js'

const args = process.argv.slice(2)
const opcion = (nombre, porDefecto) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  return encontrado ? encontrado.split('=').slice(1).join('=') : porDefecto
}
const bandera = (nombre) => args.includes(`--${nombre}`)

const CANTIDAD = Math.max(1, Number(opcion('cantidad', 6)) || 6)
const MAXIMO = Math.max(CANTIDAD, Number(opcion('maximo', MAXIMO_BANNERS)) || MAXIMO_BANNERS)

function listar() {
  const catalogo = leerCatalogo()
  console.log(`[banners] ${catalogo.length} en ${DIR_BANNERS}`)
  for (const b of catalogo) {
    let kb = 0
    try {
      kb = Math.round(fs.statSync(path.join(DIR_BANNERS, b.archivo)).size / 1024)
    } catch {
      // archivo ausente: leerCatalogo ya lo filtra
    }
    console.log(
      `  · ${b.id}  ${String(kb).padStart(4)} KB  ${b.ancho}x${b.alto}  ${b.fuente.padEnd(10)}  ${b.acento}`
    )
  }
  if (catalogo.length < MINIMO_BANNERS) {
    console.log(`[banners] quedan pocos (minimo ${MINIMO_BANNERS}); el proximo menu repone solo`)
  }
  return catalogo
}

if (bandera('estado')) {
  listar()
  process.exit(0)
}

if (bandera('limpiar')) {
  vaciarBanners()
  console.log('[banners] cache borrada')
}

console.log(`[banners] consultas: ${CONSULTAS_BANNERS.length} | bajando hasta ${CANTIDAD} nuevos`)
const { agregados } = await sincronizarBanners({ nuevo: CANTIDAD, maximo: MAXIMO })

if (!agregados.length) console.log('[banners] no se agrego ninguno (sin red o sin resultados nuevos)')
else {
  for (const b of agregados) console.log(`✔ ${b.id}  ${b.ancho}x${b.alto}  ${b.fuente}  ${b.titulo.slice(0, 60)}`)
}

listar()
