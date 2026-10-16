import { useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { PencilSimple, Check, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { showToast } from '@/lib/toast';
import { updateRxVenta } from '../../db/rxdb';
import type { RxVenta } from '../../db/rxdb';

const dia = (f: string) => dayjs(f).locale('es').format('ddd D MMM');

/**
 * Estadía de una venta de reserva de hotel (llegada y salida), en una línea dentro de la tarjeta principal de la venta, con el
 * lápiz que abre un panel para editarla. La llegada alimenta las tarjetas de «Llegadas» de Mesas › Hotel; las reservas registradas
 * antes de que existiera el campo se completan desde aquí. Es una corrección de datos: no pasa por el historial de movimientos.
 */
export function VentaEstadia({ venta }: { venta: RxVenta }) {
  const [abierto, setAbierto] = useState(false);
  const [llegada, setLlegada] = useState(venta.llegada ?? '');
  const [salida, setSalida] = useState(venta.salida ?? '');
  const [saving, setSaving] = useState(false);
  const salidaInvalida = !!llegada && !!salida && salida < llegada;
  const noches = venta.llegada && venta.salida ? dayjs(venta.salida).diff(dayjs(venta.llegada), 'day') : 0;

  // Al abrir el panel se parte siempre de lo guardado.
  const alCambiarAbierto = (v: boolean) => {
    if (v) { setLlegada(venta.llegada ?? ''); setSalida(venta.salida ?? ''); }
    setAbierto(v);
  };

  const guardar = async () => {
    if (!llegada) { showToast.warning('Indica la fecha de llegada'); return; }
    if (salidaInvalida) { showToast.warning('La salida no puede ser antes de la llegada'); return; }
    setSaving(true);
    try {
      await updateRxVenta(venta.id, { llegada, salida: salida || undefined });
      showToast.success('Estadía actualizada');
      setAbierto(false);
    } catch (e) {
      showToast.fallo('actualizar la estadía', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={abierto} onOpenChange={alCambiarAbierto}>
      {/* Toda la fila es el botón que abre el panel (no solo el lápiz); el lápiz es solo la pista visual. */}
      <PopoverTrigger asChild>
        <button type="button" title={venta.llegada ? 'Editar estadía' : 'Agregar fechas de estadía'}
          aria-label={venta.llegada ? `Editar estadía: ${dia(venta.llegada)}${venta.salida ? ` a ${dia(venta.salida)}` : ''}` : 'Agregar fechas de estadía'}
          className="group/estadia flex items-center gap-1.5 min-w-0 max-w-full min-h-8 pointer-coarse:min-h-11 -mx-2 px-2 rounded-xl text-left cursor-pointer transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/40 outline-none">
          {venta.llegada ? (
            <span className="t-cuerpo text-foreground tabular-nums truncate">
              {dia(venta.llegada)}{venta.salida ? ` → ${dia(venta.salida)}` : ''}
              {noches > 0 && <span className="text-muted-foreground"> · {noches} {noches === 1 ? 'noche' : 'noches'}</span>}
            </span>
          ) : (
            <span className="t-meta text-muted-foreground truncate">Sin fecha de llegada · agregar</span>
          )}
          <PencilSimple size={14} aria-hidden="true" className="shrink-0 text-muted-foreground group-hover/estadia:text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Label className="t-etiqueta! text-muted-foreground">Llegada *</Label>
          <DatePickerField value={llegada} onChange={setLlegada} className="h-12 text-base bg-card border-border" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="t-etiqueta! text-muted-foreground">Salida (opcional)</Label>
          <DatePickerField value={salida} onChange={setSalida} className="h-12 text-base bg-card border-border" />
        </div>
        {salidaInvalida && <p className="t-meta text-destructive">La salida no puede ser antes de la llegada</p>}
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={saving} className="h-12 flex-1 font-bold"><X size={14} /> Cancelar</Button>
          <Button type="button" onClick={guardar} disabled={saving} className="h-12 flex-1 font-bold"><Check size={14} /> Guardar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
