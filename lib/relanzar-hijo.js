/**
 * Lanzador del reinicio en caliente (`lib/relanzar.js`).
 *
 * Uso interno: `node lib/relanzar-hijo.js <pidPadre> <esperaMs> <entrada>`
 *
 * Espera a que el proceso padre termine (asi libera `data/beerus.lock` y la
 * sesion de SQLite queda cerrada), y recien entonces arranca el bot con el
 * codigo que quedo en disco despues del `git pull`.
 */
import { spawn } from 'node:child_process'

const [pidPadre, esperaTexto, entrada] = process.argv.slice(2)
const espera = Number(esperaTexto) || 1500
const LIMITE_ESPERA_MS = 20_000

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

/** Verdad si el proceso sigue vivo. EPERM cuenta como vivo. */
function sigueVivo(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

await dormir(espera)

const limite = Date.now() + LIMITE_ESPERA_MS
while (sigueVivo(Number(pidPadre)) && Date.now() < limite) {
  await dormir(250)
}

// El padre no se fue: no se arranca otra copia sobre la misma sesion.
if (sigueVivo(Number(pidPadre))) process.exit(0)

if (!entrada) process.exit(1)

const bot = spawn(process.execPath, [...process.execArgv, entrada], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

bot.on('exit', (codigo) => process.exit(codigo ?? 0))
bot.on('error', () => process.exit(1))
