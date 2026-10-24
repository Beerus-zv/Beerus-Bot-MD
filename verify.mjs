import fs from 'node:fs'
const ARCHIVOS = ['commands/waifu.js','commands/gacha.js','lib/gacha.js','lib/imagenes.js','database/db.js','database/catalogo.js','lib/uno.js','commands/uno.js']
for (const a of ARCHIVOS) {
  const src = fs.readFileSync(a, 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' ').replace(/'(?:\\.|[^'\\])*'/g,"''").replace(/`(?:\\.|[^`\\])*`/g,'``')
  const ids = [...new Set(code.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) || [])]
  const cuenta = new Map()
  for (const id of ids) cuenta.set(id, (code.match(new RegExp('\\b'+id+'\\b','g'))||[]).length)
  const TEN=[...cuenta.entries()].filter(([id,n])=>n===1 && id.length>=8)
  if (TEN.length) console.log(a + ' -> ' + TEN.map(([id])=>id).join(', '))
}
console.log('--- exports por archivo ---')
for (const a of ARCHIVOS) {
  const src = fs.readFileSync(a,'utf8')
  const ex = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)].map(m=>m[1])
  const def = /export default/.test(src)
  console.log(a + ': ' + ex.length + ' named' + (def ? ' + default' : ''))
}
