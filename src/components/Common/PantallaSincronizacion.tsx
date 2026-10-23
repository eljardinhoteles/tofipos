import { useEffect, useState } from 'react';
import { Check, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { subscribeProgresoInicial, type ProgresoInicial } from '../../db/rxdb';

// Cada paso agrupa colecciones de la réplica con un nombre que se entienda; se marca cuando terminaron todas las suyas.
const PASOS: Array<{ etiqueta: string; colecciones: string[] }> = [
  { etiqueta: 'Mesas y pisos', colecciones: ['mesas', 'pisos'] },
  { etiqueta: 'Menú y categorías', colecciones: ['categorias', 'menuItems'] },
  { etiqueta: 'Clientes', colecciones: ['clientes'] },
  { etiqueta: 'Órdenes', colecciones: ['comandas', 'items'] },
  { etiqueta: 'Reservas y habitaciones', colecciones: ['reservas', 'habitacionCuentas'] },
  { etiqueta: 'Ventas y pagos', colecciones: ['ventas', 'pagos'] },
  { etiqueta: 'Usuarios e impuestos', colecciones: ['usuarios', 'ajustesIva'] },
];

const FRASES = [
  'Poniendo las mesas en su sitio…',
  'Calentando la cocina…',
  'Contando las reservas…',
  'Afilando los cuchillos…',
  'Ordenando el menú…',
  'Pelando los últimos aguacates…',
];

interface Props {
  /** Todo terminó: se muestra el cierre («¡Listo!») antes de pasar a la app. */
  terminado?: boolean;
}

/**
 * Pantalla de la primera sincronización al vincular un dispositivo: el avance real por partes (cada colección avisa cuando termina su
 * primer pull), un aguacate que salta, frases que cambian y un cierre con check antes de entrar a la app.
 */
export function PantallaSincronizacion({ terminado = false }: Props) {
  const [progreso, setProgreso] = useState<ProgresoInicial>({ total: 0, listas: [] });
  useEffect(() => subscribeProgresoInicial(setProgreso), []);

  const [frase, setFrase] = useState(0);
  useEffect(() => {
    if (terminado) return;
    const t = setInterval(() => setFrase((f) => (f + 1) % FRASES.length), 2600);
    return () => clearInterval(t);
  }, [terminado]);

  const listas = new Set(progreso.listas);
  const hechos = PASOS.map((p) => p.colecciones.every((c) => listas.has(c)));
  const primerPendiente = hechos.indexOf(false);
  const porcentaje = terminado ? 100 : progreso.total > 0 ? Math.round((progreso.listas.length / progreso.total) * 100) : 0;
  const organizacion = (() => { try { return localStorage.getItem('pos_org_name_cached') || ''; } catch { return ''; } })();

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center p-6 bg-background text-center gap-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2 h-28 justify-end">
        {terminado ? (
          <CheckCircle size={72} weight="fill" className="text-primary animate-in zoom-in-50 fade-in-0 duration-500" aria-hidden />
        ) : (
          <>
            <span className="aguacate-salto text-6xl leading-none select-none" aria-hidden>🥑</span>
            <span className="aguacate-sombra block h-1.5 w-14 rounded-full bg-foreground" aria-hidden />
          </>
        )}
      </div>

      <div className="flex flex-col gap-1 min-h-[5.5rem]">
        <h2 className="t-valor text-foreground">{terminado ? '¡Listo!' : 'Sincronizando datos…'}</h2>
        {terminado ? (
          <p className="t-meta text-muted-foreground max-w-sm">{organizacion ? `${organizacion} está lista para trabajar.` : 'Todo está listo para trabajar.'}</p>
        ) : (
          <>
            <p className="t-meta text-muted-foreground max-w-sm">
              {organizacion ? `Preparando ${organizacion}. ` : ''}Esto solo pasa la primera vez que vinculas este dispositivo.
            </p>
            <p key={frase} className="frase-entra t-cuerpo-fuerte text-primary mt-1">{FRASES[frase]}</p>
          </>
        )}
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la sincronización">
          <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${porcentaje}%` }} />
        </div>
        <ul className="flex flex-col gap-1.5 text-left">
          {PASOS.map((p, i) => {
            const hecho = terminado || hechos[i];
            const enCurso = !terminado && i === primerPendiente;
            return (
              <li key={p.etiqueta} className={cn('flex items-center gap-2.5 t-cuerpo transition-colors duration-500', hecho ? 'text-foreground' : enCurso ? 'text-foreground' : 'text-muted-foreground/60')}>
                <span className={cn('size-5 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500', hecho ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                  {hecho ? <Check size={12} weight="bold" className="animate-in zoom-in-50 duration-300" /> : enCurso ? <CircleNotch size={14} className="animate-spin text-primary" /> : null}
                </span>
                {p.etiqueta}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
