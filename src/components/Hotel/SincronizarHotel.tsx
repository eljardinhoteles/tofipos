import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { headerIconButtonClass } from '../Common/PageHeader';
import { useCacheCalendario } from '../../hooks/useMesesHotel';
import dayjs from 'dayjs';
import { cargarMes, consultando, hace, hayFalloConsulta, refrescarCercanos, ultimaConsulta } from '../../lib/hotelCalendarioCache';

/**
 * Estado de la última consulta a Cloudbeds y botón de actualizar, para el header del módulo Hotel (se ve en todas las
 * secciones). Actualiza en vivo lo que cuelga de Cloudbeds (mes actual y siguiente del calendario) y vuelve a leer lo
 * propio del POS con `onRecargar`.
 */
export function SincronizarHotel({ version, onRecargar }: { version: number; onRecargar: () => Promise<unknown> | void }) {
  // Se repinta cuando llegan datos a la caché del calendario (también los de fondo) y cada 15 s para el «hace…».
  useCacheCalendario();
  const [ahora, setAhora] = useState(() => Date.now());
  const [actualizando, setActualizando] = useState(false);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);

  // Si aún no se ha consultado nada (p. ej. se entró por Reservas), se trae el mes actual: el Worker lo sirve guardado al instante.
  useEffect(() => {
    if (ultimaConsulta() === null) void cargarMes(dayjs().format('YYYY-MM'), version).catch(() => undefined);
    // Solo al montar: después lo mantienen las secciones y el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocupado = actualizando || consultando();
  const ultima = ultimaConsulta();

  const actualizar = async () => {
    setActualizando(true);
    try {
      const [resultados] = await Promise.all([refrescarCercanos(version), Promise.resolve(onRecargar()).catch(() => undefined)]);
      const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (fallo) showToast.fallo('actualizar desde Cloudbeds', fallo.reason);
      setAhora(Date.now());
    } finally {
      setActualizando(false);
    }
  };

  return (
    <>
      <span className="hidden xl:inline t-dato text-nav-foreground/70 whitespace-nowrap" role="status" aria-live="polite" title="Última consulta a Cloudbeds">
        {ocupado ? 'Actualizando…' : ultima !== null ? `Actualizado hace ${hace(Math.max(0, ahora - ultima))}` : ''}
      </span>
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

/**
 * Resplandor que sale del borde inferior del header del Hotel, en la mitad central y desvanecido en los extremos (sin
 * cortes). Se enciende e intensifica en tres casos y se apaga cuando todo está bien:
 *  · verde  → se está consultando Cloudbeds (calendario, actualizar, precarga);
 *  · rojo   → falló la última consulta o no hay conexión con Cloudbeds (`nivel = 'error'`);
 *  · naranja → hay algo que revisar: reservas sin subir, cambios en Cloudbeds, cabañas sin enlazar (`nivel = 'aviso'`).
 * Es absoluto (prop `pulso` de `PageHeader`): no ocupa espacio. Con «reducir movimiento» queda fijo, sin pulsar.
 */
export function PulsoSincronizacion({ nivel = 'ok' }: { nivel?: NivelHotel }) {
  useCacheCalendario();
  const estado = consultando() ? 'cargando' : hayFalloConsulta() || nivel === 'error' ? 'error' : nivel === 'aviso' ? 'aviso' : null;
  // Al apagarse se conserva el último color para que se desvanezca sin cambiar de tono.
  const [ultimo, setUltimo] = useState<'cargando' | 'aviso' | 'error'>('cargando');
  if (estado && estado !== ultimo) setUltimo(estado);
  const e = ESTILO_PULSO[estado ?? ultimo];
  const vars = { '--glow': e.glow, '--pulso-dur': e.dur, '--pulso-min': e.min, '--pulso-max': e.max } as CSSProperties;
  return (
    <span
      aria-hidden style={{ ...vars, maskImage: 'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)' }}
      className={cn('pointer-events-none absolute inset-x-[20%] bottom-0 block h-6 overflow-hidden transition-opacity duration-700', estado ? 'opacity-100' : 'opacity-0')}
    >
      <span className="pulso-glow absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_70%_100%_at_50%_100%,color-mix(in_oklab,var(--glow)_55%,transparent),transparent)]" />
      <span className="pulso-glow absolute inset-x-0 bottom-0 h-0.5 bg-[var(--glow)] shadow-[0_0_10px_2px_color-mix(in_oklab,var(--glow)_75%,transparent)]" />
    </span>
  );
}
