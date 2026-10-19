import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Bed, PencilSimple, Plus, CloudArrowDown, UsersThree, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { Girando } from './Espera';
import { getTiposHabitacion, type TipoHabitacionCloudbeds } from '../../lib/cloudbeds';
import {
  actualizarHabitacion, crearHabitacion, importarDesdeCloudbeds, intercambiarOrden, type HabitacionHotel,
} from '../../lib/hotelHabitacionesApi';
import type { ReservaHotel } from '../../lib/hotelReservasApi';

interface Props {
  habitaciones: HabitacionHotel[];
  /** Reservas del POS: de ahí sale si cada habitación está ocupada hoy. */
  reservas?: ReservaHotel[];
  puedeEditar: boolean;
  onCambio: () => void;
}

const etiqueta = 't-etiqueta! text-muted-foreground';
const SIN_ENLACE = '__sin_enlace__';

/** Qué pasa hoy en una habitación, según las reservas vigentes del POS (la salida es el día de salida, no incluido). */
function ocupacionHoy(h: HabitacionHotel, reservas: ReservaHotel[]): { texto: string; tono: 'info' | 'warning' | 'libre' } | null {
  if (!h.cloudbeds_room_type_id) return null;
  const hoy = dayjs().format('YYYY-MM-DD');
  const vigentes = reservas.filter((r) => r.room_type_id === h.cloudbeds_room_type_id && r.estado === 'confirmada');
  const dentro = vigentes.find((r) => r.llegada <= hoy && r.salida > hoy);
  if (dentro) return { texto: `Ocupada hasta el ${dayjs(dentro.salida).format('DD/MM')}`, tono: 'info' };
  if (vigentes.some((r) => r.llegada === hoy)) return { texto: 'Llega hoy', tono: 'warning' };
  return { texto: 'Libre hoy', tono: 'libre' };
}

