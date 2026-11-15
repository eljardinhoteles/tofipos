import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { ArrowCounterClockwise, ArrowDown, CaretLeft, CaretRight, CircleNotch, Lock, Minus, Money, Plus, Printer, UsersThree, X } from '@phosphor-icons/react';
import type { Mesa } from '../../db/database';
import { initVerticalRxDb, moverItemASubcomanda, repartirItemEntreSubcomandas, deshacerRepartoItem, updateRxComanda } from '../../db/rxdb';
import { esMesaMultiple, isOperativeComanda } from '../../db/comandaState';
import { crearEstabilizador } from '../../lib/estabilizarDocs';
import { calcularPartes, itemMovible, parseReparto } from '../../lib/reparto';
import { calcularTotalesComanda } from '../../lib/taxUtils';
import { imprimirConAviso } from '../../lib/imprimir';
import { queueReceiptPrint } from '../../lib/printServerClient';
import { totalesParaTicket } from '../../services/printTemplateEngine';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { useComandaIva } from '../../hooks/useComandaIva';
import { useComandaLive } from '../../hooks/useComandaLive';
import { useTableActions } from '../../hooks/useTableActions';
import { useUI } from '../../context/UIContext';
import { useHorizontalWheel } from '../../hooks/useHorizontalWheel';
import { useIsMobile } from '../../hooks/useIsMobile';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Pagos que ya cubren la cuenta (cobros por división registrados como ventas): mismo criterio que el sidebar, para que la
// precuenta de cada cuenta descuente lo ya cobrado.
function pagosDeVentas(ventas: any[]): any[] {
  return ventas.flatMap((v: any) => {
    const esSplit = typeof v.referencia === 'string' && v.referencia.includes('Dividido - ');
    const res: any[] = [];
    for (const m of (v.movimientos ?? [])) {
      if (m.anulado) continue;
      if (m.tipo === 'pago' || (m.tipo === 'ajuste' && esSplit)) {
        res.push({
          id: m.id,
          tipo_division: esSplit ? v.referencia : (v.origen === 'reserva_restaurante' ? 'Abono de reserva' : undefined),
          fecha: m.fecha,
          monto: m.monto ?? 0,
        });
      }
    }
    return res;
  });
}

interface Seleccion { comandaId: string | null; cant: Record<string, number> }
const SIN_SELECCION: Seleccion = { comandaId: null, cant: {} };

interface ColumnaProps {
  comanda: any;
  items: any[];
  mesa: Mesa;
  nombre: string;
  seleccion: Seleccion;
  hayDestino: boolean;
  ocupado: boolean;
  /** La primera cuenta (la principal) es más ancha que las subcuentas. */
  principal: boolean;
  /** Huella de la última precuenta impresa de esta cuenta (undefined = aún no se imprimió). */
  firmaImpresa?: string;
  onImpresa: (comandaId: string, firma: string) => void;
  onCobrar: (comanda: any) => void;
  onToggle: (comanda: any, item: any) => void;
  /** Cuántas unidades del producto elegido se pasan (selector bajo el propio producto). */
  onCantidad: (itemId: string, cantidad: number) => void;
  onPasarAqui: (comandaId: string) => void;
  onDeshacer: (item: any) => void;
  onDropItem: (itemId: string, comandaId: string) => void;
  registrarImpresion: (id: string, fn: (() => void) | null) => void;
  /** Controles de lo elegido en esta columna (unidades, limpiar, repartir valor): van en su pie, justo sobre «Imprimir precuenta». */
  slotSeleccion?: ReactNode;
}

