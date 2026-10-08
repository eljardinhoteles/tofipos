import { useState } from 'react';
import { Plus, Minus, Trash, ArrowsLeftRight, GiftIcon, CheckCircle, Clock, SlidersHorizontal, Check, UsersThree, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { calcularPartes, parseReparto } from '@/lib/reparto';

export interface ItemActionsData {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  pagado_cantidad?: number | null;
  cortesia_cantidad?: number | null;
  cortesia_motivo?: string | null;
  /** Marca de reparto del valor entre cuentas (JSON). */
  reparto?: string | null;
}

interface ItemActionsPanelProps {
  item: ItemActionsData;
  /** true = ya enviado a cocina (confirmado); false = aún sin enviar. */
  confirmado: boolean;
  /** Otras subcomandas de la mesa (vacío = mesa normal, sin "Mover"). */
  destinos: Array<{ id: string; nombre: string }>;
  /** Subcomandas entre las que se puede repartir el valor del plato (vacío = sin "Repartir"). */
  destinosRepartir?: Array<{ id: string; nombre: string }>;
  tieneOpciones: boolean;
  /** Producto de precio variable: antes de confirmar se puede cambiar el valor unitario. */
  precioVariable?: boolean;
  /** Con la cuenta ya pedida el estado de cocina deja de importar: se oculta el badge. */
  ocultarEstado?: boolean;
  /** Cuenta ya pedida: recién entonces se ofrece la cortesía (se decide al cerrar). */
  cuentaPedida?: boolean;
  onClose: () => void;
  onGuardar: (cantidad: number, precio?: number) => void | Promise<void>;
  onEliminar: () => void | Promise<void>;
  onEditarOpciones: () => void;
  onMover: (destinoId: string, cantidad: number) => void | Promise<void>;
  onAnular: (motivo: string, cantidad: number) => void | Promise<void>;
  onCortesia: (motivo: string, porcentaje: number, cantidad: number) => void | Promise<void>;
  onRepartir?: (destinoIds: string[], cantidad: number) => void | Promise<void>;
  onDeshacerReparto?: () => void | Promise<void>;
}

type Vista = 'menu' | 'mover' | 'anular' | 'cortesia' | 'repartir';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center">{label}</span>}
      <div className="flex items-center h-14 rounded-full border border-border bg-transparent overflow-hidden">
        <button type="button" aria-label="Menos" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}
          className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
          <Minus size={20} weight="bold" />
        </button>
        <span className="flex-1 text-center font-black text-2xl text-foreground tabular-nums">
          {value}{max < 9999 && value !== max ? <span className="text-sm text-muted-foreground font-bold"> / {max}</span> : null}
        </span>
        <button type="button" aria-label="Más" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}
          className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
          <Plus size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}

