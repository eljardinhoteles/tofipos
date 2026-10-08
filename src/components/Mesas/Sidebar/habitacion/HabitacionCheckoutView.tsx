import { useState, useMemo, useEffect } from'react';
import { folioLabel } from '../../../../lib/folio';
import { X, CaretRight, Receipt, CreditCard, Printer, Percent } from'@phosphor-icons/react';
import { type Mesa, type HabitacionCuenta } from'../../../../db/database';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb, updateRxComanda, updateRxComandaItem, updateRxHabitacionCuenta, updateRxMesa, createRxVenta } from'../../../../db/rxdb';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { cn } from'@/lib/utils';
import { Checkbox } from'@/components/ui/checkbox';
import { useIvaActivo } from'../../../../hooks/useIvaActivo';
import { useRxMenuCatalog } from'../../../../hooks/useRxMenuCatalog';
import { calcularTotalesComanda } from'../../../../lib/taxUtils';
import { generarPrecuentaConsolidadaHabitacion } from'../../../../services/printTemplateEngine';
import { queueReprintTicket } from'../../../../lib/printServerClient';
import { TicketPreviewModal } from'../../../Common/TicketPreviewModal';
import { SubcuentaChips } from'./SubcuentaChips';
import { CheckoutComandaDetalle, type CortesiaDraft } from'./CheckoutComandaDetalle';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from'@/components/ui/alert-dialog';

