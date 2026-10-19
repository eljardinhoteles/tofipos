import { useEffect, useState } from 'react';
import { listarPlanes, type PlanAlimentacion } from '../lib/hotelPlanesApi';

/** Planes de alimentación activos de la organización (se consultan una vez al montar). `defecto` es el predeterminado, si hay. */
export function usePlanesAlimentacion() {
  const [planes, setPlanes] = useState<PlanAlimentacion[]>([]);
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    let vigente = true;
    listarPlanes()
      .then((p) => { if (vigente) setPlanes(p.filter((x) => x.activo)); })
      .catch(() => { /* sin planes: el módulo funciona igual */ })
      .finally(() => { if (vigente) setCargado(true); });
    return () => { vigente = false; };
  }, []);
  return { planes, cargado, defecto: planes.find((p) => p.por_defecto) ?? null };
}
