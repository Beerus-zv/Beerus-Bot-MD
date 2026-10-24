import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '📸 *Descargar de Instagram*',
  plataformas: ['instagram'],
  ejemplo: '/instagram <enlace>',
  descripcion: 'Descarga de Instagram',
  maxMB: 25,
})
