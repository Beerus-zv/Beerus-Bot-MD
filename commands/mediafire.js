import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '🔥 *Descargar de MediaFire*',
  plataformas: ['mediafire'],
  ejemplo: '/mediafire <enlace>',
  descripcion: 'Descarga archivos de MediaFire',
  maxMB: 100,
})
