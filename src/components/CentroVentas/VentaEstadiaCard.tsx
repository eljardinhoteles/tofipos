import { useState } from 'react';
import dayjs from 'dayjs';
import { Bed, PencilSimple, Check, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { showToast } from '@/lib/toast';
import { updateRxVenta } from '../../db/rxdb';
import type { RxVenta } from '../../db/rxdb';

const fecha = (f?: string) => (f ? dayjs(f).format('DD/MM/YYYY') : '—');

/**
 * Estadía de una venta de reserva de hotel (llegada y salida). La llegada alimenta las tarjetas de «Llegadas» de
 * Mesas › Hotel; las reservas registradas antes de que existiera el campo se completan desde aquí. Es una corrección
 * de datos: no pasa por el historial de movimientos.
 */
export function VentaEstadiaCard({ venta }: { venta: RxVenta }) {
  const [editando, setEditando] = useState(false);
  const [llegada, setLlegada] = useState(venta.llegada ?? '');
  const [salida, setSalida] = useState(venta.salida ?? '');
  const [saving, setSaving] = useState(false);
  const salidaInvalida = !!llegada && !!salida && salida < llegada;

  const empezar = () => { setLlegada(venta.llegada ?? ''); setSalida(venta.salida ?? ''); setEditando(true); };

  const guardar = async () => {
    if (!llegada) { showToast.error('Indica la fecha de llegada'); return; }
    if (salidaInvalida) { showToast.error('La salida no puede ser antes de la llegada'); return; }
    setSaving(true);
    try {
      await updateRxVenta(venta.id, { llegada, salida: salida || undefined });
      showToast.success('Estadía actualizada');
      setEditando(false);
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo actualizar la estadía');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card shadow-2xs px-5 py-3.5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 t-etiqueta text-muted-foreground"><Bed size={16} weight="bold" /> Estadía</span>
        {!editando && (
          <Button type="button" variant="ghost" size="icon" onClick={empezar} title="Editar estadía" aria-label="Editar estadía" className="text-muted-foreground hover:text-primary">
            <PencilSimple size={16} />
          </Button>
        )}
      </div>

      {editando ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="t-etiqueta! text-muted-foreground">Llegada *</Label>
              <DatePickerField value={llegada} onChange={setLlegada} className="h-12 text-base bg-card border-border" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="t-etiqueta! text-muted-foreground">Salida (opcional)</Label>
              <DatePickerField value={salida} onChange={setSalida} className="h-12 text-base bg-card border-border" />
            </div>
          </div>
          {salidaInvalida && <p className="t-meta text-destructive">La salida no puede ser antes de la llegada</p>}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditando(false)} disabled={saving} className="h-12 flex-1 font-bold"><X size={14} /> Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={saving} className="h-12 flex-1 font-bold"><Check size={14} /> Guardar</Button>
          </div>
        </>
      ) : venta.llegada ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col"><span className="t-etiqueta text-muted-foreground">Llegada</span><span className="t-cuerpo-fuerte text-foreground tabular-nums">{fecha(venta.llegada)}</span></div>
          <div className="flex flex-col"><span className="t-etiqueta text-muted-foreground">Salida</span><span className="t-cuerpo-fuerte text-foreground tabular-nums">{fecha(venta.salida)}</span></div>
        </div>
      ) : (
        <p className="t-meta text-muted-foreground">Sin fecha de llegada: agrégala para que la reserva aparezca en las llegadas de Mesas › Hotel.</p>
      )}
    </div>
  );
}
