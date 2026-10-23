import { useEffect, useState, type ReactNode } from 'react';
import { Bed, Cloud, CloudSlash, Door, Plus, Power, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { Girando } from './Espera';
import { useRxMesas } from '../../hooks/useRxMesas';
import { getInventarioCloudbeds, type TipoHabitacionCloudbeds, type UnidadCloudbeds } from '../../lib/cloudbeds';
import {
  actualizarHabitacion, claveEnlace, crearHabitacion, propagarNombreHabitacion, type HabitacionHotel,
} from '../../lib/hotelHabitacionesApi';
import { agruparPlantas, componerCama } from '../../lib/hotelCamas';

const etiqueta = 't-etiqueta! text-muted-foreground';
const SIN_ENLACE = '__sin_enlace__';
const selector = 'data-[size=default]:h-12 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs';

/** Una sección del drawer: papel blanco con su título y, opcional, una línea de ayuda. */
function Seccion({ icono, titulo, ayuda, children }: { icono: ReactNode; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <h3 className="flex items-center gap-2 t-etiqueta text-muted-foreground">{icono}{titulo}</h3>
        {ayuda && <p className="t-meta text-muted-foreground">{ayuda}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * Editor de una habitación del Hotel, en un drawer lateral: datos básicos, conexiones (Cloudbeds y Mesas), camas y estado. El pie con
 * «Guardar» queda siempre a la vista. `valor`: la habitación a editar, 'nueva' para crear, null = cerrado.
 */
export function EditorHabitacionDrawer({ valor, habitaciones, onClose, onGuardada }: {
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
  const [mesaId, setMesaId] = useState(SIN_ENLACE);
  const { mesas } = useRxMesas();
  const [camas, setCamas] = useState<string[]>([]);
  const [camaNueva, setCamaNueva] = useState('');
  const [plantaNueva, setPlantaNueva] = useState('');
  const [inventario, setInventario] = useState<{ tipos: TipoHabitacionCloudbeds[]; unidades: UnidadCloudbeds[] }>({ tipos: [], unidades: [] });
  const [errorTipos, setErrorTipos] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abierto = valor !== null;
  const actual = valor && valor !== 'nueva' ? valor : null;

  useEffect(() => {
    if (!abierto) return;
    setNombre(actual?.nombre ?? ''); setCodigo(actual?.codigo ?? '');
    setCapacidad(actual?.capacidad ? String(actual.capacidad) : '');
    setActivo(actual?.activo ?? true);
    setEnlace(actual?.cloudbeds_room_type_id ? claveEnlace(actual.cloudbeds_room_type_id, actual.cloudbeds_room_id) : SIN_ENLACE);
    setMesaId(actual?.mesa_id ?? SIN_ENLACE);
    setCamas(actual?.camas ?? []); setCamaNueva(''); setPlantaNueva('');
    setErrorTipos('');
    getInventarioCloudbeds().then(setInventario).catch((e) => setErrorTipos(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'));
  }, [abierto, actual]);

  // Lugares enlazables: un tipo con UNA unidad se enlaza por tipo; un tipo con VARIAS se enlaza por unidad (Matrimonial #2, #4…).
  const usados = new Set(habitaciones.filter((h) => h.id !== actual?.id).map((h) => claveEnlace(h.cloudbeds_room_type_id, h.cloudbeds_room_id)));
  const lugares = inventario.tipos.flatMap((t) => {
    const units = inventario.unidades.filter((u) => u.roomTypeID === t.roomTypeID);
    return units.length > 1
      ? units.map((u) => ({ clave: claveEnlace(t.roomTypeID, u.roomID), etiqueta: `${t.nombre} · ${u.nombre}` }))
      : [{ clave: claveEnlace(t.roomTypeID), etiqueta: units[0]?.nombre && units[0].nombre !== t.nombre ? `${t.nombre} · ${units[0].nombre}` : t.nombre }];
  });
  const opciones = lugares.filter((l) => !usados.has(l.clave));
  const claveActual = actual?.cloudbeds_room_type_id ? claveEnlace(actual.cloudbeds_room_type_id, actual.cloudbeds_room_id) : null;
  const enlazadaCb = enlace !== SIN_ENLACE;

  // Habitaciones de Mesas (mesas del piso «Habitaciones») que se pueden enlazar: las que no usa otra habitación del Hotel.
  const mesasUsadas = new Set(habitaciones.filter((h) => h.id !== actual?.id).map((h) => h.mesa_id).filter(Boolean));
  const mesasHab = (mesas as Array<{ id: string; nombre: string; piso?: string }>)
    .filter((m) => m.piso?.toLowerCase() === 'habitaciones' && !mesasUsadas.has(m.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const mesaElegida = mesasHab.find((m) => m.id === mesaId);

  const agregarCama = () => {
    const c = componerCama(plantaNueva, camaNueva);
    if (camaNueva.trim() && !camas.some((x) => x.toLowerCase() === c.toLowerCase())) setCamas((a) => [...a, c]);
    setCamaNueva('');
  };

  const guardar = async () => {
    if (!nombre.trim()) { showToast.warning('Escribe el nombre de la habitación'); return; }
    const cap = capacidad.trim() ? parseInt(capacidad, 10) : null;
    if (cap !== null && !(cap >= 1)) { showToast.warning('La capacidad debe ser 1 o más'); return; }
    const datos = {
      nombre: nombre.trim(), codigo: codigo.trim() || null, capacidad: cap, activo,
      cloudbeds_room_type_id: enlace === SIN_ENLACE ? null : enlace.split('|')[0],
      cloudbeds_room_id: enlace === SIN_ENLACE ? null : enlace.split('|')[1] ?? null,
      mesa_id: mesaId === SIN_ENLACE ? null : mesaId,
      camas: camaNueva.trim() && !camas.includes(componerCama(plantaNueva, camaNueva)) ? [...camas, componerCama(plantaNueva, camaNueva)] : camas,
    };
    setGuardando(true);
    try {
      if (actual) {
        await actualizarHabitacion(actual.id, datos);
        // Renombrada: las reservas que ya la usan guardan el nombre viejo en su texto; se actualiza.
        if (datos.nombre !== actual.nombre) await propagarNombreHabitacion(actual, datos.nombre);
      } else {
        await crearHabitacion(datos, habitaciones.reduce((m, h) => Math.max(m, h.orden), 0) + 1);
      }
      showToast.success(actual ? 'Habitación actualizada' : 'Habitación creada');
      onGuardada();
    } catch (e) {
      showToast.fallo('guardar la habitación', e);
    } finally {
      setGuardando(false);
    }
  };

  // Camas agrupadas por planta si la habitación las usa; si no, una sola lista.
  const grupos = agruparPlantas(camas);
  const chipCama = (c: string, texto: string) => (
    <li key={c} className="flex items-center gap-1 rounded-full bg-muted pl-3 pr-1 min-h-9">
      <span className="t-cuerpo">{texto}</span>
      <button type="button" onClick={() => setCamas((a) => a.filter((x) => x !== c))} aria-label={`Quitar ${c}`}
        className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><X size={14} weight="bold" /></button>
    </li>
  );

  return (
    <Sheet open={abierto} onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg p-0 flex flex-col gap-0 data-[side=right]:border-l-0 bg-background shadow-2xl">
        <SheetHeader className="px-5 pt-4 pb-4 border-b border-border bg-card flex flex-col gap-3 text-left">
          <div className="flex items-center gap-3 pr-10 min-w-0">
            <span className={cn('size-11 shrink-0 rounded-2xl flex items-center justify-center', enlazadaCb ? 'bg-success-soft text-success-foreground' : 'bg-info-soft text-info-foreground')}><Bed size={22} weight="bold" aria-hidden /></span>
            <div className="flex flex-col min-w-0">
              <SheetTitle className="t-titulo truncate">{actual ? (nombre.trim() || actual.nombre) : 'Nueva habitación'}</SheetTitle>
              <SheetDescription className="t-meta">{actual ? 'Editar habitación' : 'Se crea una vez y se enlaza con Cloudbeds y con Mesas.'}</SheetDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {enlazadaCb
              ? <EstadoBadge tono="success"><span className="flex items-center gap-1"><Cloud size={13} weight="bold" aria-hidden /> Conectada con Cloudbeds</span></EstadoBadge>
              : <EstadoBadge tono="warning"><span className="flex items-center gap-1"><CloudSlash size={13} weight="bold" aria-hidden /> Sin enlazar con Cloudbeds</span></EstadoBadge>}
            {mesaId !== SIN_ENLACE && <EstadoBadge tono="info"><span className="flex items-center gap-1"><Door size={13} weight="bold" aria-hidden /> En Mesas</span></EstadoBadge>}
            {!activo && <EstadoBadge tono="neutral">Inactiva</EstadoBadge>}
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <Seccion icono={<Bed size={14} weight="bold" aria-hidden />} titulo="Datos básicos" ayuda="El nombre es solo del POS: no se envía a Cloudbeds.">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hab-nombre" className={etiqueta}>Nombre *</Label>
              <Input id="hab-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 text-base" autoFocus={!actual} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hab-codigo" className={etiqueta}>Código corto</Label>
                <Input id="hab-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="h-12 text-base" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hab-capacidad" className={etiqueta}>Capacidad</Label>
                <Input id="hab-capacidad" type="number" inputMode="numeric" min={1} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="Personas" className="h-12 text-base" />
              </div>
            </div>
          </Seccion>

          <Seccion icono={<Cloud size={14} weight="bold" aria-hidden />} titulo="Conexiones" ayuda="Cloudbeds es el inventario; Mesas es donde se abre la cuenta del huésped.">
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Habitación en Cloudbeds</Label>
              <Select value={enlace} onValueChange={setEnlace}>
                <SelectTrigger className={selector}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ENLACE} className="t-cuerpo">Sin enlazar</SelectItem>
                  {claveActual && !opciones.some((l) => l.clave === claveActual) && (
                    <SelectItem value={claveActual} className="t-cuerpo">Enlace actual ({claveActual.replace('|', ' · ')})</SelectItem>
                  )}
                  {opciones.map((l) => <SelectItem key={l.clave} value={l.clave} className="t-cuerpo">{l.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
              {errorTipos && <p className="t-meta text-destructive">{errorTipos}</p>}
              {!enlazadaCb && !errorTipos && <p className="t-meta text-warning-foreground">Sin enlazar no se puede reservar.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Habitación en Mesas</Label>
              <Select value={mesaId} onValueChange={setMesaId}>
                <SelectTrigger className={selector}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ENLACE} className="t-cuerpo">Sin enlazar</SelectItem>
                  {mesasHab.map((m) => <SelectItem key={m.id} value={m.id} className="t-cuerpo">{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {mesaElegida && mesaElegida.nombre !== nombre.trim() && (
                <Button type="button" variant="outline" className="self-start h-10 gap-1.5 max-w-full" onClick={() => setNombre(mesaElegida.nombre)}>
                  <span className="truncate">Usar el nombre de Mesas: «{mesaElegida.nombre}»</span>
                </Button>
              )}
              <p className="t-meta text-muted-foreground">Al elegir una llegada en Mesas se sugiere esta habitación; el personal puede abrir otra libre.</p>
            </div>
          </Seccion>

          <Seccion icono={<Bed size={14} weight="bold" aria-hidden />} titulo="Camas" ayuda="Se elige al reservar y se puede cambiar después. Es solo del POS: no va a Cloudbeds ni afecta la disponibilidad.">
            {camas.length === 0 ? (
              <p className="t-meta text-muted-foreground">Aún no hay camas. Añade las que puede llevar esta habitación.</p>
            ) : grupos ? (
              <div className="flex flex-col gap-2.5" aria-label="Camas de la habitación">
                {grupos.map((g) => (
                  <div key={g.planta} className="flex flex-col gap-1.5">
                    <span className="t-etiqueta text-muted-foreground">{g.planta}</span>
                    <ul className="flex flex-wrap gap-1.5">{g.camas.map((c) => chipCama(c, c.slice(g.planta.length + 2)))}</ul>
                  </div>
                ))}
                {camas.filter((c) => !grupos.some((g) => g.camas.includes(c))).length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">{camas.filter((c) => !grupos.some((g) => g.camas.includes(c))).map((c) => chipCama(c, c))}</ul>
                )}
              </div>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Camas de la habitación">{camas.map((c) => chipCama(c, c))}</ul>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-3.5">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={camaNueva} onChange={(e) => setCamaNueva(e.target.value)} placeholder="Ej. Matrimonial, 2 individuales" aria-label="Nueva cama" className="h-12 text-base"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCama(); } }} />
                <Button type="button" variant="outline" className="h-12 gap-1.5" onClick={agregarCama} disabled={!camaNueva.trim()}><Plus size={16} weight="bold" /> Añadir</Button>
              </div>
              <Input value={plantaNueva} onChange={(e) => setPlantaNueva(e.target.value)} list="plantas-hab" placeholder="Planta (solo si la habitación tiene varias, p. ej. Planta 1)" aria-label="Planta de la cama" className="h-11 text-base"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCama(); } }} />
              <datalist id="plantas-hab">{(grupos ?? []).map((g) => <option key={g.planta} value={g.planta} />)}</datalist>
            </div>
          </Seccion>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 cursor-pointer">
            <span className="flex items-center gap-3 min-w-0">
              <span className={cn('size-9 shrink-0 rounded-xl flex items-center justify-center', activo ? 'bg-success-soft text-success-foreground' : 'bg-muted text-muted-foreground')}><Power size={18} weight="bold" aria-hidden /></span>
              <span className="flex flex-col min-w-0">
                <span className="t-cuerpo-fuerte">Habitación activa</span>
                <span className="t-meta text-muted-foreground">{activo ? 'Se muestra en el calendario y se puede reservar.' : 'Oculta del calendario; no se puede reservar.'}</span>
              </span>
            </span>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </label>
        </div>

        <div className="shrink-0 border-t border-border bg-card px-4 py-3 flex items-center gap-2">
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button type="button" className="h-12 flex-[1.4]" onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
            {guardando ? <><Girando /> Guardando…</> : actual ? 'Guardar cambios' : 'Crear habitación'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
