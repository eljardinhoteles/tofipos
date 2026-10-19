import { createElement, useEffect, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { ArrowsClockwise, Bed, CloudCheck, ForkKnife, PencilSimple, Plus, ShoppingBag, Wallet } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { EditorConciliacionCloudbeds } from './EditorConciliacionCloudbeds';
import { FilaExtra } from './FilaExtra';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { useCategoriasPorProducto } from '../../../hooks/useCategoriasExtrasHotel';
import { cambiarTarifaReservaHotel, totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { Seccion } from './comunes';
import { dinero, etiquetaCampo, plural } from './formatos';

/** Icono de la categoría del extra (su icono del menú); sin categoría, una bolsa. */
function iconoExtra(icono?: string | null): ReactNode {
  return createElement(getCategoryIcon(icono) ?? ShoppingBag, { size: 16, className: 'text-muted-foreground' });
}

export type EditorCuenta = null | 'tarifa' | 'extras' | 'cloudbeds';

interface Props {
  r: ReservaHotel;
  puedeEditar: boolean;
  usuario?: string;
  editor: EditorCuenta;
  onEditor: (e: EditorCuenta) => void;
  onSucio: (sucio: boolean) => void;
  onCambio: (r: ReservaHotel, afectaCalendario?: boolean) => void;
  /** Pide confirmación antes de quitar un extra. */
  onQuitarExtra: (extraId: string) => void;
}

/** Tarifa y extras de la reserva. La tarifa viene de Cloudbeds; el POS puede fijar una manual (Cloudbeds conserva la suya). */
export function SeccionCuenta({ r, puedeEditar, usuario, editor, onEditor, onSucio, onCambio, onQuitarExtra }: Props) {
  const extrasVisibles = r.extras.filter((e) => e.monto > 0);
  // Categoría de cada extra (su icono del menú: spa, tours…).
  const categorias = useCategoriasPorProducto();
  const noches = dayjs(r.salida).diff(dayjs(r.llegada), 'day');

  return (
    <Seccion icono={Wallet} titulo="Tarifa y extras"
      accion={puedeEditar && editor === null ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => onEditor('tarifa')}><PencilSimple size={14} /> Tarifa</Button>
          {r.cloudbeds_reservation_id && (
            <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => onEditor('cloudbeds')} title="Conciliar con Cloudbeds" aria-label="Conciliar con Cloudbeds"><ArrowsClockwise size={14} /> <span className="hidden sm:inline">Cloudbeds</span></Button>
          )}
        </div>
      ) : undefined}>
      <div className="flex flex-col gap-1">
        {/* Estadía en una línea: con cuántos adultos y niños y cuántas noches se calculó. */}
        <div className="flex items-center gap-2.5 px-2 -mx-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors">
          <Bed size={16} className="text-muted-foreground shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="t-cuerpo-fuerte">{r.tarifa_manual ? 'Estadía · tarifa manual' : 'Estadía'}</span>
            <span className="t-meta text-muted-foreground"> · {plural(r.adultos, 'adulto', 'adultos')}{r.ninos ? `, ${plural(r.ninos, 'niño', 'niños')}` : ''} · {plural(noches, 'noche', 'noches')}</span>
          </span>
          <span className="t-cuerpo-fuerte tabular-nums shrink-0 text-right min-w-16">{dinero(r.total_estadia)}</span>
        </div>
        {r.tarifa_manual && <p className="t-meta text-muted-foreground -mt-2 ml-[26px]">Cloudbeds registra {dinero(r.total_cloudbeds ?? r.total_estadia)}{r.tarifa_motivo ? ` · ${r.tarifa_motivo}` : ''}</p>}

        {extrasVisibles.length > 0 && (
          <ul className="flex flex-col" aria-label="Extras de la reserva">
            {extrasVisibles.map((e) => (
              <FilaExtra key={e.id} r={r} extra={e} puedeEditar={puedeEditar} usuario={usuario} onQuitar={onQuitarExtra} onCambio={(x) => onCambio(x, false)}
                icono={e.origen === 'cloudbeds' ? <CloudCheck size={16} className="text-info-foreground" aria-label="Cargo hecho en Cloudbeds" /> : e.origen === 'plan' ? <ForkKnife size={16} className="text-warning-foreground" aria-label="Plan de alimentación" /> : iconoExtra(categorias.get(e.producto_id ?? '')?.icono)} />
            ))}
          </ul>
        )}
        {puedeEditar && editor === null && (
          <button type="button" onClick={() => onEditor('extras')} className="self-end px-2 min-h-8 rounded-lg flex items-center gap-1.5 t-cuerpo text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Plus size={14} weight="bold" /> Añadir extra</button>
        )}

        <div className="flex items-baseline justify-between gap-3 mt-2 pt-3 border-t border-dashed border-border">
          <span className="t-cuerpo-fuerte">Total a cobrar</span>
          <span className="t-valor text-lg text-primary tabular-nums">{dinero(totalConExtras(r))}</span>
        </div>
      </div>

      {editor === 'cloudbeds' && <EditorConciliacionCloudbeds r={r} usuario={usuario} onCancelar={() => onEditor(null)} onGuardado={(n) => { onEditor(null); onCambio(n, false); }} />}
      {editor === 'tarifa' && <EditorTarifa r={r} usuario={usuario} onCancelar={() => onEditor(null)} onSucio={onSucio} onGuardado={(n) => { onEditor(null); onCambio(n, false); }} />}
    </Seccion>
  );
}

