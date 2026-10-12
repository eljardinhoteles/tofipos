// Fechas del planificador (calendario de 5 días que arranca ayer). Funciones puras: viven fuera
// del componente para no recrearlas en cada render.

export const DIAS = 5;

export const inicioDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** El calendario arranca un día antes de hoy: Ayer, Hoy, Mañana… */
export const inicioPorDefecto = () => sumarDias(inicioDe(new Date()), -1);

const mesLargo = (d: Date) => d.toLocaleDateString('es', { month: 'long' });

/** "10 de octubre" */
export const fechaCorta = (d: Date) => `${d.getDate()} de ${mesLargo(d)}`;


/** "Hoy - Sábado", "Mañana - Domingo", "Ayer - Viernes" o el nombre del día. `f` y las referencias son YYYY-MM-DD. */
export function nombreDia(d: Date, f: string, hoy: string, ayer: string, manana: string): string {
  const dia = d.toLocaleDateString('es', { weekday: 'long' });
  const Dia = dia.charAt(0).toUpperCase() + dia.slice(1);
  return f === hoy ? `Hoy - ${Dia}` : f === manana ? `Mañana - ${Dia}` : f === ayer ? `Ayer - ${Dia}` : Dia;
}

/** Anchos mínimos (clases estáticas para Tailwind): el día en edición es más ancho para que el sidebar no lo comprima. */
export const MIN_ANCHO_DIA = 'min-w-[190px]';
export const MIN_ANCHO_EDITANDO = 'min-w-[300px]';

/** Color de la columna de hoy (cabecera y celdas): un solo lugar para cambiarlo. */
export const HOY_CABECERA = 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] shadow-[inset_0_-3px_0_var(--primary)]';
export const HOY_CELDA = 'bg-primary/[0.06]';
export const HOY_TEXTO = 'text-primary';
