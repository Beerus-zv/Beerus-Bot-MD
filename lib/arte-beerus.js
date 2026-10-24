/**
 * Arte propio de Beerus en pose imperial: el Dios de la Destruccion.
 * SVG vectorial que se rasteriza a PNG con sharp para el banner del menu.
 */
export const SVG_BEERUS = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="900" viewBox="0 0 700 900">
  <defs>
    <radialGradient id="fondo" cx="50%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#4c1d95"/>
      <stop offset="55%" stop-color="#2e1065"/>
      <stop offset="100%" stop-color="#08040f"/>
    </radialGradient>
    <linearGradient id="piel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="45%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
    <linearGradient id="pielOsc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#5b21b6"/>
    </linearGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="45%" stop-color="#f5b301"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <linearGradient id="tunica" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
    <linearGradient id="faldon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#7c3aed" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="luna" cx="42%" cy="38%" r="60%">
      <stop offset="0%" stop-color="#fef9c3"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </radialGradient>
    <linearGradient id="rayo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde68a" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fde68a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Fondo -->
  <rect width="700" height="900" fill="url(#fondo)"/>
  <circle cx="350" cy="330" r="300" fill="url(#aura)"/>

  <!-- Luna -->
  <g>
    <circle cx="556" cy="120" r="86" fill="url(#luna)" opacity="0.95"/>
    <circle cx="600" cy="98" r="80" fill="#1c1040" opacity="0.92"/>
  </g>

  <!-- Estrellas -->
  <g fill="#f5f3ff">
    <circle cx="90" cy="90" r="3" opacity="0.9"/>
    <circle cx="180" cy="60" r="2" opacity="0.7"/>
    <circle cx="640" cy="330" r="2.5" opacity="0.8"/>
    <circle cx="60" cy="420" r="2" opacity="0.6"/>
    <circle cx="250" cy="120" r="2" opacity="0.7"/>
    <circle cx="620" cy="560" r="3" opacity="0.6"/>
    <circle cx="90" cy="700" r="2.5" opacity="0.5"/>
    <circle cx="350" cy="60" r="2" opacity="0.6"/>
  </g>

  <!-- Rayos de energia -->
  <g opacity="0.16">
    <path d="M40 800 L150 180 L192 180 L96 800 Z" fill="url(#rayo)"/>
    <path d="M636 800 L664 210 L700 210 L676 800 Z" fill="url(#rayo)"/>
  </g>

  <!-- Plataforma / trono -->
  <ellipse cx="350" cy="836" rx="230" ry="46" fill="#1b1039" opacity="0.9"/>
  <ellipse cx="350" cy="826" rx="200" ry="36" fill="#4c1d95" opacity="0.8"/>
  <ellipse cx="350" cy="822" rx="150" ry="24" fill="#7c3aed" opacity="0.45"/>


  <!-- Manto imperial (detras de todo) -->
  <path d="M274 392 C196 464 186 632 220 792 L480 792 C514 632 504 464 426 392 Z" fill="#3a1d85" opacity="0.9"/>
  <path d="M274 392 C196 464 186 632 220 792" fill="none" stroke="#f5b301" stroke-width="5" opacity="0.6"/>
  <path d="M426 392 C504 464 514 632 480 792" fill="none" stroke="#f5b301" stroke-width="5" opacity="0.6"/>
  <path d="M220 792 L480 792 L468 812 L232 812 Z" fill="#1a0b3d"/>
  <g stroke="#5b21b6" stroke-width="3" fill="none" opacity="0.55">
    <path d="M256 430 C238 540 236 680 244 786"/>
    <path d="M444 430 C462 540 464 680 456 786"/>
  </g>

  <!-- Cola (detras) -->
  <path d="M420 560 C540 600 596 700 566 800 C556 838 520 852 494 836"
        fill="none" stroke="url(#pielOsc)" stroke-width="34" stroke-linecap="round"/>
  <path d="M420 560 C540 600 596 700 566 800 C556 838 520 852 494 836"
        fill="none" stroke="#5b21b6" stroke-width="14" stroke-linecap="round" opacity="0.45"/>

  <!-- Piernas -->
  <path d="M300 682 L348 682 L342 748 L336 812 L302 812 L306 748 Z" fill="url(#pielOsc)"/>
  <path d="M354 682 L402 682 L396 748 L400 812 L366 812 L360 748 Z" fill="url(#piel)"/>
  <!-- Sandalias -->
  <path d="M294 806 L342 806 L336 834 L284 834 Z" fill="url(#oro)"/>
  <path d="M360 806 L408 806 L416 834 L362 834 Z" fill="url(#oro)"/>
  <path d="M284 834 L336 834 L334 846 L282 846 Z" fill="#b45309"/>
  <path d="M362 834 L414 834 L418 846 L364 846 Z" fill="#b45309"/>

  <!-- Faldon -->
  <path d="M262 520 L438 520 L462 700 L238 700 Z" fill="url(#faldon)"/>
  <path d="M262 520 L438 520 L444 556 L256 556 Z" fill="#1e3a8a"/>
  <path d="M350 592 L378 636 L350 680 L322 636 Z" fill="#f97316"/>
  <path d="M350 592 L378 636 L350 680 L322 636 Z" fill="none" stroke="#fed7aa" stroke-width="4"/>

  <!-- Torso / tunica -->
  <path d="M284 368 L416 368 L438 524 L262 524 Z" fill="url(#tunica)"/>
  <path d="M284 368 L350 368 L350 524 L262 524 Z" fill="#6d28d9" opacity="0.5"/>
  <!-- Peto -->
  <path d="M302 372 L398 372 L392 460 L308 460 Z" fill="#2e1065"/>
  <path d="M350 388 L372 424 L350 456 L328 424 Z" fill="#f97316"/>
  <path d="M350 388 L372 424 L350 456 L328 424 Z" fill="none" stroke="#fed7aa" stroke-width="4"/>
  <!-- Hombros -->
  <ellipse cx="288" cy="388" rx="32" ry="25" fill="url(#piel)"/>
  <ellipse cx="412" cy="388" rx="32" ry="25" fill="url(#piel)"/>

  <!-- Cinturon -->
  <path d="M258 516 L442 516 L442 556 L258 556 Z" fill="url(#oro)"/>
  <path d="M330 516 L370 516 L370 556 L330 556 Z" fill="#b45309" opacity="0.35"/>
  <path d="M350 520 L368 536 L350 552 L332 536 Z" fill="#0f172a"/>

  <!-- Brazo derecho (mano en la cintura) -->
  <path d="M420 390 C472 404 498 458 470 504 L424 490 C442 452 430 424 400 414 Z" fill="url(#piel)"/>
  <ellipse cx="436" cy="502" rx="27" ry="23" fill="url(#pielOsc)"/>
  <path d="M416 492 C430 497 448 497 462 492" fill="none" stroke="#5b21b6" stroke-width="4" opacity="0.5"/>

  <!-- Brazo izquierdo (gesto de destruccion) -->
  <path d="M284 386 C232 396 196 350 186 300 L232 288 C240 322 262 342 292 340 Z" fill="url(#piel)"/>
  <!-- Mano con dedos -->
  <g>
    <path d="M186 306 C160 292 140 268 138 240 C137 226 148 218 158 228 L176 252
             L172 206 C171 192 186 188 192 200 L200 240 L204 194 C205 180 220 179 224 193
             L226 240 L236 202 C240 189 254 191 255 205 L252 250
             C252 274 228 296 206 306 Z" fill="url(#pielOsc)"/>
    <path d="M190 300 C214 292 234 274 242 252" fill="none" stroke="#5b21b6" stroke-width="4" opacity="0.6"/>
  </g>

  <!-- Collar -->
  <path d="M280 356 L420 356 L414 384 L286 384 Z" fill="url(#oro)"/>
  <path d="M350 356 L368 356 L368 384 L350 384 Z" fill="#22d3ee" opacity="0.85"/>


  <!-- Cabeza -->
  <ellipse cx="350" cy="252" rx="104" ry="96" fill="url(#piel)"/>
  <!-- Mejillas -->
  <ellipse cx="296" cy="292" rx="22" ry="12" fill="#c4b5fd" opacity="0.28"/>
  <ellipse cx="404" cy="292" rx="22" ry="12" fill="#c4b5fd" opacity="0.28"/>

  <!-- Orejas -->
  <path d="M264 208 L202 98 L304 156 Z" fill="url(#piel)"/>
  <path d="M436 208 L498 98 L396 156 Z" fill="url(#piel)"/>
  <path d="M272 194 L238 130 L290 164 Z" fill="#4c1d95" opacity="0.5"/>
  <path d="M428 194 L462 130 L410 164 Z" fill="#4c1d95" opacity="0.5"/>

  <!-- Mechones laterales -->
  <path d="M256 198 C236 258 242 318 264 356 L296 328 C278 286 280 238 296 198 Z" fill="#e9d5ff" opacity="0.9"/>
  <path d="M444 198 C464 258 458 318 436 356 L404 328 C422 286 420 238 404 198 Z" fill="#e9d5ff" opacity="0.9"/>

  <!-- Melena clara (flequillo) -->
  <path d="M250 240 C248 150 296 114 350 114 C404 114 452 150 450 240
           C440 198 424 176 398 162 L378 198 L352 156 L328 198 L304 164 L282 198
           C266 206 256 222 250 240 Z" fill="#ffffff"/>
  <path d="M262 228 C272 182 306 156 350 156 C394 156 428 182 438 228
           C428 198 396 180 350 180 C304 180 272 198 262 228 Z" fill="#ddd6fe" opacity="0.75"/>

  <!-- Ojos dorados -->
  <g>
    <ellipse cx="300" cy="272" rx="34" ry="30" fill="#fde047"/>
    <ellipse cx="400" cy="272" rx="34" ry="30" fill="#fde047"/>
    <ellipse cx="300" cy="272" rx="13" ry="27" fill="#1c1917"/>
    <ellipse cx="400" cy="272" rx="13" ry="27" fill="#1c1917"/>
    <circle cx="288" cy="258" r="8" fill="#ffffff" opacity="0.95"/>
    <circle cx="388" cy="258" r="8" fill="#ffffff" opacity="0.95"/>
    <circle cx="311" cy="288" r="4" fill="#ffffff" opacity="0.45"/>
    <circle cx="411" cy="288" r="4" fill="#ffffff" opacity="0.45"/>
    <path d="M264 240 L334 246" stroke="#4c1d95" stroke-width="8" stroke-linecap="round" fill="none"/>
    <path d="M366 246 L436 240" stroke="#4c1d95" stroke-width="8" stroke-linecap="round" fill="none"/>
  </g>

  <!-- Nariz y sonrisa -->
  <path d="M350 294 L344 308 L356 308" fill="none" stroke="#5b21b6" stroke-width="5" stroke-linecap="round"/>
  <path d="M312 318 C330 340 370 340 388 318" fill="none" stroke="#2e1065" stroke-width="8" stroke-linecap="round"/>
  <path d="M326 324 C338 332 362 332 374 324" fill="#f9a8d4" opacity="0.6"/>
  <path d="M332 328 L339 332 L346 328" fill="#ffffff" opacity="0.85"/>

  <!-- Corona -->
  <path d="M244 176 L266 94 L306 138 L350 62 L394 138 L434 94 L456 176 Z" fill="url(#oro)"/>
  <path d="M244 176 L266 94 L306 138 L350 62 L394 138 L434 94 L456 176" fill="none" stroke="#fef3c7" stroke-width="3" opacity="0.55"/>
  <rect x="244" y="170" width="212" height="24" rx="12" fill="url(#oro)"/>
  <circle cx="350" cy="182" r="11" fill="#fde047"/>
  <circle cx="272" cy="182" r="7" fill="#22d3ee"/>
  <circle cx="428" cy="182" r="7" fill="#22d3ee"/>

  <!-- Chispas de poder -->
  <g stroke="#fde68a" stroke-width="4" stroke-linecap="round" opacity="0.8">
    <path d="M120 230 L148 244"/>
    <path d="M108 262 L140 268"/>
    <path d="M130 296 L158 292"/>
    <path d="M560 470 L586 458"/>
    <path d="M578 506 L606 502"/>
  </g>
</svg>
`
