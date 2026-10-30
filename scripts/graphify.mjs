#!/usr/bin/env node
/**
 * graphify — indexa el repositorio y genera un mapa de relaciones.
 *
 * Uso:
 *   node scripts/graphify.mjs            escanea el repo y escribe graphify-out/
 *   node scripts/graphify.mjs query <q>  consulta el grafo sin releer fuentes
 *
 * Salidas en graphify-out/:
 *   graph.json  nodos + aristas (para consultas y para el visor)
 *   index.html  visor interactivo autocontenido (sin CDN, sin red)
 *   GRAPH.md    indice textual: por carpeta, hubs, huerfanos, ciclos
 *
 * El escaneo ignora node_modules, .git, auth_info, logs, tmp y la propia
 * salida, que son 8k archivos de ruido y ninguno aporta una arista.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'graphify-out')

const IGNORAR_DIR = new Set([
  'node_modules', '.git', 'auth_info', 'logs', 'tmp', 'graphify-out',
  '.opencode', '.agents', 'assets', 'data', 'tmp-data',
])

const EXT = new Set(['.js', '.mjs', '.cjs', '.ts'])

const CAPAS = [
  { id: 'root', dir: '', color: '#ff4d6d', label: 'entrada' },
  { id: 'commands', dir: 'commands', color: '#3ddc97', label: 'comandos' },
  { id: 'lib', dir: 'lib', color: '#8b7cf6', label: 'libreria' },
  { id: 'database', dir: 'database', color: '#f7b731', label: 'datos' },
  { id: 'scripts', dir: 'scripts', color: '#4cc9f0', label: 'scripts' },
]

const COLOR_EXT = '#6b7280'
const COLOR_BUILTIN = '#374151'

function esDir(ruta) {
  try { return statSync(ruta).isDirectory() } catch { return false }
}

function recorrer(dir, acc = []) {
  let entradas
  try { entradas = readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of entradas) {
    if (e.isDirectory()) {
      if (IGNORAR_DIR.has(e.name) || e.name.startsWith('.')) continue
      recorrer(join(dir, e.name), acc)
    } else if (e.isFile()) {
      const ext = e.name.slice(e.name.lastIndexOf('.'))
      if (EXT.has(ext)) acc.push(join(dir, e.name))
    }
  }
  return acc
}

function capaDe(rel) {
  if (!rel.includes('/')) return 'root'
  const top = rel.split('/')[0]
  return CAPAS.some((c) => c.dir === top) ? top : 'otro'
}

const RE_FROM = /\bfrom\s+['"]([^'"]+)['"]/g
const RE_DYN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const RE_REQ = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const RE_SIDE = /^\s*import\s+['"]([^'"]+)['"]/gm

function importaciones(fuente) {
  const set = new Set()
  for (const re of [RE_FROM, RE_DYN, RE_REQ, RE_SIDE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(fuente))) set.add(m[1])
  }
  return [...set]
}

function resolver(desde, spec) {
  const base = join(dirname(desde), spec)
  const intentos = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, join(base, 'index.js'), join(base, 'index.mjs')]
  for (const t of intentos) {
    try { if (statSync(t).isFile()) return t } catch { /* siguiente */ }
  }
  return null
}

function esNativo(spec) {
  return spec.startsWith('node:') || [
    'fs', 'path', 'url', 'crypto', 'os', 'util', 'events', 'http', 'https',
    'child_process', 'stream', 'zlib', 'buffer', 'assert', 'readline', 'timers',
  ].includes(spec.split('/')[0])
}

function descripcion(fuente) {
  const bloque = fuente.match(/^\s*\/\*\*?([\s\S]*?)\*\//)
  if (bloque) {
    const lineas = bloque[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*+\s?/, '').trim())
      .filter((l) => l && !l.startsWith('@'))
    if (lineas.length) return lineas[0].slice(0, 160)
  }
  const simple = fuente.match(/^\s*\/\/\s*(.+)$/m)
  if (simple) return simple[1].trim().slice(0, 160)
  return ''
}

function contarExport(fuente) {
  const m = fuente.match(/\bexport\b/g)
  return m ? m.length : 0
}

