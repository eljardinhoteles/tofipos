// Textos fijos del documento de cotización, por idioma. Hoy solo español; el inglés se agrega aquí cuando los planes y extras tengan su nombre en inglés.

export type Idioma = 'es' | 'en';

export interface TextosCotizacion {
  titulo: string;
  numero: string;
  emitida: string;
  valida: string;
  preparadaPara: string;
  estadia: string;
  llegada: string;
  salida: string;
  noches: (n: number) => string;
  nochesTitulo: string;
  huespedes: string;
  adultos: (n: number) => string;
  ninos: (n: number) => string;
  alojamiento: string;
  habitacion: string;
  ocupacion: string;
  cama: string;
  vista: string;
  precio: string;
  plan: string;
  incluidoEnTarifa: string;
  extras: string;
  cortesias: string;
  cortesia: string;
  notas: string;
  precioFinal: string;
  impuestosIncluidos: string;
  sujetaDisponibilidad: string;
  fechasPorDefinir: string;
  notaReferencial: string;
  vigencia: (hasta: string) => string;
  locale: string;
}

const ES: TextosCotizacion = {
  titulo: 'Cotización',
  numero: 'N.º',
  emitida: 'Emitida',
  valida: 'Válida hasta',
  preparadaPara: 'Preparada para',
  estadia: 'Tu estadía',
  llegada: 'Llegada',
  salida: 'Salida',
  noches: (n) => `${n} ${n === 1 ? 'noche' : 'noches'}`,
  nochesTitulo: 'Noches',
  huespedes: 'Huéspedes',
  adultos: (n) => `${n} ${n === 1 ? 'adulto' : 'adultos'}`,
  ninos: (n) => `${n} ${n === 1 ? 'niño' : 'niños'}`,
  alojamiento: 'Alojamiento',
  habitacion: 'Habitación',
  ocupacion: 'Ocupación',
  cama: 'Cama',
  vista: 'Vista',
  precio: 'Precio',
  plan: 'Plan de alimentación',
  incluidoEnTarifa: 'Incluido en la tarifa',
  extras: 'Extras y actividades',
  cortesias: 'Cortesías',
  cortesia: 'Cortesía',
  notas: 'Notas',
  precioFinal: 'Precio final',
  impuestosIncluidos: 'Impuestos incluidos',
  sujetaDisponibilidad: 'Cotización sujeta a disponibilidad hasta confirmar la reserva.',
  fechasPorDefinir: 'Fechas por definir',
  notaReferencial: 'Precio de referencia: puede variar según las fechas, la temporada y la disponibilidad.',
  vigencia: (hasta) => `Vigente hasta el ${hasta}.`,
  locale: 'es',
};

export const TEXTOS: Record<Idioma, TextosCotizacion> = { es: ES, en: ES };
