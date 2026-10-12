import { useCallback, useEffect, useState } from 'react';
import { listarCierresDelDia } from '../lib/cierresTurnoApi';
import type { CierreTurno } from '../lib/cierreTurno';

/** Cierres guardados de un día (AAAA-MM-DD). `recargar` vuelve a consultar, p. ej. tras guardar uno. */
export function useCierresDelDia(fechaDia: string) {
  const [cierres, setCierres] = useState<CierreTurno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    listarCierresDelDia(fechaDia)
      .then(c => { if (vivo) { setCierres(c); setError(null); } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [fechaDia, version]);

  const recargar = useCallback(() => setVersion(v => v + 1), []);
  return { cierres, cargando, error, recargar };
}
