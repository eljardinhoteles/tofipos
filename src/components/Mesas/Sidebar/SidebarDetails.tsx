import { imprimirConAviso } from '../../../lib/imprimir';
import { useState, useEffect, useMemo, useRef, useCallback } from'react';
import { folioLabel } from '../../../lib/folio';
import { X, Plus, Printer, Check, CaretDown } from'@phosphor-icons/react';
import { type Mesa } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useComandaIva } from'../../../hooks/useComandaIva';
import { SidebarComandaIvaModal } from'./SidebarComandaIvaModal';
import { useRxClientes } from'../../../hooks/useRxClientes';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { SidebarPagosModal } from'./SidebarPagosModal';
import { SidebarCobrarCuenta } from'./SidebarCobrarCuenta';
import { generarComandaCocina } from'../../../services/printTemplateEngine';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { ProductModifiersModal } from'../../Products/ProductModifiersModal';
import { createRxVenta, agregarVentaMovimiento, updateRxComanda, updateRxComandaItem, updateRxMesa, liberarMesaSiSinOperativas, anularComandaItem, aplicarCortesiaItem, moverItemASubcomanda } from'../../../db/rxdb';
import { isOperativeComanda } from'../../../db/comandaState';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { useUI } from'../../../context/UIContext';
import { useAuth } from'../../../context/AuthContext';
import { initVerticalRxDb } from'../../../db/rxdb';
import { deltaGrupo, mergeItemsCocina } from'../../../lib/kitchenDelta';
import { ItemActionsPanel } from'./ItemActionsPanel';
import { ComandaItemsList, TodasList } from'./ComandaItemsList';
import { ComandaTotales } from'./ComandaTotales';
import { calcularAnticipoMesa, esVentaDividida, repartirAnticipo, textoAplicado, tieneAnticipoAplicado, ajusteNecesario, textoCuentaCerrada } from'../../../lib/anticipoMesa';
import { useComandaLive } from'../../../hooks/useComandaLive';
import { ComandaHeader } from'./ComandaHeader';
import { ClienteInfoCollapsible } from'./ClienteInfoCollapsible';
import { ComandaAcciones } from'./ComandaAcciones';
import { DividirMesaDialog, CambiarMesaDialog, CuentaConPendientesDialog, AnticipoDetalleDialog } from'./SidebarDetailsDialogs';
import { queueKitchenPrint, queueReceiptPrint, queueReprintTicket } from'../../../lib/printServerClient';
import { esParteRepartida } from'../../../lib/reparto';
import { cantidadEnviada } from'../../../lib/itemPendiente';
import { repartirItemEntreSubcomandas, deshacerRepartoItem } from'../../../db/rxdb';
import { generarPrecuenta, generarTicketPago } from'../../../services/printTemplateEngine';
import { useIsMobile } from'../../../hooks/useIsMobile';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';
import { SidebarCambiarCliente } from'./SidebarCambiarCliente';
import { SidebarHabitacionDestino } from'./SidebarHabitacionDestino';
import { clienteCoincide, detalleCliente } from'../../../lib/documentoCliente';



interface SidebarDetailsProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onClose: () => void;
 // Se llama al terminar de cobrar/cargar a habitación la comanda; por defecto
 // cierra el sidebar. En Mesa Múltiple se queda abierto si quedan otras
 // subcomandas con productos.
 onResuelta?: () => void;
 onAddProduct: () => void;
 onAction: (mesa: Mesa, action: string) => void;
 // Mesa Múltiple: todas las subcomandas operativas de la mesa y sus ítems,
 // para enviar a cocina un solo ticket de toda la mesa.
 grupo?: { comandas: any[]; items: any[] };
 // Mesa Múltiple: muestra todos los ítems de la mesa agrupados por subcomanda.
 vistaTodas?: boolean;
 onSelectSubcomanda?: (id: string) => void;
 // Mesa normal: convierte la mesa en Mesa Múltiple (undefined = no disponible).
 onActivarMultiple?: () => Promise<void> | void;
}

const EMPTY_ARRAY: any[] = [];

