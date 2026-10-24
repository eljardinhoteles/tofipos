import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { headerIconButtonClass } from '../Common/PageHeader';
import { useCacheCalendario } from '../../hooks/useMesesHotel';
import dayjs from 'dayjs';
import { cargarMes, consultando, hace, hayFalloConsulta, refrescarCercanos, ultimaConsulta } from '../../lib/hotelCalendarioCache';

/**
 * Texto de estado de la última consulta a Cloudbeds («Actualizando…» o «hace 2 min»), para el subtítulo del header del Hotel.
 * Se repinta cuando llegan datos a la caché del calendario y cada 15 s para el «hace…».
 */
export function TextoSincronizacion() {
  useCacheCalendario();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);
  const ultima = ultimaConsulta();
  const texto = consultando() ? 'Actualizando…' : ultima !== null ? `hace ${hace(Math.max(0, ahora - ultima))}` : '';
  return texto ? <span role="status" aria-live="polite" title="Última consulta a Cloudbeds">{texto}</span> : null;
}

/**
 * Botón de actualizar desde Cloudbeds, para el header del módulo Hotel (se ve en todas las
 * secciones). Actualiza en vivo lo que cuelga de Cloudbeds (mes actual y siguiente del calendario) y vuelve a leer lo
 * propio del POS con `onRecargar`.
 */
