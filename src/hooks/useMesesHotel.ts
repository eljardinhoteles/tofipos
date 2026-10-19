import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { bloques, cargarMes, mesMas, oyentes, vigente } from '../lib/hotelCalendarioCache';

/** Repinta el componente cuando llegan tarjetas nuevas a la caché compartida (las cargue quien las cargue). */
export function useCacheCalendario() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    oyentes.add(tick);
    return () => { oyentes.delete(tick); };
  }, []);
}

/**
 * Mantiene cargados los meses indicados en la caché compartida de tarjetas del hotel y precarga los vecinos en segundo
 * plano. Se repinta solo cuando llegan datos (también los que el Worker refresca por detrás) y al volver a la pestaña.
 * Devuelve `recargar(true)` para forzar una consulta en vivo a Cloudbeds.
 */
export function useMesesHotel(meses: string[], version: number, adelante = 2, atras = 1) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const [, refrescar] = useReducer((n: number) => n + 1, 0);
  const ronda = useRef(0);
  const versionVista = useRef(version);
  const clave = meses.join(',');

  const asegurar = useCallback(async (forzar = false) => {
    const lista = clave.split(',').filter(Boolean);
    const mio = ++ronda.current;
    // Tras crear, cancelar o cambiar algo desde el POS se consulta a Cloudbeds en vivo, sin esperar al refresco de fondo.
    const cambioPropio = versionVista.current !== version;
    versionVista.current = version;
    const vivo = forzar || cambioPropio;
    const faltan = lista.filter((m) => vivo || !vigente(bloques.get(m), version));
    setError('');
    if (faltan.length > 0) {
      setCargando(true);
      const resultados = await Promise.allSettled(faltan.map((m) => cargarMes(m, version, vivo)));
      if (mio !== ronda.current) return;
      refrescar();
      setCargando(false);
      const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (fallo) setError(fallo.reason instanceof Error ? fallo.reason.message : 'No se pudo consultar Cloudbeds');
    } else {
      setCargando(false);
    }
    // Precarga de los meses vecinos, de uno en uno (la API de Cloudbeds tiene límite de peticiones).
    const cola = [
      ...Array.from({ length: adelante }, (_, i) => mesMas(lista[lista.length - 1], i + 1)),
      ...Array.from({ length: atras }, (_, i) => mesMas(lista[0], -(i + 1))),
    ];
    for (const m of cola) {
      if (mio !== ronda.current) return;
      if (vigente(bloques.get(m), version)) continue;
      try { await cargarMes(m, version); if (mio === ronda.current) refrescar(); } catch { /* es solo precarga */ }
    }
  }, [clave, version, adelante, atras]);

  useEffect(() => {
    oyentes.add(refrescar);
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    const alVolver = () => { if (document.visibilityState === 'visible') void asegurar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { oyentes.delete(refrescar); clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); };
  }, [asegurar]);

  // Se lanza en un temporizador (no síncrono dentro del efecto) y se cancela si los meses cambian antes.
  useEffect(() => {
    const t = setTimeout(() => { void asegurar(); }, 0);
    return () => clearTimeout(t);
  }, [asegurar]);

  const marcas = clave.split(',').map((m) => bloques.get(m)?.actualizado).filter((x): x is number => typeof x === 'number');
  const antiguedad = marcas.length > 0 ? Math.max(0, ahora - Math.min(...marcas)) : null;

  return { cargando, error, antiguedad, recargar: asegurar };
}
