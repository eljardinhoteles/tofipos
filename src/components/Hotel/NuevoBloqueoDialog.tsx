import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { BannerEspera, Girando } from './Espera';
import { crearBloqueoCloudbeds } from '../../lib/cloudbeds';
import type { HabitacionHotel } from '../../lib/hotelHabitacionesApi';

interface Props {
  open: boolean;
  habitaciones: HabitacionHotel[];
  /** Cabaña y fecha con las que abrir (si se llegó desde el calendario). */
  preset?: { roomTypeID?: string; desde?: string; hasta?: string } | null;
  onClose: () => void;
  onCreado: () => void;
}

const etiqueta = 't-etiqueta! text-muted-foreground';
type Tipo = 'blocked_dates' | 'out_of_service';

/** Bloquear cabañas en Cloudbeds (quedan no disponibles en todos los canales). Una sola operación para varias cabañas. */
export function NuevoBloqueoDialog({ open, habitaciones, preset, onClose, onCreado }: Props) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState<Tipo>('blocked_dates');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const disponibles = habitaciones.filter((h) => h.activo && h.cloudbeds_room_type_id);

  useEffect(() => {
    if (!open) return;
    const d = preset?.desde ?? dayjs().format('YYYY-MM-DD');
    setDesde(d); setHasta(preset?.hasta ?? dayjs(d).add(1, 'day').format('YYYY-MM-DD'));
    setElegidas(preset?.roomTypeID ? [preset.roomTypeID] : []);
    setMotivo(''); setTipo('blocked_dates'); setIntentado(false); setGuardando(false);
  }, [open, preset]);

  const noches = desde && hasta ? dayjs(hasta).diff(dayjs(desde), 'day') : 0;
  const falta = { cabanas: elegidas.length === 0, fechas: !(noches >= 1 && noches <= 366), motivo: !motivo.trim() };
  const alternar = (id: string) => setElegidas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const guardar = async () => {
    setIntentado(true);
    if (falta.cabanas || falta.fechas || falta.motivo) { showToast.warning('Completa los campos marcados en rojo'); return; }
    setGuardando(true);
    try {
      await crearBloqueoCloudbeds({ roomTypeIDs: elegidas, start: desde, end: hasta, motivo: motivo.trim(), tipo });
      showToast.success(elegidas.length === 1 ? 'Cabaña bloqueada' : `${elegidas.length} cabañas bloqueadas`, `${dayjs(desde).format('DD/MM')} al ${dayjs(hasta).format('DD/MM')} · ${motivo.trim()}`);
      onCreado();
      onClose();
    } catch (e) {
      // Cloudbeds suele rechazarlo si ya hay una reserva en esas fechas: el motivo llega en el mensaje.
      showToast.fallo('crear el bloqueo', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="t-titulo">Bloquear cabañas</DialogTitle>
          <DialogDescription className="t-meta">Las fechas quedan no disponibles en Cloudbeds y en todos los canales.</DialogDescription>
        </DialogHeader>

        {guardando && <BannerEspera texto="Creando el bloqueo en Cloudbeds…" detalle="No cierres esta ventana" />}

        <div className={cn('grid gap-4', guardando && 'opacity-60 pointer-events-none')}>
          <section className="flex flex-col gap-2">
            <h4 className={cn('t-etiqueta', intentado && falta.cabanas ? 'text-destructive' : 'text-muted-foreground')}>Cabañas {intentado && falta.cabanas && '· elige al menos una'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {disponibles.map((h) => {
                const activa = elegidas.includes(h.cloudbeds_room_type_id!);
                return (
                  <button key={h.id} type="button" aria-pressed={activa} onClick={() => alternar(h.cloudbeds_room_type_id!)}
                    className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors bg-card', activa ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary')}>
                    <span className={cn('size-5 rounded-md border flex items-center justify-center shrink-0', activa ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                      {activa && <Check size={12} weight="bold" />}
                    </span>
                    <span className="t-cuerpo-fuerte truncate">{h.nombre}</span>
                  </button>
                );
              })}
            </div>
            {disponibles.length > 1 && (
              <button type="button" onClick={() => setElegidas(elegidas.length === disponibles.length ? [] : disponibles.map((h) => h.cloudbeds_room_type_id!))} className="self-start t-meta underline cursor-pointer text-muted-foreground">
                {elegidas.length === disponibles.length ? 'Quitar todas' : 'Elegir todas'}
              </button>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Desde</Label>
              <DatePickerField value={desde} onChange={(v) => { setDesde(v); if (!hasta || hasta <= v) setHasta(dayjs(v).add(1, 'day').format('YYYY-MM-DD')); }} className="h-12 text-base bg-card border-border" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Hasta (día de salida)</Label>
              <DatePickerField value={hasta} onChange={setHasta} className={cn('h-12 text-base bg-card border-border', intentado && falta.fechas && 'border-destructive')} />
            </div>
            <p className="col-span-2 t-meta text-muted-foreground">
              {noches >= 1 ? `${noches} ${noches === 1 ? 'noche bloqueada' : 'noches bloqueadas'}; el día de salida queda libre.` : 'La salida debe ser después del inicio.'}
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <Label className={etiqueta}>Motivo * (nombre de la persona o razón)</Label>
            <Input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} aria-invalid={intentado && falta.motivo} placeholder="Ej. Producción de contenido" className="h-12 text-base" />
          </section>

          <section className="grid grid-cols-2 gap-2">
            {([['blocked_dates', 'Bloqueo', 'Reservada o apartada'], ['out_of_service', 'Mantenimiento', 'Fuera de servicio, arreglos']] as const).map(([v, titulo, ayuda]) => (
              <button key={v} type="button" aria-pressed={tipo === v} onClick={() => setTipo(v)}
                className={cn('flex flex-col items-start rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors bg-card', tipo === v ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary')}>
                <span className="t-cuerpo-fuerte">{titulo}</span>
                <span className="t-meta text-muted-foreground">{ayuda}</span>
              </button>
            ))}
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={guardando} className="gap-2">{guardando ? <><Girando /> Bloqueando…</> : 'Bloquear'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
