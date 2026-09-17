import { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Prohibit, ArrowCounterClockwise, Paperclip, Trash, Plus,
  CurrencyDollar, ArrowUp, ArrowDown, FileText, XCircle, CreditCard, ChatText,
  Table, ForkKnife, BedIcon, Door, CloudCheck, CloudWarning, ArrowsClockwise,
} from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CaretDown, User as UserIcon } from '@phosphor-icons/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { showToast } from '@/lib/toast';
import { useAuth } from '../../context/AuthContext';
import { useMetodosPagoConfig } from '../../hooks/useMetodosPagoConfig';
import { agregarVentaMovimiento, updateRxVenta, adjuntarComprobanteMovimiento, verificarSyncVenta } from '../../db/rxdb';
import { subirComprobante, eliminarComprobante, resolverComprobanteUrl } from '@/lib/comprobantes';
import { VentaClienteCard } from './VentaClienteCard';
import { MovimientoHistorialCard } from './MovimientoHistorialCard';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import type { RxVentaMovimiento, VentaMovimientoTipo, VentaOrigen } from '../../db/rxdb';

const ORIGEN_LABEL: Record<VentaOrigen, string> = {
  mesa: 'Mesa',
  reserva_restaurante: 'Reserva restaurante',
  reserva_hotel: 'Reserva hotel',
  habitacion: 'Checkout habitación',
};

const ORIGEN_ICON: Record<VentaOrigen, typeof Table> = {
  mesa: Table,
  reserva_restaurante: ForkKnife,
  reserva_hotel: BedIcon,
  habitacion: Door,
};

const ORIGEN_CLASSES: Record<VentaOrigen, string> = {
  mesa: 'bg-blue-50 text-blue-700 border-blue-200',
  reserva_restaurante: 'bg-amber-50 text-amber-700 border-amber-200',
  reserva_hotel: 'bg-purple-50 text-purple-700 border-purple-200',
  habitacion: 'bg-teal-50 text-teal-700 border-teal-200',
};

interface VentaDetalleAccionesProps {
  item: VentaConMovimientos;
}

// 'anclar' quedó como el único paso de facturación — antes existían
// 'anclar' (sin datos, solo destrababa 'facturar') y 'facturar' por
// separado; se fusionaron en una sola acción que pide el número de factura
// directo. El id se mantiene por compatibilidad con historiales previos a
// la fusión (ver useVentasConMovimientos).
type AccionId = 'pago' | 'ajuste' | 'anclar' | 'reembolsar' | 'marcar_credito' | 'comentario' | 'anular';

// Acciones que mueven/afectan dinero admiten adjuntar su propio comprobante
// al confirmar — cada pago/ajuste/reembolso lleva su respaldo individual,
// distinto del documento de venta (factura/confirmación) a nivel de venta.
const ACCIONES_CON_COMPROBANTE: AccionId[] = ['pago', 'ajuste', 'reembolsar', 'anclar'];

const ACCION_LABEL: Record<AccionId, string> = {
  pago: 'Pago',
  ajuste: 'Ajustar',
  anclar: 'Facturar',
  reembolsar: 'Reembolsar',
  marcar_credito: 'Crédito',
  comentario: 'Comentar',
  anular: 'Anular',
};

const ACCION_ICON: Record<AccionId, typeof Receipt> = {
  pago: CurrencyDollar,
  ajuste: ArrowUp,
  anclar: Receipt,
  reembolsar: ArrowCounterClockwise,
  marcar_credito: CreditCard,
  comentario: ChatText,
  anular: Prohibit,
};

// Color por acción al estar seleccionada — misma paleta semántica que
// MOVIMIENTO_COLOR en el historial, así el chip activo anticipa de qué
// color va a aparecer el movimiento una vez confirmado.
const ACCION_COLOR: Record<AccionId, string> = {
  pago: 'bg-emerald-600 border-emerald-600',
  reembolsar: 'bg-amber-600 border-amber-600',
  ajuste: 'bg-blue-600 border-blue-600',
  anclar: 'bg-purple-600 border-purple-600',
  marcar_credito: 'bg-indigo-600 border-indigo-600',
  comentario: 'bg-slate-600 border-slate-600',
  anular: 'bg-red-600 border-red-600',
};

