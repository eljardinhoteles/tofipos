import { useMemo, useState } from 'react';
import { CalendarCheck } from '@phosphor-icons/react';
import { ReservaCard } from '../Reservas/ReservaCard';
import { AsignarMesaModal } from '../Reservas/AsignarMesaModal';
import { cn } from '@/lib/utils';
import { useUI } from '../../context/UIContext';
import { useRxReservas } from '../../hooks/useRxReservas';
import { toISO } from '../Reservas/reservaUtils';

// Solo PC (en el celular el módulo es operativo y no se muestra). Reservas del día en curso por atender, justo bajo las zonas de Mesas: al asignarles
// mesa (estado completada) salen de aquí. Cada tarjeta abre el
// detalle de la reserva en el panel lateral (el mismo de la pantalla Reservas).
export function ReservasDelDia({ mesas, comandas }: { mesas: any[]; comandas: any[] }) {
  const [reservaToAssign, setReservaToAssign] = useState<any | null>(null);
  const { reservas } = useRxReservas();
  const { setSelectedReservaId, setReservaView, setSelectedMesaId, selectedReservaId } = useUI();

  const hoy = toISO(new Date());
  const delDia = useMemo(
    () => reservas
      .filter((r: any) => r.fecha === hoy && r.estado !== 'cancelada' && r.estado !== 'completada')
      .sort((a: any, b: any) => (a.hora || '').localeCompare(b.hora || '')),
    [reservas, hoy]
  );
  // Mismo código "R12" que muestra el calendario: orden de creación de todas las reservas.
  const codigoMap = useMemo(() => {
    const map: Record<string, string> = {};
    [...reservas]
      .sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id))
      .forEach((r: any, i: number) => { map[r.id] = `R${i + 1}`; });
    return map;
  }, [reservas]);
  const mesaPorId = useMemo(() => new Map(mesas.map(m => [m.id, m.nombre])), [mesas]);

  if (delDia.length === 0) return null;

  return (
    <section aria-label="Reserva de Mesas" className="hidden md:flex mb-5 flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
        <CalendarCheck size={13} weight="bold" /> Reserva de Mesas · {delDia.length}
      </h2>
      <div className="flex items-stretch gap-2 overflow-x-auto hide-scrollbar py-1 -my-1 -mx-5 px-5">
        {delDia.map((r: any) => {
          const mesaNombre = r.mesa_id && !String(r.mesa_id).startsWith('reserva_') ? mesaPorId.get(r.mesa_id) : undefined;
          return (
            <div key={r.id} className={cn('shrink-0 w-64', r.estado === 'completada' && 'opacity-60')}>
              <ReservaCard
                reserva={r}
                codigo={codigoMap[r.id]}
                isHighlighted={selectedReservaId === r.id}
                mesaNombre={mesaNombre}
                onClick={() => { setSelectedMesaId(null); setSelectedReservaId(r.id); setReservaView('detalle'); }}
                onAssign={() => setReservaToAssign(r)}
              />
            </div>
          );
        })}
      </div>
      <AsignarMesaModal reserva={reservaToAssign} mesas={mesas} comandas={comandas} onClose={() => setReservaToAssign(null)} />
    </section>
  );
}
