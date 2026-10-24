import fs from 'node:fs'

const base = 'https://raw.githubusercontent.com/GataNina-Li/GataBot-MD/master/plugins/'
const files = process.argv.slice(2)

for (const f of files) {
  try {
    const res = await fetch(base + f, { headers: { 'User-Agent': 'node' } })
    const txt = await res.text()
    console.log(`\n========== ${f} (${txt.length} chars) ==========`)
    console.log(txt)
  } catch (e) {
    console.log(`ERROR ${f}: ${e.message}`)
  }
}