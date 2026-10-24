import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '🐦 *Descargar de Twitter/X*',
  plataformas: ['twitter'],
  ejemplo: '/twitter <enlace>',
  descripcion: 'Descarga de Twitter/X',
  maxMB: 25,
})
