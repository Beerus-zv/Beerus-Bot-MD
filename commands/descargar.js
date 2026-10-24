import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '📥 *Descargar de internet*',
  plataformas: ['todas'],
  ejemplo: '/descargar <enlace>',
  descripcion: 'Descarga de YouTube, TikTok, Facebook...',
  maxMB: 25,
})
