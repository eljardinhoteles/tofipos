import { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Prohibit, ArrowCounterClockwise, Paperclip, Trash, Plus,
  CurrencyDollar, ArrowUp, ArrowDown, FileText, XCircle, CreditCard, ChatText,
  Table, ForkKnife, BedIcon, Door,
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
import { agregarVentaMovimiento, updateRxVenta, adjuntarComprobanteMovimiento } from '../../db/rxdb';
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
  const { currentMesero } = useAuth();
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
  const [saving, setSaving] = useState(false);
  const [accion, setAccion] = useState<AccionId>('pago');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta.id]);

  useEffect(() => {
    setComprobanteFile(null);
  }, [accionActiva]);

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
    if (await registrar({
      tipo: 'pago',
      monto,
      metodo_pago: metodoPago,
      transferencia_banco: metodoPago === 'transferencia' ? (bancoDestino || undefined) : undefined,
      transferencia_referencia: metodoPago === 'transferencia' ? (numeroComprobanteTransf.trim() || undefined) : undefined,
      tarjeta_red: metodoPago === 'tarjeta' ? (redTarjeta || undefined) : undefined,
      usuario_id: currentMesero?.id,
    })) {
      showToast.success('Pago registrado');
      setMontoPago('');
      setBancoDestino('');
      setNumeroComprobanteTransf('');
      setRedTarjeta('');
    }
  };

  const handleAjuste = async () => {
    const monto = parseFloat(montoAjuste);
    if (!monto) { showToast.error('Ingresa un monto (positivo para aumentar, negativo para reducir)'); return; }
    if (await registrar({ tipo: 'ajuste', monto, motivo: motivoAjuste.trim() || undefined, usuario_id: currentMesero?.id })) {
      showToast.success('Ajuste registrado');
      setMontoAjuste('');
      setMotivoAjuste('');
    }
  };

  const handleFacturar = async () => {
    if (!numeroFactura.trim()) { showToast.error('Ingresa el número de factura'); return; }
    if (await registrar({ tipo: 'anclar', numero_factura: numeroFactura.trim(), usuario_id: currentMesero?.id })) {
      showToast.success('Venta facturada');
      setNumeroFactura('');
    }
  };

  const handleReembolsar = async () => {
    const monto = parseFloat(montoReembolso);
    if (!monto || monto <= 0 || monto > item.totalPagado - item.totalReembolsado) {
      showToast.error('Ingresa un monto de reembolso válido');
      return;
    }
    if (await registrar({ tipo: 'reembolso', monto, motivo: motivoReembolso.trim() || undefined, usuario_id: currentMesero?.id })) {
      showToast.success('Reembolso registrado');
      setMontoReembolso('');
      setMotivoReembolso('');
    }
  };

  const handleMarcarCredito = async () => {
    if (await registrar({ tipo: 'marcar_credito', motivo: motivoCredito.trim() || undefined, usuario_id: currentMesero?.id })) {
      showToast.success('Venta marcada como crédito');
      setMotivoCredito('');
    }
  };

  const handleComentario = async () => {
    if (!textoComentario.trim()) { showToast.error('Escribe un comentario'); return; }
    if (await registrar({ tipo: 'comentario', motivo: textoComentario.trim(), usuario_id: currentMesero?.id })) {
      showToast.success('Comentario agregado');
      setTextoComentario('');
    }
  };

  const handleAnular = async () => {
    if (!motivoAnulacion.trim()) { showToast.error('Ingresa el motivo de anulación'); return; }
    if (await registrar({ tipo: 'anular', motivo: motivoAnulacion.trim(), usuario_id: currentMesero?.id })) {
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
        usuario_id: currentMesero?.id,
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
        <div className="rounded-2xl border border-border bg-card shadow-xs p-5 flex flex-col gap-4">
          {/* Bloque 1: Referencia + Badges (arriba) y Fecha de creación (debajo) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-extrabold text-foreground truncate">{venta.referencia || '—'}</span>
              </div>

              {/* Badges de estado (Origen + Tipo + Facturado + Anulado) */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                {(() => {
                  const OrigenIcon = ORIGEN_ICON[venta.origen];
                  return (
                    <Badge variant="outline" className={cn("font-bold text-xs px-2 py-0.5 gap-1", ORIGEN_CLASSES[venta.origen])}>
                      <OrigenIcon size={12} weight="bold" /> {ORIGEN_LABEL[venta.origen]}
                    </Badge>
                  );
                })()}
                <Badge variant="outline" className={cn("font-bold text-xs px-2 py-0.5",
                  venta.tipo === 'credito' ? "border-rose-200 text-rose-700 bg-rose-50" : "border-border text-muted-foreground")}>
                  {venta.tipo === 'credito' ? <CreditCard size={12} weight="fill" className="mr-1" /> : null} {venta.tipo === 'credito' ? 'Crédito' : 'Directa'}
                </Badge>
                {item.facturado && <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 font-bold text-xs px-2 py-0.5"><Receipt size={12} weight="fill" className="mr-1" /> Facturado</Badge>}
                {item.anulado && (
                  <div className="flex items-center gap-1.5 bg-destructive/10 rounded-full pr-1">
                    <Badge variant="destructive" className="font-bold text-xs px-2 py-0.5 border-0"><Prohibit size={12} weight="fill" className="mr-1" /> Anulado</Badge>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteVenta(true)}
                      className="p-1 rounded-full text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer mr-0.5"
                      title="Borrar definitivamente"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <span className="text-xs font-semibold text-muted-foreground">
              Creada el {dayjs(venta.created_at).format('DD MMM YYYY, HH:mm')}
            </span>
          </div>

          {/* Bloque 2: Monto de venta -------------- Saldo */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/40 border border-border/60">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Monto de Venta</span>
              <span className="text-2xl font-black text-foreground tracking-tight">${item.montoTotal.toFixed(2)}</span>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Saldo</span>
              {item.saldo > 0.01 ? (
                <span className="text-sm font-black text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  ${item.saldo.toFixed(2)}
                </span>
              ) : item.saldo < -0.01 ? (
                <span className="text-sm font-black text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  Excedente ${Math.abs(item.saldo).toFixed(2)}
                </span>
              ) : (
                <span className="text-sm font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Saldado ($0.00)
                </span>
              )}
            </div>
          </div>

          {/* Bloque 3: Datos del Cliente */}
          <VentaClienteCard venta={venta} />

          {/* Bloque 3.5: Motivo de Anulación */}
          {item.anulado && item.motivoAnulacion && (
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50">
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <Prohibit size={14} weight="bold" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Motivo de Anulación</span>
              </div>
              <p className="text-xs font-medium text-red-800 dark:text-red-300 leading-relaxed">
                {item.motivoAnulacion}
              </p>
            </div>
          )}

          {/* Bloque 4: Archivos / Documentos en pequeñas cards rectangulares con placeholder */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
              Archivos ({item.documentosAdjuntos.length})
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {item.documentosAdjuntos.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex items-center justify-between p-2 rounded-xl bg-muted/50 border border-border text-xs font-bold transition-all hover:bg-muted hover:border-primary/40 shadow-2xs"
                >
                  <a
                    href={resolverComprobanteUrl(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    title={doc.nombre}
                    className="flex items-center gap-2 min-w-0 flex-1 text-foreground hover:text-primary transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Paperclip size={14} weight="bold" />
                    </div>
                    <span className="truncate text-[11px] font-extrabold">{doc.nombre}</span>
                  </a>

                  {!item.anulado && (
                    <button
                      type="button"
                      onClick={() => setDocToDelete(doc)}
                      disabled={uploadingDocumento}
                      title="Eliminar archivo"
                      className="p-1 rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 ml-1"
                    >
                      <Trash size={13} weight="bold" />
                    </button>
                  )}
                </div>
              ))}

              {/* Placeholder rectangular para añadir archivo */}
              {!item.anulado && (
                <label className={cn(
                  "flex items-center justify-center gap-2 p-2 rounded-xl border border-dashed border-border bg-muted/20 text-xs font-bold text-muted-foreground cursor-pointer hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-all shadow-2xs min-h-[38px]",
                  uploadingDocumento && "opacity-50 pointer-events-none"
                )}>
                  <Plus size={14} weight="bold" />
                  <span className="text-[11px] font-bold">
                    {uploadingDocumento ? 'Subiendo...' : 'Añadir archivo'}
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
        </div>

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
                  <Input
                    type="number" placeholder="0.00" value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
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
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted-foreground">Número de factura</span>
                <Input
                  type="text" placeholder="Ej. F-001-00023" value={numeroFactura}
                  onChange={(e) => setNumeroFactura(e.target.value)}
                  className="h-9 text-xs font-bold"
                />
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

            {/* Comprobante opcional (si aplica) */}
            {ACCIONES_CON_COMPROBANTE.includes(accionActiva) && (
              <label className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground cursor-pointer hover:bg-muted transition-all h-9 text-xs font-semibold w-full",
                comprobanteFile && "border-primary text-primary font-bold bg-primary/5"
              )}>
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar comprobante (opcional)'}</span>
                <input
                  type="file" accept="image/*,application/pdf" className="hidden"
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
