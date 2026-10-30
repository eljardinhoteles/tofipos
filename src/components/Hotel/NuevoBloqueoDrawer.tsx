import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, X } from '@phosphor-icons/react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Drawer, DrawerPortal, DrawerContent, DrawerTitle, DrawerDescription, DrawerHandle } from '@/components/ui/drawer';
import { FondoHoja } from '@/components/Common/FondoHoja';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { BannerEspera, Girando } from './Espera';
import { crearBloqueoCloudbeds } from '../../lib/cloudbeds';
import { claveEnlace, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';

interface Props {
  open: boolean;
  habitaciones: HabitacionHotel[];
  /** Habitación y fecha con las que abrir (si se llegó desde el calendario). */
  preset?: { roomTypeID?: string; roomID?: string; desde?: string; hasta?: string } | null;
  onClose: () => void;
  onCreado: () => void;
}

const etiqueta = 't-etiqueta! text-muted-foreground';
type Tipo = 'blocked_dates' | 'out_of_service';

/**
 * Bloquear habitaciones en Cloudbeds (quedan no disponibles en todos los canales). Una sola operación para varias habitaciones.
 * PC: panel lateral. Celular: hoja inferior (se cierra deslizando). Cabecera y pie fijos; solo el cuerpo se desplaza.
 */
export function NuevoBloqueoDrawer({ open, habitaciones, preset, onClose, onCreado }: Props) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState<Tipo>('blocked_dates');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const esMovil = useIsMobile();

  const disponibles = habitaciones.filter((h) => h.activo && h.cloudbeds_room_type_id);

  useEffect(() => {
    if (!open) return;
    const d = preset?.desde ?? dayjs().format('YYYY-MM-DD');
    setDesde(d); setHasta(preset?.hasta ?? dayjs(d).add(1, 'day').format('YYYY-MM-DD'));
    setElegidas(preset?.roomTypeID ? [claveEnlace(preset.roomTypeID, preset.roomID)] : []);
    setMotivo(''); setTipo('blocked_dates'); setIntentado(false); setGuardando(false);
  }, [open, preset]);

  const noches = desde && hasta ? dayjs(hasta).diff(dayjs(desde), 'day') : 0;
  const falta = { cabanas: elegidas.length === 0, fechas: !(noches >= 1 && noches <= 366), motivo: !motivo.trim() };
  const cerrar = () => { if (!guardando) onClose(); };
  const todasElegidas = disponibles.length > 0 && elegidas.length === disponibles.length;
  const alternar = (id: string) => setElegidas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const guardar = async () => {
    setIntentado(true);
    if (falta.cabanas || falta.fechas || falta.motivo) { showToast.warning('Completa los campos marcados en rojo'); return; }
    setGuardando(true);
    try {
      // Cada elegida es un tipo («tipo») o una unidad de un tipo con varias («tipo|unidad»).
      const partes = elegidas.map((k) => k.split('|') as [string, string | undefined]);
      const unidades = partes.filter(([, u]) => u).map(([t, u]) => ({ roomTypeID: t, roomID: u as string }));
      await crearBloqueoCloudbeds({
        roomTypeIDs: [...new Set(partes.map(([t]) => t))],
        // Con alguna unidad concreta, todas se mandan como unidad (la única de un tipo sin unidades es «<tipo>-0»).
        ...(unidades.length > 0 ? { rooms: partes.map(([t, u]) => ({ roomTypeID: t, roomID: u ?? `${t}-0` })) } : {}),
        start: desde, end: hasta, motivo: motivo.trim(), tipo,
      });
      showToast.success(elegidas.length === 1 ? 'Habitación bloqueada' : `${elegidas.length} habitaciones bloqueadas`, `${dayjs(desde).format('DD/MM')} al ${dayjs(hasta).format('DD/MM')} · ${motivo.trim()}`);
      onCreado();
      onClose();
    } catch (e) {
      // Cloudbeds suele rechazarlo si ya hay una reserva en esas fechas: el motivo llega en el mensaje.
      showToast.fallo('crear el bloqueo', e);
    } finally {
      setGuardando(false);
    }
  };

  const Titulo = esMovil ? DrawerTitle : SheetTitle;
  const Descripcion = esMovil ? DrawerDescription : SheetDescription;
  const tituloRojo = (mal: boolean) => cn('t-etiqueta', mal ? 'text-destructive' : 'text-muted-foreground');

  const contenido = (
    <>
      <div className={cn('shrink-0 px-5 pb-4 border-b border-border bg-card flex items-start justify-between gap-3', esMovil ? 'pt-7' : 'pt-5')}>
        <div className="min-w-0">
          <Titulo className="t-titulo">Bloquear habitaciones</Titulo>
          <Descripcion className="t-meta text-muted-foreground mt-0.5">Las fechas quedan no disponibles en Cloudbeds y en todos los canales.</Descripcion>
        </div>
        <button type="button" onClick={cerrar} disabled={guardando} aria-label="Cerrar sin bloquear" title="Cerrar"
          className="size-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 shrink-0">
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className={cn('flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-6', guardando && 'opacity-60 pointer-events-none')}>
        {guardando && <BannerEspera texto="Creando el bloqueo en Cloudbeds…" detalle="No cierres esta ventana" />}

        <section className="flex flex-col gap-2.5">
          <h4 className="t-etiqueta text-muted-foreground">Tipo</h4>
          <div className="grid grid-cols-2 gap-2">
            {([['blocked_dates', 'Bloqueo', 'Reservada o apartada'], ['out_of_service', 'Mantenimiento', 'Fuera de servicio, arreglos']] as const).map(([v, titulo, ayuda]) => (
              <button key={v} type="button" aria-pressed={tipo === v} onClick={() => setTipo(v)}
                className={cn('flex flex-col items-start rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors', tipo === v ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary')}>
                <span className="t-cuerpo-fuerte">{titulo}</span>
                <span className="t-meta text-muted-foreground">{ayuda}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h4 className={tituloRojo(intentado && falta.cabanas)}>Habitaciones</h4>
            {disponibles.length > 1 && (
              <button type="button" onClick={() => setElegidas(todasElegidas ? [] : disponibles.map((h) => claveEnlace(h.cloudbeds_room_type_id, h.cloudbeds_room_id)))} className="t-dato text-primary cursor-pointer hover:underline">
                {todasElegidas ? 'Quitar todas' : 'Elegir todas'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {disponibles.map((h) => {
              const clave = claveEnlace(h.cloudbeds_room_type_id, h.cloudbeds_room_id);
              const activa = elegidas.includes(clave);
              return (
                <button key={h.id} type="button" aria-pressed={activa} onClick={() => alternar(clave)}
                  className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors min-h-12', activa ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary')}>
                  <span className={cn('size-5 rounded-md border flex items-center justify-center shrink-0', activa ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-card')}>
                    {activa && <Check size={12} weight="bold" />}
                  </span>
                  <span className="t-cuerpo-fuerte truncate">{h.nombre}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h4 className={tituloRojo(intentado && falta.fechas)}>Fechas</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Desde</Label>
              <DatePickerField value={desde} onChange={(v) => { setDesde(v); if (!hasta || hasta <= v) setHasta(dayjs(v).add(1, 'day').format('YYYY-MM-DD')); }} className="h-12 text-base bg-card border-border" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Hasta (día de salida)</Label>
              <DatePickerField value={hasta} onChange={setHasta} className={cn('h-12 text-base bg-card border-border', intentado && falta.fechas && 'border-destructive')} />
            </div>
          </div>
          <p className="t-meta text-muted-foreground">
            {noches >= 1 ? `${noches} ${noches === 1 ? 'noche bloqueada' : 'noches bloqueadas'}; el día de salida queda libre.` : 'La salida debe ser después del inicio.'}
          </p>
        </section>



        <section className="flex flex-col gap-2.5">
          <Label className={tituloRojo(intentado && falta.motivo)}>Motivo * (nombre de la persona o razón)</Label>
          <Input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} aria-invalid={intentado && falta.motivo} placeholder="Ej. Producción de contenido" className="h-12 text-base" />
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="flex gap-2">
          <Button type="button" variant="suave" onClick={cerrar} disabled={guardando} className="h-12 px-5 rounded-2xl">Cancelar</Button>
          <Button type="button" onClick={guardar} disabled={guardando || elegidas.length === 0} className="flex-1 h-12 gap-2 rounded-2xl">{guardando ? <><Girando /> Bloqueando…</> : 'Bloquear'}</Button>
        </div>
      </div>
    </>
  );

  if (esMovil) {
    return (
      <>
        <FondoHoja abierto={open} onClose={cerrar} />
        <Drawer open={open} onOpenChange={(o) => { if (!o) cerrar(); }} dismissible={!guardando}>
          <DrawerPortal>
            <DrawerContent className="fixed bottom-0 left-0 right-0 max-h-[92dvh] bg-background rounded-t-marco shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
              <DrawerHandle />
              {contenido}
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      </>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg p-0 flex flex-col gap-0 data-[side=right]:border-l-0 bg-background shadow-2xl">
        {contenido}
      </SheetContent>
    </Sheet>
  );
}