function nombreComando(rel) {
  return rel.replace(/^commands\//, '').replace(/\.(js|mjs|cjs|ts)$/, '')
}

/** Alias declarados en index.js: `alias: C.archivo` o `alias: conSub(C.archivo, 'sub')`. */
function extraerAlias(rutaIndex) {
  let fuente
  try { fuente = readFileSync(rutaIndex, 'utf8') } catch { return [] }
  const mapa = []
  const re = /^\s{2}([A-Za-z_][\w]*)\s*:\s*(?:conSub\(\s*C\.([A-Za-z_][\w]*)\s*,\s*'([^']+)'\s*\)|C\.([A-Za-z_][\w]*)|fabricar\w+\([^)]*\))/gm
  let m
  while ((m = re.exec(fuente))) {
    const [, alias, moduloSub, sub, modulo] = m
    const destino = moduloSub || modulo
    if (!destino) continue
    mapa.push({ alias, destino, sub: sub || null })
  }
  return mapa
}

function escanear() {
  const archivos = recorrer(ROOT)
  const nodos = new Map()
  const aristas = []
  const externos = new Map()

  for (const abs of archivos) {
    const rel = posix.normalize(relative(ROOT, abs).split('\\').join('/'))
    let fuente = ''
    try { fuente = readFileSync(abs, 'utf8') } catch { continue }
    nodos.set(rel, {
      id: rel,
      capa: capaDe(rel),
      lineas: fuente.split('\n').length,
      bytes: fuente.length,
      exports: contarExport(fuente),
      desc: descripcion(fuente),
      imports: [],
      externals: [],
      esComando: rel.startsWith('commands/'),
    })
  }

  for (const [rel, nodo] of nodos) {
    const abs = join(ROOT, rel)
    const fuente = readFileSync(abs, 'utf8')
    for (const spec of importaciones(fuente)) {
      if (spec.startsWith('.')) {
        const destino = resolver(abs, spec)
        if (!destino) continue
        const destRel = posix.normalize(relative(ROOT, destino).split('\\').join('/'))
        if (!nodos.has(destRel)) continue
        nodo.imports.push(destRel)
        aristas.push({ source: destRel, target: rel })
      } else {
        nodo.externals.push(spec)
        if (esNativo(spec)) continue
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        externos.set(pkg, (externos.get(pkg) || 0) + 1)
        aristas.push({ source: `pkg:${pkg}`, target: rel })
      }
    }
  }

  const alias = extraerAlias(join(ROOT, 'index.js'))
  return { nodos, aristas, externos, alias }
}

function construirGrafo() {
  const { nodos, aristas, externos, alias } = escanear()
  const listaNodos = []

  for (const [id, pkgCount] of [...externos].sort((a, b) => b[1] - a[1])) {
    listaNodos.push({
      id: `pkg:${id}`,
      capa: 'pkg',
      desc: `paquete npm (${pkgCount} importadores)`,
      lineas: 0,
      bytes: 0,
      exports: 0,
      imports: [],
      externals: [],
      esComando: false,
    })
  }

  for (const n of nodos.values()) listaNodos.push(n)

  const aliasPorArchivo = new Map()
  for (const a of alias) {
    const key = `commands/${a.destino}.js`
    if (!aliasPorArchivo.has(key)) aliasPorArchivo.set(key, [])
    aliasPorArchivo.get(key).push(a.sub ? `${a.alias} → ${a.sub}` : a.alias)
  }

  const ordenCapa = { root: 0, commands: 1, lib: 2, database: 3, scripts: 4, otro: 5, pkg: 6 }
  listaNodos.sort((a, b) => (ordenCapa[a.capa] - ordenCapa[b.capa]) || a.id.localeCompare(b.id))

  for (const n of listaNodos) {
    if (n.esComando) {
      n.comando = nombreComando(n.id)
      n.alias = (aliasPorArchivo.get(n.id) || []).filter((a) => a.split(' ')[0] !== n.comando)
    }
  }

  const entrantes = new Map()
  const salientes = new Map()
  for (const e of aristas) {
    entrantes.set(e.source, (entrantes.get(e.source) || 0) + 1)
    salientes.set(e.target, (salientes.get(e.target) || 0) + 1)
  }
  for (const n of listaNodos) {
    n.entrantes = entrantes.get(n.id) || 0
    n.salientes = salientes.get(n.id) || 0
  }

  const meta = {
    generado: new Date().toISOString(),
    archivos: listaNodos.filter((n) => n.capa !== 'pkg').length,
    aristas: aristas.length,
    lineas: listaNodos.reduce((a, n) => a + n.lineas, 0),
  }

  return { meta, nodes: listaNodos, links: aristas }
}

function detectarCiclos(nodes, links) {
  const ady = new Map()
  for (const n of nodes) if (n.capa !== 'pkg') ady.set(n.id, [])
  for (const l of links) if (ady.has(l.target) && ady.has(l.source)) ady.get(l.target).push(l.source)

  const estado = new Map()
  const pila = []
  const ciclos = []
  const vistos = new Set()

  function dfs(id) {
    estado.set(id, 1)
    pila.push(id)
    for (const sig of ady.get(id) || []) {
      if (estado.get(sig) === 1) {
        const i = pila.indexOf(sig)
        const ciclo = pila.slice(i)
        const clave = [...ciclo].sort().join('|')
        if (!vistos.has(clave)) {
          vistos.add(clave)
          ciclos.push([...ciclo, sig])
        }
      } else if (!estado.get(sig)) {
        dfs(sig)
      }
    }
    pila.pop()
    estado.set(id, 2)
  }

  for (const n of nodes) if (n.capa !== 'pkg' && !estado.get(n.id)) dfs(n.id)
  return ciclos
}

function escribirMarkdown(grafo) {
  const { meta, nodes, links } = grafo
  const propios = nodes.filter((n) => n.capa !== 'pkg')
  const pkgs = nodes.filter((n) => n.capa === 'pkg')
  const ciclos = detectarCiclos(nodes, links)

  const hubs = [...propios].sort((a, b) => b.entrantes - a.entrantes).slice(0, 15)
  const huerfanos = propios.filter((n) => n.entrantes === 0 && n.capa !== 'root' && n.capa !== 'scripts')
  const hojas = propios.filter((n) => n.salientes === 0)

  const L = []
  L.push('# graphify — mapa de relaciones')
  L.push('')
  L.push(`Generado: ${meta.generado}`)
  L.push('')
  L.push(`- archivos indexados: **${meta.archivos}**`)
  L.push(`- lineas de codigo: **${meta.lineas}**`)
  L.push(`- aristas (import/require): **${meta.aristas}**`)
  L.push(`- paquetes npm externos: **${pkgs.length}**`)
  L.push(`- ciclos de importacion: **${ciclos.length}**`)
  L.push('')
  L.push('Visor interactivo: `graphify-out/index.html` · datos: `graphify-out/graph.json`')
  L.push('')

  L.push('## Hubs — los mas importados')
  L.push('')
  L.push('| archivo | entrantes | salientes | lineas | descripcion |')
  L.push('| --- | --- | --- | --- | --- |')
  for (const n of hubs) {
    L.push(`| \`${n.id}\` | ${n.entrantes} | ${n.salientes} | ${n.lineas} | ${n.desc.replace(/\|/g, '\\|')} |`)
  }
  L.push('')

  L.push('## Paquetes externos')
  L.push('')
  L.push('| paquete | importadores |')
  L.push('| --- | --- |')
  for (const n of pkgs) L.push(`| \`${n.id.replace('pkg:', '')}\` | ${n.entrantes} |`)
  L.push('')

  if (ciclos.length) {
    L.push('## Ciclos de importacion')
    L.push('')
    for (const c of ciclos) L.push(`- ${c.map((x) => `\`${x}\``).join(' → ')}`)
    L.push('')
  }

  if (huerfanos.length) {
    L.push('## Huerfanos — nadie los importa')
    L.push('')
    for (const n of huerfanos) L.push(`- \`${n.id}\`${n.desc ? ` — ${n.desc}` : ''}`)
    L.push('')
  }

  if (hojas.length) {
    L.push('## Hojas — no importan nada interno')
    L.push('')
    for (const n of hojas.slice(0, 40)) L.push(`- \`${n.id}\``)
    if (hojas.length > 40) L.push(`- ... y ${hojas.length - 40} mas`)
    L.push('')
  }

  const grupos = new Map()
  for (const n of propios) {
    const dir = n.id.includes('/') ? n.id.slice(0, n.id.lastIndexOf('/')) : '(raiz)'
    if (!grupos.has(dir)) grupos.set(dir, [])
    grupos.get(dir).push(n)
  }

  L.push('## Indice por carpeta')
  for (const [dir, items] of [...grupos].sort((a, b) => a[0].localeCompare(b[0]))) {
    L.push('')
    L.push(`### ${dir}/`)
    L.push('')
    for (const n of items.sort((a, b) => a.id.localeCompare(b.id))) {
      const etiqueta = n.comando ? ` **/${n.comando}**` : ''
      const extra = n.alias && n.alias.length ? ` · alias: ${n.alias.join(', ')}` : ''
      L.push(`- \`${n.id.split('/').pop()}\`${etiqueta}${extra} — ${n.desc || 'sin descripcion'}`)
      if (n.imports.length) {
        L.push(`  - → ${n.imports.map((i) => `\`${i}\``).join(', ')}`)
      }
    }
  }

  writeFileSync(join(OUT, 'GRAPH.md'), L.join('\n'), 'utf8')
}

function escribirHTML(grafo) {
  const datos = JSON.stringify(grafo)
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Beerus Bot MD — mapa de dependencias</title>
<style>
  :root {
    --bg: #0b0d12; --panel: #12151d; --line: #232838;
    --txt: #e6e9f2; --dim: #8b93a7; --hot: #ff4d6d;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--txt);
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; }
  #app { display: flex; height: 100%; }
  #side { width: 300px; flex: 0 0 300px; border-right: 1px solid var(--line);
    background: var(--panel); display: flex; flex-direction: column; }
  #side header { padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
  #side h1 { margin: 0 0 4px; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
  #side .stat { color: var(--dim); font-size: 11px; }
  #q { width: 100%; margin-top: 10px; padding: 7px 9px; background: #0b0d12;
    border: 1px solid var(--line); color: var(--txt); border-radius: 6px; font: inherit; outline: none; }
  #q:focus { border-color: var(--hot); }
  #layers { padding: 10px 14px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--line); cursor: pointer; font-size: 11px; user-select: none; }
  .chip.off { opacity: .32; }
  .dot { width: 9px; height: 9px; border-radius: 50%; }
  #list { flex: 1; overflow: auto; padding: 6px 0; }
  .row { padding: 5px 14px; cursor: pointer; border-left: 2px solid transparent; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; color: var(--dim); }
  .row:hover { background: #171b26; color: var(--txt); }
  .row.on { border-left-color: var(--hot); color: var(--txt); background: #171b26; }
  #info { padding: 10px 14px; border-top: 1px solid var(--line); min-height: 120px; max-height: 42%; overflow: auto; }
  #info b { color: var(--hot); }
  #info .k { color: var(--dim); }
  #info p { margin: 6px 0 0; }
  #stage { position: relative; flex: 1; }
  canvas { display: block; width: 100%; height: 100%; cursor: grab; }
  canvas.drag { cursor: grabbing; }
  #hint { position: absolute; left: 12px; bottom: 10px; color: var(--dim); font-size: 11px; pointer-events: none; }
</style>
</head>
<body>
<div id="app">
  <div id="side">
    <header>
      <h1>beerus bot md</h1>
      <div class="stat" id="stat"></div>
      <input id="q" placeholder="buscar archivo o /comando" autocomplete="off" />
    </header>
    <div id="layers"></div>
    <div id="list"></div>
    <div id="info"><span class="k">click en un nodo</span></div>
  </div>
  <div id="stage">
    <canvas id="c"></canvas>
    <div id="hint">arrastra para mover · rueda para zoom · click en vacio para soltar</div>
  </div>
</div>
<script>
const DATA = ${datos};
const COLORES = {
  root: '#ff4d6d', commands: '#3ddc97', lib: '#8b7cf6',
  database: '#f7b731', scripts: '#4cc9f0', otro: '#94a3b8', pkg: '#6b7280'
};
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const N = DATA.nodes.map((n, i) => ({
  ...n, i,
  x: (Math.random() - 0.5) * 900,
  y: (Math.random() - 0.5) * 900,
  vx: 0, vy: 0,
  r: n.capa === 'pkg' ? 3 : Math.min(16, 4 + Math.sqrt(n.entrantes) * 2.2 + Math.sqrt(n.salientes)),
  vis: true
}));
const Y = new Map(N.map((n) => [n.id, n]));
const E = DATA.links
  .map((l) => ({ a: Y.get(l.source), b: Y.get(l.target) }))
  .filter((l) => l.a && l.b);
const VECINOS = new Map(N.map((n) => [n.id, new Set()]));
for (const l of E) { VECINOS.get(l.a.id).add(l.b.id); VECINOS.get(l.b.id).add(l.a.id); }

const capas = Object.keys(COLORES);
const activa = Object.fromEntries(capas.map((c) => [c, true]));
const historial = [];

let zoom = 1, panX = 0, panY = 0;
let seleccion = null, hover = null, busqueda = '';
let arrastrando = null, moviendo = false, last = { x: 0, y: 0 };
let alfa = 1;

function dpr() { return window.devicePixelRatio || 1; }
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = r.width * dpr();
  canvas.height = r.height * dpr();
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
}
window.addEventListener('resize', resize);

function proyectar(p) {
  const w = canvas.width / dpr(), h = canvas.height / dpr();
  return { x: (p.x - panX) * zoom + w / 2, y: (p.y - panY) * zoom + h / 2 };
}
function desproyectar(sx, sy) {
  const w = canvas.width / dpr(), h = canvas.height / dpr();
  return { x: (sx - w / 2) / zoom + panX, y: (sy - h / 2) / zoom + panY };
}

function visible(n) {
  if (!activa[n.capa]) return false;
  if (!busqueda) return true;
  const q = busqueda.toLowerCase();
  const hit = n.id.toLowerCase().includes(q) || (n.desc || '').toLowerCase().includes(q)
    || (n.comando || '').toLowerCase().includes(q)
    || (n.alias || []).some((a) => a.toLowerCase().includes(q));
  if (hit) return true;
  return VECINOS.get(n.id).size > 0 && [...VECINOS.get(n.id)].some((v) => {
    const o = Y.get(v);
    return o && (o.id.toLowerCase().includes(q) || (o.comando || '').toLowerCase().includes(q));
  });
}

function paso() {
  const vivos = N.filter((n) => n.vis);
  const k = 140, rep = 2600, centro = 0.0016, amort = 0.86;
  for (let i = 0; i < vivos.length; i++) {
    const a = vivos[i];
    for (let j = i + 1; j < vivos.length; j++) {
      const b = vivos[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      if (d2 > 640000) continue;
      const f = rep / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    a.vx -= a.x * centro; a.vy -= a.y * centro;
  }
  for (const l of E) {
    if (!l.a.vis || !l.b.vis) continue;
    let dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = (d - k) / d * 0.02;
    l.a.vx += dx * f; l.a.vy += dy * f;
    l.b.vx -= dx * f; l.b.vy -= dy * f;
  }
  for (const n of vivos) {
    if (n === arrastrando) { n.vx = n.vy = 0; continue; }
    n.vx *= amort; n.vy *= amort;
    n.x += Math.max(-24, Math.min(24, n.vx));
    n.y += Math.max(-24, Math.min(24, n.vy));
  }
}

function dibujar() {
  const w = canvas.width / dpr(), h = canvas.height / dpr();
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-panX, -panY);

  const resaltado = seleccion || hover;
  const cerca = resaltado ? VECINOS.get(resaltado.id) : null;

  ctx.lineWidth = 1 / zoom;
  for (const l of E) {
    if (!l.a.vis || !l.b.vis) continue;
    const tocado = resaltado && (l.a === resaltado || l.b === resaltado);
    ctx.strokeStyle = tocado ? 'rgba(255,77,109,.85)' : 'rgba(120,132,160,.13)';
    ctx.beginPath();
    ctx.moveTo(l.a.x, l.a.y);
    ctx.lineTo(l.b.x, l.b.y);
    ctx.stroke();
  }

  for (const n of N) {
    if (!n.vis) continue;
    const on = !resaltado || n === resaltado || cerca.has(n.id);
    ctx.globalAlpha = on ? 1 : 0.12;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r / Math.sqrt(zoom), 0, Math.PI * 2);
    ctx.fillStyle = COLORES[n.capa] || '#888';
    ctx.fill();
    if (n === resaltado) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / zoom; ctx.stroke();
    }
    if (zoom > 1.15 || n.entrantes > 6) {
      ctx.globalAlpha = on ? 0.9 : 0.1;
      ctx.fillStyle = '#c8cee0';
      ctx.font = \`\${11 / zoom}px ui-monospace, monospace\`;
      ctx.fillText(n.id.split('/').pop(), n.x + n.r / Math.sqrt(zoom) + 3 / zoom, n.y + 3 / zoom);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function bucle() {
  for (const n of N) n.vis = visible(n);
  paso();
  dibujar();
  requestAnimationFrame(bucle);
}

function pintarLista() {
  const list = document.getElementById('list');
  const q = busqueda.toLowerCase();
  const filas = N
    .filter((n) => n.capa !== 'pkg' && n.vis)
    .filter((n) => !q || n.id.toLowerCase().includes(q) || (n.comando || '').includes(q))
    .sort((a, b) => b.entrantes - a.entrantes || a.id.localeCompare(b.id))
    .slice(0, 300);
  list.innerHTML = '';
  for (const n of filas) {
    const d = document.createElement('div');
    d.className = 'row' + (seleccion === n ? ' on' : '');
    d.innerHTML = \`<span class="dot" style="background:\${COLORES[n.capa]};display:inline-block;margin-right:7px"></span>\` +
      (n.comando ? '/' + n.comando : n.id.split('/').pop());
    d.title = n.id;
    d.onclick = () => { seleccion = n; panX = n.x; panY = n.y; mostrarInfo(n); pintarLista(); };
    list.appendChild(d);
  }
}

function mostrarInfo(n) {
  const info = document.getElementById('info');
  const dentro = E.filter((l) => l.b === n).map((l) => l.a.id);
  const fuera = E.filter((l) => l.a === n).map((l) => l.b.id);
  const partes = [];
  partes.push(\`<b>\${n.id}</b>\`);
  partes.push(\`<p><span class="k">capa</span> \${n.capa} · <span class="k">lineas</span> \${n.lineas} · <span class="k">exports</span> \${n.exports}</p>\`);
  if (n.comando) partes.push(\`<p><span class="k">comando</span> /\${n.comando}\${n.alias && n.alias.length ? \`<br><span class="k">alias</span> \${n.alias.join(', ')}\` : ''}</p>\`);
  if (n.desc) partes.push(\`<p>\${n.desc}</p>\`);
  if (fuera.length) partes.push(\`<p><span class="k">lo importan (\${fuera.length})</span><br>\${fuera.slice(0, 20).map((x) => '· ' + x).join('<br>')}</p>\`);
  if (dentro.length) partes.push(\`<p><span class="k">importa (\${dentro.length})</span><br>\${dentro.slice(0, 14).map((x) => '· ' + x).join('<br>')}</p>\`);
  info.innerHTML = partes.join('');
}

function nodoEn(sx, sy) {
  let best = null, bd = 1e9;
  for (const n of N) {
    if (!n.vis) continue;
    const p = proyectar(n);
    const d = Math.hypot(p.x - sx, p.y - sy);
    const r = Math.max(9, n.r * zoom + 5);
    if (d < r && d < bd) { bd = d; best = n; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const n = nodoEn(sx, sy);
  if (n) { arrastrando = n; seleccion = n; mostrarInfo(n); pintarLista(); }
  else { moviendo = true; seleccion = null; }
  last = { x: sx, y: sy };
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  hover = nodoEn(sx, sy);
  if (arrastrando) {
    const p = desproyectar(sx, sy);
    arrastrando.x = p.x; arrastrando.y = p.y;
  } else if (moviendo) {
    panX -= (sx - last.x) / zoom;
    panY -= (sy - last.y) / zoom;
  }
  last = { x: sx, y: sy };
});
window.addEventListener('pointerup', () => {
  arrastrando = null; moviendo = false; canvas.classList.remove('drag');
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const antes = desproyectar(e.clientX - r.left, e.clientY - r.top);
  zoom = Math.max(0.15, Math.min(6, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  const desp = desproyectar(e.clientX - r.left, e.clientY - r.top);
  panX += antes.x - desp.x;
  panY += antes.y - desp.y;
}, { passive: false });

document.getElementById('q').addEventListener('input', (e) => {
  busqueda = e.target.value.trim();
  pintarLista();
});

function pintarChips() {
  const box = document.getElementById('layers');
  box.innerHTML = '';
  const totales = {};
  for (const n of N) totales[n.capa] = (totales[n.capa] || 0) + 1;
  for (const c of capas) {
    if (!totales[c]) continue;
    const el = document.createElement('span');
    el.className = 'chip' + (activa[c] ? '' : ' off');
    el.innerHTML = \`<span class="dot" style="background:\${COLORES[c]}"></span>\${c} \${totales[c]}\`;
    el.onclick = () => { activa[c] = !activa[c]; pintarChips(); pintarLista(); };
    box.appendChild(el);
  }
}

document.getElementById('stat').textContent =
  DATA.meta.archivos + ' archivos · ' + DATA.links.length + ' aristas · ' + DATA.meta.lineas + ' lineas';

resize();
pintarChips();
pintarLista();
bucle();
</script>
</body>
</html>`
  writeFileSync(join(OUT, 'index.html'), html, 'utf8')
}

function consultar(q) {
  const archivo = join(OUT, 'graph.json')
  if (!existsSync(archivo)) {
    console.error('no hay grafo — corre: node scripts/graphify.mjs')
    process.exit(1)
  }
  const g = JSON.parse(readFileSync(archivo, 'utf8'))
  const Y = new Map(g.nodes.map((n) => [n.id, n]))
  const t = q.toLowerCase()

  const directos = g.nodes.filter((n) =>
    n.id.toLowerCase().includes(t) || (n.comando || '').toLowerCase().includes(t) ||
    (n.desc || '').toLowerCase().includes(t) || (n.alias || []).some((a) => a.toLowerCase().includes(t))
  )
  console.log(`consulta: "${q}" — ${directos.length} coincidencias`)
  for (const n of directos.slice(0, 20)) {
    console.log(`\n${n.id}${n.comando ? `  (/${n.comando})` : ''}`)
    if (n.alias && n.alias.length) console.log(`  alias: ${n.alias.join(', ')}`)
    if (n.desc) console.log(`  ${n.desc}`)
    const dentro = g.links.filter((l) => l.target === n.id).map((l) => l.source)
    const fuera = g.links.filter((l) => l.source === n.id).map((l) => l.target)
    if (dentro.length) console.log(`  importa: ${dentro.join(', ')}`)
    if (fuera.length) console.log(`  lo importan: ${fuera.join(', ')}`)
    const vec = [...new Set([...dentro, ...fuera])].filter((v) => Y.has(v))
    if (vec.length) console.log(`  radio 1: ${vec.join(', ')}`)
  }
}

const args = process.argv.slice(2)
if (args[0] === 'query') {
  consultar(args.slice(1).join(' ') || '')
} else {
  mkdirSync(OUT, { recursive: true })
  const grafo = construirGrafo()
  writeFileSync(join(OUT, 'graph.json'), JSON.stringify(grafo, null, 2), 'utf8')
  escribirMarkdown(grafo)
  escribirHTML(grafo)
  console.log(`graphify: ${grafo.meta.archivos} archivos, ${grafo.links.length} aristas, ${grafo.meta.lineas} lineas`)
  console.log(`  ${join(OUT, 'index.html')}`)
  console.log(`  ${join(OUT, 'GRAPH.md')}`)
  console.log(`  ${join(OUT, 'graph.json')}`)
}