// UUID v4-formato derivado de un texto (SHA-256), para ids idempotentes.
async function idDeterminista(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  const h = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function HabitacionCheckoutView({
  cuenta,
  selectedMesa,
  checkoutData,
  onBack,
  onSuccess,
}: {
  cuenta: HabitacionCuenta;
  selectedMesa: Mesa;
  checkoutData?: any;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const subcuentas = cuenta.subcuentas ?? [];
  // Subcuenta que se cobra: 'todas', null (principal) o id. Viene de CuentaView
  // según el filtro que estaba activo; se puede cambiar aquí.
  const [subSel, setSubSel] = useState<string | null>(
    checkoutData?.subcuentaId === undefined ? 'todas' : checkoutData.subcuentaId
  );
  const nombrePagador = (sel: string | null) =>
    subcuentas.find(x => x.id === sel)?.nombre || cuenta.huesped ||'';
  const [payerName, setPayerName] = useState(() => nombrePagador(subSel));
  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();
  const [aplicandoIva, setAplicandoIva] = useState(false);

  const [comandas, setComandas] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemsByComanda, setItemsByComanda] = useState<Record<string, any[]>>({});
  // Comanda cuyo detalle (cortesías por ítem) está abierto en su propia pantalla.
  const [detalleComandaId, setDetalleComandaId] = useState<string | null>(null);
  const [cortesiaDrafts, setCortesiaDrafts] = useState<Record<string, CortesiaDraft>>({});

  // Confirmación antes de "Cobrar": el cierre en base de datos es
  // irreversible desde esta pantalla (libera la mesa/cierra la cuenta), así
  // que se pide un paso extra para evitar toques accidentales.
  const [confirmCobroOpened, setConfirmCobroOpened] = useState(false);

  // Preview consolidado que el huésped revisa antes de confirmar el cobro.
  // El cierre real en base de datos (handleFinalizar) solo corre cuando el
  // usuario confirma la impresión en el modal (tras la cuenta regresiva).
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  const roomNum = selectedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || selectedMesa.nombre.replace(/\D/g,'') || selectedMesa.nombre;

  useEffect(() => {
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const docs = await rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).exec();
      if (!alive) return;
      // Solo comandas pendientes de cobro: las ya cobradas (cerrado/facturado)
      // o anuladas de un checkout parcial por subcuenta no deben volver a
      // seleccionarse (doble venta) ni contar como "pendientes" al decidir si
      // se cierra la cuenta y se libera la mesa.
      const list = docs.map((d: any) => d.toJSON())
        .filter((c: any) => !['cerrado', 'facturado', 'anulada'].includes(c.estado));
      setComandas(list);
      // Por defecto se seleccionan todas las precuentas, como antes; el
      // usuario puede desmarcar las que no quiere pagar en este cobro.
      setSelectedIds(new Set(list
        .filter((c: any) => subSel === 'todas' || (c.habitacion_subcuenta_id ?? null) === subSel)
        .map((c: any) => c.id)));

      const itemsDocs = await rxDb.comanda_items.find({
        selector: { comanda_id: { $in: list.map((c: any) => c.id) }, _deleted: { $ne: true } }
      }).exec();
      if (!alive) return;
      const grouped: Record<string, any[]> = {};
      for (const doc of itemsDocs) {
        const item = (doc as any).toJSON();
        (grouped[item.comanda_id] ||= []).push(item);
      }
      setItemsByComanda(grouped);

      // Prellenar drafts con la cortesía ya guardada de cada item.
      const drafts: Record<string, CortesiaDraft> = {};
      for (const item of itemsDocs.map((d: any) => d.toJSON())) {
        drafts[item.id] = {
          cantidad: item.cortesia_cantidad || 0,
          motivo: item.cortesia_motivo ||'',
        };
      }
      setCortesiaDrafts(drafts);
    })();
    return () => { alive = false; };
  }, [cuenta.id]);

  const comandasSeleccionadas = useMemo(
    () => comandas.filter(c => selectedIds.has(c.id)),
    [comandas, selectedIds]
  );

  // Si lo que se cobra pertenece a una sola subcuenta, su nombre sale en la
  // precuenta consolidada y en la referencia de la venta. Vacío si la cuenta
  // no tiene subcuentas o si se cobran varias a la vez.
  const etiquetaSubcuenta = useMemo(() => {
    if (subcuentas.length === 0) return '';
    const subs = new Set(comandasSeleccionadas.map(c => c.habitacion_subcuenta_id ?? null));
    if (subs.size !== 1) return '';
    const id = [...subs][0];
    return subcuentas.find(x => x.id === id)?.nombre || cuenta.principal_nombre ||'Principal';
  }, [comandasSeleccionadas, subcuentas, cuenta.principal_nombre]);

  // Total neto a cobrar por comanda: se resta, por cada item, el monto
  // correspondiente a la cantidad marcada en cortesía.
  const totalNetoPorComanda = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comandas) {
      const items = itemsByComanda[c.id] || [];
      const totalCortesia = items.reduce((acc, item) => {
        const draft = cortesiaDrafts[item.id];
        const cantidadCortesia = draft ? draft.cantidad : (item.cortesia_cantidad || 0);
        return acc + cantidadCortesia * item.precio;
      }, 0);
      map.set(c.id, Math.max(0, (c.total || 0) - totalCortesia));
    }
    return map;
  }, [comandas, itemsByComanda, cortesiaDrafts]);

  const total = useMemo(
    () => comandasSeleccionadas.reduce((acc, c) => acc + (totalNetoPorComanda.get(c.id) ?? c.total ?? 0), 0),
    [comandasSeleccionadas, totalNetoPorComanda]
  );

  // Comandas seleccionadas cuyo total no coincide con el IVA activo hoy (p. ej.
  // consumos de días anteriores a 15% cuando el checkout cae en feriado a 8%).
  // El IVA del checkout manda: se pueden recalcular con la tasa activa.
  const ivaPendientes = useMemo(() => {
    const out: Array<{ comanda: any; nuevoTotal: number }> = [];
    // Sin catálogo cargado no se puede recalcular: evita falsos avisos al abrir.
    if (menuItems.length === 0) return out;
    for (const c of comandasSeleccionadas) {
      if (!itemsByComanda[c.id]) continue; // items aún sin cargar / comanda vacía
      const items = itemsByComanda[c.id].filter(i => !i.anulado);
      const nuevoTotal = calcularTotalesComanda(items, menuItems, ivaPorcentaje, preciosConIva).total;
      const totalCambia = Math.abs(nuevoTotal - (c.total || 0)) > 0.005;
      const tasaDistinta = c.iva_porcentaje != null && c.iva_porcentaje !== ivaPorcentaje;
      if (totalCambia || tasaDistinta) out.push({ comanda: c, nuevoTotal });
    }
    return out;
  }, [comandasSeleccionadas, itemsByComanda, menuItems, ivaPorcentaje, preciosConIva]);

  const totalConIvaActivo = useMemo(() => {
    const nuevos = new Map(ivaPendientes.map(x => [x.comanda.id, x.nuevoTotal]));
    return comandasSeleccionadas.reduce((acc, c) => {
      const bruto = nuevos.get(c.id) ?? c.total ?? 0;
      const cortesia = (c.total || 0) - (totalNetoPorComanda.get(c.id) ?? c.total ?? 0);
      return acc + Math.max(0, bruto - cortesia);
    }, 0);
  }, [ivaPendientes, comandasSeleccionadas, totalNetoPorComanda]);

  const aplicarIvaActivo = async () => {
    if (ivaPendientes.length === 0) return;
    setAplicandoIva(true);
    try {
      const patch = { iva_porcentaje: ivaPorcentaje, iva_precios_con_iva: preciosConIva };
      for (const { comanda, nuevoTotal } of ivaPendientes) {
        await updateRxComanda(comanda.id, { ...patch, total: nuevoTotal });
      }
      const nuevos = new Map(ivaPendientes.map(x => [x.comanda.id, x.nuevoTotal]));
      setComandas(prev => prev.map(c => nuevos.has(c.id) ? { ...c, ...patch, total: nuevos.get(c.id) } : c));
      showToast.success('IVA actualizado', `Se aplicó el ${ivaPorcentaje}% a ${ivaPendientes.length} comanda${ivaPendientes.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      showToast.error('No se pudo aplicar el IVA');
    } finally {
      setAplicandoIva(false);
    }
  };

  const cambiarSubcuenta = (sel: string | null) => {
    setSubSel(sel);
    setSelectedIds(new Set(comandas
      .filter(c => sel === 'todas' || (c.habitacion_subcuenta_id ?? null) === sel)
      .map(c => c.id)));
    setPayerName(nombrePagador(sel));
  };

  const toggleSeleccion = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setDraft = (itemId: string, patch: Partial<CortesiaDraft>) => {
    setCortesiaDrafts(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { cantidad: 0, motivo:''}), ...patch },
    }));
  };

  // Botón "Completa" / "Consumos": solo arma y muestra el comprobante
  // consolidado para que el huésped lo revise, sin afectar el estado de
  // las comandas. Es independiente de "Cobrar" — se puede imprimir varias
  // veces sin cobrar. "Consumos" omite los items del plan (precio 0),
  // para no confundir al huésped con líneas en $0 en su cuenta a pagar.
  const handleImprimirConsolidado = (soloConsumo: boolean) => {
    if (comandasSeleccionadas.length === 0) return;

    const comandasConItems = comandasSeleccionadas.map(c => ({
      comanda: c,
      items: (itemsByComanda[c.id] || []).filter(item => !item.anulado).filter(item => {
        const draft = cortesiaDrafts[item.id];
        const cantidadCortesia = draft ? draft.cantidad : (item.cortesia_cantidad || 0);
        return cantidadCortesia < item.cantidad;
      }).map(item => {
        const draft = cortesiaDrafts[item.id];
        const cantidadCortesia = draft ? draft.cantidad : (item.cortesia_cantidad || 0);
        return { ...item, cantidad: item.cantidad - cantidadCortesia };
      }),
    }));

    const content = generarPrecuentaConsolidadaHabitacion(
      comandasConItems,
      selectedMesa.nombre,
      ivaPorcentaje,
      selectedMesa.nombre,
      false,
      soloConsumo,
      etiquetaSubcuenta || undefined,
    );
    setPreviewContent(content);
    setPreviewOpened(true);
  };

  // Botón "Cobrar": cierra directo, sin preview ni confirmación adicional.
  const handleFinalizar = async () => {
    if (comandasSeleccionadas.length === 0) return;

    // Toda cortesía marcada (cantidad > 0) requiere motivo, para no perder
    // trazabilidad de por qué no se cobró ese item.
    for (const c of comandasSeleccionadas) {
      const items = itemsByComanda[c.id] || [];
      for (const item of items) {
        const draft = cortesiaDrafts[item.id];
        if (draft && draft.cantidad > 0 && !draft.motivo.trim()) {
          showToast.error('Falta motivo','Indica el motivo de la cortesía en'+` "${item.nombre}".`);
          return;
        }
      }
    }

    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const now = new Date().toISOString();

      // 1) La venta va primero: si el proceso se interrumpe después, las
      // comandas siguen pendientes y el reintento no pierde el cobro. El id
      // es determinista (cuenta + comandas) para que el reintento no
      // duplique la venta en Centro de Ventas.
      if (total > 0.001) {
        const rxDb = await initVerticalRxDb();
        const ventaId = await idDeterminista(`hab-checkout:${cuenta.id}:${comandasSeleccionadas.map(c => c.id).sort().join(',')}`);
        const yaExiste = await rxDb.ventas.findOne(ventaId).exec();
        if (!yaExiste) {
          const folios = comandasSeleccionadas.map(c => `#${folioLabel(c)}`).join(', ');
          await createRxVenta({
            id: ventaId,
            origen:'habitacion',
            tipo:'directa',
            cliente_id: cuenta.cliente_id || undefined,
            cliente_nombre: payerName.trim() || cuenta.huesped || undefined,
            referencia: `${selectedMesa.nombre}${etiquetaSubcuenta ? ` · ${etiquetaSubcuenta}` : ''} · Comandas ${folios}`,
            organization_id: localStorage.getItem('pos_active_org_id') ||'',
          }, total);
        }
      }

      for (const c of comandasSeleccionadas) {
        const items = itemsByComanda[c.id] || [];
        for (const item of items) {
          const draft = cortesiaDrafts[item.id];
          if (!draft) continue;
          const cantidadPrevia = item.cortesia_cantidad || 0;
          const motivoPrevio = item.cortesia_motivo ||'';
          if (draft.cantidad !== cantidadPrevia || draft.motivo.trim() !== motivoPrevio) {
            await updateRxComandaItem(item.id, {
              cortesia_cantidad: draft.cantidad,
              cortesia_motivo: draft.cantidad > 0 ? draft.motivo.trim() : null,
            });
          }
        }
        await updateRxComanda(c.id, {
          estado:'cerrado',
          total: totalNetoPorComanda.get(c.id) ?? c.total,
        });
      }

      // La cuenta de la habitación solo se cierra y la mesa se libera si no
      // quedan precuentas pendientes de pago; si el usuario dejó comandas sin
      // marcar, la habitación sigue activa con el resto del saldo.
      const quedanPendientes = comandas.some(c => !selectedIds.has(c.id));
      if (!quedanPendientes) {
        await updateRxHabitacionCuenta(cuenta.id, { estado:'cerrada', check_out: now.split('T')[0] });
        await updateRxMesa(selectedMesa.id, { estado:'libre'});
      }

      showToast.success('Checkout completado');
      onSuccess();
    } catch {
      showToast.error('Error al procesar checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  const comandaDetalle = detalleComandaId ? comandas.find(c => c.id === detalleComandaId) : null;
  if (comandaDetalle) {
    return (
      <CheckoutComandaDetalle
        comanda={comandaDetalle}
        items={itemsByComanda[comandaDetalle.id] || []}
        drafts={cortesiaDrafts}
        onDraft={setDraft}
        totalNeto={totalNetoPorComanda.get(comandaDetalle.id) ?? comandaDetalle.total ?? 0}
        onBack={() => setDetalleComandaId(null)}
      />
    );
  }

  return (
    <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
      {/* Header — mismo lenguaje que SidebarDetails/CuentaView */}
      <header className="p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground md:bg-info md:text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 bg-info text-white md:bg-white/15">
            {roomNum}
          </div>
          <div className="flex flex-col">
            <h3 className="font-extrabold text-base leading-tight md:text-white">Checkout</h3>
            <span className="text-[10px] font-bold text-muted-foreground md:text-white/70">
              {cuenta.huesped} · {selectedMesa.nombre}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon-lg" aria-label="Volver" onClick={onBack} className="rounded-xl bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25 md:text-white">
          <X size={18} weight="bold" />
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {subcuentas.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">Subcuenta a cobrar</span>
            <SubcuentaChips subcuentas={subcuentas} value={subSel} onChange={cambiarSubcuenta} mostrarTodas nombrePrincipal={cuenta.principal_nombre || 'Principal'} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkout-pagador" className="text-xs font-bold text-foreground">Nombre de quien paga</Label>
          <Input
            id="checkout-pagador" type="text" value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            className="h-12 text-base font-semibold"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
            <Receipt size={14} weight="bold" /> Precuentas a cobrar
          </span>
          {ivaPendientes.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-warning-soft border border-warning/40 p-3">
              <div className="w-9 h-9 rounded-lg bg-card text-warning-foreground flex items-center justify-center shrink-0 shadow-xs">
                <Percent size={18} weight="bold" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-extrabold text-warning-foreground leading-tight">
                  {ivaPendientes.length} comanda{ivaPendientes.length === 1 ? '' : 's'} con IVA distinto al activo ({ivaPorcentaje}%)
                </span>
                <span className="text-[11px] font-semibold text-warning-foreground/80">
                  Total ${total.toFixed(2)} → ${totalConIvaActivo.toFixed(2)} con IVA {ivaPorcentaje}%
                </span>
              </div>
              <Button size="sm" className="shrink-0" disabled={aplicandoIva} onClick={aplicarIvaActivo}>
                {aplicandoIva ? 'Aplicando…' : `Aplicar ${ivaPorcentaje}%`}
              </Button>
            </div>
          )}
          {/* Mismo estilo que la lista de la cuenta de habitación: filas a todo el ancho, intercaladas, sin líneas. */}
          <div className="flex flex-col -mx-4">
            {comandas.map((c, index) => {
              const isOdd = index % 2 === 1;
              const isSelected = selectedIds.has(c.id);
              const totalNeto = totalNetoPorComanda.get(c.id) ?? c.total ?? 0;
              const descuento = (c.total || 0) - totalNeto;
              const tieneCortesia = descuento > 0.001;

              return (
                <div key={c.id} className={cn("flex items-stretch px-4", isOdd && "bg-muted/70")}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSeleccion(c.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSeleccion(c.id); } }}
                    className="flex-1 min-w-0 py-3 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm text-foreground truncate">Comanda #{folioLabel(c)}</span>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {new Date(c.created_at).toLocaleDateString('es', { day:'2-digit', month:'short'})} · {new Date(c.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>

                  {/* El importe es también el botón del detalle: tocarlo abre los ítems (donde se ajusta ese importe). */}
                  <div className="flex items-center py-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDetalleComandaId(c.id)}
                      title="Ver ítems / aplicar cortesía"
                      aria-label={`Ver ítems de la comanda ${folioLabel(c)}`}
                      className="h-auto min-h-11 min-w-28 pl-3 pr-2 py-1.5 gap-2 justify-between rounded-xl hover:bg-muted"
                    >
                      <span className="flex flex-col items-end leading-tight">
                        {tieneCortesia && (
                          <span className="text-[10px] font-bold text-warning-foreground">Cortesía −${descuento.toFixed(2)}</span>
                        )}
                        <span className="font-black text-sm text-foreground">${totalNeto.toFixed(2)}</span>
                      </span>
                      <CaretRight size={16} weight="bold" className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer — mismo bloque de total que SidebarDetails/CuentaView */}
      <footer className="p-4 bg-muted/40 border-t border-border flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-1.5 px-2 py-1 text-sm font-semibold text-muted-foreground">
          <div className="flex items-center justify-between">
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black text-foreground">Total a Cobrar</span>
              <span className="text-xs font-semibold text-muted-foreground">
                {comandasSeleccionadas.length}/{comandas.length} precuentas
              </span>
            </div>
            <span className="text-xl font-black text-foreground">${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button" variant="warningSoft" disabled={comandasSeleccionadas.length === 0}
            onClick={() => handleImprimirConsolidado(false)}
            className="w-full h-10 font-bold"
          >
            <Printer size={18} weight="bold" className="mr-1.5" /> Completa
          </Button>
          <Button
            type="button" variant="warningSoft" disabled={comandasSeleccionadas.length === 0}
            onClick={() => handleImprimirConsolidado(true)}
            className="w-full h-10 font-bold"
          >
            <Printer size={18} weight="bold" className="mr-1.5" /> Consumos
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button" disabled={isProcessing || comandasSeleccionadas.length === 0}
            onClick={() => setConfirmCobroOpened(true)}
            variant="warning" className="w-full h-10 font-bold"
          >
            <CreditCard size={18} weight="bold" className="mr-1.5" /> Cobrar
          </Button>
          <Button
            type="button" variant="ghost" disabled={isProcessing}
            onClick={onBack}
            className="w-full h-10 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Cancelar
          </Button>
        </div>
      </footer>

      <AlertDialog open={confirmCobroOpened} onOpenChange={setConfirmCobroOpened}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cobro</AlertDialogTitle>
            <AlertDialogDescription>
              Se cobrará ${total.toFixed(2)} y se cerrarán {comandasSeleccionadas.length === comandas.length ? 'todas las comandas' : `${comandasSeleccionadas.length} de ${comandas.length} comandas`} seleccionadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              onClick={() => {
                setConfirmCobroOpened(false);
                handleFinalizar();
              }}
            >
              Confirmar cobro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={`Precuenta Consolidada - ${selectedMesa.nombre}`}
        content={previewContent}
        onPrint={() => {
          queueReprintTicket({
            rawText: previewContent,
            mesaNombre: selectedMesa.nombre,
            comanda: comandasSeleccionadas[0],
          }).catch(err => console.warn('print server offline', err));
        }}
      />
    </div>
  );
}
