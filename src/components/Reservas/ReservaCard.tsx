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
  /** Siempre la tarjeta completa, también para atendidas/canceladas (vista de lista: sobra espacio). */
  completa?: boolean;
  className?: string;
}

// Punto + texto del estado: más legible que una etiqueta diminuta.
const ESTADO: Record<string, { punto: string; texto: string }> = {
  pendiente: { punto: 'bg-warning', texto: 'text-warning-foreground' },
  confirmada: { punto: 'bg-success', texto: 'text-success-foreground' },
  completada: { punto: 'bg-muted-foreground/60', texto: 'text-muted-foreground' },
  cancelada: { punto: 'bg-destructive', texto: 'text-destructive' },
};

/**
 * Tarjeta de una reserva. Se usa igual en el calendario de Reservas y en la franja
 * "Reserva de Mesas" de Mesas:
 *   hora · personas                       código
 *   Nombre de la reserva
 *   ▦ Mesa asignada (solo si ya tiene)
 *   ● Estado                         [asignar]
 */
export function ReservaCard({ reserva, onClick, onAssign, isHighlighted = false, codigo, mesaNombre, completa = false, className }: ReservaCardProps) {
  const done = reserva.estado === 'completada';
  const canceled = reserva.estado === 'cancelada';
  // Asignar mesa solo tiene sentido el día del servicio: una reserva futura
  // aún no debe ocupar una mesa física.
  const esHoy = reserva.fecha === toISO(new Date());
  const estado = ESTADO[reserva.estado] ?? ESTADO.completada;

  // Atendida (servicio iniciado) o cancelada: versión compacta de dos líneas, para
  // que no ocupe tanto alto en el calendario.
  if ((done || canceled) && !completa) {
    return (
      <div
        data-card
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={cn(
          'rounded-xl border px-2.5 py-1.5 flex flex-col gap-0.5 cursor-pointer transition-all shadow-2xs',
          canceled ? 'bg-muted/60 opacity-70 shadow-none hover:opacity-100' : 'bg-card',
          isHighlighted ? 'border-border ring-2 ring-primary/20' : 'border-border',
          className
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className={cn('text-xs font-black tabular-nums', canceled ? 'text-muted-foreground' : 'text-foreground')}>{reserva.hora}</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1"><Users size={12} /> {reserva.personas}</span>
          {codigo && <span className="text-[11px] font-bold tabular-nums">· {codigo}</span>}
          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold shrink-0">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', canceled ? 'bg-muted-foreground/50' : estado.punto)} />
            {canceled ? STATUS_LABEL.cancelada : mesaNombre || STATUS_LABEL[reserva.estado]}
          </span>
        </div>
        <span className={cn('text-xs font-extrabold truncate', canceled ? 'text-muted-foreground line-through' : 'text-foreground')}>{reserva.nombre}</span>
      </div>
    );
  }

  return (
    <div
      data-card
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'group/reserva rounded-xl border p-3 flex flex-col gap-1.5 cursor-pointer transition-all shadow-2xs',
        canceled ? 'bg-muted/60 opacity-70 shadow-none hover:opacity-100' : 'bg-card',
        isHighlighted ? 'border-border ring-2 ring-primary/20' : 'border-border',
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1 text-sm font-black text-foreground tabular-nums">
          <Clock size={14} weight="bold" /> {reserva.hora}
        </span>
        <span className={cn('ml-auto flex items-center gap-1.5 text-xs font-bold shrink-0', canceled ? 'text-muted-foreground' : estado.texto)}>
          <span className={cn('w-2 h-2 rounded-full shrink-0', canceled ? 'bg-muted-foreground/50' : estado.punto)} />
          {STATUS_LABEL[reserva.estado] ?? reserva.estado}
        </span>
      </div>

      <span className={cn('text-sm font-extrabold truncate', canceled ? 'text-muted-foreground line-through' : 'text-foreground')}>{reserva.nombre}</span>

      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Users size={13} className="shrink-0" /> {reserva.personas} pers.
      </span>

      <div className="flex items-end justify-between gap-2 min-h-8">
        <div className="flex flex-col gap-0.5 min-w-0">
          {mesaNombre && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground truncate">
              <SquaresFour size={13} className="shrink-0" /> {mesaNombre}
            </span>
          )}
          {codigo && <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{codigo}</span>}
        </div>

        {!canceled && !done && (
          <button
            type="button"
            disabled={!esHoy}
            onClick={(e) => { e.stopPropagation(); if (esHoy) onAssign(); }}
            className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
              esHoy ? 'bg-success-soft text-success-foreground hover:bg-success hover:text-white group-hover/reserva:bg-success group-hover/reserva:text-white cursor-pointer' : 'bg-muted text-muted-foreground/50 cursor-not-allowed')}
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
