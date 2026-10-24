import { crearComandoDescarga } from '../lib/comando-descarga.js'

export default crearComandoDescarga({
  titulo: '🎵 *Descargar de TikTok*',
  plataformas: ['tiktok'],
  ejemplo: '/tiktok <enlace>',
  descripcion: 'Descarga videos de TikTok',
  maxMB: 25,
})