export function HabitacionesHotel({ habitaciones, reservas = [], puedeEditar, onCambio }: Props) {
  const [importando, setImportando] = useState(false);
  const [editando, setEditando] = useState<HabitacionHotel | 'nueva' | null>(null);

  const importar = async () => {
    setImportando(true);
    try {
      const n = await importarDesdeCloudbeds(habitaciones);
      if (n === 0) showToast.info('Todo está al día', 'Todas las habitaciones de Cloudbeds ya están enlazadas.');
      else showToast.success(`${n} ${n === 1 ? 'habitación importada' : 'habitaciones importadas'}`, 'Puedes cambiarles el nombre y el orden.');
      onCambio();
    } catch (e) {
      showToast.fallo('importar desde Cloudbeds', e);
    } finally {
      setImportando(false);
    }
  };

  const mover = async (i: number, d: -1 | 1) => {
    const otra = habitaciones[i + d];
    if (!otra) return;
    try { await intercambiarOrden(habitaciones[i], otra); onCambio(); } catch (e) { showToast.fallo('cambiar el orden', e); }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-meta text-muted-foreground max-w-xl">
          Las habitaciones se crean aquí una sola vez y se enlazan con su tipo de habitación de Cloudbeds. El calendario usa esta lista, así que no se consultan nombres ni IDs cada vez.
        </p>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={importar} disabled={importando} className="gap-1.5">
              {importando ? <Girando /> : <CloudArrowDown size={16} weight="bold" />} {importando ? 'Importando…' : 'Importar desde Cloudbeds'}
            </Button>
            <Button type="button" onClick={() => setEditando('nueva')} className="gap-1.5"><Plus size={16} weight="bold" /> Nueva</Button>
          </div>
        )}
      </div>

      {habitaciones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center t-cuerpo text-muted-foreground">
          Aún no hay habitaciones. {puedeEditar ? 'Usa «Importar desde Cloudbeds» para traer las cabañas de una vez.' : 'Un administrador debe configurarlas.'}
        </div>
      ) : (
        <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {habitaciones.map((h, i) => {
            const hoy = ocupacionHoy(h, reservas);
            const sinEnlazar = !h.cloudbeds_room_type_id;
            return (
              <li key={h.id} className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4', sinEnlazar ? 'border-warning/40' : 'border-border', !h.activo && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span className="size-10 shrink-0 rounded-xl bg-info-soft text-info-foreground flex items-center justify-center"><Bed size={20} weight="bold" aria-hidden /></span>
                  <span className="flex flex-col min-w-0 grow">
                    <span className="t-fila truncate">{h.nombre}</span>
                    <span className="t-meta text-muted-foreground truncate">{h.codigo || `Habitación ${i + 1}`}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    {!h.activo && <EstadoBadge tono="neutral">Inactiva</EstadoBadge>}
                    {sinEnlazar && <EstadoBadge tono="warning" title="No se puede reservar hasta enlazarla con su tipo de habitación de Cloudbeds">Sin enlazar</EstadoBadge>}
                  </span>
                </div>
                <div className="flex flex-col gap-2 grow">
                  <span className="t-cuerpo text-muted-foreground flex items-center gap-1.5">
                    <UsersThree size={16} aria-hidden /> {h.capacidad ? `Hasta ${h.capacidad} personas` : 'Capacidad sin definir'}
                  </span>
                  {h.camas.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Camas de ${h.nombre}`}>
                      {h.camas.map((c) => <li key={c} className="rounded-md bg-muted px-2 py-0.5 t-dato text-foreground">{c}</li>)}
                    </ul>
                  ) : (
                    <span className="t-meta text-muted-foreground">Sin camas definidas</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  {hoy
                    ? hoy.tono === 'libre'
                      ? <span className="t-meta text-muted-foreground">{hoy.texto}</span>
                      : <EstadoBadge tono={hoy.tono}>{hoy.texto}</EstadoBadge>
                    : <span />}
                  {puedeEditar && (
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" aria-label={`Mover ${h.nombre} antes`} title="Mover antes" disabled={i === 0} onClick={() => mover(i, -1)} className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default"><ArrowLeft size={16} /></button>
                      <button type="button" aria-label={`Mover ${h.nombre} después`} title="Mover después" disabled={i === habitaciones.length - 1} onClick={() => mover(i, 1)} className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default"><ArrowRight size={16} /></button>
                      <button type="button" aria-label={`Editar ${h.nombre}`} title="Editar" onClick={() => setEditando(h)} className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"><PencilSimple size={16} /></button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditorHabitacion
        valor={editando} habitaciones={habitaciones}
        onClose={() => setEditando(null)}
        onGuardada={() => { setEditando(null); onCambio(); }}
      />
    </div>
  );
}

function EditorHabitacion({ valor, habitaciones, onClose, onGuardada }: {
  valor: HabitacionHotel | 'nueva' | null;
  habitaciones: HabitacionHotel[];
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [activo, setActivo] = useState(true);
  const [enlace, setEnlace] = useState(SIN_ENLACE);
  const [camas, setCamas] = useState<string[]>([]);
  const [camaNueva, setCamaNueva] = useState('');
  const [tipos, setTipos] = useState<TipoHabitacionCloudbeds[]>([]);
  const [errorTipos, setErrorTipos] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abierto = valor !== null;
  const actual = valor && valor !== 'nueva' ? valor : null;

  useEffect(() => {
    if (!abierto) return;
    setNombre(actual?.nombre ?? ''); setCodigo(actual?.codigo ?? '');
    setCapacidad(actual?.capacidad ? String(actual.capacidad) : '');
    setActivo(actual?.activo ?? true); setEnlace(actual?.cloudbeds_room_type_id ?? SIN_ENLACE);
    setCamas(actual?.camas ?? []); setCamaNueva('');
    setErrorTipos('');
    getTiposHabitacion().then(setTipos).catch((e) => setErrorTipos(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'));
  }, [abierto, actual]);

  // Tipos libres + el que ya tiene esta habitación.
  const usados = new Set(habitaciones.filter((h) => h.id !== actual?.id).map((h) => h.cloudbeds_room_type_id));
  const opciones = tipos.filter((t) => !usados.has(t.roomTypeID));

  const agregarCama = () => {
    const c = camaNueva.trim();
    if (c && !camas.some((x) => x.toLowerCase() === c.toLowerCase())) setCamas((a) => [...a, c]);
    setCamaNueva('');
  };

  const guardar = async () => {
    if (!nombre.trim()) { showToast.warning('Escribe el nombre de la habitación'); return; }
    const cap = capacidad.trim() ? parseInt(capacidad, 10) : null;
    if (cap !== null && !(cap >= 1)) { showToast.warning('La capacidad debe ser 1 o más'); return; }
    const datos = {
      nombre: nombre.trim(), codigo: codigo.trim() || null, capacidad: cap, activo,
      cloudbeds_room_type_id: enlace === SIN_ENLACE ? null : enlace,
      camas: camaNueva.trim() && !camas.includes(camaNueva.trim()) ? [...camas, camaNueva.trim()] : camas,
    };
    setGuardando(true);
    try {
      if (actual) await actualizarHabitacion(actual.id, datos);
      else await crearHabitacion(datos, habitaciones.reduce((m, h) => Math.max(m, h.orden), 0) + 1);
      showToast.success(actual ? 'Habitación actualizada' : 'Habitación creada');
      onGuardada();
    } catch (e) {
      showToast.fallo('guardar la habitación', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-titulo">{actual ? 'Editar habitación' : 'Nueva habitación'}</DialogTitle>
          <DialogDescription className="t-meta">El nombre es solo del POS; el enlace indica a qué cabaña de Cloudbeds corresponde.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className={etiqueta}>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 text-base" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Código corto</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Capacidad</Label>
              <Input type="number" inputMode="numeric" min={1} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className="h-12 text-base" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className={etiqueta}>Enlace con Cloudbeds</Label>
            <Select value={enlace} onValueChange={setEnlace}>
              <SelectTrigger className="data-[size=default]:h-12 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ENLACE} className="t-cuerpo">Sin enlazar</SelectItem>
                {actual?.cloudbeds_room_type_id && !opciones.some((t) => t.roomTypeID === actual.cloudbeds_room_type_id) && (
                  <SelectItem value={actual.cloudbeds_room_type_id} className="t-cuerpo">Enlace actual ({actual.cloudbeds_room_type_id})</SelectItem>
                )}
                {opciones.map((t) => <SelectItem key={t.roomTypeID} value={t.roomTypeID} className="t-cuerpo">{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            {errorTipos && <p className="t-meta text-destructive">{errorTipos}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className={etiqueta}>Camas disponibles</Label>
            {camas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Camas de la habitación">
                {camas.map((c) => (
                  <li key={c} className="flex items-center gap-1 rounded-full bg-muted pl-3 pr-1 min-h-9">
                    <span className="t-cuerpo">{c}</span>
                    <button type="button" onClick={() => setCamas((a) => a.filter((x) => x !== c))} aria-label={`Quitar ${c}`} className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><X size={14} weight="bold" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Input value={camaNueva} onChange={(e) => setCamaNueva(e.target.value)} placeholder="Ej. Matrimonial, 2 individuales" className="h-12 text-base"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCama(); } }} />
              <Button type="button" variant="outline" className="h-12 shrink-0" onClick={agregarCama} disabled={!camaNueva.trim()}>Añadir</Button>
            </div>
            <p className="t-meta text-muted-foreground">Se elige al reservar y se puede cambiar después. Es solo del POS: no va a Cloudbeds ni afecta la disponibilidad.</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 cursor-pointer">
            <span className="t-cuerpo-fuerte">Activa (se muestra en el calendario)</span>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
