import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { listarReservasDeVenta } from '../../lib/hotelReservasApi';
import type { RxVenta } from '../../db/rxdb';

const dia = (f: string) => dayjs(f).locale('es').format('ddd D MMM');

/**
 * Estadía de una venta de reserva de hotel (llegada y salida), en una línea dentro de la tarjeta principal de la venta. Es de SOLO
 * LECTURA: las fechas se cambian en el módulo Hotel, donde cada habitación tiene las suyas (una venta puede cubrir varias). Si la venta
 * tiene reservas del Hotel enlazadas, se muestran SUS fechas (de la primera llegada a la última salida) y cuántas habitaciones son, así
 * no quedan desactualizadas cuando se mueve una reserva; sin ellas (ventas registradas a mano), las de la propia venta.
 */
export function VentaEstadia({ venta }: { venta: RxVenta }) {
  const [reservas, setReservas] = useState<Awaited<ReturnType<typeof listarReservasDeVenta>> | null>(null);
  useEffect(() => {
    let vigente = true;
    listarReservasDeVenta(venta.id).then((r) => { if (vigente) setReservas(r); }).catch(() => { if (vigente) setReservas([]); });
    return () => { vigente = false; };
  }, [venta.id]);

  const vigentes = (reservas ?? []).filter((r) => r.estado === 'confirmada');
  const llegada = vigentes.length > 0 ? vigentes.map((r) => r.llegada).sort()[0] : venta.llegada;
  const salida = vigentes.length > 0 ? vigentes.map((r) => r.salida).sort().at(-1) : venta.salida;
  if (!llegada) return null;
  const noches = salida ? dayjs(salida).diff(dayjs(llegada), 'day') : 0;

  return (
    <span className="t-cuerpo text-foreground tabular-nums truncate min-w-0 max-w-full" title="Las fechas se cambian en el módulo Hotel">
      {dia(llegada)}{salida ? ` → ${dia(salida)}` : ''}
      {noches > 0 && <span className="text-muted-foreground"> · {noches} {noches === 1 ? 'noche' : 'noches'}</span>}
      {vigentes.length > 1 && <span className="text-muted-foreground"> · {vigentes.length} habitaciones</span>}
    </span>
  );
}
