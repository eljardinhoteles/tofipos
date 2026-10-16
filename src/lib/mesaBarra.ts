import { initVerticalRxDb } from '../db/rxdb';

// Venta directa (barra): una mesa virtual por organización que reutiliza todo
// el flujo de Mesas (Mesa Múltiple, precuenta, cierre → Centro de Ventas). Vive
// en un piso reservado que no existe en la colección `pisos`, así que nunca
// se pinta en el mapa; los listados donde se elige una mesa la excluyen con
// `esMesaBarra`.
export const PISO_BARRA = '__barra__';
export const NOMBRE_MESA_BARRA = 'Directa';

export function esMesaBarra(mesa: { piso?: string | null } | null | undefined): boolean {
  return mesa?.piso === PISO_BARRA;
}

// Id determinista por organización: dos equipos que la creen a la vez generan
// el mismo documento y no quedan dos barras tras sincronizar.
function idMesaBarra(orgId: string): string {
  return `${orgId.slice(0, 24)}ba4ba4ba4ba4`;
}

export async function obtenerOCrearMesaBarra(): Promise<string> {
  const orgId = localStorage.getItem('pos_active_org_id') || '';
  if (!orgId) throw new Error('Sin organización activa');
  const db = await initVerticalRxDb();
  const id = idMesaBarra(orgId);
  const existente = await db.mesas.findOne(id).exec();
  if (existente) {
    if ((existente as any)._deleted) {
      await existente.update({ $set: { _deleted: false, _modified: new Date().toISOString() } } as any);
    }
    return id;
  }
  await db.mesas.insert({
    id,
    nombre: NOMBRE_MESA_BARRA,
    estado: 'libre',
    piso: PISO_BARRA,
    capacidad: 0,
    organization_id: orgId,
    _deleted: false,
    _modified: new Date().toISOString(),
  });
  return id;
}
