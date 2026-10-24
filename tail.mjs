import fs from 'node:fs'
const ruta = 'commands/uno.js'
const lineas = fs.readFileSync(ruta, 'utf8').split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'))
// Muestra las ultimas 10 lineas con indice
for (let i = Math.max(0, lineas.length - 12); i < lineas.length; i++) {
  console.log((i + 1) + ' | ' + lineas[i])
}
console.log('TOTAL LINEAS:', lineas.length)