function EditorTarifa({ r, usuario, onCancelar, onSucio, onGuardado }: { r: ReservaHotel; usuario?: string; onCancelar: () => void; onSucio: (s: boolean) => void; onGuardado: (r: ReservaHotel) => void }) {
  const [monto, setMonto] = useState(String(r.total_estadia));
  const [motivo, setMotivo] = useState(r.tarifa_motivo ?? '');
  const [guardando, setGuardando] = useState(false);
  const montoN = parseFloat(monto);
  const valido = montoN >= 0 && !Number.isNaN(montoN);
  const hayCambios = monto !== String(r.total_estadia) || motivo !== (r.tarifa_motivo ?? '');
  useEffect(() => { onSucio(hayCambios); }, [hayCambios, onSucio]);

  const guardar = async (volverACloudbeds: boolean) => {
    setGuardando(true);
    try {
      await cambiarTarifaReservaHotel(r, volverACloudbeds ? null : montoN, motivo, usuario);
      showToast.success(volverACloudbeds ? 'Se usa la tarifa de Cloudbeds' : 'Tarifa actualizada', 'Cloudbeds conserva su tarifa estándar.');
      onSucio(false);
      onGuardado({ ...r, tarifa_manual: !volverACloudbeds, tarifa_motivo: volverACloudbeds ? null : motivo.trim() || null, total_estadia: volverACloudbeds ? (r.total_cloudbeds ?? r.total_estadia) : montoN });
    } catch (e) {
      showToast.fallo('cambiar la tarifa', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="t-cuerpo-fuerte">Tarifa manual del POS</span>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tf-monto" className={etiquetaCampo}>Total de la estadía</Label>
          <Input id="tf-monto" type="number" inputMode="decimal" step="0.01" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={!valido} className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tf-motivo" className={etiquetaCampo}>Motivo</Label>
          <Input id="tf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. cortesía" className="h-11 text-base" />
        </div>
      </div>
      <p className="t-meta text-muted-foreground">Cloudbeds conservará su tarifa base ({dinero(r.total_cloudbeds ?? r.total_estadia)}).</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {r.tarifa_manual && <Button type="button" variant="ghost" className="h-11 mr-auto" onClick={() => void guardar(true)} disabled={guardando}>Usar la de Cloudbeds</Button>}
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar(false)} disabled={!valido || !hayCambios || guardando}>{guardando ? <><Girando /> Guardando…</> : 'Guardar tarifa'}</Button>
      </div>
    </div>
  );
}
