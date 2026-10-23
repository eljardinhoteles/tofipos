import dayjs from 'dayjs';

export const dinero = (n: number) => `$${n.toFixed(2)}`;
export const fechaCorta = (f: string) => dayjs(f).format('DD/MM/YYYY');
export const fechaLarga = (f: string) => dayjs(f).format('ddd D MMM YYYY');
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
export const etiquetaCampo = 't-etiqueta! text-muted-foreground';
export const EPS = 0.005;

/** Totales de un grupo de habitaciones: lo que se cobra (POS) y lo ya pagado. Si comparten venta, sus pagos se cuentan una sola vez. */
export function totalesGrupo(
  filas: Array<{ total: number; ventaId?: string | null; venta?: { anulado?: boolean; totalPagado: number } }>,
) {
  const total = filas.reduce((a, f) => a + f.total, 0);
  const vistas = new Set<string>();
  let pagado = 0;
  for (const f of filas) {
    if (!f.venta || f.venta.anulado) continue;
    const clave = f.ventaId ?? `anon-${vistas.size}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    pagado += f.venta.totalPagado;
  }
  return { total, pagado, saldo: Math.max(0, total - pagado) };
}
