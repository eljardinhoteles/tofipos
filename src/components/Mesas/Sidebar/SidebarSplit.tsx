import { imprimirConAviso } from '../../../lib/imprimir';
import { useEffect, useState, useMemo } from'react';
import { folioLabel } from '../../../lib/folio';
import {
 Users, CurrencyCircleDollar, Check, Printer, Scissors, Minus, Plus, CaretRight
} from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { generarPrecuentaDividida } from'../../../services/printTemplateEngine';
import { queueReprintTicket } from'../../../lib/printServerClient';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import {
 initVerticalRxDb,
 createRxVenta,
 updateRxComanda,
 liberarMesaSiSinOperativas
} from'../../../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from'@/components/ui/dialog';
import { ReservaHeader } from'./ReservaHeader';

interface SidebarSplitProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onBack: () => void;
 onSuccess: () => void;
}

export function SidebarSplit({ selectedMesa, activeComanda, comandaItems, onBack, onSuccess }: SidebarSplitProps) {
 const [splitMethod, setSplitMethod] = useState<'iguales'|'monto'| null>(null);
 const [saldoInicialSplit, setSaldoInicialSplit] = useState<number>(0);
 const [personas, setPersonas] = useState(2);
 const [selectedPersonaIdx, setSelectedPersonaIdx] = useState<number | null>(null);
 const [paidPersonaIndexes, setPaidPersonaIndexes] = useState<number[]>([]);
 const [montoCustom, setMontoCustom] = useState<number |''>('');
 const [cobrarModalState, setCobrarModalState] = useState<{
 monto: number;
 label: string;
 onSuccessCallback?: () => void;
 } | null>(null);

 const [payerName, setPayerName] = useState<string>('');
 const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
 const [pagos, setPagos] = useState<any[]>([]);

 useEffect(() => {
 if (!activeComanda?.id) {
 setPagos([]);
 return;
 }

 let sub: { unsubscribe: () => void } | null = null;
 let alive = true;

 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id, _deleted: false }
 });
 const docs = await query.exec();
 if (!alive) return;
 setPagos(docs.map((doc: any) => doc.toJSON()));
 sub = query.$.subscribe((docs: any[]) => {
 setPagos(docs.map((doc: any) => doc.toJSON()));
 });
 };

 run().catch(console.error);

 return () => {
 alive = false;
 sub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 // Abonos previos registrados fuera del split (p.ej. desde la reserva
 // antes de asignar mesa) — se restan del total a dividir igual que los
 // pagos legacy, para no pedirle de más a quienes falta cobrar.
 const [ventasPrevias, setVentasPrevias] = useState<any[]>([]);
 useEffect(() => {
 if (!activeComanda?.id) {
 setVentasPrevias([]);
 return;
 }
 let alive = true;
 let unsub: { unsubscribe: () => void } | null = null;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.ventas.find({ selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } } });
 const docs = await query.exec();
 if (!alive) return;
 setVentasPrevias(docs.map((d: any) => d.toJSON()));
 unsub = query.$.subscribe((docs: any[]) => {
 setVentasPrevias(docs.map((d: any) => d.toJSON()));
 });
 };
 run().catch(console.error);
 return () => {
 alive = false;
 unsub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const totalesOriginales = useMemo(() => {
 return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
 }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

 const totalOriginal = totalesOriginales.total;
 const totalPagadoVentas = useMemo(() => {
 return ventasPrevias.reduce((accVenta: number, v: any) => {
 // El dinero de una venta normal (abono de reserva, cobro hecho en la mesa)
 // es anticipo de la mesa y se decide al cobrar la cuenta; aquí solo cuenta
 // lo que se cobró por división.
 if (!(typeof v.referencia ==='string' && v.referencia.includes('Dividido - '))) return accVenta;
 const movs = v.movimientos ?? [];
 // Las ventas "Dividido - ..." creadas por este mismo split (cualquiera
 // de los 3 métodos) registran el cobro ya recibido como 'ajuste' (el
 // método de pago real se ancla después en Centro de Ventas, no 'pago'
 // aquí) — sin esto, un segundo split sobre la misma comanda no veía lo
 // ya cobrado.
 const esSplit = typeof v.referencia ==='string' && v.referencia.includes('Dividido - ');
 const sumaVenta = movs.reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo ==='pago') return acc + (m.monto ?? 0);
 if (m.tipo ==='reembolso') return acc - (m.monto ?? 0);
 if (m.tipo ==='ajuste'&& esSplit) return acc + (m.monto ?? 0);
 return acc;
 }, 0);
 return accVenta + sumaVenta;
 }, 0);
 }, [ventasPrevias]);
 const totalPagado = useMemo(
 () => pagos.reduce((acc, p) => acc + p.monto, 0) + totalPagadoVentas,
 [pagos, totalPagadoVentas]
 );
 const saldoPendiente = Math.max(0, totalOriginal - totalPagado);

 const montoPorPersona = saldoInicialSplit / personas;

 const selectSplitMethod = (method:'iguales'|'monto') => {
 setSplitMethod(method);
 setSaldoInicialSplit(saldoPendiente);
 setSelectedPersonaIdx(null);
 setPaidPersonaIndexes([]);
 setMontoCustom('');
 };

 const procesarPagoSimple = async (
 monto: number,
 label?: string,
 onSuccessCallback?: () => void,
 nameOfPayer?: string
 ) => {
 if (!activeComanda) return;
 try {
 // Sin método: la división de cuenta en Mesas ya no elige método de pago
 // — se define después al anclar en Centro de Ventas.
 const labelDivision = nameOfPayer?.trim()
 ?`Dividido - ${nameOfPayer.trim()}`:`Dividido - ${label ||'Parte'}`;
 await createRxVenta({
 id: crypto.randomUUID(),
 origen:'mesa',
 tipo:'directa',
 cliente_id: activeComanda.cliente_id || undefined,
 cliente_nombre: nameOfPayer?.trim() || activeComanda.cliente || undefined,
 referencia: `Mesa ${activeComanda.mesa_nombre || selectedMesa.nombre} · #${folioLabel(activeComanda)} · ${labelDivision}`,
 comanda_id: activeComanda.id,
 organization_id: activeComanda.organization_id || localStorage.getItem('pos_active_org_id') ||'',
 }, monto);

 showToast.success('Pago y Ticket',`Cobro registrado por $${monto.toFixed(2)}.`);

 const labelText = nameOfPayer?.trim() || label ||'Parte';
 const ticketText = generarPrecuentaDividida(
 activeComanda,
 [],
 selectedMesa.nombre,
 labelText,
 monto,
 ivaPorcentaje
 );
 setPreviewTicketText(ticketText);
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueReprintTicket({
 rawText: ticketText,
 mesaNombre: selectedMesa.nombre,
 comanda: activeComanda,
 }), 'Ticket');
 });

 if (onSuccessCallback) onSuccessCallback();

 setMontoCustom('');
 setCobrarModalState(null);

 // Recalcula sumando ambas fuentes (pagos legacy + movimientos de venta):
 // una parte pudo haberse cobrado por acá y otra ya venir abonada desde la
 // reserva antes de asignar mesa — solo mirar `pagos` subestimaba lo ya
 // cubierto y dejaba la cuenta "abierta" aunque estuviera saldada.
 const rxDb = await initVerticalRxDb();
 const pagosActualizados = await rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id, _deleted: false }
 }).exec();
 const ventasActualizadas = await rxDb.ventas.find({
 selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } }
 }).exec();
 const totalPagosLegacy = pagosActualizados.reduce((acc, p) => acc + p.monto, 0);
 // Solo lo cobrado por división: un abono/anticipo de la mesa se decide al
 // cerrar la cuenta y no la salda desde aquí.
 const totalVentas = ventasActualizadas.reduce((accVenta, doc: any) => {
 const v = doc.toJSON();
 if (!(typeof v.referencia ==='string' && v.referencia.includes('Dividido - '))) return accVenta;
 const sumaVenta = (v.movimientos ?? []).reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo ==='pago') return acc + (m.monto ?? 0);
 if (m.tipo ==='reembolso') return acc - (m.monto ?? 0);
 if (m.tipo ==='ajuste') return acc + (m.monto ?? 0);
 return acc;
 }, 0);
 return accVenta + sumaVenta;
 }, 0);
 const nuevoTotalPagado = totalPagosLegacy + totalVentas;

 if (Math.abs(totalOriginal - nuevoTotalPagado) < 0.05 || nuevoTotalPagado >= totalOriginal) {
 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 updated_at: new Date().toISOString()
 });
 await liberarMesaSiSinOperativas(selectedMesa.id);
 showToast.success('Cuenta Pagada','El saldo pendiente ha sido cubierto en su totalidad.');
 onSuccess();
 }
 } catch (error) {
 console.error(error);
 showToast.error('Error al registrar el pago');
 }
 };

  const titulo = 'text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground';
  const nombreMesa = selectedMesa.nombre.toLowerCase().startsWith('mesa') ? selectedMesa.nombre : `Mesa ${selectedMesa.nombre}`;
  const montoInvalido = !montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente;
  const sinNombre = !payerName.trim();

  const verPrecuenta = (label: string, monto: number) => {
    const text = generarPrecuentaDividida(activeComanda, [], selectedMesa.nombre, label, monto, ivaPorcentaje);
    setPreviewTicketText(text);
    setPreviewOnPrint(() => () => {
      imprimirConAviso(() => queueReprintTicket({ rawText: text, mesaNombre: selectedMesa.nombre, comanda: activeComanda }), 'Ticket');
    });
  };

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <ReservaHeader
        tono="primary"
        badge={<Scissors size={22} weight="bold" />}
        titulo="Dividir cuenta"
        subtitulo={`${nombreMesa} · Cuenta #${folioLabel(activeComanda)}`}
        onBack={splitMethod ? () => setSplitMethod(null) : onBack}
      />

      <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
        {!splitMethod ? (
          saldoPendiente <= 0.001 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-success-soft text-success-foreground flex items-center justify-center">
                <Check size={24} weight="bold" />
              </div>
              <span className="font-extrabold text-sm text-foreground">Cuenta ya pagada</span>
              <span className="text-xs text-muted-foreground max-w-[220px]">
                Esta cuenta ya fue cubierta en su totalidad, no hay saldo para dividir.
              </span>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-border px-5 py-4 flex flex-col items-center gap-0.5 text-center">
                <span className={titulo}>Total a dividir</span>
                <span className="text-3xl font-black text-foreground tabular-nums">${saldoPendiente.toFixed(2)}</span>
              </section>

              <section className="flex flex-col gap-3">
                <h4 className={titulo}>Método de división</h4>
                <button type="button" onClick={() => selectSplitMethod('iguales')}
                  className="p-4 rounded-2xl border border-border flex items-center gap-3 text-left cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center shrink-0">
                    <Users size={20} weight="bold" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-extrabold text-sm text-foreground">Partes iguales</span>
                    <span className="text-xs text-muted-foreground">Divide el saldo entre N personas por igual.</span>
                  </div>
                  <CaretRight size={16} weight="bold" className="text-muted-foreground/60 shrink-0" />
                </button>
                <button type="button" onClick={() => selectSplitMethod('monto')}
                  className="p-4 rounded-2xl border border-border flex items-center gap-3 text-left cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center shrink-0">
                    <CurrencyCircleDollar size={20} weight="bold" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-extrabold text-sm text-foreground">Monto fijo</span>
                    <span className="text-xs text-muted-foreground">Registra un pago rápido por una cantidad específica.</span>
                  </div>
                  <CaretRight size={16} weight="bold" className="text-muted-foreground/60 shrink-0" />
                </button>
              </section>
            </>
          )
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h4 className={titulo}>Nombre de quien paga</h4>
              <Input type="text" placeholder="Ej: Juan Pérez" value={payerName} onChange={(e) => setPayerName(e.target.value)} className="h-12 text-base" />
            </section>

            {splitMethod === 'iguales' && (
              <>
                <section className="flex flex-col gap-3">
                  <h4 className={titulo}>¿Entre cuántas personas?</h4>
                  <div className="flex items-center h-14 rounded-full border border-border overflow-hidden">
                    <button type="button" aria-label="Menos" disabled={personas <= 2}
                      onClick={() => { setPersonas(Math.max(2, personas - 1)); setSelectedPersonaIdx(null); setPaidPersonaIndexes([]); }}
                      className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
                      <Minus size={20} weight="bold" />
                    </button>
                    <span className="flex-1 text-center text-2xl font-black tabular-nums">{personas}</span>
                    <button type="button" aria-label="Más" disabled={personas >= 20}
                      onClick={() => { setPersonas(Math.min(20, personas + 1)); setSelectedPersonaIdx(null); setPaidPersonaIndexes([]); }}
                      className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
                      <Plus size={20} weight="bold" />
                    </button>
                  </div>
                </section>

                <section className="flex flex-col gap-3">
                  <h4 className={titulo}>Elige quién paga ahora</h4>
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: personas }).map((_, idx) => {
                      const isPaid = paidPersonaIndexes.includes(idx);
                      const isSelected = selectedPersonaIdx === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isPaid}
                          onClick={() => setSelectedPersonaIdx(isSelected ? null : idx)}
                          className={cn('p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors',
                            isPaid ? 'bg-muted/60 border-border opacity-60 cursor-default'
                              : isSelected ? 'bg-primary border-primary text-primary-foreground cursor-pointer'
                                : 'bg-card border-border cursor-pointer hover:bg-muted/50')}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs',
                              isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : isPaid ? 'bg-success text-white' : 'bg-muted text-foreground')}>
                              {isPaid ? <Check size={16} weight="bold" /> : idx + 1}
                            </div>
                            <span className="font-extrabold text-sm">{isPaid ? `Persona ${idx + 1} · pagada` : `Persona ${idx + 1}`}</span>
                          </div>
                          <span className="font-black text-sm tabular-nums">${montoPorPersona.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {splitMethod === 'monto' && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className={titulo}>Monto a pagar</h4>
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">Pendiente: ${saldoPendiente.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border px-4 h-14">
                  <span className="text-lg font-black text-muted-foreground">$</span>
                  <Input
                    type="number" inputMode="decimal" step="0.01" min={0} max={saldoPendiente} placeholder="0.00" value={montoCustom}
                    onChange={(e) => setMontoCustom(parseFloat(e.target.value) || '')}
                    className={cn('h-10 flex-1 border-0 shadow-none focus-visible:ring-0 px-1 text-lg font-black', Number(montoCustom) > saldoPendiente && 'text-destructive')} />
                </div>
                {Number(montoCustom) > saldoPendiente && (
                  <span className="text-xs font-bold text-destructive">
                    El monto no puede superar el pendiente (${saldoPendiente.toFixed(2)}).
                  </span>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {splitMethod && (
        <footer className="p-4 border-t border-border bg-muted/40 grid grid-cols-2 gap-2 shrink-0">
          <Button
            type="button" variant="warningSoft" className="h-12 font-bold gap-1.5"
            disabled={splitMethod === 'monto' ? montoInvalido : selectedPersonaIdx === null}
            onClick={() => {
              if (splitMethod === 'monto') verPrecuenta(payerName.trim() || 'Pago Parcial', Number(montoCustom));
              else if (selectedPersonaIdx !== null) verPrecuenta(payerName.trim() || `Persona ${selectedPersonaIdx + 1}`, montoPorPersona);
            }}>
            <Printer size={18} weight="bold" /> Pre-cuenta
          </Button>
          <Button
            type="button" className="h-12 font-bold"
            disabled={splitMethod === 'monto' ? montoInvalido || sinNombre : selectedPersonaIdx === null || sinNombre}
            title={sinNombre ? 'Ingresa el nombre de quien paga para poder cobrar' : undefined}
            onClick={() => {
              if (splitMethod === 'monto') {
                setCobrarModalState({ monto: Number(montoCustom), label: 'Pago Parcial' });
              } else if (selectedPersonaIdx !== null) {
                const idx = selectedPersonaIdx;
                setCobrarModalState({
                  monto: montoPorPersona,
                  label: `Persona ${idx + 1}`,
                  onSuccessCallback: () => {
                    setPaidPersonaIndexes(prev => [...prev, idx]);
                    setSelectedPersonaIdx(null);
                  },
                });
              }
            }}>
            {splitMethod === 'monto' ? 'Cobrar monto' : 'Cobrar parte'}
          </Button>
        </footer>
      )}

      <Dialog open={!!cobrarModalState} onOpenChange={(open) => { if (!open) setCobrarModalState(null); }}>
        <DialogContent className="max-w-sm p-6 gap-4">
          <DialogHeader className="text-left">
            <DialogTitle className="font-extrabold text-base">Cobrar e imprimir</DialogTitle>
            <DialogDescription className="text-sm">Se registra el cobro de {payerName.trim() || 'esta parte'} y se imprime su ticket.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border py-4 text-center flex flex-col gap-0.5">
            <span className={titulo}>Monto</span>
            <span className="font-black text-3xl text-foreground tabular-nums">${(cobrarModalState?.monto ?? 0).toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11 font-bold" onClick={() => setCobrarModalState(null)}>Cancelar</Button>
            <Button
              type="button" className="h-11 font-bold" disabled={sinNombre}
              onClick={() => cobrarModalState && procesarPagoSimple(cobrarModalState.monto, cobrarModalState.label, cobrarModalState.onSuccessCallback, payerName)}>
              Cobrar e imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TicketPreviewModal
        opened={previewTicketText !== null}
        onClose={() => setPreviewTicketText(null)}
        title="Precuenta Dividida"
        content={previewTicketText || ''}
        onPrint={previewOnPrint ?? undefined}
      />
    </div>
  );
}
