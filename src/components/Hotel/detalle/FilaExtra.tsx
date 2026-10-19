import { useState } from 'react';
import { Note, Trash } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { showToast } from '@/lib/toast';
import { reanotarExtraHotel, type ExtraHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { FormNota, ItemNota } from './NotasReserva';
import { dinero } from './formatos';

/** Con mouse, las acciones de la fila solo se ven al pasar el cursor o enfocarla; en pantallas táctiles, siempre. */
const SOLO_HOVER = '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/acc:opacity-100 [@media(hover:hover)]:group-focus-within/acc:opacity-100 transition-opacity';
const accion = 'size-7 rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer';

interface Props {
  r: ReservaHotel;
  extra: ExtraHotel;
  icono: ReactNode;
  puedeEditar: boolean;
  usuario?: string;
  onQuitar: (extraId: string) => void;
  onCambio: (r: ReservaHotel) => void;
}

/** Un extra de la reserva en una sola línea (icono, nombre, importe) con sus notas debajo; las acciones aparecen al pasar el cursor. */
export function FilaExtra({ r, extra: e, icono, puedeEditar, usuario, onQuitar, onCambio }: Props) {
  const [anotando, setAnotando] = useState(false);
  const [reanotando, setReanotando] = useState(false);
  const notas = r.notas_items.filter((n) => n.extra_id === e.id);
  // El extra de un plan de alimentación se gestiona cambiando el plan.
  const editable = puedeEditar && e.origen !== 'plan';

  const reanotar = async () => {
    setReanotando(true);
    try { onCambio(await reanotarExtraHotel(r, e.id)); showToast.success('Extra anotado en Cloudbeds'); } catch (err) { showToast.fallo('anotar el extra', err); } finally { setReanotando(false); }
  };

  return (
    <li className="group/acc flex flex-col gap-1.5 px-2 -mx-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors">
      <div className="flex items-center gap-2.5 min-h-7">
        <span className="shrink-0 flex">{icono}</span>
        <span className="flex-1 min-w-0 t-cuerpo break-words">{e.descripcion}</span>
        {editable && (
          <span className={`flex items-center shrink-0 ${SOLO_HOVER}`}>
            <button type="button" onClick={() => setAnotando(true)} title="Añadir nota" aria-label={`Añadir nota a ${e.descripcion}`} className={`${accion} hover:text-foreground hover:bg-muted`}><Note size={15} /></button>
            <button type="button" onClick={() => onQuitar(e.id)} title="Quitar extra" aria-label={`Quitar ${e.descripcion}`} className={`${accion} hover:text-destructive hover:bg-destructive/10`}><Trash size={15} /></button>
          </span>
        )}
        <span className="t-cuerpo-fuerte tabular-nums shrink-0 text-right min-w-16">{dinero(e.monto)}</span>
      </div>
      {notas.map((n) => <ItemNota key={n.id} r={r} nota={n} destacada puedeEditar={editable} usuario={usuario} onCambio={onCambio} />)}
      {anotando && <FormNota r={r} extraFijo={e.id} usuario={usuario} onCancelar={() => setAnotando(false)} onGuardado={(n) => { setAnotando(false); onCambio(n); }} />}
      {e.nota_ok === false && (
        <div className="flex items-center justify-between gap-3 t-meta text-warning-foreground">
          <span>Sin anotar en Cloudbeds</span>
          {puedeEditar && <button type="button" onClick={() => void reanotar()} disabled={reanotando} className="underline cursor-pointer disabled:opacity-50">{reanotando ? 'Anotando…' : 'Reintentar'}</button>}
        </div>
      )}
    </li>
  );
}
