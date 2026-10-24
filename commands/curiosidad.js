/** Datos curiosos para el comando /curiosidad (lista local, sin APIs) */
const CURIOSIDADES = [
  'El corazon de una ballena azul es tan grande que un humano podria nadar por sus arterias.',
  'Los pulpos tienen tres corazones y su sangre es de color azul.',
  'Un rayo es unas 5 veces mas caliente que la superficie del sol.',
  'Los gatos no pueden saborear lo dulce.',
  'La miel nunca se echa a perder: se hallaron tarros comestibles de mas de 3000 anos en Egipto.',
  'El primer movil comercial (Motorola DynaTAC, 1983) pesaba casi un kilo y costaba 3995 dolares.',
  'Los tiburones existian antes que los arboles, unos 250 millones de anos antes.',
  'De promedio, una persona pasa unos 6 meses de su vida esperando en semaforos.',
  'La Torre Eiffel crece unos 15 cm en verano por la dilatacion del metal.',
  'El 80% del oceano nunca ha sido explorado ni mapeado por el ser humano.',
  'Los pandas gigantes dedican casi 14 horas al dia a comer bambu.',
  'La primera webcam de la historia se invento en Cambridge para vigilar una tetera.',
  'La medusa Turritopsis dohrnii puede revertir su ciclo vital: se le llama biologicamente inmortal.',
  'La computadora de guia del Apolo 11 tenia menos potencia que una calculadora moderna.',
  'La palabra "chocolate" viene del nahuatl "xocolatl", que significa agua amarga.',
  'El acido estomacal humano es tan fuerte que podria corroer metal: el estomago renueva su mucosa cada pocos dias.',
  'Las hormigas no tienen pulmones: respiran por orificios de su cuerpo llamados espiraculos.',
  'Botanicamente hablando, la banana es una baya, pero la fresa no lo es.',
  'Sudafrica tiene tres capitales: Pretoria, Ciudad del Cabo y Bloemfontein.',
  'Las abejas pueden aprender a reconocer rostros humanos.',
  'En Japon viven mas de 80 mil personas mayores de 100 anos.',
  'El sonido viaja unas 4 veces mas rapido por el agua que por el aire.',
  'La Gran Muralla China no se ve desde la Luna a simple vista.',
  'El billete de dolar se fabrica con una mezcla de lino y algodon, no con papel comun.',
  'Un cactus saguaro puede almacenar varios miles de litros de agua en su interior.',
  'El cerebro humano genera unos 12 vatios de energia: suficiente para una bombilla eficiente.',
  'Venus es el planeta mas caliente del sistema solar, aunque Mercurio este mas cerca del sol.',
  'Los pulpos pueden resolver laberintos y abrir frascos rosca.',
  'Saturno es tan poco denso que flotaria en una piscina lo bastante grande.',
  'El primer correo electronico de la historia se envio en 1971, junto con el uso del simbolo @.',
]

/**
 * Comparte un dato curioso (basado en el plugin 'fact' de MEGA-MD).
 */
export default async ({ sock, jid, msg }) => {
  const dato = CURIOSIDADES[Math.floor(Math.random() * CURIOSIDADES.length)]
  await sock.sendMessage(jid, {
    text: `🧠 *Dato curioso*\n\n_${dato}_`,
    quoted: msg,
  })
}
