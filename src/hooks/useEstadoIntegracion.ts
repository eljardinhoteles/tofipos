import { useCallback, useEffect, useRef, useState } from 'react';
import { getSalud, type SaludResp } from '../lib/cloudbeds';

const CADA_MS = 5 * 60_000;
/** Tras un fallo se reintenta pronto (15 s, 30 s…) en vez de esperar 5 minutos. */
const ESPERAS_MS = [15_000, 30_000, 60_000];
/** Fallos seguidos a partir de los cuales ya no es «reconectando» sino una falla (rojo). */
const FALLOS_PARA_ROJO = 3;

/**
 * Estado real de la integración (conexión con Cloudbeds y último aviso). Se comprueba al abrir y cada 5 minutos. Un fallo suelto casi
 * siempre es pasajero (Cloudbeds lento): se reintenta pronto y mientras tanto se muestra «reconectando» (`reconectando`, con la hora
 * del próximo intento en `proximoIntento`) en vez de dar la conexión por caída; solo tras varios fallos seguidos se considera una falla.
 */
export function useEstadoIntegracion() {
  const [salud, setSalud] = useState<SaludResp | null>(null);
  const [error, setError] = useState('');
  const [comprobando, setComprobando] = useState(false);
  // Hora de la última comprobación: de aquí se calcula «hace X» sin leer el reloj durante el render.
  const [ahora, setAhora] = useState(() => Date.now());
  const [fallos, setFallos] = useState(0);
  const [proximoIntento, setProximoIntento] = useState<number | null>(null);
  const fallosRef = useRef(0);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comprobarRef = useRef<() => Promise<void>>(async () => undefined);

  const limpiarReintento = () => { if (reintento.current) { clearTimeout(reintento.current); reintento.current = null; } };

  const registrarFallo = useCallback(() => {
    fallosRef.current += 1;
    setFallos(fallosRef.current);
    limpiarReintento();
    const espera = ESPERAS_MS[fallosRef.current - 1];
    if (espera) {
      setProximoIntento(Date.now() + espera);
      reintento.current = setTimeout(() => { void comprobarRef.current(); }, espera);
    } else {
      setProximoIntento(null);
    }
  }, []);

  const comprobar = useCallback(async () => {
    setComprobando(true);
    try {
      const s = await getSalud();
      setSalud(s);
      setError('');
      setAhora(Date.now());
      if (s.cloudbeds.ok) {
        fallosRef.current = 0;
        setFallos(0);
        setProximoIntento(null);
        limpiarReintento();
      } else {
        registrarFallo();
      }
    } catch (e) {
      // El Worker mismo no responde (red, sesión…).
      setSalud(null);
      setError(e instanceof Error ? e.message : 'No se pudo comprobar la conexión');
      registrarFallo();
    } finally {
      setComprobando(false);
    }
  }, [registrarFallo]);

  useEffect(() => { comprobarRef.current = comprobar; }, [comprobar]);

  useEffect(() => {
    const primero = setTimeout(() => { void comprobar(); }, 0);
    const cada = setInterval(() => { void comprobar(); }, CADA_MS);
    return () => { clearTimeout(primero); clearInterval(cada); limpiarReintento(); };
  }, [comprobar]);

  const reconectando = fallos > 0 && fallos < FALLOS_PARA_ROJO;
  return { salud, error, comprobando, comprobar, ahora, reconectando, proximoIntento };
}
