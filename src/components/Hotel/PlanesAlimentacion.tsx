import { useEffect, useState } from 'react';
import { ForkKnife, PencilSimple, Plus, Star } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { actualizarPlan, crearPlan, incluyeDelPlan, planesDisponibles, type PlanAlimentacion } from '../../lib/hotelPlanesApi';
import { dinero } from './detalle/formatos';

interface Props {
  planes: PlanAlimentacion[];
  puedeEditar: boolean;
  onCambio: () => void;
}

const etiqueta = 't-etiqueta! text-muted-foreground';

/** Planes de alimentación del hotel: se crean una vez aquí y se asignan a cada reserva según sus adultos y niños. */
export function PlanesAlimentacion({ planes, puedeEditar, onCambio }: Props) {
  const [editando, setEditando] = useState<PlanAlimentacion | 'nuevo' | null>(null);

  const marcarDefecto = async (p: PlanAlimentacion) => {
    try { await actualizarPlan(p.id, { por_defecto: !p.por_defecto }); onCambio(); } catch (e) { showToast.fallo('cambiar el plan por defecto', e); }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-meta text-muted-foreground max-w-xl">
          Cada reserva puede llevar un plan de alimentación según sus adultos y niños. El plan marcado con la estrella se preselecciona al crear una reserva (se puede cambiar o dejar sin plan); las reservas anteriores quedan sin plan hasta elegirlo a mano. Un plan puede ir incluido en la tarifa o tener precio por adulto y por niño por noche, que se suma a la reserva.
        </p>
        {puedeEditar && planesDisponibles && <Button type="button" onClick={() => setEditando('nuevo')} className="gap-1.5"><Plus size={16} weight="bold" /> Nuevo plan</Button>}
      </div>

      {!planesDisponibles ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center t-cuerpo text-muted-foreground">
          Para usar planes de alimentación, ejecuta la migración <b>20261019000200_hotel_planes_alimentacion.sql</b> en Supabase.
        </div>
      ) : planes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center t-cuerpo text-muted-foreground">
          Aún no hay planes. {puedeEditar ? 'Crea el primero con «Nuevo plan» (por ejemplo, Solo desayuno).' : 'Un administrador debe crearlos.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {planes.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="size-10 rounded-xl bg-warning-soft text-warning-foreground flex items-center justify-center shrink-0"><ForkKnife size={20} /></span>
              <span className="flex flex-col min-w-0 grow">
                <span className="t-fila truncate">{p.nombre}</span>
                <span className="t-meta text-muted-foreground truncate">{incluyeDelPlan(p, 1).map((l) => `${l.quien ? `${l.quien}: ` : ''}${l.texto}`).join(' · ') || 'Sin descripción'}</span>
              </span>
              {p.incluido ? (
                <EstadoBadge tono="info">Incluido en la tarifa</EstadoBadge>
              ) : (
                <span className="hidden sm:flex flex-col items-end shrink-0 t-meta text-muted-foreground tabular-nums">
                  <span>Adulto {dinero(p.precio_adulto)}</span>
                  <span>Niño {dinero(p.precio_nino)}</span>
                </span>
              )}
              {!p.activo && <EstadoBadge tono="neutral">Inactivo</EstadoBadge>}
              {puedeEditar && (
                <span className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => void marcarDefecto(p)} disabled={!p.activo} aria-pressed={p.por_defecto}
                    aria-label={p.por_defecto ? 'Quitar como plan por defecto' : 'Marcar como plan por defecto'} title={p.por_defecto ? 'Plan por defecto' : 'Marcar como plan por defecto'}
                    className="size-9 rounded-xl border border-border flex items-center justify-center cursor-pointer disabled:opacity-40 hover:bg-muted">
                    <Star size={16} weight={p.por_defecto ? 'fill' : 'regular'} className={p.por_defecto ? 'text-warning-foreground' : 'text-muted-foreground'} />
                  </button>
                  <button type="button" aria-label="Editar" onClick={() => setEditando(p)} className="size-9 rounded-xl border border-border flex items-center justify-center cursor-pointer hover:bg-muted"><PencilSimple size={16} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <EditorPlan valor={editando} ordenSiguiente={planes.reduce((m, p) => Math.max(m, p.orden), 0) + 1} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); onCambio(); }} />
    </div>
  );
}