export function SidebarDetails({
 selectedMesa,
 activeComanda: activeComandaProp,
 comandaItems = EMPTY_ARRAY,
 onClose,
 onResuelta: onResueltaProp,
 onAddProduct,
 onAction,
 grupo,
 vistaTodas = false,
 onSelectSubcomanda,
 onActivarMultiple,
}: SidebarDetailsProps) {
 const isMobile = useIsMobile();
 const onResuelta = onResueltaProp ?? onClose;
 // Chevron sobre "Añadir Productos" en móvil: avisa que la lista de
 // productos sigue scrolleable hacia abajo, ya que ahí no queda tan obvio
 // como en desktop (más alto de pantalla visible de una vez).
 const productListRef = useRef<HTMLDivElement>(null);
 const [hasMoreBelow, setHasMoreBelow] = useState(false);
 useEffect(() => {
 const el = productListRef.current;
 if (!el) return;
 const checkScroll = () => {
 setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
 };
 checkScroll();
 el.addEventListener('scroll', checkScroll);
 const resizeObserver = new ResizeObserver(checkScroll);
 resizeObserver.observe(el);
 return () => {
 el.removeEventListener('scroll', checkScroll);
 resizeObserver.disconnect();
 };
 }, [comandaItems]);
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 // Ticket de cocina recién confirmado: si se cierra la vista previa sin imprimir, se avisa.
 const [previewAviso, setPreviewAviso] = useState<string | undefined>(undefined);
 const [previewContent, setPreviewContent] = useState('');
 // Acción real de impresión, disparada por el modal recién tras la cuenta
 // regresiva (no al abrir el preview) — evita imprimir antes de que el
 // usuario alcance a revisar/cancelar.
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
 const [editingItem, setEditingItem] = useState<any | null>(null);
 const [activandoMultiple, setActivandoMultiple] = useState(false);
 const [confirmDividir, setConfirmDividir] = useState(false);
 const [confirmCuentaPendientes, setConfirmCuentaPendientes] = useState(false);
 // Mesa Múltiple: otras subcomandas a las que se puede mover el ítem.
 const destinosMover = useMemo(
 () => (grupo?.comandas ?? []).filter((c: any) => c.id !== activeComandaProp?.id && !!c.subcomanda_nombre),
 [grupo, activeComandaProp?.id]
 );
 const handleMoverItem = async (destId: string, cantidad: number) => {
 if (!editingItem) return;
 try {
 await moverItemASubcomanda(editingItem.id, destId, cantidad);
 setEditingItem(null);
 showToast.success('Producto movido');
 } catch (e) {
 showToast.error('No se pudo mover', e instanceof Error ? e.message : undefined);
 }
 };
 const handleRepartirItem = async (destIds: string[], cantidad: number) => {
 if (!editingItem) return;
 try {
 await repartirItemEntreSubcomandas(editingItem.id, destIds, cantidad);
 setEditingItem(null);
 showToast.success('Valor repartido', `Entre ${destIds.length} cuenta${destIds.length === 1 ? '' : 's'}.`);
 } catch (e) {
 showToast.error('No se pudo repartir', e instanceof Error ? e.message : undefined);
 }
 };
 const handleDeshacerReparto = async () => {
 if (!editingItem) return;
 try {
 await deshacerRepartoItem(editingItem.id);
 setEditingItem(null);
 showToast.success('Reparto deshecho');
 } catch (e) {
 showToast.error('No se pudo deshacer', e instanceof Error ? e.message : undefined);
 }
 };
 const { currentMesero } = useAuth();
 const [showPagosModal, setShowPagosModal] = useState(false);

 // Org activa: se lee una sola vez (localStorage es síncrono y se repetía en cada cobro).
 const orgIdLocal = useMemo(() => localStorage.getItem('pos_active_org_id') || '', []);
 const [closeCuentaModalOpen, setCloseCuentaModalOpen] = useState(false);
 // Evita dobles clics mientras cierran cuenta / cargan a habitación: el
 // proceso tarda unos segundos (escrituras + liberar mesa) antes de cerrar el
 // modal. El ref bloquea el segundo clic antes de que React re-renderice.
 const [procesandoCierre, setProcesandoCierre] = useState(false);
 const [procesandoHab, setProcesandoHab] = useState(false);
 const enCursoRef = useRef(false);
 const [closePayerName, setClosePayerName] = useState('');

 const [showRoomChargeModal, setShowRoomChargeModal] = useState(false);
 // Vincular la cuenta a una habitación sin cerrarla (p. ej. cada subcuenta de una mesa compartida).
 const [showVincularHab, setShowVincularHab] = useState(false);
 const [clienteInfoOpen, setClienteInfoOpen] = useState(false);
 const [changeClienteModal, setChangeClienteModal] = useState(false);
 const [changeClienteName, setChangeClienteName] = useState('');
 // Cliente elegido de la lista de sugerencias (null = nombre escrito a mano).
 const [changeClienteId, setChangeClienteId] = useState<string | null>(null);
 const [changeMesaModal, setChangeMesaModal] = useState(false);
 const { clientes } = useRxClientes();


 const { mesaView, setMesaView } = useUI();

 const { liveComanda, pagos, ventasComanda, linkedMesa, activeRoomAccounts, allMesas, ventasMesa, comandasOperativasMesa, comandasOperativasAnticipo, anticipoContexto } = useComandaLive(activeComandaProp);

 useEffect(() => {
 if (closeCuentaModalOpen && activeComandaProp) {
 setClosePayerName(activeComandaProp.cliente ||'Consumidor Final');
 }
 }, [closeCuentaModalOpen, activeComandaProp]);

 const activeComanda = liveComanda || activeComandaProp;

 // El cliente de la comanda se guarda solo como texto (nombre); si coincide
 // con un cliente registrado, mostramos su ficha completa en la subsección.
 const clienteVinculado = useMemo(() => {
 const nombre = activeComanda?.cliente?.trim();
 if (!nombre) return null;
 return clientes.find(c => c.nombre?.trim().toLowerCase() === nombre.toLowerCase()) || null;
 }, [activeComanda?.cliente, clientes]);

 // Un ítem queda bloqueado (no editable/borrable) cuando ya formaba parte
 // del último lote confirmado a cocina — evita que ediciones locales
 // desincronicen lo que la cocina ya está preparando. Items agregados
 // después de esa confirmación (aún no enviados) siguen libres. Un ítem ya
 // anulado no cuenta como "bloqueado": es un estado terminal propio.
 const esItemBloqueado = (item: any) =>
 // Una parte repartida nunca se edita ni se borra suelta: solo se deshace el reparto.
 (esParteRepartida(item) && !item?.anulado) ||
 !!activeComanda?.confirmada &&
 !!activeComanda?.confirmada_at &&
 !!item?.created_at &&
 item.created_at <= activeComanda.confirmada_at &&
 !item?.anulado;

 // Unidades de un ítem que cocina ya recibió.
 const enviadaDe = (item: any) =>
 esParteRepartida(item) ? item.cantidad
 : activeComanda?.confirmada ? cantidadEnviada(item, activeComanda?.confirmada_at, cantidadesSnapshot) : 0;

 const handleUpdateItem = async (cantidad: number, precio?: number) => {
 if (!editingItem) return;
 // Con unidades ya enviadas solo se pueden quitar las que se sumaron después.
 const enviadaEdit = enviadaDe(editingItem);
 const soloNuevas = esItemBloqueado(editingItem) && enviadaEdit < editingItem.cantidad && cantidad >= enviadaEdit && cantidad < editingItem.cantidad;
 if (esItemBloqueado(editingItem) && !soloNuevas) {
 showToast.error('Error','Este ítem ya fue confirmado y no puede modificarse. Use "Anular ítem" si ya no está disponible.');
 setEditingItem(null);
 return;
 }
 if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
 showToast.error('Error','No se puede modificar un producto con unidades pagadas.');
 setEditingItem(null);
 return;
 }
 await updateRxComandaItem(editingItem.id, precio !== undefined && editingMenuItem?.precio_variable ? { cantidad, precio } : { cantidad });

 // Nota: ya no se resetea `confirmada` aquí. Este punto solo se alcanza
 // para ítems SIN bloquear (nuevos, no enviados aún a cocina) — editarlos
 // no debe tumbar la confirmación de lo que ya está en cocina.
 setEditingItem(null);
 };

 const handleDeleteItem = async () => {
 if (!editingItem) return;
 if (esItemBloqueado(editingItem)) {
 showToast.error('Error','Este ítem ya fue confirmado y no puede eliminarse. Use "Anular ítem" si ya no está disponible.');
 setEditingItem(null);
 return;
 }
 if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
 showToast.error('Error','No se puede eliminar un producto con unidades pagadas.');
 setEditingItem(null);
 return;
 }
 await updateRxComandaItem(editingItem.id, { _deleted: true });

 // Nota: ya no se resetea `confirmada` aquí — ver comentario en handleUpdateItem.
 setEditingItem(null);
 };

 // Anula todo el ítem o solo `cantidad` de sus unidades.
 const handleAnularItem = async (motivo: string, cantidad: number) => {
 if (!editingItem) return;
 await anularComandaItem(editingItem.id, motivo, currentMesero?.id, cantidad);
 setEditingItem(null);
 };

 // Cortesía por cantidad y porcentaje (ver aplicarCortesiaItem).
 const handleMarcarCortesia = async (motivo: string, porcentaje: number, cantidad: number) => {
 if (!editingItem) return;
 try {
 await aplicarCortesiaItem(editingItem.id, motivo, porcentaje, cantidad);
 } catch (e) {
 showToast.error('No se pudo aplicar la cortesía', e instanceof Error ? e.message : undefined);
 return;
 }
 setEditingItem(null);
 };

 const handleConfirmDividir = async () => {
 setActivandoMultiple(true);
 try { await onActivarMultiple?.(); setConfirmDividir(false); } catch { showToast.error('No se pudo activar mesa múltiple'); } finally { setActivandoMultiple(false); }
 };

 const { porcentaje: ivaPorcentaje, preciosConIva, esOverride: ivaEsOverride } = useComandaIva(activeComanda);
 const [ivaModalOpen, setIvaModalOpen] = useState(false);
 const { menuItems, categorias } = useRxMenuCatalog();

 const [editingModifiers, setEditingModifiers] = useState(false);
 const editingMenuItem = useMemo(
 () => editingItem ? menuItems.find(m => m.id === editingItem.item_id) : null,
 [editingItem, menuItems]
 );

 const handleUpdateModifiers = async (selected: string[]) => {
 if (!editingItem) return;
 if (esItemBloqueado(editingItem)) {
 showToast.error('Error','Este ítem ya fue confirmado y no puede modificarse. Use "Anular ítem" si ya no está disponible.');
 setEditingModifiers(false);
 setEditingItem(null);
 return;
 }
 await updateRxComandaItem(editingItem.id, { modificadores: selected });
 // Nota: ya no se resetea `confirmada` aquí — ver comentario en handleUpdateItem.
 setEditingModifiers(false);
 setEditingItem(null);
 };

 const withBebida = (items: any[]) =>
 items.map(item => {
 const menuItem = menuItems.find(m => m.id === item.item_id);
 const categoria = menuItem ? categorias.find(c => c.id === menuItem.categoria_id) : undefined;
 return {
 ...item,
 es_bebida: menuItem?.es_bebida || false,
 // Entradas (o cualquier categoría marcada) siempre primero en el
 // ticket de cocina, sin importar el orden en que se pidieron.
 imprimir_primero: categoria?.imprimir_primero || false,
 };
 });

 // Clientes únicos para autocompletar en el flujo de cambio de cliente
 // Clientes registrados que coinciden con lo escrito (por nombre o documento), con
 // su documento visible para elegir al correcto entre homónimos.
 const filteredChangeClientes = useMemo(() => {
 const term = changeClienteName.trim();
 if (!term) return [];
 return clientes
 .filter(c => clienteCoincide(c, term) && c.id !== changeClienteId)
 .slice(0, 6)
 .map(c => ({ id: c.id, nombre: c.nombre, detalle: detalleCliente(c) }));
 }, [clientes, changeClienteName, changeClienteId]);

 const handleOpenChangeCliente = () => {
 setChangeClienteName(activeComanda?.cliente ||'');
 setChangeClienteId(activeComanda?.cliente_id || null);
 setChangeClienteModal(true);
 };

 const handleConfirmChangeCliente = async () => {
 if (!activeComanda) return;
 const nuevoCliente = changeClienteName.trim();
 // El anticipo sigue al cliente por su cliente_id: al cambiar de cliente hay que cambiar
 // también el id (o quitarlo si es un nombre libre / Consumidor Final), para que no
 // conserve el del cliente anterior ni su saldo a favor.
 // Solo se vincula si se eligió de la lista: un nombre escrito a mano es texto libre y
 // nunca se enlaza solo a un cliente registrado (ni siquiera si el nombre coincide).
 const clienteElegido = changeClienteId ? clientes.find(c => c.id === changeClienteId) : undefined;
 await updateRxComanda(activeComanda.id, {
 cliente: nuevoCliente || undefined,
 cliente_id: (clienteElegido?.id ?? null) as any,
 // Mesa Múltiple: la card de la subcomanda muestra este nombre.
 ...(activeComanda.subcomanda_nombre && nuevoCliente ? { subcomanda_nombre: nuevoCliente } : {}),
 });
 setChangeClienteModal(false);
 };

 // Mesas realmente libres: el campo mesa.estado persistido puede quedar
 // desincronizado (p.ej. tras cobrar por otro flujo), así que igual que en
 // MesasV2/getMesaEstadoEfectivo, una mesa se considera libre solo si
 // además no tiene ninguna comanda operativa activa apuntándole.
 const [mesasIdsOcupadas, setMesasIdsOcupadas] = useState<Set<string>>(new Set());

 useEffect(() => {
 if (!changeMesaModal) return;
 let alive = true;
 (async () => {
 const rxDb = await initVerticalRxDb();
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const activas = await rxDb.comandas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 const ids = new Set<string>();
 for (const doc of activas) {
 const c = doc.toJSON();
 if (isOperativeComanda(c)) ids.add(c.mesa_id);
 }
 setMesasIdsOcupadas(ids);
 })().catch(() => {});
 return () => { alive = false; };
 }, [changeMesaModal]);

 // Mesas disponibles para reasignar la comanda activa: libres y distintas
 // de la mesa actual. Se excluyen habitaciones (flujo propio de cuentas de
 // habitación) y las mesas sintéticas de Reserva/Delivery (piso 'Reservas',
 // ver isSyntheticMesaId en rxdb.ts), que no son mesas físicas reales.
 const mesasDisponiblesParaCambio = useMemo(
 () => allMesas
 .filter((m) => m.id !== selectedMesa.id && m.estado !=='cuenta' && !mesasIdsOcupadas.has(m.id)
 && m.piso?.toLowerCase() !== 'habitaciones' && m.piso?.toLowerCase() !== 'reservas')
 .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true })),
 [allMesas, selectedMesa.id, mesasIdsOcupadas]
 );

 const [mesaSeleccionadaParaCambio, setMesaSeleccionadaParaCambio] = useState<any | null>(null);

 useEffect(() => {
 if (changeMesaModal) setMesaSeleccionadaParaCambio(null);
 }, [changeMesaModal]);

 const handleConfirmChangeMesa = async () => {
 const destino = mesaSeleccionadaParaCambio;
 if (!activeComanda || !destino) return;
 await updateRxComanda(activeComanda.id, { mesa_id: destino.id, mesa_nombre: destino.nombre });
 await updateRxMesa(destino.id, { estado: 'ocupada' });
 const otrasComandasEnOrigen = await (await initVerticalRxDb()).comandas
 .find({ selector: { mesa_id: selectedMesa.id, id: { $ne: activeComanda.id }, _deleted: { $ne: true } } })
 .exec();
 const origenSigueOcupada = otrasComandasEnOrigen.some((d: any) => isOperativeComanda(d.toJSON()));
 if (!origenSigueOcupada) {
 await updateRxMesa(selectedMesa.id, { estado: 'libre' });
 }
 setChangeMesaModal(false);
 showToast.success('Mesa cambiada', `La comanda se movió a ${destino.nombre}.`);
 };

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );
 const subtotal = totales.subtotalNeto;
 const ivaCalculado = totales.ivaTotal;
 const total = totales.total;
 // Vista "Todas": subtotal por subcomanda y total general (cada comanda puede
 // tener su propio override de IVA).
 const gruposTodas = useMemo(() => {
 if (!grupo) return [];
 return grupo.comandas.map(c => {
 const items = grupo.items.filter(i => i.comanda_id === c.id);
 const t = calcularTotalesComanda(
 items.filter(i => !i.anulado), menuItems,
 c.iva_porcentaje ?? ivaPorcentaje, c.iva_precios_con_iva ?? preciosConIva
 );
 return { comanda: c, items, total: t.total };
 });
 }, [grupo, menuItems, ivaPorcentaje, preciosConIva]);
 const totalTodas = gruposTodas.reduce((acc, g) => acc + g.total, 0);
 const totalItems = useMemo(
 () => comandaItems.reduce((acc, item) => acc + (item.cantidad || 0), 0),
 [comandaItems]
 );
 // Cobrado de ESTA comanda: lo registrado por división de cuenta (SidebarSplit).
 // El dinero de una venta normal (abono de reserva, cobro hecho en la mesa) ya
 // no se descuenta de la comanda: es anticipo de la mesa (ver anticipoMesa).
 const totalPagadoVentas = useMemo(() => {
 return ventasComanda.reduce((accVenta: number, v: any) => {
 if (!esVentaDividida(v)) return accVenta;
 const movs = v.movimientos ?? [];
 // Las ventas "Dividido - ..." registran el cobro recibido en el momento
 // como movimiento 'ajuste' (el método real se ancla después en Centro de
 // Ventas); los 'pago' y reembolsos posteriores también cuentan.
 const sumaVenta = movs.reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo ==='pago') return acc + (m.monto ?? 0);
 if (m.tipo ==='reembolso') return acc - (m.monto ?? 0);
 if (m.tipo ==='ajuste') return acc + (m.monto ?? 0);
 return acc;
 }, 0);
 return accVenta + sumaVenta;
 }, 0);
 }, [ventasComanda]);
 const totalPagado = useMemo(
 () => pagos.reduce((acc, p) => acc + p.monto, 0) + totalPagadoVentas,
 [pagos, totalPagadoVentas]
 );
 const saldoPendiente = Math.max(0, total - totalPagado);
 // Anticipo de la mesa (a favor de la mesa, compartido por todas sus cuentas):
 // se ofrece al pedir cuenta y se decide al cobrar si se usa o se cobra aparte.
 const anticipo = useMemo(
 () => calcularAnticipoMesa(ventasMesa, new Set(comandasOperativasAnticipo), anticipoContexto),
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [ventasMesa, comandasOperativasAnticipo, anticipoContexto.clienteId, anticipoContexto.clienteNombre, anticipoContexto.grupoComandaIds.size]
 );
 // Cuánto del anticipo se aplica al cobrar: por defecto todo lo que cubra la
 // cuenta; el cajero puede bajarlo o ponerlo en 0 (cobro nuevo). Sin vuelto:
 // nunca más que lo que falta por cobrar.
 const [anticipoDetalleOpen, setAnticipoDetalleOpen] = useState(false);
 const [anticipoUsarInput, setAnticipoUsarInput] = useState<number | null>(null);
 const anticipoMaxUsar = Math.min(anticipo.disponible, saldoPendiente);
 const anticipoUsar = anticipoUsarInput === null ? anticipoMaxUsar : Math.min(anticipoMaxUsar, Math.max(0, anticipoUsarInput));
 // Venta vigente (no anulada) sobre esta comanda, si existe — se reutiliza
 // al cerrar la cuenta en vez de crear una paralela que duplicaría el
 // cobro e ignoraría abonos ya registrados (p.ej. desde una reserva).
 // Las ventas "Dividido - ..." (SidebarSplit) quedan excluidas a propósito:
 // cada cobro por división es un registro de venta independiente en Centro
 // de Ventas (p.ej. "pagó Juan $30"), así que el saldo restante al cerrar
 // debe crear SU PROPIA venta nueva, no mezclarse como ajuste dentro de la
 // del split — de lo contrario una cuenta de $100 con $30 divididos y $70
 // cerrados terminaba viéndose como una sola venta de $100.
 const ventaVigente = useMemo(() => {
 return ventasComanda
 .filter((v: any) => !(v.movimientos ?? []).some((m: any) => m.tipo ==='anular'))
 .filter((v: any) => !(typeof v.referencia ==='string' && v.referencia.includes('Dividido - ')))
 .sort((a: any, b: any) => (b.created_at ||'').localeCompare(a.created_at ||''))[0] || null;
 }, [ventasComanda]);
 // Movimientos 'pago' de todas las ventas de la comanda, normalizados al
 // shape que espera SidebarPagosModal — así el historial de "Ver Pagos"
 // incluye abonos hechos desde una reserva antes de asignar mesa. También
 // se incluyen los 'ajuste' de ventas "Dividido - ..." (SidebarSplit): ese
 // monto ya se cobró en el momento del split, aunque quede registrado como
 // 'ajuste' porque el método de pago real se ancla después en Centro de
 // Ventas — ver mismo criterio en `totalPagadoVentas`.
 const pagosDeVentas = useMemo(() => {
 return ventasComanda.flatMap((v: any) => {
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
 }, [ventasComanda]);

 const cantidadesSnapshot = useMemo(() => {
 try {
 return activeComanda?.cantidades_snapshot
 ? JSON.parse(activeComanda.cantidades_snapshot)
 : {};
 } catch { return {}; }
 }, [activeComanda?.cantidades_snapshot]);

 // Lo que cocina debe ver: sin las partes repartidas (son valor, no platos).
 const itemsCocina = useMemo(() => comandaItems.filter((i: any) => !esParteRepartida(i)), [comandaItems]);

 // Una subcomanda que solo tiene partes de un reparto de valor no tiene nada que
 // enviar a cocina: cuenta como confirmada para poder pedir la cuenta.
 const soloPartesRepartidas = comandaItems.length > 0 && itemsCocina.length === 0;
 const confirmadaEfectiva = !!activeComanda?.confirmada || soloPartesRepartidas;

 const itemsRealmenteNuevos = useMemo(() => activeComanda?.confirmada_at
 ? itemsCocina.filter(item =>
 item.created_at && item.created_at > activeComanda.confirmada_at
 )
 : [], [activeComanda?.confirmada_at, itemsCocina]);

 const itemsConCantidadExtra = useMemo(() => {
 if (!activeComanda?.confirmada_at) return [];
 const res: any[] = [];
 for (const item of itemsCocina) {
 const cantConfirmada = cantidadesSnapshot[item.id];
 if (cantConfirmada !== undefined && item.cantidad > cantConfirmada) {
 res.push({ ...item, cantidad: item.cantidad - cantConfirmada });
 }
 }
 return res;
 }, [activeComanda?.confirmada_at, itemsCocina, cantidadesSnapshot]);

 const itemsNuevos = useMemo(() => [...itemsRealmenteNuevos, ...itemsConCantidadExtra], [itemsRealmenteNuevos, itemsConCantidadExtra]);
 const hayItemsNuevos = itemsNuevos.length > 0;

 // Si ya se marcó algún ítem como cortesía, no se puede reabrir la cuenta
 // para volver a agregar productos — evita que se agregue algo después de
 // haber regalado un ítem y usar ese descuento para colar otro cobro.
 const hayCortesia = useMemo(
 () => comandaItems.some((item: any) => (item.cortesia_cantidad || 0) > 0),
 [comandaItems]
 );

 // Ítems anulados después del último "Confirmar"/"Adicional" — se adjuntan
 // como sección final del próximo ticket de Adicional que se imprima (no
 // disparan una impresión aparte solo por anularse).
 const itemsAnuladosDesdeUltimaConfirmacion = useMemo(() => activeComanda?.confirmada_at
 ? itemsCocina.filter(item =>
 item.anulado && item.anulado_at && item.anulado_at > activeComanda.confirmada_at
 )
 : [], [activeComanda?.confirmada_at, itemsCocina]);

 const kitchenGrupo = useMemo(
 () => (grupo ? deltaGrupo(grupo.comandas, grupo.items) : null),
 [grupo]
 );
 const nuevosCocina = kitchenGrupo ? kitchenGrupo.nuevos : itemsNuevos;
 const hayNuevosCocina = kitchenGrupo ? kitchenGrupo.nuevos.length > 0 : hayItemsNuevos;
 const hayConfirmadaCocina = kitchenGrupo ? kitchenGrupo.algunaConfirmada : confirmadaEfectiva;
 const sinItemsCocina = kitchenGrupo ? kitchenGrupo.vivos.length === 0 : itemsCocina.length === 0;
 // Sin ningún ítem en toda la mesa (en mesa múltiple, en ninguna subcomanda):
 // "Anular" pasa a ser "Cerrar mesa", sin motivo.
 const mesaSinItems = kitchenGrupo
 ? kitchenGrupo.vivos.length === 0
 : !itemsCocina.some((i: any) => !i.anulado);

 // Mesa Múltiple: un solo ticket a cocina con lo pendiente de TODAS las
 // subcomandas (ítems iguales juntos, sin nombres de subcomanda).
 const handleConfirmOrderGrupo = async () => {
 if (!kitchenGrupo) return;
 const ahora = new Date().toISOString();
 const esAdicional = kitchenGrupo.algunaConfirmada && kitchenGrupo.nuevos.length > 0;
 const reimprimir = kitchenGrupo.algunaConfirmada && kitchenGrupo.nuevos.length === 0;
 const itemsTicket = mergeItemsCocina(reimprimir ? kitchenGrupo.vivos : kitchenGrupo.nuevos);
 const anulados = esAdicional ? mergeItemsCocina(kitchenGrupo.anulados) : [];

 if (!reimprimir) {
 for (const pc of kitchenGrupo.porComanda) {
 if (pc.items.length === 0 || pc.nuevos.length === 0) continue;
 await updateRxComanda(pc.comanda.id, {
 confirmada: true,
 confirmada_at: ahora,
 cantidades_snapshot: JSON.stringify(Object.fromEntries(pc.items.map(i => [i.id, i.cantidad]))),
 });
 }
 }

 const content = generarComandaCocina(
 activeComanda, withBebida(itemsTicket), selectedMesa.nombre, esAdicional, linkedMesa?.nombre, false, withBebida(anulados)
 );
 setPreviewContent(content);
 setPreviewTitle(`${esAdicional ?'Adicional Cocina':'Comanda de Cocina'} - ${selectedMesa.nombre}`);
 setPreviewAviso(reimprimir ? undefined : 'La comanda de cocina');
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(itemsTicket),
 mesaNombre: selectedMesa.nombre,
 esAdicional,
 habitacionNombre: linkedMesa?.nombre,
 itemsAnulados: withBebida(anulados),
 }), 'Comanda de cocina');
 });
 setPreviewOpened(true);
 if (!reimprimir) showToast.success(esAdicional ?'Adicional enviado':'Orden Confirmada','Un solo ticket de cocina para toda la mesa.');
 };

 const handlePrintPrecuenta = () => {
 const content = generarPrecuenta(
 activeComanda,
 itemsCocina,
 selectedMesa.nombre,
 ivaPorcentaje,
 [...pagos, ...pagosDeVentas],
 linkedMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Pre-cuenta - ${selectedMesa.nombre}`);
 setPreviewAviso(undefined);
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueReceiptPrint({
 comanda: activeComanda,
 items: itemsCocina,
 mesaNombre: selectedMesa.nombre,
 ivaPorcentaje,
 pagos: [...pagos, ...pagosDeVentas],
 habitacionNombre: linkedMesa?.nombre,
 }), 'Pre-cuenta');
 });
 setPreviewOpened(true);
 };

 const handleConfirmOrder = async () => {
 if (kitchenGrupo) return handleConfirmOrderGrupo();
 if (!activeComanda?.confirmada) {
 const ahora = new Date().toISOString();
 const snapshot = Object.fromEntries(
 itemsCocina.map(item => [item.id, item.cantidad])
 );
 await updateRxComanda(activeComanda.id, {
 confirmada: true,
 confirmada_at: ahora,
 cantidades_snapshot: JSON.stringify(snapshot)
 });
 const content = generarComandaCocina(
 activeComanda,
 withBebida(itemsCocina),
 selectedMesa.nombre,
 false,
 linkedMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Comanda de Cocina - ${selectedMesa.nombre}`);
 setPreviewAviso('La comanda de cocina');
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(itemsCocina),
 mesaNombre: selectedMesa.nombre,
 esAdicional: false,
 habitacionNombre: linkedMesa?.nombre,
 }), 'Comanda de cocina');
 });
 setPreviewOpened(true);
 showToast.success('Orden Confirmada','La comanda fue enviada a cocina.');
 } else if (hayItemsNuevos) {
 const content = generarComandaCocina(
 activeComanda,
 withBebida(itemsNuevos),
 selectedMesa.nombre,
 true,
 linkedMesa?.nombre,
 false,
 withBebida(itemsAnuladosDesdeUltimaConfirmacion)
 );
 setPreviewContent(content);
 setPreviewTitle(`Adicional Cocina - ${selectedMesa.nombre}`);
 setPreviewAviso('El adicional de cocina');
 const nuevoSnapshot = Object.fromEntries(
 itemsCocina.map(item => [item.id, item.cantidad])
 );
 await updateRxComanda(activeComanda.id, {
 confirmada_at: new Date().toISOString(),
 cantidades_snapshot: JSON.stringify(nuevoSnapshot)
 });
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(itemsNuevos),
 mesaNombre: selectedMesa.nombre,
 esAdicional: true,
 habitacionNombre: linkedMesa?.nombre,
 itemsAnulados: withBebida(itemsAnuladosDesdeUltimaConfirmacion),
 }), 'Comanda de cocina');
 });
 setPreviewOpened(true);
 } else {
 const content = generarComandaCocina(
 activeComanda,
 withBebida(itemsCocina),
 selectedMesa.nombre,
 false,
 linkedMesa?.nombre,
 false,
 withBebida(itemsAnuladosDesdeUltimaConfirmacion)
 );
 setPreviewContent(content);
 setPreviewTitle(`Comanda de Cocina - ${selectedMesa.nombre}`);
 setPreviewAviso(undefined);
 setPreviewOnPrint(() => () => {
 imprimirConAviso(() => queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(itemsCocina),
 mesaNombre: selectedMesa.nombre,
 esAdicional: false,
 habitacionNombre: linkedMesa?.nombre,
 itemsAnulados: withBebida(itemsAnuladosDesdeUltimaConfirmacion),
 }), 'Comanda de cocina');
 });
 setPreviewOpened(true);
 }
 };

 // Unidades aún sin enviar a cocina en esta comanda (ítems nuevos o cantidad extra).
 const unidadesPendientesCocina = itemsNuevos.reduce((acc: number, i: any) => acc + (i.cantidad || 0), 0);
 // Pedir la cuenta con productos sin enviar no se bloquea: se avisa y decide el mesero.
 const handlePedirCuenta = () => {
 if (unidadesPendientesCocina > 0) setConfirmCuentaPendientes(true);
 else onAction(selectedMesa,'cuenta');
 };

 // Hooks antes de cualquier return anticipado. Callback estable para las listas memoizadas (el prop llega como función inline).
 const onSelectSubRef = useRef(onSelectSubcomanda);
 // La ref se actualiza en un efecto (no durante el render).
 useEffect(() => { onSelectSubRef.current = onSelectSubcomanda; });
 const handleSelectSubcomanda = useCallback((id: string) => onSelectSubRef.current?.(id), []);

 // "Cambiar cliente" es una página dentro del mismo sheet, no un modal.
 if (changeClienteModal) {
 return (
 <SidebarCambiarCliente
 folio={folioLabel(activeComanda)}
 mesaNombre={selectedMesa.nombre}
 nombre={changeClienteName}
 onNombreChange={(v) => { setChangeClienteName(v); setChangeClienteId(null); }}
 sugerencias={filteredChangeClientes}
 onElegir={(c) => { setChangeClienteName(c.nombre); setChangeClienteId(c.id); }}
 onBack={() => setChangeClienteModal(false)}
 onGuardar={handleConfirmChangeCliente}
 />
 );
 }

 // Cargar la comanda a una habitación activa (y subcuenta). El diálogo solo
 // elige destino; la escritura y el cierre se resuelven aquí.
 const handleTransferirHabitacion = async (cuentaId: string, subcuentaId: string | null) => {
 if (!activeComanda || enCursoRef.current) return;
 enCursoRef.current = true;
 setProcesandoHab(true);
 try {
 await updateRxComanda(activeComanda.id, {
 habitacion_cuenta_id: cuentaId,
 habitacion_subcuenta_id: subcuentaId,
 total,
 confirmada: true,
 sincronizado: true,
 });
 await liberarMesaSiSinOperativas(activeComanda.mesa_id);
 setShowRoomChargeModal(false);
 showToast.success('Transferencia exitosa','La comanda fue asignada a la habitación.');
 onResuelta();
 } catch (error) {
 console.error(error);
 showToast.error('Error','No se pudo transferir la comanda a la habitación.');
 } finally {
 enCursoRef.current = false;
 setProcesandoHab(false);
 }
 };


 // Vincula la cuenta a una habitación SIN cerrarla: sigue abierta en la mesa (se le pueden
 // agregar productos) pero ya cuenta como consumo de esa habitación; se envía al confirmarla.
 const handleVincularHabitacion = async (cuentaId: string, subcuentaId: string | null) => {
 if (!activeComanda || enCursoRef.current) return;
 enCursoRef.current = true;
 setProcesandoHab(true);
 try {
 // La cuenta pasa a ser de ese huésped, igual que al abrir una mesa vinculada: cambia el
 // cliente (texto, sin cliente_id: el huésped no es un cliente de la lista) y, en una
 // subcuenta, también el nombre que muestra su tarjeta.
 const huesped = (activeRoomAccounts.find((c: any) => c.id === cuentaId)?.huesped || '').trim();
 await updateRxComanda(activeComanda.id, {
 habitacion_cuenta_id: cuentaId,
 habitacion_subcuenta_id: subcuentaId,
 sincronizado: false,
 ...(huesped ? {
 cliente: huesped,
 cliente_id: null as any,
 ...(activeComanda.subcomanda_nombre ? { subcomanda_nombre: huesped } : {}),
 } : {}),
 });
 setShowVincularHab(false);
 showToast.success('Cuenta vinculada', 'Esta cuenta quedó asociada a la habitación.');
 } catch (error) {
 console.error(error);
 showToast.error('Error', 'No se pudo vincular la cuenta a la habitación.');
 } finally {
 enCursoRef.current = false;
 setProcesandoHab(false);
 }
 };

 const handleQuitarHabitacion = async () => {
 if (!activeComanda || enCursoRef.current) return;
 enCursoRef.current = true;
 setProcesandoHab(true);
 try {
 await updateRxComanda(activeComanda.id, {
 habitacion_cuenta_id: null as any,
 habitacion_subcuenta_id: null,
 sincronizado: null as any,
 });
 setShowVincularHab(false);
 showToast.success('Vínculo quitado', 'La cuenta vuelve a ser de mesa.');
 } catch (error) {
 console.error(error);
 showToast.error('Error', 'No se pudo quitar el vínculo.');
 } finally {
 enCursoRef.current = false;
 setProcesandoHab(false);
 }
 };

 // Cobro de la cuenta (página "Cobrar"). `imprimir` envía el recibo al cerrar.
 const handleConfirmarCobro = async (imprimir: boolean) => {
 if (!activeComanda || enCursoRef.current) return;
 enCursoRef.current = true;
 setProcesandoCierre(true);
 try {
 // Anticipo de la mesa: se usa (cubre parte o todo el saldo) o se ignora y
 // se cobra todo aparte. Todo se registra en la MISMA venta del anticipo.
 const hayAnticipo = anticipo.disponible > 0.001;
 const aplica = hayAnticipo ? anticipoUsar : 0;

 if (saldoPendiente > 0.01 || hayAnticipo) {
 await updateRxComanda(activeComanda.id, {
 total: total,
 updated_at: new Date().toISOString(),
 confirmada: true,
 estado: activeComanda.estado ==='cuenta'?'cuenta': activeComanda.estado,
 _modified: new Date().toISOString(),
 });
 // Sin método: se define después al anclar en Centro de Ventas.
 // Aislado en su propio try/catch: si registrar el saldo en la venta
 // falla (p.ej. la venta no se sincronizó todavía), NO debe bloquear
 // el cierre de la comanda ni la liberación de la mesa más abajo —
 // eso es lo operativamente crítico, el ajuste se puede corregir
 // después a mano en Centro de Ventas.
 try {
 if (hayAnticipo) {
 const ventaBase = anticipo.ventas[0].venta;
 // Lo que se usa del anticipo queda anotado (movimiento neutro) en la
 // venta que lo contiene, para que las otras cuentas de la mesa vean
 // el disponible real.
 for (const parte of repartirAnticipo(anticipo, aplica)) {
 await agregarVentaMovimiento({
 venta_id: parte.ventaId,
 tipo:'comentario',
 motivo: textoAplicado(parte.monto, folioLabel(activeComanda)),
 });
 }
 // Si el anticipo de ESTA comanda queda sin usar (total o parcialmente),
 // se deja la marca igual para que siga disponible para las otras cuentas
 // de la mesa cuando esta comanda ya esté cerrada.
 const conParte = new Set(repartirAnticipo(anticipo, aplica).map(p => p.ventaId));
 for (const { venta } of anticipo.ventas) {
 if (venta.comanda_id === activeComanda.id && !conParte.has(venta.id) && !tieneAnticipoAplicado(venta)) {
 await agregarVentaMovimiento({ venta_id: venta.id, tipo:'comentario', motivo: textoAplicado(0, folioLabel(activeComanda)) });
 }
 }
 // El consumo de esta cuenta ya está en el cargo de la venta (p. ej. los
 // $200 de la reserva): lo que se cobra ahora NO sube el valor de la venta,
 // se paga contra ese mismo cargo. Solo si el consumo acumulado lo supera
 // se agrega la diferencia.
 const extra = ajusteNecesario(ventaBase, saldoPendiente);
 if (extra > 0.001) {
 await agregarVentaMovimiento({
 venta_id: ventaBase.id,
 tipo:'ajuste',
 monto: extra,
 motivo:'Ajuste al cerrar cuenta (consumo mayor al cargo de la venta)',
 });
 }
 if (saldoPendiente > 0.001) {
 await agregarVentaMovimiento({
 venta_id: ventaBase.id,
 tipo:'comentario',
 motivo: textoCuentaCerrada(saldoPendiente, folioLabel(activeComanda)),
 });
 }
 // Lo que no se use queda a favor de la mesa en la misma venta (no hay
 // vuelto: no se devuelve nada al cerrar).
 } else if (ventaVigente) {
 // Ya existe una venta sobre esta comanda — se completa esa misma venta
 // en vez de crear una paralela. El saldo pendiente queda como 'ajuste'
 // (no se auto-cobra con un 'pago'; el cobro real se ancla después en
 // Centro de Ventas). Se agrega directamente `saldoPendiente`, que ya
 // descuenta los cobros de división (ver `totalPagadoVentas`).
 if (saldoPendiente > 0.001) {
 const extra = ajusteNecesario(ventaVigente, saldoPendiente);
 if (extra > 0.001) {
 await agregarVentaMovimiento({
 venta_id: ventaVigente.id,
 tipo:'ajuste',
 monto: extra,
 motivo:'Ajuste al cerrar cuenta (consumo mayor al cargo de la venta)',
 });
 }
 await agregarVentaMovimiento({
 venta_id: ventaVigente.id,
 tipo:'comentario',
 motivo: textoCuentaCerrada(saldoPendiente, folioLabel(activeComanda)),
 });
 }
 } else {
 await createRxVenta({
 id: crypto.randomUUID(),
 origen:'mesa',
 tipo:'directa',
 cliente_id: activeComanda.cliente_id || undefined,
 cliente_nombre: closePayerName?.trim() || activeComanda.cliente || undefined,
 referencia: `Mesa ${activeComanda.mesa_nombre || selectedMesa.nombre} · #${folioLabel(activeComanda)}`,
 comanda_id: activeComanda.id,
 organization_id: activeComanda.organization_id || orgIdLocal,
 }, saldoPendiente);
 }
 } catch (ventaError) {
 console.error('No se pudo registrar el saldo en la venta, se continúa cerrando la cuenta:', ventaError);
 showToast.error('Aviso','La cuenta se cerró, pero no se pudo registrar el saldo en Centro de Ventas. Revísalo manualmente.');
 }
 }

 
 // El total y el nombre de quien paga se guardan SIEMPRE al cerrar (no solo
 // en una rama): una subcomanda pagada con parte del anticipo quedaba en el
 // historial con valor 0 y sin datos.
 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 total: total,
 cliente: closePayerName?.trim() || activeComanda.cliente || undefined,
 confirmada: true,
 });

 await liberarMesaSiSinOperativas(activeComanda.mesa_id);

 // Recibo de cierre: nunca bloquea el cobro (si el servidor de impresión
 // falla, la cuenta ya quedó cerrada y se puede reimprimir desde Órdenes).
 if (imprimir) {
 try {
 const fecha = new Date().toISOString();
 const orgId = activeComanda.organization_id || orgIdLocal;
 const pagosRecibo: any[] = [...pagos, ...pagosDeVentas];
 if (aplica > 0.001) pagosRecibo.push({ id: crypto.randomUUID(), comanda_id: activeComanda.id, monto: aplica, fecha, organization_id: orgId, tipo_division: 'Anticipo aplicado' });
 const cobradoAhora = Math.max(0, saldoPendiente - aplica);
 if (cobradoAhora > 0.001) pagosRecibo.push({ id: crypto.randomUUID(), comanda_id: activeComanda.id, monto: cobradoAhora, fecha, organization_id: orgId });
 const rawText = generarTicketPago(activeComanda, comandaItems as any, pagosRecibo, selectedMesa.nombre, ivaPorcentaje, undefined, linkedMesa?.nombre);
 await queueReprintTicket({ rawText, mesaNombre: selectedMesa.nombre, comanda: activeComanda });
 showToast.success('Cuenta cobrada', `Recibo enviado a imprimir · ${selectedMesa.nombre}`);
 } catch (err) {
 console.warn('No se pudo enviar el recibo a imprimir', err);
 showToast.warning('Cuenta cobrada', 'No se pudo enviar el recibo a la impresora.');
 }
 } else {
 showToast.success('Cuenta cobrada', selectedMesa.nombre);
 }

 setCloseCuentaModalOpen(false);
 onResuelta();
 } catch (error) {
 console.error(error);
 showToast.error('Error','Hubo un error al cerrar la cuenta.');
 } finally {
 enCursoRef.current = false;
 setProcesandoCierre(false);
 }
 };
 // Cargar o vincular a una habitación: página dentro del mismo sheet.
 if (showRoomChargeModal || showVincularHab) {
 const vincular = showVincularHab;
 return (
 <SidebarHabitacionDestino
 modo={vincular ?'vincular':'cargar'}
 folio={folioLabel(activeComanda)}
 cuentas={activeRoomAccounts}
 mesas={allMesas}
 procesando={procesandoHab}
 onConfirm={vincular ? handleVincularHabitacion : handleTransferirHabitacion}
 cuentaInicialId={activeComanda?.habitacion_cuenta_id}
 subcuentaInicialId={activeComanda?.habitacion_subcuenta_id}
 onQuitar={vincular && activeComanda?.habitacion_cuenta_id ? handleQuitarHabitacion : undefined}
 onBack={() => { setShowRoomChargeModal(false); setShowVincularHab(false); }}
 />
 );
 }
 if (closeCuentaModalOpen) {
 return (
 <SidebarCobrarCuenta
 folio={folioLabel(activeComanda)}
 mesaNombre={selectedMesa.nombre}
 subtotal={subtotal}
 iva={ivaCalculado}
 ivaPorcentaje={ivaPorcentaje}
 total={total}
 totalPagado={totalPagado}
 saldoPendiente={saldoPendiente}
 anticipo={anticipo.disponible}
 anticipoUsar={anticipoUsar}
 onAnticipoUsarChange={setAnticipoUsarInput}
 ultimaCuentaDeMesa={comandasOperativasMesa.filter((id: string) => id !== activeComanda?.id).length === 0}
 closePayerName={closePayerName}
 setClosePayerName={setClosePayerName}
 procesando={procesandoCierre}
 onBack={() => setCloseCuentaModalOpen(false)}
 onConfirm={handleConfirmarCobro}
 />
 );
 }

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 {/* Header — en desktop el fondo completo toma el color de estado (verde/naranja);
 en móvil el fondo queda neutro y solo el badge de mesa lleva el color, ya que
 un header sólido se veía mal dentro del bottom-sheet redondeado. */}
 <ComandaHeader
 mesaNombre={selectedMesa.nombre}
 titulo={vistaTodas ?'Toda la mesa': (activeComanda?.cliente ||'Público General')}
 subtitulo={vistaTodas ? `${gruposTodas.length} subcomandas` : `COMANDA #${folioLabel(activeComanda)}`}
 enCuenta={activeComanda?.estado ==='cuenta'}
 linkedMesa={linkedMesa}
 puedeDividir={!!onActivarMultiple && !vistaTodas}
 dividiendo={activandoMultiple}
 puedeVincularHabitacion={!vistaTodas && !!activeComanda && (activeRoomAccounts.length > 0 || !!activeComanda.habitacion_cuenta_id)}
 onVincularHabitacion={() => {
 if (activeRoomAccounts.length === 0 && !activeComanda?.habitacion_cuenta_id) {
 showToast.error('Aviso','No hay habitaciones activas para vincular.');
 return;
 }
 setShowVincularHab(true);
 }}
 onCambiarMesa={() => setChangeMesaModal(true)}
 onDividir={() => setConfirmDividir(true)}
 onClose={onClose}
 />

 {/* Datos del cliente, colapsable — siempre visible para poder cambiar el cliente */}
 {!vistaTodas && (
 <ClienteInfoCollapsible
 open={clienteInfoOpen}
 onOpenChange={setClienteInfoOpen}
 onEditar={handleOpenChangeCliente}
 linkedMesa={linkedMesa}
 clienteVinculado={clienteVinculado}
 clienteNombre={activeComanda?.cliente}
 />
 )}

 {/* Lista de productos */}
 <main ref={productListRef}className="flex-1 overflow-y-auto">
 {vistaTodas ? (
 <TodasList grupos={gruposTodas} onSelectSubcomanda={handleSelectSubcomanda} />
 ) : (
 <ComandaItemsList
 items={comandaItems}
 selectedId={editingItem?.id}
 confirmada={!!activeComanda?.confirmada}
 confirmadaAt={activeComanda?.confirmada_at}
 snapshot={cantidadesSnapshot}
 padBottom={!editingItem && activeComanda?.estado !=='cuenta'}
 onSelect={setEditingItem}
 />
 )}
 </main>

 {/* Footer y Acciones */}
 {vistaTodas ? (
 <footer className="p-4 bg-muted/40 border-t border-border flex flex-col gap-3 shrink-0">
 <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/60">
 <span className="text-base font-black text-foreground">Total mesa</span>
 <span className="text-xl font-black text-primary">${totalTodas.toFixed(2)}</span>
 </div>
 <Button
 variant={!hayConfirmadaCocina || hayNuevosCocina ?"default":"secondary"}
 className={cn("w-full h-10 font-bold", !hayConfirmadaCocina || hayNuevosCocina ?"":"bg-muted text-foreground")}
 onClick={handleConfirmOrder}
 disabled={sinItemsCocina}
 >
 {!hayConfirmadaCocina || hayNuevosCocina ? <Check size={18} weight="bold"className="mr-1.5"/> : <Printer size={18} weight="bold"className="mr-1.5"/>}
 {!hayConfirmadaCocina ?'Confirmar': hayNuevosCocina ?`Confirmar (${nuevosCocina.length})`:'Reimprimir'}
 </Button>
 <span className="text-[11px] text-center text-muted-foreground">Elige una subcomanda para añadir, cobrar o cargar a habitación.</span>
 </footer>
 ) : (
 <footer className={cn("relative p-4 flex flex-col gap-3 shrink-0",
 editingItem ?"bg-muted/70": "bg-muted/40",
 "border-t border-border",
 // Con el pill "Añadir" flotando sobre el borde, deja espacio para que no tape los totales.
 !editingItem && activeComanda?.estado !=='cuenta'&&"pt-6")}>
 {isMobile && hasMoreBelow && !editingItem && activeComanda?.estado !=='cuenta'&& (
 <CaretDown
 aria-hidden="true"
 size={18}
 weight="bold"
 className="absolute -top-10 left-1/2 -translate-x-1/2 text-muted-foreground/70 animate-bounce pointer-events-none"
 />
 )}
 {!editingItem ? (
 <>
 {activeComanda?.estado !=='cuenta'&& (
 <Button
 // Pill flotante: sale del flujo del footer y queda centrada sobre su borde
 // superior, así no ocupa una fila propia ni va a todo el ancho.
 className="absolute -top-[18px] left-1/2 -translate-x-1/2 z-20 h-9 w-auto px-4 rounded-full border-0 font-semibold text-xs whitespace-nowrap bg-warning-foreground hover:bg-warning-foreground text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] focus-visible:ring-0 active:scale-95 transition-transform"onClick={mesaView ==='productos'? () => setMesaView('mapa') : onAddProduct}
 >
 <Plus size={15} weight="bold"className="mr-1.5"/>
 Añadir {totalItems > 0 &&`· Total Items: ${totalItems}`}
 </Button>
 )}
 <ComandaTotales
 subtotal={subtotal}
 iva={ivaCalculado}
 ivaPorcentaje={ivaPorcentaje}
 ivaEsOverride={ivaEsOverride}
 total={total}
 totalPagado={totalPagado}
 saldoPendiente={saldoPendiente}
 // El anticipo de la mesa solo aparece al pedir cuenta.
 anticipo={activeComanda?.estado ==='cuenta'? anticipo.disponible : 0}
 // En móvil, mientras se toma el pedido solo se muestra el Total: el
 // detalle le quita espacio a la lista de productos.
 detallado={!isMobile || activeComanda?.estado ==='cuenta'}
 onEditarIva={() => setIvaModalOpen(true)}
 onVerPagos={() => setShowPagosModal(true)}
 onVerAnticipo={() => setAnticipoDetalleOpen(true)}
 />

 <ComandaAcciones
 enCuenta={activeComanda?.estado ==='cuenta'}
 total={total}
 saldoPendiente={saldoPendiente}
 hayConfirmadaCocina={hayConfirmadaCocina}
 hayNuevosCocina={hayNuevosCocina}
 nuevosCocinaCount={nuevosCocina.length}
 sinItemsCocina={sinItemsCocina}
 confirmada={confirmadaEfectiva}
 sinProductos={comandaItems.length === 0}
 mesaSinItems={mesaSinItems}
 onConfirmarCocina={handleConfirmOrder}
 onPedirCuenta={handlePedirCuenta}
 onCargarHabitacion={() => {
 if (activeRoomAccounts.length === 0) {
 showToast.error('Aviso','No hay habitaciones activas para cargar.');
 return;
 }
 setShowRoomChargeModal(true);
 }}
 onCerrarVacia={() => onAction(selectedMesa,'cerrar_vacia')}
 onAnular={() => onAction(selectedMesa,'cancelar')}
 hayCortesia={hayCortesia}
 onPrecuenta={handlePrintPrecuenta}
 onCobrar={() => setCloseCuentaModalOpen(true)}
 onDividirCuenta={() => onAction(selectedMesa,'dividido')}
 onReabrir={() => onAction(selectedMesa,'reabrir')}
 />
 </>
 ) : editingItem.anulado ? (
 // Estado terminal: un ítem anulado no admite ninguna acción más,
 // solo se muestra el motivo/fecha de la anulación.
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <span className="font-extrabold text-xs text-destructive">Ítem Anulado</span>
 <Button variant="ghost"size="icon"className="h-6 w-6"onClick={() => setEditingItem(null)}>
 <X size={14} />
 </Button>
 </div>
 <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex flex-col gap-1">
 <span className="text-sm font-bold text-foreground line-through">{editingItem.nombre}</span>
 {editingItem.anulado_motivo && (
 <span className="text-xs text-muted-foreground">Motivo: {editingItem.anulado_motivo}</span>
 )}
 {editingItem.anulado_at && (
 <span className="text-[10px] text-muted-foreground">
 {new Date(editingItem.anulado_at).toLocaleDateString('es', { day:'2-digit', month:'short'})} · {new Date(editingItem.anulado_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit'})}
 </span>
 )}
 </div>
 <Button variant="outline"className="w-full font-bold"onClick={() => setEditingItem(null)}>
 Cerrar
 </Button>
 </div>
 ) : (
 <ItemActionsPanel
 key={editingItem.id}
 item={editingItem}
 confirmado={esItemBloqueado(editingItem)}
 cantidadEnviada={esItemBloqueado(editingItem) ? enviadaDe(editingItem) : 0}
 destinos={destinosMover.filter((c: any) => c.estado !== 'cuenta').map((c: any) => ({ id: c.id, nombre: c.subcomanda_nombre }))}
 destinosRepartir={destinosMover.filter((c: any) => c.estado !== 'cuenta').map((c: any) => ({ id: c.id, nombre: c.subcomanda_nombre }))}
 ocultarEstado={activeComanda?.estado ==='cuenta'}
 cuentaPedida={activeComanda?.estado ==='cuenta'}
 tieneOpciones={!!editingMenuItem?.modificadores && editingMenuItem.modificadores.length > 0}
 precioVariable={!!editingMenuItem?.precio_variable}
 onClose={() => setEditingItem(null)}
 onGuardar={handleUpdateItem}
 onEliminar={handleDeleteItem}
 onEditarOpciones={() => setEditingModifiers(true)}
 onMover={handleMoverItem}
 onAnular={handleAnularItem}
 onCortesia={handleMarcarCortesia}
 onRepartir={handleRepartirItem}
 onDeshacerReparto={handleDeshacerReparto}
 />
 )}
 </footer>
 )}

 <SidebarPagosModal
 opened={showPagosModal}
 onClose={() => setShowPagosModal(false)}
 pagos={[...pagos, ...pagosDeVentas]}
 totalPagado={[...pagos, ...pagosDeVentas].reduce((acc: number, p: any) => acc + (p.monto ?? 0), 0)}
 />

 <SidebarComandaIvaModal
 opened={ivaModalOpen}
 onClose={() => setIvaModalOpen(false)}
 currentPorcentaje={ivaPorcentaje}
 esOverride={ivaEsOverride}
 onConfirm={async (data) => {
 if (!activeComanda) return;
 await updateRxComanda(activeComanda.id, {
 iva_porcentaje: data ? data.porcentaje : null,
 iva_precios_con_iva: data ? data.preciosConIva : null,
 });
 }}
 />


 <DividirMesaDialog
 opened={confirmDividir}
 onOpenChange={setConfirmDividir}
 procesando={activandoMultiple}
 onConfirm={handleConfirmDividir}
 />

 <CuentaConPendientesDialog
 opened={confirmCuentaPendientes}
 onOpenChange={setConfirmCuentaPendientes}
 pendientes={unidadesPendientesCocina}
 onConfirm={() => { setConfirmCuentaPendientes(false); onAction(selectedMesa,'cuenta'); }}
 />

 <AnticipoDetalleDialog
 opened={anticipoDetalleOpen}
 onOpenChange={setAnticipoDetalleOpen}
 disponible={anticipo.disponible}
 ventas={anticipo.ventas}
 />

 <CambiarMesaDialog
 opened={changeMesaModal}
 onOpenChange={setChangeMesaModal}
 folio={folioLabel(activeComanda)}
 mesas={mesasDisponiblesParaCambio}
 seleccionada={mesaSeleccionadaParaCambio}
 onSelect={setMesaSeleccionadaParaCambio}
 onConfirm={handleConfirmChangeMesa}
 />

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 onPrint={previewOnPrint ?? undefined}
 avisoSinImprimir={previewAviso}
 />

 <ProductModifiersModal
 key={editingItem?.id}
 opened={editingModifiers}
 onClose={() => setEditingModifiers(false)}
 product={editingMenuItem}
 onConfirm={handleUpdateModifiers}
 />
 </div>
 );
}
