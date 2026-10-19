import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react';
import { BannerEspera, Girando } from '../Espera';
import type { EstadoLinea } from './tipos';

/** Avance de la creación: una fila por cabaña (guardando en el POS, reservando en Cloudbeds, extras). */
export function ProgresoReserva({ avance }: { avance: Array<{ id: string; nombre: string; estado: EstadoLinea }> }) {
  const terminadas = avance.filter((l) => l.estado === 'ok' || l.estado === 'pendiente' || l.estado === 'error').length;
  return (
    <div className="flex flex-col gap-3">
      <BannerEspera texto={avance.every((l) => l.estado === 'guardando') ? 'Guardando en el POS…' : 'Reservando en Cloudbeds…'} detalle={`${terminadas} de ${avance.length} · no cierres este panel`} />
      <ul className="flex flex-col gap-2" aria-live="polite">
        {avance.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <span className="t-fila truncate">{l.nombre}</span>
            <span className="flex items-center gap-2 shrink-0 t-meta">
              {l.estado === 'guardando' && <><Girando /> Guardando…</>}
              {l.estado === 'subiendo' && <><Girando /> Reservando…</>}
              {l.estado === 'extras' && <><Girando /> Añadiendo extras…</>}
              {l.estado === 'ok' && <><CheckCircle size={18} weight="fill" className="text-success" /> Reservada</>}
              {l.estado === 'pendiente' && <><WarningCircle size={18} weight="fill" className="text-warning-foreground" /> Pendiente</>}
              {l.estado === 'error' && <><XCircle size={18} weight="fill" className="text-destructive" /> Rechazada</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
