import fs from 'node:fs'
const ruta = 'commands/uno.js'
const NL = String.fromCharCode(10)
const lineas = fs.readFileSync(ruta, 'utf8').split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'))
// elimina la linea 512 (indice 511): duplicado huerfano
if (lineas[511].includes('.map((u, i) =>') && lineas[512].includes('Clasificacion')) {
  lineas.splice(511, 1)
  console.log('linea huerfana eliminada')
} else {
  console.log('NO coincide:', JSON.stringify(lineas[511]), JSON.stringify(lineas[512]))
}
fs.writeFileSync(ruta, lineas.join(NL), 'utf8')
