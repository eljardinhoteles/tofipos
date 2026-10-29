import dayjs from 'dayjs';
import { ForkKnife } from '@phosphor-icons/react';
import { EstadoBadge } from '../../Common/EstadoBadge';
import type { ReservaHotel } from '../../../lib/hotelReservasApi';
import { importePlan, planSeCobra } from '../../../lib/hotelPlanesApi';
import { dinero } from './formatos';

/**
 * Plan de alimentación de la reserva. Va dentro de la tarjeta de Huéspedes, como una fila con ícono, y se cambia con
 * el mismo «Editar». Las reservas anteriores a los planes aparecen sin plan hasta elegirlo a mano.
 */
export function SeccionPlan({ r, hayPlanes }: { r: ReservaHotel; hayPlanes: boolean }) {
  const p = r.plan_alimentacion;
  // Sin planes creados y sin plan en la reserva, el bloque no aporta nada.
  if (!p && !hayPlanes) return null;
  const noches = dayjs(r.salida).diff(dayjs(r.llegada), 'day');
  return (
    <div className="flex items-start gap-3 min-w-0">
      <ForkKnife size={20} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden />
      {p ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="t-cuerpo-fuerte">{p.nombre}</span>
          {planSeCobra(p)
            ? <EstadoBadge tono="warning">Se cobra {dinero(importePlan(p, r.adultos, r.ninos, noches))}</EstadoBadge>
            : <EstadoBadge tono="info">Incluido en la tarifa</EstadoBadge>}
        </span>
      ) : (
        <span className="t-cuerpo text-muted-foreground">Sin plan: solo alojamiento</span>
      )}
    </div>
  );
}
