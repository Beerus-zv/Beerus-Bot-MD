import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '📘 *Descargar de Facebook*',
  plataformas: ['facebook'],
  ejemplo: '/facebook <enlace>',
  descripcion: 'Descarga de Facebook',
  maxMB: 25,
})
