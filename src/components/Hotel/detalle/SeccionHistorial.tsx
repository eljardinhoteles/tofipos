import { Clock } from '@phosphor-icons/react';
import { historialDisponible, type EventoHistorial } from '../../../lib/hotelReservasApi';
import { Seccion } from './comunes';

/** Línea de tiempo de la reserva: creación, cambios, cobros, conciliación y cancelación, con fecha y usuario. */
export function SeccionHistorial({ historial, cargando = false }: { historial: EventoHistorial[]; cargando?: boolean }) {
  return (
  <Seccion icono={Clock} color="info" titulo="Registro de cambios">
    {!historialDisponible ? (
      <p className="t-meta text-muted-foreground">Para ver el historial de cambios, ejecuta la migración <b>20261018000200_hotel_reservas_historial.sql</b> en Supabase.</p>
    ) : cargando ? (
      <p className="t-meta text-muted-foreground">Cargando historial…</p>
    ) : historial.length === 0 ? (
      <p className="t-meta text-muted-foreground">Todavía no hay cambios registrados.</p>
    ) : (
      <ol className="flex flex-col">
        {[...historial].reverse().map((e, i, todos) => (
          <li key={e.id} className="flex gap-3">
            {/* Columna del hilo: el punto centrado y una línea que baja hasta el siguiente evento (no en el último). */}
            <div className="flex flex-col items-center w-3 shrink-0">
              <span className="size-2.5 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden />
              {i < todos.length - 1 && <span className="w-px flex-1 bg-border mt-1" aria-hidden />}
            </div>
            <div className={i < todos.length - 1 ? 'flex flex-col gap-0.5 min-w-0 pb-4' : 'flex flex-col gap-0.5 min-w-0'}>
              <span className="t-cuerpo break-words">{e.texto}</span>
              <span className="t-meta text-muted-foreground">
                {new Date(e.fecha).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{e.usuario ? ` · ${e.usuario}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ol>
    )}
  </Seccion>
  );
}
