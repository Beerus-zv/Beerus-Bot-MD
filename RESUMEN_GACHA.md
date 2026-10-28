Completado — sincronización del gacha con AniList

Tests: 114/114 OK (`npm test`)

Cambios (6 archivos):
- `lib/anilist.js` — `ALIAS_ANILIST`, `FIJOS_ANILIST`, `terminosDeBusqueda`, `palabras`, `mismaSerie`, `puntuarCandidato`, `elegirCandidato` (distinge homónimos por serie).
- `lib/gacha-internet.js` — `buscarEnAniList` usa `Page.characters(search:, sort: SEARCH_MATCH)` (antes `Character` daba 404 con nombres como "Ryomen Sukuna"), `candidatosDeBusqueda`, `personajePorId`, y `sincronizarRarezas` reporta `duplicados` y `sinDatos`.
- `scripts/sincronizar-rarezas.mjs` — imprime duplicados y filas sin datos al final.
- `commands/gacha.js` — `.gacha sync` muestra duplicados y sin datos en la respuesta.
- `verify.mjs` — pruebas para los nuevos emparejamientos.
- `database/catalogo.js` — `Lelouch vi Britannia` → `Lelouch Lamperouge`.

Beerus raro (1.213 favoritos): se dejó en raro (regla única intacta).

Resultados de la sync:
- 372 filas totales (borrado: Lelouch vi Britannia id 117, Sasha Braus id 23, Robin Nico id 234, Darwis id 31).
- Duplicados detectados: Ryomen Sukuna, L, Rengoku Kyojuro, Aizen Sosuke (mismo personaje que otra fila).
- Sin datos: Steven Universe, Patrick Star, Ezio Auditore, Exodia, Vi, Dark Magician, Blue-Eyes White Dragon (limites de coincidencia de AniList; conservan rareza manual).
- Reparto: épico 152 · mítico 60 · legendario 118 · común 20 · raro 22.

Backup de DB: `tmp/backup/beerus-2026-10-28-antes-limpieza.db`.

Pendiente del usuario: reiniciar el bot (él mismo indicó que lo hace cuando quiera).
