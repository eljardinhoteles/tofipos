import { Clock, Users, ArrowUpRight, SquaresFour } from '@phosphor-icons/react';
import { type Reserva } from '../../db/database';
import { cn } from '@/lib/utils';
import { toISO, STATUS_LABEL } from './reservaUtils';

interface ReservaCardProps {
  reserva: Reserva;
  onClick: () => void;
  /** Asignar mesa (solo el día del servicio y mientras la reserva siga abierta). */
  onAssign: () => void;
  isHighlighted?: boolean;
  /** Código corto de la reserva ("R12"). */
  codigo?: string;
  /** Mesa asignada (vacío/undefined = "Sin mesa"). */
  mesaNombre?: string;
  className?: string;
}

// Punto + texto del estado: más legible que una etiqueta diminuta.
const ESTADO: Record<string, { punto: string; texto: string }> = {
  pendiente: { punto: 'bg-warning', texto: 'text-warning-foreground' },
  confirmada: { punto: 'bg-info', texto: 'text-info-foreground' },
  completada: { punto: 'bg-muted-foreground/60', texto: 'text-muted-foreground' },
  cancelada: { punto: 'bg-destructive', texto: 'text-destructive' },
};

/**
 * Tarjeta de una reserva. Se usa igual en el calendario de Reservas y en la franja
 * "Reserva de Mesas" de Mesas:
 *   hora · personas                       código
 *   Nombre de la reserva
 *   ▦ Mesa asignada / Sin mesa
 *   ● Estado                         [asignar]
 */
export function ReservaCard({ reserva, onClick, onAssign, isHighlighted = false, codigo, mesaNombre, className }: ReservaCardProps) {
  const done = reserva.estado === 'completada';
  const canceled = reserva.estado === 'cancelada';
  // Asignar mesa solo tiene sentido el día del servicio: una reserva futura
  // aún no debe ocupar una mesa física.
  const esHoy = reserva.fecha === toISO(new Date());
  const estado = ESTADO[reserva.estado] ?? ESTADO.completada;

  // Ya con mesa asignada (servicio iniciado): versión compacta de dos líneas, para
  // que no ocupe tanto alto en el calendario.
  if (done) {
    return (
      <div
        data-card
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={cn(
          'rounded-xl border bg-card px-2.5 py-1.5 flex flex-col gap-0.5 cursor-pointer transition-all shadow-2xs hover:bg-muted/40',
          isHighlighted ? 'border-border ring-2 ring-primary/20' : 'border-border',
          className
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className="text-xs font-black text-foreground tabular-nums">{reserva.hora}</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1"><Users size={12} /> {reserva.personas}</span>
          {codigo && <span className="text-[11px] font-bold tabular-nums">· {codigo}</span>}
          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold shrink-0">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', estado.punto)} />
            {mesaNombre || 'Sin mesa'}
          </span>
        </div>
        <span className="text-xs font-extrabold text-foreground truncate">{reserva.nombre}</span>
      </div>
    );
  }

  return (
    <div
      data-card
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'rounded-xl border bg-card p-3 flex flex-col gap-1.5 cursor-pointer transition-all shadow-2xs hover:bg-muted/40',
        isHighlighted ? 'border-border ring-2 ring-primary/20' : 'border-border',
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1 text-sm font-black text-foreground tabular-nums">
          <Clock size={14} weight="bold" /> {reserva.hora}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1"><Users size={14} /> {reserva.personas} pers.</span>
        {codigo && <span className="ml-auto text-[11px] font-bold tabular-nums">{codigo}</span>}
      </div>

      <span className="text-sm font-extrabold text-foreground truncate">{reserva.nombre}</span>

      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground truncate">
        <SquaresFour size={13} className="shrink-0" /> {mesaNombre || 'Sin mesa'}
      </span>

      <div className="flex items-end justify-between gap-2 min-h-8">
        <span className={cn('flex items-center gap-1.5 text-xs font-bold', estado.texto)}>
          <span className={cn('w-2 h-2 rounded-full shrink-0', estado.punto)} />
          {STATUS_LABEL[reserva.estado] ?? reserva.estado}
        </span>

        {!canceled && !done && (
          <button
            type="button"
            disabled={!esHoy}
            onClick={(e) => { e.stopPropagation(); if (esHoy) onAssign(); }}
            className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
              esHoy ? 'bg-muted text-foreground hover:bg-secondary cursor-pointer' : 'bg-muted text-muted-foreground/50 cursor-not-allowed')}
            title={esHoy ? 'Asignar Mesa' : 'Solo se puede asignar mesa el día de la reserva'}
            aria-label="Asignar mesa"
          >
            <ArrowUpRight size={17} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