const MOVIMIENTO_ICON: Record<VentaMovimientoTipo, typeof Receipt> = {
  ajuste: ArrowUp,
  pago: CurrencyDollar,
  reembolso: ArrowDown,
  anclar: Receipt,
  facturar: FileText,
  anular: XCircle,
  marcar_credito: CreditCard,
  comentario: ChatText,
};

const MOVIMIENTO_LABEL: Record<VentaMovimientoTipo, string> = {
  ajuste: 'Ajuste',
  pago: 'Pago',
  reembolso: 'Reembolso',
  anclar: 'Facturado',
  facturar: 'Facturado',
  anular: 'Anulado',
  marcar_credito: 'Marcado como crédito',
  comentario: 'Comentario',
};

// Color por tipo de movimiento — para diferenciarlos de un vistazo en el
// historial: verde = entra dinero, ámbar = sale dinero, azul = ajuste de
// monto, morado = facturación, rosa = cambio de tipo a crédito, gris =
// informativo, rojo = anulación de la venta completa.
const MOVIMIENTO_COLOR: Record<VentaMovimientoTipo, string> = {
  pago: 'bg-emerald-100 text-emerald-700',
  reembolso: 'bg-amber-100 text-amber-700',
  ajuste: 'bg-blue-100 text-blue-700',
  anclar: 'bg-purple-100 text-purple-700',
  facturar: 'bg-purple-100 text-purple-700',
  marcar_credito: 'bg-indigo-100 text-indigo-700',
  comentario: 'bg-slate-100 text-slate-700',
  anular: 'bg-red-100 text-red-700',
};

/**
 * Detalle de una venta: card de resumen (solo lectura, incluye el documento
 * de venta — factura/confirmación) + historial de movimientos como
 * sub-cards cronológicas (cada uno con su propio comprobante si lo tiene) +
 * barra de acción fija abajo. Cada acción agrega un movimiento nuevo —
 * nunca edita el historial existente.
 */