function EditorPlan({ valor, ordenSiguiente, onClose, onGuardado }: { valor: PlanAlimentacion | 'nuevo' | null; ordenSiguiente: number; onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [incluyeNino, setIncluyeNino] = useState('');
  const [adulto, setAdulto] = useState('');
  const [nino, setNino] = useState('');
  const [incluido, setIncluido] = useState(true);
  const [defecto, setDefecto] = useState(false);
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const abierto = valor !== null;
  const actual = valor && valor !== 'nuevo' ? valor : null;

  useEffect(() => {
    if (!abierto) return;
    setNombre(actual?.nombre ?? ''); setDescripcion(actual?.descripcion ?? ''); setIncluyeNino(actual?.incluye_nino ?? '');
    setAdulto(actual ? String(actual.precio_adulto) : ''); setNino(actual ? String(actual.precio_nino) : '');
    setIncluido(actual?.incluido ?? true); setDefecto(actual?.por_defecto ?? false); setActivo(actual?.activo ?? true);
  }, [abierto, actual]);

  const guardar = async () => {
    if (!nombre.trim()) { showToast.warning('Escribe el nombre del plan'); return; }
    const a = !incluido && adulto.trim() ? parseFloat(adulto) : 0;
    const n = !incluido && nino.trim() ? parseFloat(nino) : 0;
    if (!(a >= 0) || !(n >= 0)) { showToast.warning('Los valores deben ser 0 o más'); return; }
    if (!incluido && a <= 0 && n <= 0) { showToast.warning('Escribe el precio por adulto o por niño, o márcalo como incluido en la tarifa'); return; }
    const datos = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, incluye_nino: incluyeNino.trim() || null, precio_adulto: a, precio_nino: n, incluido, por_defecto: defecto && activo, activo };
    setGuardando(true);
    try {
      if (actual) await actualizarPlan(actual.id, datos); else await crearPlan(datos, ordenSiguiente);
      showToast.success(actual ? 'Plan actualizado' : 'Plan creado');
      onGuardado();
    } catch (e) {
      showToast.fallo('guardar el plan', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-titulo">{actual ? 'Editar plan' : 'Nuevo plan de alimentación'}</DialogTitle>
          <DialogDescription className="t-meta">Incluido en la tarifa, o con precio por persona y por noche que se suma a la reserva.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-nombre" className={etiqueta}>Nombre *</Label>
            <Input id="pl-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Media pensión" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-desc" className={etiqueta}>Qué incluye para adultos</Label>
            <Input id="pl-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Desayuno y cena" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-desc-nino" className={etiqueta}>Qué incluye para niños</Label>
            <Input id="pl-desc-nino" value={incluyeNino} onChange={(e) => setIncluyeNino(e.target.value)} placeholder="Si se deja vacío, es igual que adultos" className="h-12 text-base" />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 cursor-pointer">
            <span className="flex flex-col"><span className="t-cuerpo-fuerte">Incluido en la tarifa</span><span className="t-meta text-muted-foreground">Sin cobro aparte; si lo apagas, se cobra por persona y por noche</span></span>
            <Switch checked={incluido} onCheckedChange={setIncluido} />
          </label>
          {!incluido && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-adulto" className={etiqueta}>Por adulto</Label>
              <Input id="pl-adulto" type="number" inputMode="decimal" step="0.01" min={0} value={adulto} onChange={(e) => setAdulto(e.target.value)} placeholder="0.00" className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-nino" className={etiqueta}>Por niño</Label>
              <Input id="pl-nino" type="number" inputMode="decimal" step="0.01" min={0} value={nino} onChange={(e) => setNino(e.target.value)} placeholder="0.00" className="h-12 text-base" />
            </div>
          </div>
          )}
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 cursor-pointer">
            <span className="flex flex-col"><span className="t-cuerpo-fuerte">Plan por defecto</span><span className="t-meta text-muted-foreground">Se preselecciona al crear una reserva</span></span>
            <Switch checked={defecto && activo} onCheckedChange={setDefecto} disabled={!activo} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 cursor-pointer">
            <span className="t-cuerpo-fuerte">Activo</span>
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
