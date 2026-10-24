/**
 * Parche temporal: recorta descripciones largas del menu para que quepa en un mensaje.
 */
import fs from 'node:fs'

const archivo = 'lib/categorias.js'
let src = fs.readFileSync(archivo, 'utf8')

const cambios = {
  'Saluda al bot y muestra su estado': 'Saluda y muestra su estado',
  'Comprueba la velocidad de respuesta': 'Mide la velocidad de respuesta',
  'Muestra el menu con todos los comandos': 'Muestra todos los comandos',
  'Alias de /menu, muestra la ayuda': 'Alias de /menu',
  'Informacion y ajustes del grupo': 'Info y ajustes del grupo',
  'Lista los administradores del grupo': 'Lista los administradores',
  'Envia el link de invitacion del grupo': 'Envia el link de invitacion',
  'Silencia a un miembro en el grupo': 'Silencia a un miembro',
  'Solo los admins cambian los ajustes': 'Solo admins cambian ajustes',
  'Mensajes que desaparecen (0, 24h, 7d)': 'Mensajes que desaparecen',
  'Lista los grupos donde esta el bot': 'Lista los grupos del bot',
  'Reenvia el video del mensaje respondido': 'Reenvia el video respondido',
  'Bloquea enlaces: kick, ban o delete': 'Bloquea enlaces: kick, ban...',
  'Advertencias para miembros del grupo': 'Advertencias de miembros',
  'Tabla de los usuarios mas ricos': 'Tabla de los mas ricos',
  'Tira personajes y gestiona coleccion': 'Tira y gestiona personajes',
  'Adivina el numero que Beerus piensa': 'Adivina el numero de Beerus',
  'Sopa de letras con palabra escondida': 'Sopa de letras escondida',
  'Busca en la web y muestra resultados': 'Busca en la web y sus resultados',
  'Clima actual y pronostico de 3 dias': 'Clima y pronostico de 3 dias',
  'Traduce texto entre distintos idiomas': 'Traduce entre idiomas',
  'Descarga una pagina y devuelve su texto': 'Descarga una pagina web',
  'Acciones de amor (abrazo, beso...)': 'Acciones de amor',
  'Convierte texto en estilos bonitos': 'Estiliza un texto',
  'Muestra tu perfil, monedas y progreso': 'Muestra tu perfil y monedas',
  'Guarda y consulta tus notas personales': 'Guarda tus notas',
}

let aplicados = 0
for (const [viejo, nuevo] of Object.entries(cambios)) {
  const desde = `'${viejo}',`
  const hasta = `'${nuevo}',`

  if (src.includes(desde)) {
    src = src.replace(desde, hasta)
    aplicados++
  } else {
    console.warn(`No encontrado: ${viejo}`)
  }
}

fs.writeFileSync(archivo, src)
console.log(`Descripciones actualizadas: ${aplicados}/${Object.keys(cambios).length}`)
