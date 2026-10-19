import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Bed } from '@phosphor-icons/react';
import { EstadoBadge } from '../Common/EstadoBadge';
import { ReservaDrawer, SyncBadge } from '../Hotel/ReservaDrawer';
import { usePermisos } from '../../hooks/usePermisos';
import { listarHabitaciones, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { listarReservasDeVenta, nombreHuesped, totalConExtras, type ReservaHotel } from '../../lib/hotelReservasApi';

const money = (n: number) => `$${n.toFixed(2)}`;

interface Props {
  ventaId: string;
  /** Avisa de cuántas reservas hay, para el contador de la pestaña. */
  onCantidad?: (n: number) => void;
}

/** Reservas del Hotel que cubre esta venta: una, o todas las cabañas de un grupo. Solo lectura; se gestionan en Hotel. */
export function VentaReservasHotelPanel({ ventaId, onCantidad }: Props) {
  const [lista, setLista] = useState<ReservaHotel[] | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<ReservaHotel | null>(null);
  const [habitaciones, setHabitaciones] = useState<HabitacionHotel[]>([]);
  const [version, setVersion] = useState(0);
  const permisos = usePermisos();

  useEffect(() => {
    let vigente = true;
    listarReservasDeVenta(ventaId)
      .then((r) => { if (vigente) { setLista(r); setError(''); onCantidad?.(r.length); } })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : 'No se pudieron cargar las reservas'); });
    return () => { vigente = false; };
  }, [ventaId, onCantidad, version]);

  // El mapa de cabañas solo se necesita al abrir una reserva (el detalle muestra el nombre y valida cambios con él).
  const abrir = (r: ReservaHotel) => {
    setAbierta(r);
    if (habitaciones.length === 0) void listarHabitaciones().then(setHabitaciones).catch(() => { /* el detalle usa el nombre guardado */ });
  };

  if (error) return <p className="t-meta text-destructive py-2">{error}</p>;
  if (!lista) return <p className="t-meta text-muted-foreground py-2">Cargando reservas…</p>;
  if (lista.length === 0) return <p className="t-meta text-muted-foreground py-2">Esta venta no tiene reservas del Hotel enlazadas.</p>;

  return (
    <div className="flex flex-col gap-2">
      {lista.map((r) => (
        <button key={r.id} type="button" onClick={() => abrir(r)} title="Abrir la reserva"
          className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-2xl bg-card shadow-2xs text-left cursor-pointer hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <Bed size={20} className="text-primary shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="t-cuerpo-fuerte truncate">{r.cabana}</span>
              <span className="t-meta text-muted-foreground truncate">
                {nombreHuesped(r)} · {dayjs(r.llegada).format('D MMM')} → {dayjs(r.salida).format('D MMM YYYY')} · {r.adultos + r.ninos} {r.adultos + r.ninos === 1 ? 'huésped' : 'huéspedes'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.estado === 'cancelada' ? <EstadoBadge tono="neutral">Cancelada</EstadoBadge> : <SyncBadge r={r} />}
            <span className="t-cuerpo-fuerte tabular-nums">{money(totalConExtras(r))}</span>
          </div>
        </button>
      ))}
      <ReservaDrawer open={!!abierta} reserva={abierta} reservas={lista} habitaciones={habitaciones}
        puedeGestionar={permisos.gestionarHotel} onAbrirHermana={setAbierta}
        onCambio={() => setVersion((v) => v + 1)} onClose={() => setAbierta(null)} />
    </div>
  );
}