function ColumnaCuenta({ comanda, items, mesa, nombre, seleccion, hayDestino, ocupado, principal, firmaImpresa, onImpresa, onCobrar, onToggle, onCantidad, onPasarAqui, onDeshacer, onDropItem, registrarImpresion, slotSeleccion }: ColumnaProps) {
  const { menuItems } = useRxMenuCatalog();
  const { porcentaje: ivaPorcentaje, preciosConIva } = useComandaIva(comanda);
  const { pagos, ventasComanda, linkedMesa } = useComandaLive(comanda);
  const [arrastrando, setArrastrando] = useState(false);
  const firmaActual = useRef('');

  const activos = useMemo(() => items.filter(i => !i.anulado && (i.cantidad || 0) > 0), [items]);
  const totales = useMemo(
    () => calcularTotalesComanda(activos, menuItems, ivaPorcentaje, preciosConIva),
    [activos, menuItems, ivaPorcentaje, preciosConIva]
  );
  const pagosTicket = useMemo(() => [...pagos, ...pagosDeVentas(ventasComanda)], [pagos, ventasComanda]);
  const pagado = pagosTicket.reduce((acc: number, p: any) => acc + (p.monto ?? 0), 0);

  // Huella de lo impreso: si cambian productos, cantidades o total, la precuenta ya no vale y el cobro vuelve a pedir imprimirla.
  const firma = useMemo(() => `${activos.map(i => `${i.id}:${i.cantidad}:${i.precio}`).join('|')}#${totales.total}`, [activos, totales.total]);
  useEffect(() => { firmaActual.current = firma; }, [firma]);
  // La precuenta impresa sigue vigente solo si no cambió nada desde entonces: entonces se ofrece cobrar.
  const impresaOk = firmaImpresa !== undefined && firmaImpresa === firma;

  const imprimir = useCallback(() => {
    if (activos.length === 0) { showToast.warning('Cuenta vacía', `${nombre} no tiene productos para imprimir.`); return; }
    imprimirConAviso(() => queueReceiptPrint({
      comanda,
      items: activos as any,
      mesaNombre: mesa.nombre,
      ivaPorcentaje,
      pagos: pagosTicket,
      habitacionNombre: linkedMesa?.nombre,
      totales: totalesParaTicket(totales),
    }), `Pre-cuenta ${nombre}`);
    onImpresa(comanda.id, firmaActual.current);
  }, [activos, comanda, mesa.nombre, ivaPorcentaje, pagosTicket, linkedMesa?.nombre, totales, nombre, onImpresa]);

  useEffect(() => {
    registrarImpresion(comanda.id, imprimir);
    return () => registrarImpresion(comanda.id, null);
  }, [comanda.id, imprimir, registrarImpresion]);

  const puedeRecibir = hayDestino && seleccion.comandaId !== comanda.id;
  const enCuenta = comanda.estado === 'cuenta';

  return (
    <section
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/item-id')) { e.preventDefault(); setArrastrando(true); } }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        setArrastrando(false);
        const id = e.dataTransfer.getData('text/item-id');
        if (id) { e.preventDefault(); onDropItem(id, comanda.id); }
      }}
      className={cn('flex flex-col min-h-0 bg-card overflow-hidden transition-colors',
        // La principal (de donde se divide) va fija y pegada a los bordes del modal; las demás son tarjetas que se deslizan a su lado.
        principal
          ? 'w-[380px] shrink-0 border-r shadow-[6px_0_14px_-8px_rgba(0,0,0,0.3)] z-10'
          : 'shrink-0 grow basis-[360px] min-w-[360px] max-w-[460px] rounded-2xl border',
        arrastrando ? 'border-primary ring-2 ring-inset ring-primary/40' : enCuenta ? 'border-warning' : 'border-border')}
    >
      <header className={cn('shrink-0 px-4 py-3 flex items-center justify-between gap-2 border-b',
        enCuenta ? 'bg-warning-soft border-warning/40' : 'bg-muted/50 border-border')}>
        <div className="min-w-0 flex flex-col">
          <span className="t-cuerpo-fuerte text-foreground truncate">{nombre}</span>
          <span className="t-meta text-muted-foreground">
            {activos.reduce((a, i) => a + (i.cantidad || 0), 0)} items{enCuenta ? ' · cuenta pedida' : ''}
          </span>
        </div>
        <span className="t-valor text-foreground tabular-nums shrink-0">{money(totales.total)}</span>
      </header>

      {puedeRecibir && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onPasarAqui(comanda.id)}
          className="shrink-0 mx-3 mt-3 h-11 rounded-xl border-2 border-dashed border-primary bg-primary/10 text-primary t-cuerpo-fuerte cursor-pointer active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
        >
          <ArrowDown size={16} weight="bold" /> Pasar aquí {Object.keys(seleccion.cant).length === 1 ? 'el producto' : `${Object.keys(seleccion.cant).length} productos`}
        </button>
      )}

      <ul className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1.5">
        {activos.length === 0 && (
          <li className="py-8 text-center t-meta text-muted-foreground">
            {hayDestino ? 'Cuenta vacía' : 'Sin productos'}
          </li>
        )}
        {activos.map(it => {
          const meta = parseReparto(it);
          const movible = itemMovible(it);
          const elegido = seleccion.comandaId === comanda.id && seleccion.cant[it.id] !== undefined;
          const motivoBloqueo = (it.pagado_cantidad || 0) > 0 ? 'Pagado'
            : ((it.cortesia_cantidad || 0) > 0 || it.cortesia_motivo) ? 'Cortesía'
            : meta?.tipo === 'origen' ? 'Valor repartido'
            : meta?.tipo === 'parte' ? 'Parte de reparto'
            : null;
          const cantElegida = elegido ? seleccion.cant[it.id] : it.cantidad;
          return (
            <li key={it.id}>
              <div
                role={movible ? 'button' : undefined}
                tabIndex={movible ? 0 : undefined}
                aria-pressed={movible ? elegido : undefined}
                draggable={movible && !ocupado}
                onDragStart={(e) => { e.dataTransfer.setData('text/item-id', it.id); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => movible && onToggle(comanda, it)}
                onKeyDown={(e) => { if (movible && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(comanda, it); } }}
                className={cn('w-full rounded-xl border px-3 py-2.5 flex flex-col gap-2 text-left transition-colors',
                  movible ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default opacity-80',
                  elegido ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50')}
              >
                <div className="flex items-center gap-3">
                <span className={cn('shrink-0 min-w-8 h-8 px-1.5 rounded-lg flex items-center justify-center t-dato tabular-nums',
                  elegido ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                  {elegido && cantElegida !== it.cantidad ? `${cantElegida}/${it.cantidad}` : it.cantidad}
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="t-cuerpo text-foreground break-words">{it.nombre}</span>
                  {Array.isArray(it.modificadores) && it.modificadores.length > 0 && (
                    <span className="flex items-baseline gap-1.5 t-meta text-warning-foreground leading-snug">
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning-foreground shrink-0 translate-y-[-1px]" />
                      <span className="break-words">{it.modificadores.join(' · ')}</span>
                    </span>
                  )}
                  {motivoBloqueo && (
                    <span className="t-meta text-muted-foreground flex items-center gap-1">
                      <Lock size={11} weight="bold" /> {motivoBloqueo}
                    </span>
                  )}
                </span>
                {meta && (
                  <button
                    type="button"
                    title="Deshacer reparto"
                    aria-label="Deshacer reparto"
                    disabled={ocupado}
                    onClick={(e) => { e.stopPropagation(); onDeshacer(it); }}
                    className="shrink-0 size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer"
                  >
                    <ArrowCounterClockwise size={16} weight="bold" />
                  </button>
                )}
                <span className="shrink-0 t-fila text-muted-foreground tabular-nums">{money(it.precio * it.cantidad)}</span>
                </div>
                {elegido && it.cantidad > 1 && (
                  // Dentro de la tarjeta del producto: se ve que las unidades son de ESE producto y no hay que ir al pie.
                  <div className="flex items-center h-10 rounded-full border border-primary/40 bg-card overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label="Menos unidades" disabled={cantElegida <= 1 || ocupado}
                      onClick={() => onCantidad(it.id, Math.max(1, cantElegida - 1))}
                      className="h-full w-12 flex items-center justify-center cursor-pointer active:bg-muted disabled:opacity-30">
                      <Minus size={16} weight="bold" />
                    </button>
                    <span className="flex-1 text-center t-dato tabular-nums">{cantElegida} de {it.cantidad} unidades</span>
                    <button type="button" aria-label="Más unidades" disabled={cantElegida >= it.cantidad || ocupado}
                      onClick={() => onCantidad(it.id, Math.min(it.cantidad, cantElegida + 1))}
                      className="h-full w-12 flex items-center justify-center cursor-pointer active:bg-muted disabled:opacity-30">
                      <Plus size={16} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="shrink-0 border-t border-border p-3 flex flex-col gap-2">
        {pagado > 0.001 && (
          <div className="flex items-center justify-between t-meta text-muted-foreground">
            <span>Ya pagado</span><span className="tabular-nums">{money(pagado)}</span>
          </div>
        )}
        {slotSeleccion}
        {impresaOk ? (
          // Ya se imprimió la precuenta: se da por hecho que el cliente paga ahí mismo, así que el cobro pasa a ser la acción principal.
          <>
            <Button className="h-12 font-extrabold justify-center" onClick={() => onCobrar(comanda)} disabled={ocupado}>
              <Money size={18} weight="bold" className="mr-2" /> Pasar a Cobrar
            </Button>
            <Button variant="ghost" className="h-9 font-bold justify-center text-muted-foreground" onClick={imprimir}>
              <Printer size={15} weight="bold" className="mr-2" /> Reimprimir precuenta
            </Button>
          </>
        ) : (
          <Button variant="warningSoft" className="h-11 font-bold justify-center" onClick={imprimir} disabled={activos.length === 0}>
            <Printer size={16} weight="bold" className="mr-2" /> Imprimir precuenta
          </Button>
        )}
      </footer>
    </section>
  );
}

interface Props {
  opened: boolean;
  onClose: () => void;
  mesa: Mesa | null;
  /** Abre el cobro de esa cuenta en el sidebar (lo resuelve TableSidebar). */
  onCobrar: (comandaId: string) => void;
}

// Pantalla de reparto de la mesa: todas las cuentas lado a lado para pasar productos de una a otra (tocar y «Pasar aquí»,
// o arrastrar en PC), repartir el valor de un plato e imprimir las precuentas. Es otra vista de las mismas cuentas/pestañas del
// sidebar: lee y escribe las mismas comandas, así que ambas siempre coinciden.
export function RepartoCuentasModal({ opened, onClose, mesa, onCobrar }: Props) {
  const { crearSubcomanda, activarMesaMultiple } = useTableActions();
  const { activeSubcomandaId, setActiveSubcomandaId } = useUI();
  const [comandas, setComandas] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [seleccion, setSeleccion] = useState<Seleccion>(SIN_SELECCION);
  const [repartiendo, setRepartiendo] = useState(false);
  const [repartirEntre, setRepartirEntre] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  // En pantallas angostas no cabe una columna fija junto a las demás: todas van en la misma fila que se desliza.
  const isMobile = useIsMobile();
  // Fila de subcuentas: en Windows con mouse no hay scroll lateral, así que la rueda se convierte en horizontal y hay flechas.
  const wheelRef = useHorizontalWheel();
  const filaRef = useRef<HTMLDivElement | null>(null);
  const [borde, setBorde] = useState({ izq: false, der: false });
  const actualizarBorde = useCallback(() => {
    const row = filaRef.current;
    if (!row) return;
    const izq = row.scrollLeft > 2;
    const der = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
    setBorde(prev => (prev.izq === izq && prev.der === der ? prev : { izq, der }));
  }, []);
  const observador = useRef<ResizeObserver | null>(null);
  const setFilaRef = useCallback((el: HTMLDivElement | null) => {
    observador.current?.disconnect();
    if (filaRef.current) filaRef.current.removeEventListener('scroll', actualizarBorde);
    filaRef.current = el;
    wheelRef(el);
    if (el) {
      el.addEventListener('scroll', actualizarBorde, { passive: true });
      observador.current = new ResizeObserver(actualizarBorde);
      observador.current.observe(el);
      Array.from(el.children).forEach(h => observador.current?.observe(h));
      actualizarBorde();
    }
  }, [wheelRef, actualizarBorde]);
  // Al agregar o quitar cuentas cambia el ancho a recorrer sin que cambie el de la fila: se recalculan las flechas.
  useEffect(() => { actualizarBorde(); const id = requestAnimationFrame(actualizarBorde); return () => cancelAnimationFrame(id); }, [comandas.length, actualizarBorde]);
  const desplazarFila = (dir: -1 | 1) => {
    const row = filaRef.current;
    if (row) row.scrollBy({ left: dir * Math.max(240, row.clientWidth * 0.7), behavior: 'smooth' });
  };
  // Precuentas impresas desde esta pantalla (huella por cuenta). Se conservan al cerrar y reabrir; se limpian al cambiar de mesa.
  const [impresas, setImpresas] = useState<Record<string, string>>({});
  const marcarImpresa = useCallback((id: string, firma: string) => setImpresas(prev => ({ ...prev, [id]: firma })), []);
  useEffect(() => { setImpresas({}); }, [mesa?.id]);
  // Cerrar (X, Escape o tocar fuera) pide confirmación: un toque accidental no debe sacar al cajero del reparto.
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const pedirCierre = () => { if (!ocupado) setConfirmarCierre(true); };
  const impresiones = useRef<Record<string, () => void>>({});
  const registrarImpresion = useCallback((id: string, fn: (() => void) | null) => {
    if (fn) impresiones.current[id] = fn; else delete impresiones.current[id];
  }, []);

  // Cuentas operativas de la mesa (las cargadas a una habitación ya sincronizada son de solo lectura y no participan).
  const mesaId = mesa?.id;
  useEffect(() => {
    if (!opened || !mesaId) return;
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const query = rxDb.comandas.find({
        selector: { mesa_id: mesaId, organization_id: orgId, estado: { $nin: ['cerrado', 'facturado', 'anulada'] } },
      });
      const aplicar = (docs: any[]) => {
        if (!alive) return;
        setComandas(docs
          .map(d => (d.toJSON ? d.toJSON() : d))
          .filter(c => isOperativeComanda(c) && !(c.habitacion_cuenta_id && c.sincronizado !== false))
          .sort((a, b) => a.folio - b.folio));
      };
      aplicar(await query.exec());
      sub = query.$.subscribe(aplicar);
    })().catch(e => console.warn('Reparto de cuentas: no se pudieron cargar las cuentas', e));
    return () => { alive = false; sub?.unsubscribe(); };
  }, [opened, mesaId]);

  const idsKey = comandas.map(c => c.id).join(',');
  useEffect(() => {
    if (!opened || !idsKey) { setItems([]); return; }
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.comanda_items.find({ selector: { comanda_id: { $in: idsKey.split(',') }, _deleted: { $ne: true } } });
      const estabilizar = crearEstabilizador<any>();
      sub = query.$.subscribe((docs: any[]) => { if (alive) setItems(estabilizar(docs.map((d: any) => d.toJSON()))); });
    })().catch(() => {});
    return () => { alive = false; sub?.unsubscribe(); };
  }, [opened, idsKey]);

  // Al cerrar o cambiar de mesa se limpia lo elegido.
  useEffect(() => {
    // También se vacían las listas: al reabrir (p. ej. tras cobrar una cuenta) no debe verse un instante la cuenta que ya se cerró.
    if (!opened) { setSeleccion(SIN_SELECCION); setRepartiendo(false); setRepartirEntre([]); setConfirmarCierre(false); setComandas([]); setItems([]); }
  }, [opened]);

  const multiple = esMesaMultiple(comandas);
  const nombreDe = useCallback((c: any, idx: number) => c.subcomanda_nombre || (multiple ? `Cuenta ${idx + 1}` : (c.cliente && c.cliente !== 'Consumidor Final' && c.cliente !== 'Público General' ? c.cliente : 'Cuenta principal')), [multiple]);
  const itemsDe = useCallback((id: string) => items.filter(i => i.comanda_id === id), [items]);

  const limpiar = () => { setSeleccion(SIN_SELECCION); setRepartiendo(false); setRepartirEntre([]); };

  const toggle = (c: any, it: any) => {
    setRepartiendo(false);
    setSeleccion(prev => {
      const base = prev.comandaId === c.id ? { ...prev.cant } : {};
      if (base[it.id] !== undefined) delete base[it.id]; else base[it.id] = it.cantidad;
      return Object.keys(base).length > 0 ? { comandaId: c.id, cant: base } : SIN_SELECCION;
    });
  };

  const ejecutar = async (fn: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); }
  };

  const moverVarios = (pares: Array<[string, number]>, destId: string) => ejecutar(async () => {
    const nombreDestino = nombreDe(comandas.find(c => c.id === destId) ?? {}, comandas.findIndex(c => c.id === destId));
    let movidos = 0;
    let primerFallo = '';
    for (const [id, cant] of pares) { // de uno en uno: cada movimiento actualiza las cantidades enviadas a cocina
      try { await moverItemASubcomanda(id, destId, cant); movidos++; }
      catch (e) { if (!primerFallo) primerFallo = `${items.find(i => i.id === id)?.nombre ?? 'Un producto'}: ${e instanceof Error ? e.message : 'no se pudo mover'}`; }
    }
    limpiar();
    if (movidos === pares.length) showToast.success(movidos === 1 ? 'Producto movido' : `${movidos} productos movidos`, `A ${nombreDestino}.`);
    else showToast.warning(`Se movieron ${movidos} de ${pares.length}`, primerFallo);
  });

  const cambiarCantidad = (itemId: string, cantidad: number) => setSeleccion(s => ({ ...s, cant: { ...s.cant, [itemId]: cantidad } }));
  const pasarAqui = (destId: string) => moverVarios(Object.entries(seleccion.cant), destId);

  // Arrastrar y soltar (PC): si el producto está entre los elegidos se mueve todo lo elegido; si no, solo ese.
  const soltar = (itemId: string, destId: string) => {
    const it = items.find(i => i.id === itemId);
    if (!it || it.comanda_id === destId || !itemMovible(it)) return;
    if (seleccion.comandaId === it.comanda_id && seleccion.cant[itemId] !== undefined) moverVarios(Object.entries(seleccion.cant), destId);
    else moverVarios([[itemId, it.cantidad]], destId);
  };

  const deshacer = (it: any) => ejecutar(async () => {
    try { await deshacerRepartoItem(it.id); limpiar(); showToast.success('Reparto deshecho'); }
    catch (e) { showToast.fallo('deshacer el reparto', e); }
  });

  const unicoElegido = Object.keys(seleccion.cant).length === 1 ? items.find(i => i.id === Object.keys(seleccion.cant)[0]) : null;
  const abrirRepartir = () => { setRepartirEntre(comandas.map(c => c.id)); setRepartiendo(true); };
  const confirmarRepartir = () => ejecutar(async () => {
    if (!unicoElegido) return;
    try {
      await repartirItemEntreSubcomandas(unicoElegido.id, repartirEntre, seleccion.cant[unicoElegido.id]);
      showToast.success('Valor repartido', `Entre ${repartirEntre.length} cuenta${repartirEntre.length === 1 ? '' : 's'}.`);
      limpiar();
    } catch (e) { showToast.fallo('repartir el valor', e); }
  });
  const montosReparto = unicoElegido && repartirEntre.length > 0
    ? calcularPartes(unicoElegido.precio * seleccion.cant[unicoElegido.id], repartirEntre.length) : [];

  const faltaOtra = repartirEntre.filter(id => id !== seleccion.comandaId).length === 0;
  const panelRepartir = (
    <div className="flex flex-col gap-2">
      {!repartiendo ? (
        <Button variant="outline" className="h-11 font-bold justify-center border-special text-special-foreground hover:bg-special-soft" onClick={abrirRepartir} disabled={ocupado}>
          <UsersThree size={16} weight="bold" className="mr-2" /> Repartir valor…
        </Button>
      ) : (
        <div className="rounded-xl border border-special/40 bg-special-soft p-3 flex flex-col gap-2">
          <span className="t-etiqueta text-special-foreground">Repartir «{unicoElegido?.nombre}» entre</span>
          <div className="flex flex-wrap gap-1.5">
            {comandas.map((c, idx) => {
              const activa = repartirEntre.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setRepartirEntre(prev => activa ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                  className={cn('h-10 px-3 rounded-full t-dato cursor-pointer transition-colors border',
                    activa ? 'bg-special text-white border-special' : 'bg-card text-foreground border-border hover:bg-muted')}
                >
                  {nombreDe(c, idx)}
                </button>
              );
            })}
          </div>
          {montosReparto.length > 0 && (
            <span className="t-meta text-special-foreground">
              Cada cuenta paga {Math.min(...montosReparto) === Math.max(...montosReparto)
                ? money(montosReparto[0])
                : `${money(Math.min(...montosReparto))} – ${money(Math.max(...montosReparto))}`}.
            </span>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10 font-bold bg-card" onClick={() => setRepartiendo(false)} disabled={ocupado}>Atrás</Button>
            <Button className="h-10 font-bold bg-special hover:bg-special/90 text-white" onClick={confirmarRepartir} disabled={ocupado || faltaOtra}>
              {faltaOtra ? 'Elige otra' : `Repartir (${repartirEntre.length})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const nElegidos = Object.keys(seleccion.cant).length;
  const slotOrigen = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="t-dato text-foreground">{nElegidos === 1 ? '1 elegido' : `${nElegidos} elegidos`}</span>
        <Button variant="ghost" className="h-9 px-3 font-bold" onClick={limpiar} disabled={ocupado}>Limpiar</Button>
      </div>
      {comandas.length < 2 && <span className="t-meta text-muted-foreground">Crea una cuenta nueva para pasar productos.</span>}
      {unicoElegido && comandas.length > 1 && panelRepartir}
    </div>
  );

  const crearCuenta = () => ejecutar(async () => {
    if (!mesa || comandas.length === 0) return;
    try {
      if (!multiple) {
        await activarMesaMultiple(mesa, comandas[0]);
      } else {
        const usados = new Set(comandas.map(c => (c.subcomanda_nombre || '').trim().toLowerCase()));
        let n = comandas.length + 1;
        while (usados.has(`cuenta ${n}`)) n++;
        const previa = activeSubcomandaId;
        await crearSubcomanda(mesa, `Cuenta ${n}`);
        setActiveSubcomandaId(previa); // crear una cuenta desde aquí no cambia la que el cajero tenía abierta en el sidebar
      }
    } catch (e) { showToast.fallo('crear la cuenta', e); }
  });

  // Cobrar: la cuenta pasa a «cuenta pedida» si aún no lo estaba (imprimir la precuenta equivale a pedirla) y se abre su cobro en el sidebar.
  const cobrarCuenta = (c: any) => ejecutar(async () => {
    try {
      if (c.estado !== 'cuenta') {
        if (!c.confirmada) {
          showToast.warning('Faltan productos por enviar a cocina', `Envía a cocina lo pendiente de ${c.subcomanda_nombre || 'esta cuenta'} antes de cobrar.`);
          return;
        }
        await updateRxComanda(c.id, { estado: 'cuenta', confirmada: true });
      }
      onCobrar(c.id);
    } catch (e) { showToast.fallo('abrir el cobro', e); }
  });

  const imprimirTodas = () => {
    const fns = comandas.map(c => impresiones.current[c.id]).filter(Boolean);
    if (fns.length === 0) return;
    fns.forEach(fn => fn());
  };

  const hayDestino = comandas.length > 1 && seleccion.comandaId !== null;

  const renderColumna = (c: any, idx: number) => mesa && (
    <ColumnaCuenta
      key={c.id}
      comanda={c}
      items={itemsDe(c.id)}
      mesa={mesa}
      nombre={nombreDe(c, idx)}
      seleccion={seleccion}
      hayDestino={hayDestino}
      ocupado={ocupado}
      principal={idx === 0 && !isMobile}
      firmaImpresa={impresas[c.id]}
      onImpresa={marcarImpresa}
      onCobrar={cobrarCuenta}
      onToggle={toggle}
      onCantidad={cambiarCantidad}
      onPasarAqui={pasarAqui}
      onDeshacer={deshacer}
      onDropItem={soltar}
      registrarImpresion={registrarImpresion}
      slotSeleccion={seleccion.comandaId === c.id ? slotOrigen : null}
    />
  );

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) pedirCierre(); }}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)] md:w-[calc(100vw-3rem)] md:h-[calc(100dvh-3rem)] max-w-none sm:max-w-none p-0 gap-0 flex flex-col overflow-hidden"
      >
        <DialogHeader className="shrink-0 px-4 py-3 md:px-5 md:py-4 border-b border-border flex-row items-center justify-between gap-3 text-left">
          <div className="min-w-0 flex flex-col gap-0.5">
            <DialogTitle className="t-titulo truncate">Dividir cuenta{mesa ? ` · ${mesa.nombre}` : ''}</DialogTitle>
            <DialogDescription className="hidden md:block t-meta text-muted-foreground">
              Toca los productos y pásalos a otra cuenta, o arrástralos. Cada cuenta se imprime por separado.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" className="h-11 font-bold px-3 md:px-4" onClick={imprimirTodas} disabled={comandas.length === 0} title="Imprimir todas las precuentas" aria-label="Imprimir todas las precuentas">
              <Printer size={16} weight="bold" className="md:mr-2" /> <span className="hidden md:inline">Imprimir todas</span>
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Cerrar" disabled={ocupado} onClick={pedirCierre} className="rounded-2xl">
              <X size={20} weight="bold" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex bg-muted/30">
          {!isMobile && mesa && comandas[0] && renderColumna(comandas[0], 0)}
          <div className="relative flex-1 min-w-0 min-h-0 flex">
            {borde.izq && (
              <button type="button" aria-label="Ver cuentas anteriores" onClick={() => desplazarFila(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 size-11 rounded-full bg-card border border-border shadow-lg flex items-center justify-center cursor-pointer active:scale-95">
                <CaretLeft size={20} weight="bold" />
              </button>
            )}
            {borde.der && (
              <button type="button" aria-label="Ver más cuentas" onClick={() => desplazarFila(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 size-11 rounded-full bg-card border border-border shadow-lg flex items-center justify-center cursor-pointer active:scale-95">
                <CaretRight size={20} weight="bold" />
              </button>
            )}
            <div ref={setFilaRef} className="flex-1 min-w-0 overflow-x-auto overscroll-x-contain p-4 flex gap-3 items-stretch [scrollbar-width:thin]">
              {mesa && (isMobile ? comandas : comandas.slice(1)).map(c => renderColumna(c, comandas.indexOf(c)))}
              {comandas.length > 0 && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={crearCuenta}
                  className="shrink-0 w-[150px] rounded-2xl border-2 border-dashed border-border text-muted-foreground flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-card hover:text-foreground transition-colors"
                >
                  {ocupado ? <CircleNotch size={24} className="animate-spin" /> : <Plus size={24} weight="bold" />}
                  <span className="t-cuerpo-fuerte">Nueva cuenta</span>
                </button>
              )}
            </div>
          </div>
        </div>

      </DialogContent>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar el reparto de cuentas?</AlertDialogTitle>
            <AlertDialogDescription>
              Lo que ya pasaste o repartiste queda guardado en cada cuenta. Lo que tengas elegido sin aplicar se descarta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir repartiendo</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmarCierre(false); onClose(); }}>Cerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