// Acciones sobre un ítem de la comanda. Dos estados, sin importar si ya se
// pidió la cuenta: sin confirmar (cantidad, mover, eliminar) y confirmado
// (cortesía, anular). Cada acción con parámetros abre su propia pantalla; la
// X de la cabecera cierra el panel.
export function ItemActionsPanel({ item, confirmado, destinos, destinosRepartir = [], tieneOpciones, precioVariable = false, ocultarEstado, cuentaPedida = false, onClose, onGuardar, onEliminar, onEditarOpciones, onMover, onAnular, onCortesia, onRepartir, onDeshacerReparto }: ItemActionsPanelProps) {
  const [vista, setVista] = useState<Vista>('menu');
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [precio, setPrecio] = useState(item.precio);
  const [cantAccion, setCantAccion] = useState(item.cantidad);
  const [pct, setPct] = useState(100);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const pagado = (item.pagado_cantidad || 0) > 0;
  const conCortesia = (item.cortesia_cantidad || 0) > 0 || !!item.cortesia_motivo;
  const meta = parseReparto(item);
  const puedeMover = destinos.length > 0 && !pagado && !conCortesia && !meta;
  const puedeRepartir = !!onRepartir && destinosRepartir.length > 0 && !pagado && !conCortesia && !meta;

  const ejecutar = async (fn: () => void | Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); }
  };
  const abrir = (v: Vista) => { setCantAccion(item.cantidad); setMotivo(''); setPct(100); setSeleccion([]); setVista(v); };
  const toggleDestino = (id: string) => setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const titulos: Record<Vista, string> = { menu: 'Editar', mover: 'Mover a otra cuenta', anular: 'Anular ítem', cortesia: 'Marcar como cortesía', repartir: 'Repartir el valor' };

  return (
    <div className="flex flex-col gap-3">
      {/* Estado: pill flotante sobre el borde superior del footer, mismo
          lenguaje que el botón "Añadir" (el footer es `relative`). */}
      {!ocultarEstado && (
      <span className={cn('absolute -top-[18px] left-1/2 -translate-x-1/2 z-20 h-9 px-4 inline-flex items-center gap-1.5 rounded-full border text-xs font-bold whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
        confirmado ? 'bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))] border-primary/30 text-primary' : 'bg-warning-soft border-warning/40 text-warning-foreground')}>
        {confirmado ? <CheckCircle size={15} weight="fill" /> : <Clock size={15} weight="fill" />}
        {confirmado ? 'En cocina' : 'Pendiente'}
      </span>
      )}

      {/* Cabecera: (acción, si no es el menú), y producto con su precio unitario */}
      <div className="flex flex-col gap-0.5 pt-2">
        {vista !== 'menu' && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulos[vista]}</span>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-extrabold text-lg text-foreground truncate">{item.nombre}</span>
          <span className="shrink-0 text-base font-bold text-muted-foreground tabular-nums">{money(item.precio)} c/u</span>
        </div>
      </div>

      {vista === 'menu' && !confirmado && (
        <>
          <Stepper value={cantidad} max={9999} onChange={setCantidad} />
          {precioVariable && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 h-14">
              <label htmlFor="precio-variable" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Precio unitario</label>
              <div className="flex items-center gap-1">
                <span className="text-lg font-black text-muted-foreground">$</span>
                <Input id="precio-variable" type="number" inputMode="decimal" step="0.01" min={0}
                  value={Number.isNaN(precio) ? '' : precio}
                  onChange={(e) => setPrecio(parseFloat(e.target.value))}
                  className="h-10 w-28 text-right text-lg font-black border-0 shadow-none focus-visible:ring-0 px-1" />
              </div>
            </div>
          )}
          <div className={cn('grid gap-2', tieneOpciones ? 'grid-cols-2' : 'grid-cols-1')}>
            {tieneOpciones && (
              <Button variant="secondary" className="h-11 font-bold text-primary bg-primary/10 hover:bg-primary/15" onClick={onEditarOpciones}>
                <SlidersHorizontal size={15} className="mr-1.5" /> Opciones
              </Button>
            )}
            <Button className="h-11 font-bold" disabled={ocupado || pagado || !(precio >= 0) || (cantidad === item.cantidad && (!precioVariable || precio === item.precio))} onClick={() => ejecutar(() => onGuardar(cantidad, precioVariable ? Math.round(precio * 100) / 100 : undefined))}>
              Guardar
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 -mt-1">
            <Button variant="ghost" className="h-11 font-bold text-destructive hover:text-destructive" disabled={ocupado || pagado} onClick={() => ejecutar(onEliminar)}>
              <Trash size={15} className="mr-1.5" /> Eliminar
            </Button>
            <Button variant="ghost" className="h-11 font-bold" onClick={onClose}>Cancelar</Button>
          </div>
        </>
      )}

      {vista === 'menu' && confirmado && (
        <>
          {conCortesia && (
            <div className="p-3 rounded-xl bg-muted border border-border flex flex-col gap-0.5">
              <span className="text-xs font-bold text-foreground">Cortesía aplicada</span>
              {item.cortesia_motivo && <span className="text-[11px] text-foreground/80">{item.cortesia_motivo}</span>}
            </div>
          )}
          {meta && (
            <div className="p-3 rounded-xl bg-special-soft flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-special-foreground">Valor repartido entre cuentas</span>
                <span className="text-[11px] text-special-foreground/80">
                  {meta.tipo === 'parte'
                    ? `Parte${meta.i ? ` ${meta.i}` : ''} de ${meta.n} del valor del plato. Cocina no la recibe.`
                    : `Este plato queda en $0 aquí; su valor se repartió entre ${meta.partes.length} cuenta${meta.partes.length === 1 ? '' : 's'}.`}
                </span>
              </div>
              {onDeshacerReparto && (
                <Button variant="outline" className="h-10 font-bold justify-center bg-card" disabled={ocupado} onClick={() => ejecutar(onDeshacerReparto)}>
                  <ArrowCounterClockwise size={16} weight="bold" className="mr-1.5" /> Deshacer reparto
                </Button>
              )}
            </div>
          )}
          {puedeRepartir && (
            <Button variant="outline" className="w-full h-12 font-bold justify-center px-4 border-border bg-card hover:bg-card/80" onClick={() => abrir('repartir')}>
              <UsersThree size={18} className="mr-2" /> Repartir entre cuentas
            </Button>
          )}
          {/* Solo ítems ya enviados a cocina se mueven; uno sin enviar se elimina y se
              vuelve a cargar en la otra cuenta, y sigue el flujo normal. */}
          {puedeMover && (
            <Button variant="outline" className="w-full h-12 font-bold justify-center px-4 border-border bg-card hover:bg-card/80" onClick={() => abrir('mover')}>
              <ArrowsLeftRight size={18} className="mr-2" /> Mover a otra cuenta
            </Button>
          )}
          {cuentaPedida && !conCortesia && !pagado && !meta && (
            <Button className="w-full h-12 font-extrabold justify-center px-4 bg-primary hover:bg-primary/90 text-white" onClick={() => abrir('cortesia')}>
              <GiftIcon size={18} className="mr-2" /> Marcar como cortesía
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2 -mt-1">
            {meta ? <span /> : (
              <Button variant="ghost" className="h-11 font-bold text-destructive hover:text-destructive" onClick={() => abrir('anular')}>
                <Trash size={15} className="mr-1.5" /> Anular ítem
              </Button>
            )}
            <Button variant="ghost" className="h-11 font-bold" onClick={onClose}>Cancelar</Button>
          </div>
        </>
      )}

      {vista === 'mover' && (
        <>
          {item.cantidad > 1 && <Stepper value={cantAccion} max={item.cantidad} onChange={setCantAccion} label="Unidades a mover" />}
          <div className="flex flex-col gap-2">
            {destinos.map(d => (
              <Button key={d.id} className="w-full h-12 font-bold justify-between px-4 bg-primary hover:bg-primary/90 text-white" disabled={ocupado} onClick={() => ejecutar(() => onMover(d.id, cantAccion))}>
                {d.nombre} <ArrowsLeftRight size={16} className="opacity-80" />
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setVista('menu')}>Cancelar</Button>
        </>
      )}

      {vista === 'repartir' && (
        <>
          {item.cantidad > 1 && <Stepper value={cantAccion} max={item.cantidad} onChange={setCantAccion} label="Unidades a repartir" />}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Entre qué cuentas</span>
            {destinosRepartir.map(d => {
              const activa = seleccion.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => toggleDestino(d.id)}
                  className={cn('w-full h-12 px-4 rounded-xl flex items-center justify-between text-sm font-bold transition-colors cursor-pointer',
                    activa ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground shadow-xs hover:bg-muted')}
                >
                  {d.nombre}
                  {activa && <Check size={16} weight="bold" />}
                </button>
              );
            })}
          </div>
          {seleccion.length > 0 && (() => {
            const montos = calcularPartes(item.precio * cantAccion, seleccion.length);
            const min = Math.min(...montos), max = Math.max(...montos);
            return (
              <div className="text-center text-sm font-bold text-muted-foreground">
                Cada cuenta paga <span className="text-foreground">{min === max ? money(min) : `${money(min)} – ${money(max)}`}</span>
                <span className="block text-[11px] font-semibold">Este plato queda en $0 en esta cuenta.</span>
              </div>
            );
          })()}
          <Button className="w-full h-11 font-bold" disabled={ocupado || seleccion.length === 0 || !onRepartir} onClick={() => ejecutar(() => onRepartir!(seleccion, cantAccion))}>
            <UsersThree size={15} className="mr-1.5" /> {seleccion.length === 0 ? 'Elige las cuentas' : `Repartir entre ${seleccion.length} cuenta${seleccion.length === 1 ? '' : 's'}`}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setVista('menu')}>Cancelar</Button>
        </>
      )}

      {vista === 'anular' && (
        <>
          {item.cantidad > 1 && <Stepper value={cantAccion} max={item.cantidad} onChange={setCantAccion} label="Unidades a anular" />}
          <div className="flex flex-col gap-2">
            <Input type="text" placeholder="Motivo de anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11 text-sm" />
          </div>
          <Button variant="destructive" className="w-full h-11 font-bold" disabled={ocupado || !motivo.trim()} onClick={() => ejecutar(() => onAnular(motivo.trim(), cantAccion))}>
            <Trash size={15} className="mr-1.5" /> Confirmar anulación
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setVista('menu')}>Cancelar</Button>
        </>
      )}

      {vista === 'cortesia' && (
        <>
          {item.cantidad > 1 && <Stepper value={cantAccion} max={item.cantidad} onChange={setCantAccion} label="Unidades en cortesía" />}
          <div className="grid grid-cols-3 gap-2">
            {[100, 50, 25].map(p => (
              <button key={p} type="button" onClick={() => setPct(p)}
                className={cn('h-11 rounded-xl border text-sm font-bold cursor-pointer',
                  pct === p ? 'bg-primary border-primary text-white' : 'bg-card border-border')}>
                {p}%
              </button>
            ))}
          </div>
          <div className="text-center text-sm font-bold text-muted-foreground">
            Descuento <span className="text-foreground">{money(cantAccion * item.precio * pct / 100)}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Input type="text" placeholder="Motivo de cortesía" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11 text-sm" />
          </div>
          <Button className="w-full h-11 font-bold bg-primary hover:bg-primary/90 text-white" disabled={ocupado || !motivo.trim()} onClick={() => ejecutar(() => onCortesia(motivo.trim(), pct, cantAccion))}>
            <GiftIcon size={15} className="mr-1.5" /> Confirmar cortesía
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setVista('menu')}>Cancelar</Button>
        </>
      )}
    </div>
  );
}