export function VentaDetalleAcciones({ item }: VentaDetalleAccionesProps) {
  const { currentMesero, adminUser } = useAuth();
  const getUsuarioId = () => currentMesero?.id || adminUser?.id;
  const esAdmin = !!adminUser || currentMesero?.rol === 'admin';
  
  const { bancos, redesTarjeta } = useMetodosPagoConfig();
  const { venta, movimientos } = item;

  const [numeroFactura, setNumeroFactura] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [montoReembolso, setMontoReembolso] = useState('');
  const [motivoReembolso, setMotivoReembolso] = useState('');
  const [montoAjuste, setMontoAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'otros'>('efectivo');
  const [bancoDestino, setBancoDestino] = useState('');
  const [numeroComprobanteTransf, setNumeroComprobanteTransf] = useState('');
  const [redTarjeta, setRedTarjeta] = useState('');
  const [motivoCredito, setMotivoCredito] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [textoComentario, setTextoComentario] = useState('');
  const [uploadingDocumento, setUploadingDocumento] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; url: string; nombre: string; origen: string } | null>(null);
  const [confirmDeleteVenta, setConfirmDeleteVenta] = useState(false);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accion, setAccion] = useState<AccionId>('pago');
  const [checkingSync, setCheckingSync] = useState(false);
  const [syncResult, setSyncResult] = useState<'ok' | 'reintentado' | 'error' | null>(null);

  const [ajustarVentaPago, setAjustarVentaPago] = useState(false);
  const [motivoAjustePago, setMotivoAjustePago] = useState('');
  
  const [pagosSeleccionados, setPagosSeleccionados] = useState<Set<string>>(new Set());

  const accionesDisponibles = useMemo<AccionId[]>(() => {
    // Si la venta está anulada, todo queda estrictamente en solo lectura:
    // no se permiten pagos, ajustes, facturación ni nuevos comentarios.
    if (item.anulado) return [];
    const list: AccionId[] = [];
    // Grupo 1: movimientos de dinero directos sobre la venta.
    // Sin condición de saldo ni de facturado: se puede registrar más de un pago
    // y emitir múltiples facturas en una misma venta (ej. factura dividida o parcial).
    list.push('pago');
    list.push('anclar');
    if (item.totalPagado > 0) list.push('reembolsar');
    // Grupo 2: cambios de estado/clasificación de la venta.
    list.push('ajuste');
    if (venta.tipo === 'directa') list.push('marcar_credito');
    list.push('anular');
    // Grupo 3: solo informativo.
    list.push('comentario');
    return list;
  }, [item, venta.tipo]);

  const accionActiva = accionesDisponibles.includes(accion) ? accion : accionesDisponibles[0];

  useEffect(() => {
    setAccion(accionesDisponibles[0] ?? 'pago');
    setComprobanteFile(null);
    setSyncResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta.id]);

  const handleVerificarSync = async () => {
    setCheckingSync(true);
    setSyncResult(null);
    try {
      const resultado = await verificarSyncVenta(venta.id);
      if (resultado.enSupabase) {
        setSyncResult('ok');
        showToast.success('La venta está sincronizada en Supabase');
      } else if (resultado.reintentado) {
        setSyncResult('reintentado');
        showToast.success('La venta no estaba sincronizada. Se reenvió, esperando confirmación...');
      } else {
        setSyncResult('error');
        showToast.error(resultado.error || 'No se pudo verificar la sincronización');
      }
    } catch (e) {
      console.error(e);
      setSyncResult('error');
      showToast.error('No se pudo verificar la sincronización');
    } finally {
      setCheckingSync(false);
    }
  };

  useEffect(() => {
    setComprobanteFile(null);
  }, [accionActiva]);

  // Un pago en efectivo no tiene comprobante que subir — se deshabilita en
  // vez de solo ocultar para dejar claro que la opción existe pero no
  // aplica a este método, y se limpia cualquier archivo ya seleccionado si
  // el usuario cambia de método después de elegir uno.
  const comprobanteDeshabilitado = accionActiva === 'pago' && metodoPago === 'efectivo';

  useEffect(() => {
    if (comprobanteDeshabilitado) setComprobanteFile(null);
  }, [comprobanteDeshabilitado]);

  const registrar = async (input: Omit<RxVentaMovimiento, 'id' | 'fecha'> & { fecha?: string }) => {
    setSaving(true);
    try {
      let comprobante_url: string | undefined;
      if (comprobanteFile) {
        const orgId = localStorage.getItem('pos_active_org_id') || '';
        comprobante_url = await subirComprobante(comprobanteFile, orgId, venta.id);
      }
      await agregarVentaMovimiento({ venta_id: venta.id, ...input, comprobante_url });
      setComprobanteFile(null);
      return true;
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo registrar el movimiento');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePago = async () => {
    const monto = parseFloat(montoPago);
    if (!monto || monto <= 0) { showToast.error('Ingresa un monto válido'); return; }

    let montoAjuste = 0;
    if (ajustarVentaPago) {
      montoAjuste = monto - Math.max(0, item.saldo);
      if (montoAjuste > 0 && !motivoAjustePago.trim()) {
        showToast.error('Ingresa el motivo del ajuste');
        return;
      }
    }

    if (await registrar({
      tipo: 'pago',
      monto,
      metodo_pago: metodoPago,
      transferencia_banco: metodoPago === 'transferencia' ? (bancoDestino || undefined) : undefined,
      transferencia_referencia: metodoPago === 'transferencia' ? (numeroComprobanteTransf.trim() || undefined) : undefined,
      tarjeta_red: metodoPago === 'tarjeta' ? (redTarjeta || undefined) : undefined,
      usuario_id: getUsuarioId(),
    })) {
      if (montoAjuste > 0) {
        try {
          await agregarVentaMovimiento({
            venta_id: venta.id,
            tipo: 'ajuste',
            monto: montoAjuste,
            motivo: motivoAjustePago.trim(),
            usuario_id: getUsuarioId(),
          });
        } catch (e) {
          console.error("Error al registrar ajuste", e);
        }
      }
      showToast.success('Pago registrado');
      setMontoPago('');
      setBancoDestino('');
      setNumeroComprobanteTransf('');
      setRedTarjeta('');
      setAjustarVentaPago(false);
      setMotivoAjustePago('');
    }
  };

  const handleAjuste = async () => {
    const monto = parseFloat(montoAjuste);
    if (!monto) { showToast.error('Ingresa un monto (positivo para aumentar, negativo para reducir)'); return; }
    if (await registrar({ tipo: 'ajuste', monto, motivo: motivoAjuste.trim() || undefined, usuario_id: getUsuarioId() })) {
      showToast.success('Ajuste registrado');
      setMontoAjuste('');
      setMotivoAjuste('');
    }
  };

  const handleFacturar = async () => {
    if (!numeroFactura.trim()) { showToast.error('Ingresa el número de factura'); return; }
    if (await registrar({ 
      tipo: 'anclar', 
      numero_factura: numeroFactura.trim(), 
      pagos_asociados: pagosSeleccionados.size > 0 ? Array.from(pagosSeleccionados) : undefined,
      usuario_id: getUsuarioId() 
    })) {
      showToast.success('Venta facturada');
      setNumeroFactura('');
      setPagosSeleccionados(new Set());
    }
  };

  const handleReembolsar = async () => {
    const monto = parseFloat(montoReembolso);
    if (!monto || monto <= 0 || monto > item.totalPagado - item.totalReembolsado) {
      showToast.error('Ingresa un monto de reembolso válido');
      return;
    }
    if (await registrar({ tipo: 'reembolso', monto, motivo: motivoReembolso.trim() || undefined, usuario_id: getUsuarioId() })) {
      showToast.success('Reembolso registrado');
      setMontoReembolso('');
      setMotivoReembolso('');
    }
  };

  const handleMarcarCredito = async () => {
    if (await registrar({ tipo: 'marcar_credito', motivo: motivoCredito.trim() || undefined, usuario_id: getUsuarioId() })) {
      showToast.success('Venta marcada como crédito');
      setMotivoCredito('');
    }
  };

  const handleComentario = async () => {
    if (!textoComentario.trim()) { showToast.error('Escribe un comentario'); return; }
    if (await registrar({ tipo: 'comentario', motivo: textoComentario.trim(), usuario_id: getUsuarioId() })) {
      showToast.success('Comentario agregado');
      setTextoComentario('');
    }
  };

  const handleAnular = async () => {
    if (!motivoAnulacion.trim()) { showToast.error('Ingresa el motivo de anulación'); return; }
    if (await registrar({ tipo: 'anular', motivo: motivoAnulacion.trim(), usuario_id: getUsuarioId() })) {
      showToast.success('Venta anulada');
      setMotivoAnulacion('');
    }
  };

  const handleDeleteVenta = async () => {
    setSaving(true);
    try {
      const rxDb = await import('../../db/rxdb').then(m => m.initVerticalRxDb());
      const doc = await rxDb.comandas.findOne(venta.id).exec();
      if (doc) {
        await doc.update({ $set: { _deleted: true, _modified: new Date().toISOString() } } as any);
        showToast.success('Comanda borrada permanentemente');
        setConfirmDeleteVenta(false);
      }
    } catch (e) {
      console.error(e);
      showToast.error('Error al borrar la comanda');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocumento = async (file: File) => {
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    setUploadingDocumento(true);
    try {
      const url = await subirComprobante(file, orgId, venta.id);
      await agregarVentaMovimiento({
        venta_id: venta.id,
        tipo: 'comentario',
        motivo: file.name,
        comprobante_url: url,
        usuario_id: getUsuarioId(),
      });
      showToast.success('Documento adjuntado');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo subir el documento');
    } finally {
      setUploadingDocumento(false);
    }
  };

  const handleQuitarDocumento = async (doc: { id: string; url: string; origen: string }) => {
    setUploadingDocumento(true);
    try {
      await eliminarComprobante(doc.url);
      if (doc.id === `venta-doc-${venta.id}`) {
        await updateRxVenta(venta.id, { documento_url: undefined, documento_nombre: undefined });
      } else {
        await adjuntarComprobanteMovimiento(venta.id, doc.id, null);
      }
      showToast.success('Documento eliminado');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo eliminar el documento');
    } finally {
      setUploadingDocumento(false);
    }
  };

  const handleConfirmar = () => {
    if (accionActiva === 'pago') return handlePago();
    if (accionActiva === 'ajuste') return handleAjuste();
    if (accionActiva === 'anclar') return handleFacturar();
    if (accionActiva === 'reembolsar') return handleReembolsar();
    if (accionActiva === 'marcar_credito') return handleMarcarCredito();
    if (accionActiva === 'comentario') return handleComentario();
    if (accionActiva === 'anular') return handleAnular();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {/* Card de resumen del Header de Venta */}
        <Card className="gap-0 py-0 overflow-visible">
          {/* Bloque 1: Identidad — referencia sola arriba; fecha + badges comparten fila abajo */}
          <div className="flex flex-col gap-1.5 px-5 py-4">
            <CardTitle className="text-sm font-extrabold line-clamp-2">{venta.referencia || '—'}</CardTitle>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                Creada el {dayjs(venta.created_at).format('DD MMM YYYY, HH:mm')}
              </span>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={handleVerificarSync}
                  disabled={checkingSync}
                  title="Verificar si esta venta está sincronizada en Supabase"
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50",
                    syncResult === 'ok' && "border-emerald-200 text-emerald-700 bg-emerald-50",
                    syncResult === 'reintentado' && "border-amber-200 text-amber-700 bg-amber-50",
                    syncResult === 'error' && "border-red-200 text-red-700 bg-red-50",
                    !syncResult && "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {checkingSync ? (
                    <ArrowsClockwise size={12} weight="bold" className="animate-spin" />
                  ) : syncResult === 'ok' ? (
                    <CloudCheck size={12} weight="bold" />
                  ) : syncResult === 'error' ? (
                    <CloudWarning size={12} weight="bold" />
                  ) : (
                    <ArrowsClockwise size={12} weight="bold" />
                  )}
                  {checkingSync
                    ? 'Verificando...'
                    : syncResult === 'ok'
                      ? 'Sincronizada'
                      : syncResult === 'reintentado'
                        ? 'Reenviada'
                        : syncResult === 'error'
                          ? 'Error de sync'
                          : 'Verificar sync'}
                </button>
                {(() => {
                  const OrigenIcon = ORIGEN_ICON[venta.origen];
                  return (
                    <Badge variant="outline" className={cn("font-bold", ORIGEN_CLASSES[venta.origen])}>
                      <OrigenIcon size={12} weight="bold" /> {ORIGEN_LABEL[venta.origen]}
                    </Badge>
                  );
                })()}
                {venta.tipo === 'credito' && (
                  <Badge variant="outline" className="font-bold border-rose-200 text-rose-700 bg-rose-50">
                    <CreditCard size={12} weight="fill" /> Crédito
                  </Badge>
                )}
                {item.facturado && (
                  <Badge variant="outline" className="font-bold border-emerald-200 text-emerald-700 bg-emerald-50">
                    <Receipt size={12} weight="fill" /> Facturado
                  </Badge>
                )}
                {item.anulado && (
                  <div className="flex items-center gap-1 bg-destructive/10 rounded-full pr-0.5">
                    <Badge variant="destructive" className="font-bold border-0"><Prohibit size={12} weight="fill" /> Anulado</Badge>
                    {esAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 rounded-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setConfirmDeleteVenta(true)}
                        title="Borrar definitivamente"
                      >
                        <Trash size={13} weight="bold" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bloque 2: Montos — monto de venta y saldo, dato financiero clave, con más peso visual */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-muted/40">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Monto de Venta</span>
              <span className="text-2xl font-black text-foreground tracking-tight">${item.montoTotal.toFixed(2)}</span>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Saldo</span>
              {item.saldo > 0.01 ? (
                <span className="font-black text-sm text-amber-600">
                  ${item.saldo.toFixed(2)}
                </span>
              ) : item.saldo < -0.01 ? (
                <span className="font-black text-sm text-blue-600">
                  Excedente ${Math.abs(item.saldo).toFixed(2)}
                </span>
              ) : (
                <span className="font-black text-sm text-emerald-600">
                  Saldado ($0.00)
                </span>
              )}
            </div>
          </div>

          {/* Motivo de Anulación: crítico cuando aplica, pegado al bloque financiero */}
          {item.anulado && item.motivoAnulacion && (
            <div className="flex flex-col gap-1.5 px-5 py-3 bg-red-50 dark:bg-red-950/30 border-t border-red-100 dark:border-red-900/50">
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <Prohibit size={14} weight="bold" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Motivo de Anulación</span>
              </div>
              <p className="text-xs font-medium text-red-800 dark:text-red-300 leading-relaxed">
                {item.motivoAnulacion}
              </p>
            </div>
          )}

          {/* Bloque 3: Cliente, colapsable — fila delgada, sin look de input */}
          <Collapsible open={clienteAbierto} onOpenChange={setClienteAbierto} className="border-t border-border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between gap-2 w-full px-5 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserIcon size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-extrabold text-foreground truncate">
                    {venta.cliente_nombre || 'Sin cliente'}
                  </span>
                </div>
                <CaretDown size={14} className={cn("text-muted-foreground shrink-0 transition-transform", clienteAbierto && "rotate-180")} />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="px-5 pb-4 select-text">
                <VentaClienteCard venta={venta} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Bloque 4: Archivos, minimalista — solo lista + link añadir, sin grid de tarjetas */}
          <div className="flex flex-col gap-2 px-5 py-4 border-t border-border">

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {item.documentosAdjuntos.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
                >
                  <a
                    href={resolverComprobanteUrl(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    title={doc.nombre}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Paperclip size={13} className="shrink-0" />
                    <span className="truncate text-[11px] font-semibold">{doc.nombre}</span>
                  </a>

                  {!item.anulado && (
                    <button
                      type="button"
                      onClick={() => setDocToDelete(doc)}
                      disabled={uploadingDocumento}
                      title="Eliminar archivo"
                      className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-background transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={12} />
                    </button>
                  )}
                </div>
              ))}

              {!item.anulado && (
                <label className={cn(
                  "flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-border text-muted-foreground cursor-pointer hover:bg-muted/40 hover:text-primary hover:border-primary/50 transition-colors",
                  uploadingDocumento && "opacity-50 pointer-events-none"
                )}>
                  <Plus size={13} />
                  <span className="text-[11px] font-semibold">
                    {uploadingDocumento ? 'Subiendo...' : 'Añadir'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadDocumento(file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </Card>

        {/* Dialog de confirmación para eliminar documento */}
        <Dialog open={!!docToDelete} onOpenChange={(open) => { if (!open) setDocToDelete(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">
                ¿Eliminar documento adjunto?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-1">
                Esta acción eliminará físicamente el archivo "{docToDelete?.nombre}" de Cloudflare R2 / almacén local. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDocToDelete(null)}
                className="text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={uploadingDocumento}
                onClick={async () => {
                  if (docToDelete) {
                    const target = docToDelete;
                    setDocToDelete(null);
                    await handleQuitarDocumento(target);
                  }
                }}
                className="text-xs font-bold gap-1"
              >
                <Trash size={14} /> Eliminar documento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmación para borrar Venta definitivamente */}
        <Dialog open={confirmDeleteVenta} onOpenChange={setConfirmDeleteVenta}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Borrar Comanda</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas borrar permanentemente esta comanda y ocultarla de la lista? Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDeleteVenta(false)}>Cancelar</Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={handleDeleteVenta}>
                {saving ? 'Borrando...' : 'Borrar definitivamente'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Historial de movimientos — sub-cards cronológicas */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider px-1">
            Historial
          </span>
          {[...movimientos].reverse().map(m => (
            <MovimientoHistorialCard
              key={m.id}
              ventaId={venta.id}
              movimiento={m}
              allMovimientos={movimientos}
              icon={MOVIMIENTO_ICON[m.tipo]}
              label={MOVIMIENTO_LABEL[m.tipo]}
              colorClasses={MOVIMIENTO_COLOR[m.tipo]}
            />
          ))}
        </div>
      </div>

      {/* Barra de acción — Diseño Minimalista y Limpio */}
      {accionActiva && (
        <div className="shrink-0 border-t border-border bg-card p-4 flex flex-col gap-3">
          {/* Fila superior: Tabs minimalistas a la izquierda + Botón Confirmar a la derecha */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-1 min-w-0">
              {accionesDisponibles.map(a => {
                const Icon = ACCION_ICON[a];
                const active = a === accionActiva;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAccion(a)}
                    title={ACCION_LABEL[a]}
                    className={cn(
                      "rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 border",
                      active
                        ? cn(ACCION_COLOR[a], "px-3 py-1.5 text-white shadow-2xs font-extrabold")
                        : "p-2 bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon size={17} weight={active ? "bold" : "regular"} />
                    {active && <span>{ACCION_LABEL[a]}</span>}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              onClick={handleConfirmar}
              disabled={saving}
              className={cn("font-bold text-xs h-9 px-4 rounded-full cursor-pointer shrink-0 transition-all shadow-xs",
                ACCION_COLOR[accionActiva]
              )}
            >
              {saving ? 'Guardando...' : `Confirmar ${ACCION_LABEL[accionActiva]}`}
            </Button>
          </div>

          {/* Formulario minimalista de la acción seleccionada */}
          <div className="flex flex-col gap-3">
            {accionActiva === 'pago' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Monto</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" placeholder="0.00" value={montoPago}
                      onChange={(e) => setMontoPago(e.target.value)}
                      className="h-9 text-xs font-bold"
                    />
                    {item.saldo > 0.01 && (
                      <button
                        type="button"
                        onClick={() => setMontoPago(item.saldo.toFixed(2))}
                        title={`Usar saldo pendiente ($${item.saldo.toFixed(2)})`}
                        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <CurrencyDollar size={16} weight="bold" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Método de pago</span>
                  <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as typeof metodoPago)}>
                    <SelectTrigger className="w-full h-9 text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['efectivo', 'tarjeta', 'transferencia', 'otros'] as const).map(m => (
                        <SelectItem key={m} value={m} className="text-xs font-medium">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {metodoPago === 'transferencia' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-muted-foreground">Banco</span>
                      <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                        <SelectTrigger className="w-full h-9 text-xs font-bold">
                          <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos'} />
                        </SelectTrigger>
                        <SelectContent>
                          {bancos.map(b => (
                            <SelectItem key={b} value={b} className="text-xs font-medium">{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-muted-foreground">N.º Comprobante</span>
                      <Input
                        type="text" placeholder="Ej. 000123456" value={numeroComprobanteTransf}
                        onChange={(e) => setNumeroComprobanteTransf(e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                    </div>
                  </>
                )}

                {metodoPago === 'tarjeta' && (
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground">Red de cobro</span>
                    <Select value={redTarjeta || undefined} onValueChange={setRedTarjeta}>
                      <SelectTrigger className="w-full h-9 text-xs font-bold">
                        <SelectValue placeholder={redesTarjeta.length ? 'Selecciona' : 'Sin redes'} />
                      </SelectTrigger>
                      <SelectContent>
                        {redesTarjeta.map(r => (
                          <SelectItem key={r} value={r} className="text-xs font-medium">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="col-span-2 flex flex-col gap-2 mt-2 pt-2 border-t border-border/50">
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      checked={ajustarVentaPago}
                      onChange={(e) => setAjustarVentaPago(e.target.checked)}
                    />
                    <span className="text-xs font-bold text-foreground select-none">Ajustar venta para evitar excedente</span>
                  </label>
                  {ajustarVentaPago && (
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[11px] font-bold text-muted-foreground">Motivo del ajuste</span>
                      <Input
                        type="text" placeholder="Ej. Propina, recargo adicional..." value={motivoAjustePago}
                        onChange={(e) => setMotivoAjustePago(e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {accionActiva === 'ajuste' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Monto (+ aumentar, - reducir)</span>
                  <Input
                    type="number" placeholder="0.00" value={montoAjuste}
                    onChange={(e) => setMontoAjuste(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Motivo (opcional)</span>
                  <Textarea
                    placeholder="Describe el motivo del ajuste..." value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    className="min-h-12 text-xs resize-none"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'anclar' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Número de factura</span>
                  <Input
                    type="text" placeholder="Ej. F-001-00023" value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
                </div>
                
                {(() => {
                  const pagosDisponibles = movimientos.filter(m => m.tipo === 'pago' && !m.anulado && m.monto);
                  if (pagosDisponibles.length === 0) return null;
                  
                  return (
                    <div className="flex flex-col gap-2 p-3 bg-muted/30 border border-border/50 rounded-xl mt-1">
                      <span className="text-[11px] font-bold text-foreground">Pagos asociados a esta factura (opcional)</span>
                      <div className="flex flex-col gap-2">
                        {pagosDisponibles.map(pago => (
                          <label key={pago.id} className="flex items-center gap-2 cursor-pointer w-fit group">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              checked={pagosSeleccionados.has(pago.id)}
                              onChange={(e) => {
                                const next = new Set(pagosSeleccionados);
                                if (e.target.checked) next.add(pago.id);
                                else next.delete(pago.id);
                                setPagosSeleccionados(next);
                              }}
                            />
                            <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors select-none">
                              ${pago.monto?.toFixed(2)} - {pago.metodo_pago} {dayjs(pago.fecha).format('(DD/MM HH:mm)')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {accionActiva === 'reembolsar' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Monto a reembolsar</span>
                  <Input
                    type="number" placeholder="0.00" value={montoReembolso}
                    onChange={(e) => setMontoReembolso(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Motivo (opcional)</span>
                  <Textarea
                    placeholder="Describe el motivo..." value={motivoReembolso}
                    onChange={(e) => setMotivoReembolso(e.target.value)}
                    className="min-h-12 text-xs resize-none"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'marcar_credito' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground">Motivo (opcional)</span>
                  <Input
                    type="text" placeholder="Ej. acuerdo de crédito" value={motivoCredito}
                    onChange={(e) => setMotivoCredito(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'comentario' && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted-foreground">Comentario</span>
                <Textarea
                  placeholder="Escribe una observación..." value={textoComentario}
                  onChange={(e) => setTextoComentario(e.target.value)}
                  className="min-h-14 text-xs resize-none"
                />
              </div>
            )}

            {accionActiva === 'anular' && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted-foreground">Motivo de anulación</span>
                <Input
                  type="text" placeholder="Ej. error en cobro" value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  className="h-9 text-xs font-bold"
                />
              </div>
            )}

            {/* Comprobante opcional (si aplica) — deshabilitado para pagos en
                efectivo, que no tienen comprobante que subir. */}
            {ACCIONES_CON_COMPROBANTE.includes(accionActiva) && (
              <label
                title={comprobanteDeshabilitado ? 'Un pago en efectivo no requiere comprobante' : undefined}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground transition-all h-9 text-xs font-semibold w-full",
                  comprobanteDeshabilitado
                    ? "opacity-50 cursor-not-allowed"
                    : cn("cursor-pointer hover:bg-muted", comprobanteFile && "border-primary text-primary font-bold bg-primary/5")
                )}
              >
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar comprobante (opcional)'}</span>
                <input
                  type="file" accept="image/*,application/pdf" className="hidden"
                  disabled={comprobanteDeshabilitado}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setComprobanteFile(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
