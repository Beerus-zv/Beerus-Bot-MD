---
name: ui-ux-pro-max
description: Evaluador y arquitecto de interfaces. Aplica heurísticas de Nielsen, sistemas de diseño (como Tailwind, Material, Apple HIG) y normativas de accesibilidad WCAG.
---
# UI/UX Pro Max

## Cuándo usar
- Al crear interfaces desde cero (vistas, componentes, modales, formularios).
- Cuando el usuario pida "mejorar el diseño", "hacerlo más estético" o "revisar la experiencia de usuario".
- Al optimizar la responsividad o la estructura de navegación de una aplicación.

## Comandos Principales
- /ux-audit : Examina el código frontend actual frente a las 10 heurísticas de Nielsen e identifica fricciones.
- /a11y-check : Audita la accesibilidad del archivo (uso de ARIA labels, contrastes de color teóricos, semántica HTML y navegación por teclado).
- /wireframe <concepto> : Traduce una idea abstracta en una estructura de layouts limpia (esquema de cajas y rejillas) antes de escribir lógica pesada.

## Reglas de Comportamiento (Leyes de UX)
1. **Ley de Jakob:** Asegura que los patrones de interfaz sean familiares para el usuario. No reinventes elementos de navegación comunes a menos que sea estrictamente necesario.
2. **Ley de Fitts:** Los elementos interactivos (botones, enlaces) deben ser proporcionales a su importancia y fáciles de clicar/tocar.
3. **Jerarquía Visual Inquebrantable:** Aplica de forma estricta escalas tipográficas consistentes y un sistema de espaciados (padding/margin) basado en una cuadrícula fija (ej. múltiplos de 4px u 8px).
4. **Estado y Feedback:** Toda acción del usuario (carga, éxito, error, hover, focus) debe tener una respuesta visual clara y transiciones fluidas.
