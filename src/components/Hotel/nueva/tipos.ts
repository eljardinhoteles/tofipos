import type { OfertaCabana } from '../../../lib/cloudbeds';

export type Paso = 1 | 2 | 3 | 4;
export const PASOS: Array<{ n: Paso; titulo: string }> = [
  { n: 1, titulo: 'Estadía' },
  { n: 2, titulo: 'Cliente' },
  { n: 3, titulo: 'Extras' },
  { n: 4, titulo: 'Revisar' },
];

/** Lo que se configura de cada cabaña elegida: huéspedes, plan de tarifa y tarifa manual del POS. */
export interface Linea { cama: string; adultos: number; ninos: number; planRateID: string | null; manual: boolean; monto: string; motivo: string }
export type EstadoLinea = 'guardando' | 'subiendo' | 'extras' | 'ok' | 'pendiente' | 'error';

export interface PlanCabana { rateID: string | null; nombre: string; total: number }

/** Una cabaña elegida con su plan y total ya resueltos. */
export type Elegida = { o: OfertaCabana; l: Linea; planes: PlanCabana[]; plan: PlanCabana; manualValida: boolean; totalPOS: number; nombre: string; cotizado: boolean; /** Camas que admite la habitación (para el selector). */ camas: string[] };
