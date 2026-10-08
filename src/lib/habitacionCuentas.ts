// Fuente única de "cuenta de habitación vigente": las listas donde se elige una
// habitación (abrir mesa vinculada, enviar cargo) deben coincidir con el
// contador del botón Hotel, no mostrar cuentas viejas, de otra organización o
// cuya habitación ya no existe. Devuelve las cuentas ordenadas por número de habitación.

type CuentaLike = {
  id: string;
  mesa_id: string;
  estado?: string;
  organization_id?: string;
  check_in?: string;
  created_at?: string;
  _deleted?: boolean;
};

type MesaLike = {
  id: string;
  nombre?: string;
  piso?: string | null;
  _deleted?: boolean;
};

export function filtrarCuentasHabitacionVigentes<C extends CuentaLike>(
  cuentas: C[],
  mesas: MesaLike[],
  orgId: string = localStorage.getItem('pos_active_org_id') || ''
): C[] {
  const mesasHabitacion = new Map(
    mesas
      .filter(m => !m._deleted && m.piso?.toLowerCase() === 'habitaciones')
      .map(m => [m.id, m] as const)
  );

  // Una sola cuenta vigente por habitación: si por sincronización quedaron dos
  // 'activa' sobre la misma mesa, gana la más reciente.
  const porMesa = new Map<string, C>();
  for (const c of cuentas) {
    if (c.estado !== 'activa' || c._deleted) continue;
    if (orgId && c.organization_id !== orgId) continue;
    if (!mesasHabitacion.has(c.mesa_id)) continue;
    const previa = porMesa.get(c.mesa_id);
    const fecha = (x: C) => x.check_in || x.created_at || '';
    if (!previa || fecha(c) > fecha(previa)) porMesa.set(c.mesa_id, c);
  }
  // Orden numérico por número de habitación (2, 3, 5, 11), no por orden de llegada.
  const numero = (c: C) => {
    const nombre = mesasHabitacion.get(c.mesa_id)?.nombre ?? '';
    const n = nombre.match(/Hab\.\s*(\d+)/)?.[1] ?? nombre.match(/\d+/)?.[0];
    return n ? parseInt(n, 10) : Number.MAX_SAFE_INTEGER;
  };
  return [...porMesa.values()].sort((a, b) =>
    numero(a) - numero(b) ||
    (mesasHabitacion.get(a.mesa_id)?.nombre ?? '').localeCompare(mesasHabitacion.get(b.mesa_id)?.nombre ?? '', 'es', { numeric: true })
  );
}
