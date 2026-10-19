import { useEffect, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { SelectorProductos } from '../SelectorProductos';
import { Contador } from './Contador';
import { useExtrasSeleccion } from '../../../hooks/useExtrasSeleccion';
import { agregarExtrasHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { dinero } from './formatos';

interface Props {
  r: ReservaHotel;
  usuario?: string;
  onCancelar: () => void;
  onGuardado: (r: ReservaHotel) => void;
  onSucio: (sucio: boolean) => void;
}

/** Añade extras (productos del sistema, con sus impuestos) a una reserva ya creada. */
export function EditorExtras({ r, usuario, onCancelar, onGuardado, onSucio }: Props) {
  const { items, activos, categorias, cantidades, tasaIva, preciosConIva, sumar, restar, cambiar, quitar, monto, total } = useExtrasSeleccion();

  useEffect(() => { onSucio(items.length > 0); }, [items.length, onSucio]);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const nueva = await agregarExtrasHotel(r, items.map((x) => ({
        descripcion: `${x.cantidad > 1 ? `${x.cantidad}× ` : ''}${x.producto.nombre}`,
        monto: monto(x), producto_id: x.producto.id, cantidad: x.cantidad,
      })), usuario);
      const sinAnotar = nueva.extras.slice(-items.length).some((e) => e.nota_ok === false);
      if (sinAnotar) showToast.warning('Extras guardados, pero sin anotar en Cloudbeds', 'Puedes reintentarlo desde la cuenta de la reserva.');
      else showToast.success(items.length === 1 ? 'Extra añadido' : 'Extras añadidos', r.cloudbeds_reservation_id ? 'También se anotaron en la reserva de Cloudbeds.' : undefined);
      onSucio(false);
      onGuardado(nueva);
    } catch (e) {
      showToast.fallo('añadir los extras', e);
    } finally {
      setGuardando(false);
    }
  };

  // Página completa del drawer: el selector y la lista por añadir se desplazan; el pie con el botón queda fijo.
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3">
      <SelectorProductos productos={activos} categorias={categorias} cantidades={cantidades} tasaIva={tasaIva} preciosConIva={preciosConIva} onSumar={sumar} onRestar={restar} />

      {items.length > 0 && (
        <ul className="flex flex-col" aria-label="Extras por añadir">
          {items.map((x) => (
            <li key={x.key} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex-1 min-w-32 truncate t-cuerpo">{x.producto.nombre}</span>
              {x.producto.precio_variable && (
                <label className="flex items-center gap-1.5 t-meta text-muted-foreground">
                  Precio
                  <input type="number" inputMode="decimal" step="0.01" min={0} value={x.precio} onChange={(e) => cambiar(x.key, { precio: e.target.value })} className="h-9 w-20 rounded-xl border border-border bg-card px-2 text-base text-foreground" />
                </label>
              )}
              <Contador enLinea etiquetaTexto={`Cantidad de ${x.producto.nombre}`} corto="Cant." valor={x.cantidad} min={1} max={99} onCambio={(n) => cambiar(x.key, { cantidad: n })} />
              <span className="t-cuerpo-fuerte tabular-nums w-16 text-right">{dinero(monto(x))}</span>
              <button type="button" onClick={() => quitar(x.key)} aria-label={`Quitar ${x.producto.nombre}`} className="size-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash size={16} /></button>
            </li>
          ))}
        </ul>
      )}

      </div>

      <div className="border-t border-border bg-card px-5 py-3 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={items.length === 0 || guardando}>
          {guardando ? <><Girando /> Guardando…</> : items.length === 0 ? 'Elige productos' : `Añadir ${items.length === 1 ? '1 extra' : `${items.length} extras`} · ${dinero(total)} (IVA incl.)`}
        </Button>
      </div>
    </div>
  );
}
