import { useState } from 'react';
import { Check, Note, PencilSimple, Trash, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { showToast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Girando } from '../Espera';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';
import type { RxMenuItem } from '../../../db/rxdb';
import { Contador } from './Contador';
import { editarExtraHotel, reanotarExtraHotel, type ExtraHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
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
  const [editando, setEditando] = useState(false);
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
            {e.origen !== 'cloudbeds' && <button type="button" onClick={() => setEditando(true)} title="Editar cantidad o valor" aria-label={`Editar ${e.descripcion}`} className={`${accion} hover:text-foreground hover:bg-muted`}><PencilSimple size={15} /></button>}
            <button type="button" onClick={() => setAnotando(true)} title="Añadir nota" aria-label={`Añadir nota a ${e.descripcion}`} className={`${accion} hover:text-foreground hover:bg-muted`}><Note size={15} /></button>
            <button type="button" onClick={() => onQuitar(e.id)} title="Quitar extra" aria-label={`Quitar ${e.descripcion}`} className={`${accion} hover:text-destructive hover:bg-destructive/10`}><Trash size={15} /></button>
          </span>
        )}
        <span className="t-cuerpo-fuerte tabular-nums shrink-0 text-right min-w-16">{dinero(e.monto)}</span>
      </div>
      {notas.map((n) => <ItemNota key={n.id} r={r} nota={n} destacada puedeEditar={editable} usuario={usuario} onCambio={onCambio} />)}
      {editando && <FormEditarExtra r={r} extra={e} usuario={usuario} onCancelar={() => setEditando(false)} onGuardado={(n) => { setEditando(false); onCambio(n); }} />}
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

/**
 * Edita un extra bajo su fila: la cantidad (si viene de un producto) y el valor total. El valor solo se escribe a mano si el
 * producto es de precio variable o el extra se escribió a mano; en un producto de precio fijo sigue a la cantidad.
 */
function FormEditarExtra({ r, extra: e, usuario, onCancelar, onGuardado }: { r: ReservaHotel; extra: ExtraHotel; usuario?: string; onCancelar: () => void; onGuardado: (r: ReservaHotel) => void }) {
  const { menuItems } = useRxMenuCatalog() as { menuItems: RxMenuItem[] };
  const conProducto = e.producto_id !== undefined;
  const variable = !conProducto || !!menuItems.find((m) => m.id === e.producto_id)?.precio_variable;
  const cantidad0 = e.cantidad ?? 1;
  const unitario = e.monto / Math.max(1, cantidad0);
  const [cantidad, setCantidad] = useState(cantidad0);
  const [valor, setValor] = useState(e.monto.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const montoN = parseFloat(valor);
  const valido = Number.isFinite(montoN) && montoN >= 0;
  const sinCambios = cantidad === cantidad0 && Math.abs(montoN - e.monto) < 0.005;

  // Cambiar la cantidad reparte el valor actual entre unidades y lo vuelve a multiplicar (el precio por unidad se conserva).
  const alCantidad = (n: number) => { setCantidad(n); setValor((Math.round(unitario * n * 100) / 100).toFixed(2)); };

  const guardar = async () => {
    if (!valido || sinCambios) return;
    setGuardando(true);
    try {
      onGuardado(await editarExtraHotel(r, e.id, { cantidad: conProducto ? cantidad : undefined, monto: montoN }, usuario));
      showToast.success('Extra actualizado', 'Si la reserva tiene venta, ajústala desde Cobros.');
    } catch (err) {
      showToast.fallo('editar el extra', err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2">
      {conProducto && <Contador etiquetaTexto="Cantidad" valor={cantidad} min={1} max={99} onCambio={alCantidad} enLinea />}
      <label className="flex items-center gap-1.5 t-meta text-muted-foreground">
        Valor $
        <Input value={valor} onChange={(ev) => setValor(ev.target.value)} inputMode="decimal" disabled={!variable || guardando} aria-label="Valor total del extra"
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void guardar(); } if (ev.key === 'Escape') onCancelar(); }}
          className="h-10 w-28 text-base tabular-nums" />
      </label>
      {!variable && <span className="t-meta text-muted-foreground">Precio fijo: sigue a la cantidad</span>}
      <span className="flex items-center gap-1.5 ml-auto">
        <button type="button" onClick={() => void guardar()} disabled={!valido || sinCambios || guardando} aria-label="Guardar cambios del extra"
          className="size-10 rounded-xl flex items-center justify-center text-primary-foreground bg-primary disabled:opacity-40 cursor-pointer shrink-0">{guardando ? <Girando /> : <Check size={18} weight="bold" />}</button>
        <button type="button" onClick={onCancelar} disabled={guardando} aria-label="Cancelar"
          className="size-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-card cursor-pointer shrink-0"><X size={18} /></button>
      </span>
    </div>
  );
}
