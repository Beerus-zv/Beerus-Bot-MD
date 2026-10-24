/**
 * Extrae la lista real de comandos registrados en index.js.
 * No importa index.js (eso arrancaria el bot): se lee el fuente y se
 * extraen las claves del objeto `commands`.
 */
import fs from 'node:fs'

export function leerRegistroComandos(archivo = 'index.js') {
  const src = fs.readFileSync(archivo, 'utf8')
  const inicio = src.indexOf('const commands = {')
  if (inicio === -1) throw new Error('No se encontro el registro de comandos en index.js')

  const desde = src.indexOf('{', inicio)
  let profundidad = 0
  let fin = -1

  for (let i = desde; i < src.length; i++) {
    if (src[i] === '{') profundidad++
    else if (src[i] === '}') {
      profundidad--
      if (profundidad === 0) {
        fin = i
        break
      }
    }
  }

  const texto = src.slice(desde, fin + 1)
  const claves = []

  // Una propiedad por linea: `clave,` | `clave: valor,` | `'clave': valor,`
  for (const linea of texto.split('\n')) {
    const limpia = linea.replace(/\/\/.*$/, '').trim()
    const coincidencia = limpia.match(/^'([\w-]+)'|^(?:'([\w-]+)'|([\w-]+))\s*[:,]/)
    if (!coincidencia) continue

    const clave = coincidencia[1] ?? coincidencia[2] ?? coincidencia[3]
    if (!clave) continue
    claves.push(clave)
  }

  // Cada comando se registra como una funcion
  const registro = {}
  for (const clave of claves) registro[clave] = () => {}
  return registro
}
