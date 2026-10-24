import fs from 'node:fs'

// Revierte las sustituciones incorrectas del script agresivo
const REVERTIR = [
  ['commands/waifu.js', 'import default async', 'export default async'],
  ['commands/gacha.js', 'import default async', 'export default async'],
  ['commands/uno.js', 'import default async', 'export default async'],
]

for (const [archivo, mal, bien] of REVERTIR) {
  let src = fs.readFileSync(archivo, 'utf8')
  const n = src.split(mal).length - 1
  src = src.split(mal).join(bien)
  fs.writeFileSync(archivo, src, 'utf8')
  console.log(archivo + ': ' + n + ' -> ' + bien)
}

// catalogo.js: RAREZAS mal reemplazado por rareza
let cat = fs.readFileSync('database/catalogo.js', 'utf8')
const antes = cat.split('export const rareza = {').length - 1
cat = cat.split('export const rareza = {').join('export const RAREZAS = {')
fs.writeFileSync('database/catalogo.js', cat, 'utf8')
console.log('catalogo.js: ' + antes + ' -> export const RAREZAS = {')
