import { imprimirConAviso } from '../../../lib/imprimir';
import { ComandaTotales } from'./ComandaTotales';
import { folioLabel } from '../../../lib/folio';
import { ComandaLiquidacion } from'./ComandaLiquidacion';
import { ComandaDividida, type ParteDividida } from'./ComandaDividida';
import { liquidacionComanda } from'../../../lib/anticipoMesa';
import { useEffect, useState, useMemo } from'react';
import { X, Printer, User, Bed, ForkKnife } from'@phosphor-icons/react';
import { type Mesa } from'../../../db/database';
import { ComandaItemRow } from'./ComandaItemRow';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { useNavigate } from 'react-router-dom';
import { CurrencyDollar } from'@phosphor-icons/react';
import { generarTicketPago, generarPrecuenta } from'../../../services/printTemplateEngine';
import { queueReceiptPrint, queueReprintTicket } from'../../../lib/printServerClient';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { initVerticalRxDb } from'../../../db/rxdb';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';
import { showToast } from'@/lib/toast';
import { useUI } from'../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';

interface SidebarReceiptViewerProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onClose: () => void;
 onAction: (mesa: Mesa, action: string) => void;
}

const EMPTY_ARRAY: any[] = [];

export function SidebarReceiptViewer({
 selectedMesa,
 activeComanda,
 comandaItems = EMPTY_ARRAY,
 onClose,
 onAction: _onAction,
}: SidebarReceiptViewerProps) {
 const navigate = useNavigate();
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
 const [pagos, setPagos] = useState<any[]>([]);
 const [pagosDeVentas, setPagosDeVentas] = useState<any[]>([]);
 const [ventasMesa, setVentasMesa] = useState<any[]>([]);
 const [habitacionCuenta, setHabitacionCuenta] = useState<any | null>(null);
 const [habitacionMesa, setHabitacionMesa] = useState<any | null>(null);
 const { openConfirm } = useUI();
 const { currentMesero, adminUser } = useAuth();
 const esAdmin = !!adminUser || currentMesero?.rol === 'admin';

 useEffect(() => {
 let alive = true;
 if (activeComanda?.habitacion_cuenta_id) {
 initVerticalRxDb().then(async rxDb => {
 const doc = await rxDb.habitacion_cuentas.findOne(activeComanda.habitacion_cuenta_id).exec();
 if (alive && doc) {
 const cuentaData = doc.toJSON();
 setHabitacionCuenta(cuentaData);
 if (cuentaData.mesa_id) {
 const mDoc = await rxDb.mesas.findOne(cuentaData.mesa_id).exec();
 if (alive && mDoc) {
 setHabitacionMesa(mDoc.toJSON());
 }
 }
 }
 });
 } else {
 setHabitacionCuenta(null);
 setHabitacionMesa(null);
 }
 return () => {
 alive = false;
 };
 }, [activeComanda?.habitacion_cuenta_id]);

 const handleDeleteVenta = async () => {
   openConfirm(
     'Borrar Comanda',
     '¿Estás seguro de que deseas borrar permanentemente esta comanda? Esta acción no se puede deshacer.',
     async () => {
       try {
         const rxDb = await initVerticalRxDb();
         const doc = await rxDb.comandas.findOne(activeComanda.id).exec();
         if (doc) {
           await doc.update({ $set: { _deleted: true, _modified: new Date().toISOString() } } as any);
           showToast.success('Comanda borrada permanentemente');
           onClose();
         }
       } catch (e) {
         console.error(e);
         showToast.error('Error al borrar la comanda');
       }
     }
   );
 };

 useEffect(() => {
 let alive = true;
 let sub: { unsubscribe: () => void } | null = null;
 let ventasSub: { unsubscribe: () => void } | null = null;

 (async () => {
 if (!activeComanda?.id) {
 if (alive) { setPagos([]); setPagosDeVentas([]); }
 return;
 }
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id }
 });
 sub = query.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setPagos(docs.map((doc: any) => doc.toJSON()));
 });

 // Pagos que viven como movimientos de RxVenta (Centro de Ventas /
 // abonos de reserva) — sin esto el recibo final de una comanda cerrada
 // por ese camino se ve sin pagos.
 const ventasQuery = rxDb.ventas.find({
 selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } }
 });
 ventasSub = ventasQuery.$.subscribe((docs: any[]) => {
 if (!alive) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const pagosDeMovimientos = docs.flatMap((doc: any) => {
 const v = doc.toJSON();
 return (v.movimientos ?? [])
 .filter((m: any) => !m.anulado && m.tipo ==='pago')
 .map((m: any) => ({
 id: m.id,
 comanda_id: activeComanda.id,
 monto: m.monto ?? 0,
 metodo_pago: m.metodo_pago ?? null,
 fecha: m.fecha,
 organization_id: orgId,
 }));
 });
 setPagosDeVentas(pagosDeMovimientos);
 });
 })().catch(() => {});

 return () => {
 alive = false;
 sub?.unsubscribe();
 ventasSub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 // Ventas de TODAS las comandas de la mesa: las marcas de anticipo de esta
 // cuenta viven en la venta de la reserva, no en una venta propia.
 useEffect(() => {
 let alive = true;
 let sub: { unsubscribe: () => void } | null = null;
 (async () => {
 if (!activeComanda?.mesa_id) { setVentasMesa([]); return; }
 const rxDb = await initVerticalRxDb();
 const comandas = await rxDb.comandas.find({ selector: { mesa_id: activeComanda.mesa_id, _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 const ids = comandas.map((c: any) => c.id);
 if (ids.length === 0) { setVentasMesa([]); return; }
 sub = rxDb.ventas.find({ selector: { comanda_id: { $in: ids }, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (alive) setVentasMesa(docs.map((d: any) => d.toJSON()));
 });
 })().catch(() => {});
 return () => { alive = false; sub?.unsubscribe(); };
 }, [activeComanda?.mesa_id, activeComanda?.id]);

 // Partes cobradas con "Dividir cuenta": ventas "Dividido - Nombre" de esta comanda.
 const partesDivididas = useMemo<ParteDividida[]>(() => ventasMesa
 .filter((v: any) => v.comanda_id === activeComanda?.id && typeof v.referencia === 'string' && v.referencia.includes('Dividido - '))
 .map((v: any) => ({
 id: v.id,
 nombre: v.referencia.split('Dividido - ').pop()?.trim() || 'Parte',
 monto: (v.movimientos ?? []).reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo === 'pago' || m.tipo === 'ajuste') return acc + (m.monto ?? 0);
 if (m.tipo === 'reembolso') return acc - (m.monto ?? 0);
 return acc;
 }, 0),
 }))
 .filter((p: ParteDividida) => p.monto > 0.004), [ventasMesa, activeComanda?.id]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );
 const subtotal = totales.subtotalNeto;
 const ivaCalculado = totales.ivaTotal;

 const liquidacion = useMemo(
 () => (activeComanda?.folio != null ? liquidacionComanda(ventasMesa, folioLabel(activeComanda)) : null),
 [ventasMesa, activeComanda]
 );
 // Con anticipo, los pagos de la venta son de la reserva (no de esta cuenta):
 // el recibo muestra lo que de verdad pagó esta comanda.
 const todosPagos = useMemo(() => {
 if (!liquidacion) return [...pagos, ...pagosDeVentas];
 const fecha = activeComanda?.updated_at || new Date().toISOString();
 const orgId = activeComanda?.organization_id || '';
 const res: any[] = [...pagos];
 if (liquidacion.anticipoAplicado > 0.005) res.push({ id: 'anticipo', comanda_id: activeComanda?.id, monto: liquidacion.anticipoAplicado, fecha, organization_id: orgId, tipo_division: 'Anticipo aplicado' });
 if (liquidacion.porCobrar > 0.005) res.push({ id: 'por-cobrar', comanda_id: activeComanda?.id, monto: liquidacion.porCobrar, fecha, organization_id: orgId });
 return res;
 }, [pagos, pagosDeVentas, liquidacion, activeComanda?.id, activeComanda?.updated_at, activeComanda?.organization_id]);
 const totalPagado = useMemo(() => todosPagos.reduce((acc, p) => acc + p.monto, 0), [todosPagos]);

// Venta donde se maneja el cobro: la que guarda las marcas de anticipo de
 // esta cuenta, o la propia de la comanda.
 const ventaIdCentro = liquidacion?.ventaId
 || ventasMesa.find((v: any) => v.comanda_id === activeComanda?.id)?.id
 || null;

 const isFacturado = activeComanda?.estado ==='facturado';
 const isAnulada = activeComanda?.estado ==='anulada';
 const esComandaEnHabitacionActiva = !!activeComanda?.habitacion_cuenta_id &&
 activeComanda.estado !=='cerrado'&&
 activeComanda.estado !=='facturado'&&
 activeComanda.estado !=='anulada';

 // Badge circular del header: solo el número de mesa/habitación, nunca el
 // nombre completo (que puede incluir el tipo entre paréntesis, ej.
 //"Hab. 1 (Cabaña Jacuzzi)"), o desborda el círculo.
 const badgeNum = selectedMesa?.nombre?.match(/Hab\.\s*(\d+)/)?.[1]
 || selectedMesa?.nombre?.match(/Mesa\s*(\d+)/)?.[1]
 || selectedMesa?.nombre?.replace(/\D/g,'')
 || selectedMesa?.nombre
 ||'—';

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 {/* Header — mismo lenguaje que SidebarDetails: badge circular con el
 número de la mesa/habitación, título + subtítulo, fondo temático en
 desktop según el estado de la comanda. */}
 <header className={cn("p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground",
 esComandaEnHabitacionActiva ?"md:bg-info md:text-white": isAnulada ?"md:bg-destructive md:text-white":"md:bg-primary md:text-primary-foreground")}>
 <div className="flex items-center gap-3">
 <div className={cn("w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0",
 esComandaEnHabitacionActiva ?"bg-info text-white md:bg-white/15": isAnulada ?"bg-destructive text-white md:bg-white/15":"bg-primary text-primary-foreground md:bg-primary-foreground/15")}>
 {badgeNum}
 </div>
 <div className="flex flex-col min-w-0">
 <h3 className={cn("font-extrabold text-base leading-tight truncate",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white":"md:text-primary-foreground")}>
 Comanda #{folioLabel(activeComanda)}
 </h3>
 <div className="flex items-center gap-1.5">
 {activeComanda?.created_at && (
 <span className={cn("text-[10px] font-bold text-muted-foreground",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white/70":"md:text-primary-foreground/70")}>
 {new Date(activeComanda.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric'})}
 {' · '}
 {new Date(activeComanda.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit'})}
 </span>
 )}
 {isFacturado && (
 <span className="text-xs font-bold text-primary">
 Factura: {activeComanda.factura_nro ||'Sin número'}
 </span>
 )}
 </div>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <span className={cn("px-3 py-1 rounded-full font-black text-xs uppercase shrink-0",
 esComandaEnHabitacionActiva
 ?"bg-white/20 text-white": isFacturado
 ?"bg-muted text-muted-foreground": isAnulada
 ?"bg-white/20 text-white":"bg-muted text-muted-foreground")}>
 {esComandaEnHabitacionActiva ?'En Habitación': isFacturado ?'Conciliada': isAnulada ?'Anulada':'Cobrada'}
 </span>
 <Button
 variant="ghost"size="icon-lg"onClick={onClose}
 className={cn("rounded-xl text-muted-foreground",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white":"md:text-primary-foreground")}
 >
 <X size={18} weight="bold"/>
 </Button>
 </div>
 </header>

 {/* Datos del cliente / ubicación, mismo bloque que el resto de sidebars */}
 <div className="px-4 py-2.5 border-b border-border shrink-0 flex flex-col gap-1.5">
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold text-xs truncate">{activeComanda?.cliente || habitacionCuenta?.huesped ||'Consumidor Final'}</span>
 </div>
 <div className="flex items-center gap-2 text-foreground">
 {activeComanda?.habitacion_cuenta_id ? <Bed size={14} className="text-primary shrink-0"/> : <ForkKnife size={14} className="text-primary shrink-0"/>}
 <span className="font-semibold text-xs">
 {(() => {
 if (activeComanda?.habitacion_cuenta_id) {
 const roomName = habitacionMesa?.nombre || activeComanda?.mesa_nombre ||'Habitación';
 const prefix = roomName.toLowerCase().startsWith('hab') || roomName.toLowerCase().startsWith('cuart') || roomName.toLowerCase().startsWith('room') ?'':'Habitación';
 return`${prefix}${roomName}`;
 }
 const name = selectedMesa?.nombre || activeComanda?.mesa_nombre ||'Desconocida';
 const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ?'':'Mesa';
 return`${prefix}${name}`;
 })()}
 </span>
 </div>
 </div>

 {isAnulada && activeComanda?.motivo_anulacion && (
      <div className="px-4 py-2.5 bg-destructive/10 dark:bg-destructive/30 border-b border-destructive/15 dark:border-destructive shrink-0">
        <span className="text-[10px] font-bold uppercase text-destructive dark:text-destructive tracking-wider block mb-0.5">
          Motivo de Anulación
        </span>
        <p className="text-xs text-destructive dark:text-white font-medium leading-relaxed">
          {activeComanda.motivo_anulacion}
        </p>
      </div>
    )}

 <main className="flex-1 overflow-y-auto">
 {comandaItems.map((item, index) => (
 <ComandaItemRow key={item.id} item={item} index={index} />
 ))}
 </main>

 {/* Totales y Acciones — mismo resumen que SidebarDetails (ComandaTotales) */}
 <footer className="p-4 border-t border-border bg-muted/40 flex flex-col gap-3 shrink-0">
 <ComandaTotales
 subtotal={subtotal}
 iva={ivaCalculado}
 ivaPorcentaje={ivaPorcentaje}
 total={liquidacion ? liquidacion.consumo : totalPagado}
 etiquetaTotal={liquidacion ? 'Total cuenta' : 'Total Pagado'}
 tono="success"
 />
 {liquidacion && <ComandaLiquidacion liquidacion={liquidacion} />}
 <ComandaDividida partes={partesDivididas} />

 <div className={cn("grid gap-2", esComandaEnHabitacionActiva ?"grid-cols-1":"grid-cols-2")}>
 <Button
 variant={esComandaEnHabitacionActiva ?"warningSoft":"primarySoft"}className="w-full h-10 font-bold"
 onClick={() => {
 const content = esComandaEnHabitacionActiva
 ? generarPrecuenta(activeComanda, comandaItems, selectedMesa.nombre, ivaPorcentaje, todosPagos, habitacionMesa?.nombre)
 : generarTicketPago(
 activeComanda,
 comandaItems,
 todosPagos,
 selectedMesa.nombre,
 ivaPorcentaje,
 undefined,
 habitacionMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(esComandaEnHabitacionActiva ?`Imprimir Precuenta - ${selectedMesa.nombre}`:`Reimprimir Recibo - ${selectedMesa.nombre}`);
 setPreviewOnPrint(() => () => {
 if (esComandaEnHabitacionActiva) {
 imprimirConAviso(() => queueReceiptPrint({
 comanda: activeComanda,
 items: comandaItems,
 mesaNombre: selectedMesa.nombre,
 ivaPorcentaje,
 habitacionNombre: habitacionMesa?.nombre,
 }), 'Pre-cuenta');
 } else {
 imprimirConAviso(() => queueReprintTicket({
 rawText: content,
 mesaNombre: selectedMesa.nombre,
 comanda: activeComanda,
 }), 'Ticket');
 }
 });
 setPreviewOpened(true);
 }}
 >
 <Printer size={18} weight="bold"className="mr-1.5"/> {esComandaEnHabitacionActiva ?'Imprimir Precuenta':'Reimprimir'}
 </Button>

 {!esComandaEnHabitacionActiva && (
 <Button
 variant="secondary"className="w-full h-10 font-bold"
 disabled={!ventaIdCentro}
 title={ventaIdCentro ? undefined : 'Esta comanda no tiene una venta en Centro de Ventas'}
 onClick={() => {
 if (!ventaIdCentro) return;
 try { sessionStorage.setItem('pos_venta_a_abrir', ventaIdCentro); } catch { /* sin storage: abre sin selección */ }
 navigate('/v2/centro-ventas');
 }}
 >
 <CurrencyDollar size={18} weight="bold" className="mr-1.5" /> Ver en C. de Ventas
 </Button>
 )}
 {isAnulada && esAdmin && (
    <Button
      variant="destructive"
      className="w-full h-10 font-bold"
      onClick={handleDeleteVenta}
    >
      Borrar permanentemente
    </Button>
  )}
 </div>
 </footer>

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 onPrint={previewOnPrint ?? undefined}
 />
 </div>
 );
}
