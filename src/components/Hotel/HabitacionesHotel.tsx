import { useState } from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Bed, CheckCircle, Door, PencilSimple, Plus, Cloud, CloudArrowDown, CloudSlash, UsersThree } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { Girando } from './Espera';
import { EditorHabitacionDrawer } from './EditorHabitacionDrawer';
import { useRxMesas } from '../../hooks/useRxMesas';
import { coincideUnidad, importarDesdeCloudbeds, intercambiarOrden, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import type { ReservaHotel } from '../../lib/hotelReservasApi';

interface Props {
  habitaciones: HabitacionHotel[];
  /** Reservas del POS: de ahí sale si cada habitación está ocupada hoy. */
  reservas?: ReservaHotel[];
  puedeEditar: boolean;
  onCambio: () => void;
}


/** Qué pasa hoy en una habitación, según las reservas vigentes del POS (la salida es el día de salida, no incluido). */
function ocupacionHoy(h: HabitacionHotel, reservas: ReservaHotel[]): { texto: string; tono: 'info' | 'warning' | 'libre' } | null {
  if (!h.cloudbeds_room_type_id) return null;
  const hoy = dayjs().format('YYYY-MM-DD');
  const vigentes = reservas.filter((r) => coincideUnidad(h, r.room_type_id, r.room_id) && r.estado === 'confirmada');
  const dentro = vigentes.find((r) => r.llegada <= hoy && r.salida > hoy);
  if (dentro) return { texto: `Ocupada hasta el ${dayjs(dentro.salida).format('DD/MM')}`, tono: 'info' };
  if (vigentes.some((r) => r.llegada === hoy)) return { texto: 'Llega hoy', tono: 'warning' };
  return { texto: 'Libre hoy', tono: 'libre' };
}

export function HabitacionesHotel({ habitaciones, reservas = [], puedeEditar, onCambio }: Props) {
  const [importando, setImportando] = useState(false);
  const [editando, setEditando] = useState<HabitacionHotel | 'nueva' | null>(null);
  // Nombre de la mesa de Mesas enlazada a cada habitación.
  const { mesas } = useRxMesas();
  const nombresMesas = new Map((mesas as Array<{ id: string; nombre: string }>).map((m) => [m.id, m.nombre]));

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
          Aún no hay habitaciones. {puedeEditar ? 'Usa «Importar desde Cloudbeds» para traer las habitaciones de una vez.' : 'Un administrador debe configurarlas.'}
        </div>
      ) : (
        <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {habitaciones.map((h, i) => {
            const hoy = ocupacionHoy(h, reservas);
            const sinEnlazar = !h.cloudbeds_room_type_id;
            const mesa = h.mesa_id ? nombresMesas.get(h.mesa_id) : undefined;
            const mesaPerdida = !!h.mesa_id && !mesa;
            const camasVisibles = h.camas.slice(0, 3);
            return (
              <li key={h.id} className={cn('flex flex-col gap-3.5 rounded-2xl border bg-card p-4', sinEnlazar ? 'border-warning/40' : 'border-border', !h.activo && 'opacity-60')}>
                {/* Cabecera: nombre y código; el estado solo si es notable. */}
                <div className="flex items-start gap-3">
                  <span className={cn('size-10 shrink-0 rounded-xl flex items-center justify-center', sinEnlazar ? 'bg-info-soft text-info-foreground' : 'bg-success-soft text-success-foreground')}><Bed size={20} weight="bold" aria-hidden /></span>
                  <span className="flex flex-col min-w-0 grow">
                    <span className="t-fila line-clamp-2 leading-snug break-words" title={h.nombre}>{h.nombre}</span>
                    <span className="flex items-center gap-2 min-w-0 t-meta text-muted-foreground">
                      <span className="truncate">{h.codigo || `Habitación ${i + 1}`}</span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums" title={h.capacidad ? `Hasta ${h.capacidad} personas` : 'Capacidad sin definir'}>
                        <UsersThree size={13} weight="bold" aria-hidden /> {h.capacidad ?? '—'}
                      </span>
                    </span>
                  </span>
                  {!h.activo && <EstadoBadge tono="neutral">Inactiva</EstadoBadge>}
                </div>

                {/* Conexiones: dónde está enlazada, con el mismo orden y alineación en todas las tarjetas. */}
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 t-meta text-muted-foreground"><Cloud size={14} weight="bold" aria-hidden /> Cloudbeds</dt>
                  <dd className={cn('t-cuerpo-fuerte truncate flex items-center gap-1.5', sinEnlazar ? 'text-warning-foreground' : 'text-success-foreground')}
                    title={sinEnlazar ? 'No se puede reservar hasta enlazarla con su habitación de Cloudbeds' : `Tipo ${h.cloudbeds_room_type_id}${h.cloudbeds_room_id ? `, unidad ${h.cloudbeds_room_id}` : ''}`}>
                    {sinEnlazar ? <><CloudSlash size={14} weight="bold" aria-hidden /> Sin enlazar</> : <><CheckCircle size={14} weight="fill" aria-hidden /> {h.cloudbeds_room_id ? 'Unidad enlazada' : 'Enlazada'}</>}
                  </dd>
                  <dt className="flex items-center gap-1.5 t-meta text-muted-foreground"><Door size={14} weight="bold" aria-hidden /> Mesas</dt>
                  <dd className={cn('t-cuerpo truncate', mesa ? 't-cuerpo-fuerte text-foreground' : mesaPerdida ? 'text-warning-foreground' : 'text-muted-foreground')} title={mesa ?? undefined}>
                    {mesa ?? (mesaPerdida ? 'La mesa ya no existe' : 'Sin enlazar')}
                  </dd>
                </dl>

                {/* Camas. */}
                <div className="flex flex-col gap-2 grow">
                  {h.camas.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Camas de ${h.nombre}`}>
                      {camasVisibles.map((c) => <li key={c} className="rounded-md bg-muted px-2 py-0.5 t-dato text-foreground">{c}</li>)}
                      {h.camas.length > camasVisibles.length && <li className="rounded-md px-1.5 py-0.5 t-dato text-muted-foreground" title={h.camas.slice(3).join(', ')}>+{h.camas.length - camasVisibles.length}</li>}
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

      <EditorHabitacionDrawer
        valor={editando} habitaciones={habitaciones}
        onClose={() => setEditando(null)}
        onGuardada={() => { setEditando(null); onCambio(); }}
      />
    </div>
  );
}