export function SincronizarHotel({ version, onRecargar }: { version: number; onRecargar: () => Promise<unknown> | void }) {
  // Se repinta cuando llegan datos a la caché del calendario (también los de fondo): el icono gira mientras se consulta.
  useCacheCalendario();
  const [actualizando, setActualizando] = useState(false);

  // Si aún no se ha consultado nada (p. ej. se entró por Reservas), se trae el mes actual: el Worker lo sirve guardado al instante.
  useEffect(() => {
    if (ultimaConsulta() === null) void cargarMes(dayjs().format('YYYY-MM'), version).catch(() => undefined);
    // Solo al montar: después lo mantienen las secciones y el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocupado = actualizando || consultando();

  const actualizar = async () => {
    setActualizando(true);
    try {
      const [resultados] = await Promise.all([refrescarCercanos(version), Promise.resolve(onRecargar()).catch(() => undefined)]);
      const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (fallo) showToast.fallo('actualizar desde Cloudbeds', fallo.reason);
    } finally {
      setActualizando(false);
    }
  };

  return (
    <>
      <button type="button" aria-label="Actualizar desde Cloudbeds" title="Actualizar ahora" onClick={() => void actualizar()} disabled={actualizando} className={cn(headerIconButtonClass, 'disabled:opacity-60')}>
        <ArrowsClockwise size={16} weight="bold" className={cn(ocupado && 'animate-spin')} />
      </button>
    </>
  );
}

export type NivelHotel = 'ok' | 'aviso' | 'error';

// Color y ritmo de cada estado. El verde enciende e intensifica rápido mientras se consulta; el naranja es un brillo lento y
// suave (hay algo que revisar); el rojo es más intenso y se queda hasta que la conexión vuelva.
const ESTILO_PULSO: Record<'cargando' | 'aviso' | 'error', { glow: string; dur: string; min: string; max: string }> = {
  cargando: { glow: 'oklch(0.82 0.19 150)', dur: '1.5s', min: '0.25', max: '1' },
  aviso: { glow: 'oklch(0.8 0.17 65)', dur: '3.2s', min: '0.4', max: '0.8' },
  error: { glow: 'oklch(0.7 0.22 25)', dur: '2.2s', min: '0.65', max: '1' },
};

type EstadoPulso = 'cargando' | 'aviso' | 'error';

/**
 * Suaviza el estado del resplandor para que una API inestable no lo haga parpadear entre rojo y verde:
 *  · entrada con retraso: el rojo solo aparece si el fallo se mantiene 2 s, y el verde si la consulta dura más de 0,25 s
 *    (las respuestas instantáneas no encienden nada);
 *  · permanencia mínima: lo que ya se muestra no se quita antes de 4 s (rojo) o 1,2 s (verde), así los fallos intermitentes
 *    dan un rojo estable en vez de intermitente y la recuperación no deja un destello.
 */
function useEstadoSuavizado(crudo: EstadoPulso | null): EstadoPulso | null {
  const [mostrado, setMostrado] = useState<EstadoPulso | null>(crudo);
  const desde = useRef(Date.now());
  useEffect(() => {
    if (crudo === mostrado) return;
    const entrada = crudo === 'error' ? 2000 : crudo === 'cargando' ? 250 : 0;
    const minimo = mostrado === 'error' ? 4000 : mostrado === 'cargando' ? 1200 : 0;
    const espera = Math.max(entrada, minimo - (Date.now() - desde.current), 0);
    const t = setTimeout(() => { setMostrado(crudo); desde.current = Date.now(); }, espera);
    return () => clearTimeout(t);
  }, [crudo, mostrado]);
  return mostrado;
}

/** Una capa de color del resplandor: las tres están montadas y se funden entre sí (opacidad), en vez de cambiar de color de golpe. */
function CapaPulso({ activa, estilo: e }: { activa: boolean; estilo: (typeof ESTILO_PULSO)[EstadoPulso] }) {
  const vars = { '--glow': e.glow, '--pulso-dur': e.dur, '--pulso-min': e.min, '--pulso-max': e.max } as CSSProperties;
  return (
    <span aria-hidden style={vars} className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out motion-reduce:duration-0', activa ? 'opacity-100' : 'opacity-0')}>
      <span className="pulso-glow absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_70%_100%_at_50%_100%,color-mix(in_oklab,var(--glow)_55%,transparent),transparent)]" />
      <span className="pulso-glow absolute inset-x-0 bottom-0 h-0.5 bg-[var(--glow)] shadow-[0_0_10px_2px_color-mix(in_oklab,var(--glow)_75%,transparent)]" />
    </span>
  );
}

/**
 * Resplandor que sale del borde inferior del header del Hotel, en la mitad central y desvanecido en los extremos (sin
 * cortes). Se enciende e intensifica en tres casos y se apaga cuando todo está bien:
 *  · rojo   → falló la última consulta o no hay conexión con Cloudbeds (`nivel = 'error'`); manda sobre los demás;
 *  · verde  → se está consultando Cloudbeds (calendario, actualizar, precarga);
 *  · naranja → hay algo que revisar: reservas sin subir, cambios en Cloudbeds, habitaciones sin enlazar (`nivel = 'aviso'`).
 * Los cambios de estado se funden en ~1 s y se filtran los parpadeos de una API inestable (ver `useEstadoSuavizado`).
 * Es absoluto (prop `pulso` de `PageHeader`): no ocupa espacio. Con «reducir movimiento» queda fijo, sin pulsar.
 */
export function PulsoSincronizacion({ nivel = 'ok' }: { nivel?: NivelHotel }) {
  useCacheCalendario();
  // El error va primero: mientras Cloudbeds sigue fallando, un reintento en curso no lo pinta de verde (era lo que parpadeaba).
  const crudo: EstadoPulso | null = hayFalloConsulta() || nivel === 'error' ? 'error' : consultando() ? 'cargando' : nivel === 'aviso' ? 'aviso' : null;
  const estado = useEstadoSuavizado(crudo);
  const mascara = 'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)';
  return (
    <span aria-hidden style={{ maskImage: mascara, WebkitMaskImage: mascara }} className="pointer-events-none absolute inset-x-[20%] bottom-0 block h-6 overflow-hidden">
      {(['cargando', 'aviso', 'error'] as const).map((k) => <CapaPulso key={k} activa={estado === k} estilo={ESTILO_PULSO[k]} />)}
    </span>
  );
}
