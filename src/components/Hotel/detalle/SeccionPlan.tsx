import dayjs from 'dayjs';
import { EstadoBadge } from '../../Common/EstadoBadge';
import type { ReservaHotel } from '../../../lib/hotelReservasApi';
import { importePlan, planSeCobra } from '../../../lib/hotelPlanesApi';
import { dinero } from './formatos';

/**
 * Plan de alimentación de la reserva. Va dentro de la rejilla de la tarjeta de Huéspedes (ocupa las dos columnas) y se cambia con
 * el mismo «Editar». Las reservas anteriores a los planes aparecen sin plan hasta elegirlo a mano.
 */
export function SeccionPlan({ r, hayPlanes }: { r: ReservaHotel; hayPlanes: boolean }) {
  const p = r.plan_alimentacion;
  // Sin planes creados y sin plan en la reserva, el bloque no aporta nada.
  if (!p && !hayPlanes) return null;
  const noches = dayjs(r.salida).diff(dayjs(r.llegada), 'day');
  return (
    <div className="col-span-2 flex flex-col gap-1">
      <span className="t-etiqueta text-muted-foreground">Plan de alimentación</span>
      {p ? (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <span className="t-cuerpo-fuerte">{p.nombre}</span>
            {planSeCobra(p)
              ? <EstadoBadge tono="warning">Se cobra {dinero(importePlan(p, r.adultos, r.ninos, noches))}</EstadoBadge>
              : <EstadoBadge tono="info">Incluido en la tarifa</EstadoBadge>}
          </span>
        </>
      ) : (
        <span className="t-cuerpo text-muted-foreground">Sin plan: solo alojamiento</span>
      )}
    </div>
  );
}
