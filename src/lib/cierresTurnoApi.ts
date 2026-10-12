import { supabase } from './supabase';
import type { CierreTurno, OrigenCierre } from './cierreTurno';
import type { DatosTicketCierre } from '../services/printTemplateEngine';

/**
 * Los cierres de turno viven en Supabase (`cierres_turno`) y no en RxDB: la app los lee y los escribe directo,
 * por eso guardar un cierre exige conexión. Ver supabase/migrations/20261012000100_cierres_turno.sql.
 */
export interface NuevoCierreTurno {
  id: string;
  /** Día de caja que se cierra, en formato AAAA-MM-DD. */
  fechaDia: string;
  usuarioId?: string;
  usuarioNombre: string;
  origenes: OrigenCierre[];
  totalCobrado: number;
  totalReembolsado: number;
  pagos: CierreTurno['pagos'];
  novedades: string;
  ticket: DatosTicketCierre;
}

/** Guarda el cierre. Reintentar con el mismo `id` no lo duplica. */
export async function guardarCierreTurno(c: NuevoCierreTurno): Promise<void> {
  const orgId = localStorage.getItem('pos_active_org_id') || '';
  const { error } = await supabase.from('cierres_turno').upsert({
    id: c.id,
    organization_id: orgId,
    fecha_dia: c.fechaDia,
    usuario_id: c.usuarioId ?? null,
    usuario_nombre: c.usuarioNombre,
    origenes: c.origenes,
    total_cobrado: c.totalCobrado,
    total_reembolsado: c.totalReembolsado,
    pagos: c.pagos,
    novedades: c.novedades,
    resumen: c.ticket,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Cierres guardados de un día de caja (AAAA-MM-DD), el más reciente primero. */
export async function listarCierresDelDia(fechaDia: string): Promise<CierreTurno[]> {
  const orgId = localStorage.getItem('pos_active_org_id') || '';
  const { data, error } = await supabase
    .from('cierres_turno')
    .select('id, fecha_dia, fecha_cierre, usuario_nombre, origenes, total_cobrado, total_reembolsado, pagos, novedades, resumen')
    .eq('organization_id', orgId)
    .eq('fecha_dia', fechaDia)
    .order('fecha_cierre', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha_dia: r.fecha_dia,
    fecha_cierre: r.fecha_cierre,
    usuario_nombre: r.usuario_nombre,
    origenes: r.origenes ?? [],
    total_cobrado: Number(r.total_cobrado) || 0,
    total_reembolsado: Number(r.total_reembolsado) || 0,
    pagos: { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, ...(r.pagos ?? {}) },
    novedades: r.novedades ?? '',
    ticket: r.resumen && Object.keys(r.resumen).length > 0 ? (r.resumen as DatosTicketCierre) : null,
  }));
}
