import { useCallback, useEffect, useState } from 'react';
import { getSalud, type SaludResp } from '../lib/cloudbeds';

const CADA_MS = 5 * 60_000;

/** Estado real de la integración (conexión con Cloudbeds y último aviso). Se comprueba al abrir y cada 5 minutos. */
export function useEstadoIntegracion() {
  const [salud, setSalud] = useState<SaludResp | null>(null);
  const [error, setError] = useState('');
  const [comprobando, setComprobando] = useState(false);
  // Hora de la última comprobación: de aquí se calcula «hace X» sin leer el reloj durante el render.
  const [ahora, setAhora] = useState(() => Date.now());

  const comprobar = useCallback(async () => {
    setComprobando(true);
    try {
      setSalud(await getSalud());
      setError('');
      setAhora(Date.now());
    } catch (e) {
      // El Worker mismo no responde (red, sesión…).
      setSalud(null);
      setError(e instanceof Error ? e.message : 'No se pudo comprobar la conexión');
    } finally {
      setComprobando(false);
    }
  }, []);

  useEffect(() => {
    const primero = setTimeout(() => { void comprobar(); }, 0);
    const cada = setInterval(() => { void comprobar(); }, CADA_MS);
    return () => { clearTimeout(primero); clearInterval(cada); };
  }, [comprobar]);

  return { salud, error, comprobando, comprobar, ahora };
}
