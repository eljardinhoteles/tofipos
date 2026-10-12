import { useState, useEffect } from 'react';
import { limpiarReferencia } from '../../lib/nombreMesa';
import {
  Receipt, Prohibit, Paperclip, Trash, Plus,
  CurrencyDollar, ArrowUp, ArrowDown, FileText, XCircle, CreditCard, ChatText,
  CloudCheck, CloudWarning, ArrowsClockwise,
} from '@phosphor-icons/react';
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
import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { useAuth } from '../../context/AuthContext';
import { useRxClientes } from '../../hooks/useRxClientes';
import { documentoCliente } from '../../lib/documentoCliente';
import { EstadoBadge } from '../Common/EstadoBadge';
import { agregarVentaMovimiento, updateRxVenta, adjuntarComprobanteMovimiento, verificarSyncVenta } from '../../db/rxdb';
import { subirComprobante, eliminarComprobante, resolverComprobanteUrl } from '@/lib/comprobantes';
import { VentaClienteCard } from './VentaClienteCard';
import { VentaAccionesBar } from './VentaAccionesBar';
import { MovimientoHistorialCard } from './MovimientoHistorialCard';
import { VentaComandasPanel } from './VentaComandasPanel';
import { OrigenBadge } from '../Common/OrigenBadge';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import type { VentaMovimientoTipo } from '../../db/rxdb';

interface VentaDetalleAccionesProps {
  item: VentaConMovimientos;
}

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
// monto, morado = facturación, rojo = cambio de tipo a crédito, gris =
// informativo, negro = anulación de la venta completa.
const MOVIMIENTO_COLOR: Record<VentaMovimientoTipo, string> = {
  pago: 'bg-muted text-muted-foreground',
  reembolso: 'bg-warning-soft text-warning-foreground',
  ajuste: 'bg-info/15 text-info-foreground',
  anclar: 'bg-special-soft text-special-foreground',
  facturar: 'bg-special-soft text-special-foreground',
  marcar_credito: 'bg-destructive-soft text-destructive',
  comentario: 'bg-muted text-muted-foreground',
  anular: 'bg-foreground/10 text-foreground',
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
  
  const { venta, movimientos } = item;

  const [uploadingDocumento, setUploadingDocumento] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; url: string; nombre: string; origen: string } | null>(null);
  const [confirmDeleteVenta, setConfirmDeleteVenta] = useState(false);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const { clientes } = useRxClientes();
  const clienteVenta = venta.cliente_id ? clientes.find((c: any) => c.id === venta.cliente_id) : undefined;
  const [saving, setSaving] = useState(false);
  // Pestaña del detalle: movimientos de la venta o las comandas vinculadas.
  const [pestana, setPestana] = useState<'historial' | 'comandas'>('historial');
  const [checkingSync, setCheckingSync] = useState(false);
  const [syncResult, setSyncResult] = useState<'ok' | 'reintentado' | 'error' | null>(null);

  

  useEffect(() => {
    setSyncResult(null);
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

  const handleDeleteVenta = async () => {
    setSaving(true);
    try {
      const rxDb = await import('../../db/rxdb').then(m => m.initVerticalRxDb());
      const doc = await rxDb.ventas.findOne(venta.id).exec();
      if (doc) {
        await doc.update({ $set: { _deleted: true, _modified: new Date().toISOString() } } as any);
        showToast.success('Venta borrada permanentemente');
        setConfirmDeleteVenta(false);
      }
    } catch (e) {
      console.error(e);
      showToast.error('Error al borrar la venta');
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header fijo, del mismo alto que la fila de filtros: el cliente de la venta, con un botón para ver sus datos. */}
      <div className="h-16 px-6 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="min-w-0 mr-auto flex flex-col">
          <span className="t-titulo uppercase text-secondary-foreground truncate">{venta.cliente_nombre || 'Sin cliente'}</span>
          <span className="t-meta text-muted-foreground truncate">{(clienteVenta && documentoCliente(clienteVenta)) || 'Sin documento'}</span>
        </div>
        <EstadoBadge tono={venta.tipo === 'credito' ? 'destructive' : 'success'}>{venta.tipo === 'credito' ? 'Crédito' : 'Directa'}</EstadoBadge>
        <Button type="button" variant="outline" size="icon" aria-expanded={clienteAbierto} aria-label={clienteAbierto ? 'Ocultar datos del cliente' : 'Ver datos del cliente'}
          title={clienteAbierto ? 'Ocultar datos del cliente' : 'Ver datos del cliente'}
          onClick={() => setClienteAbierto(v => !v)} className="shrink-0">
          <CaretDown size={16} weight="bold" className={cn("transition-transform duration-200", clienteAbierto && "rotate-180")} />
        </Button>
      </div>
      {clienteAbierto && (
        <div className="shrink-0 max-h-[45%] overflow-y-auto px-6 py-4 bg-card border-b border-border select-text animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none">
          <VentaClienteCard venta={venta} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {/* Card de resumen del Header de Venta */}
        <Card className="gap-0 py-0 overflow-visible">
          {/* Bloque 1: Identidad — referencia con el badge de origen a su derecha; el estado Anulado, si aplica, debajo */}
          <div className="flex flex-col gap-1.5 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="t-cuerpo-fuerte line-clamp-2 min-w-0">{limpiarReferencia(venta.referencia) || '—'}</CardTitle>
              <OrigenBadge origen={venta.origen} size="md" className="shrink-0" />
            </div>

            {item.anulado && (
              <div className="flex items-center gap-1 bg-destructive/10 rounded-full pr-0.5 w-fit self-end">
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

          {/* Bloque 2: Montos — monto de venta y saldo, dato financiero clave, con más peso visual */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-muted/40">
            <div className="flex flex-col gap-0.5">
              <span className="t-etiqueta text-muted-foreground">Monto de Venta</span>
              <span className="t-cifra text-foreground tracking-tight">${item.montoTotal.toFixed(2)}</span>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <span className="t-etiqueta text-muted-foreground">Saldo</span>
              {item.saldo > 0.01 ? (
                <span className="t-cuerpo-fuerte text-warning-foreground">
                  ${item.saldo.toFixed(2)}
                </span>
              ) : item.saldo < -0.01 ? (
                <span className="t-cuerpo-fuerte text-info-foreground">
                  Excedente ${Math.abs(item.saldo).toFixed(2)}
                </span>
              ) : (
                <span className="t-cuerpo-fuerte text-foreground">
                  Saldado ($0.00)
                </span>
              )}
            </div>
          </div>

          {/* Motivo de Anulación: crítico cuando aplica, pegado al bloque financiero */}
          {item.anulado && item.motivoAnulacion && (
            <div className="flex flex-col gap-1.5 px-5 py-3 bg-destructive/10 border-t border-destructive/15 ">
              <div className="flex items-center gap-1.5 text-destructive ">
                <Prohibit size={14} weight="bold" />
                <span className="t-etiqueta">Motivo de Anulación</span>
              </div>
              <p className="t-meta text-destructive leading-relaxed">
                {item.motivoAnulacion}
              </p>
            </div>
          )}

          {/* Bloque 4: Archivos, minimalista — solo lista + link añadir, sin grid de tarjetas */}
          <div className="flex flex-col gap-2 px-5 py-4 border-t border-border">

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {item.documentosAdjuntos.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex items-center gap-1.5 p-2 rounded-2xl bg-muted/40 hover:bg-muted transition-colors"
                >
                  <a
                    href={resolverComprobanteUrl(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    title={doc.nombre}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Paperclip size={13} className="shrink-0" />
                    <span className="truncate t-dato">{doc.nombre}</span>
                  </a>

                  {!item.anulado && (
                    <button
                      type="button"
                      onClick={() => setDocToDelete(doc)}
                      disabled={uploadingDocumento}
                      title="Eliminar archivo"
                      className="shrink-0 p-0.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-background transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={12} />
                    </button>
                  )}
                </div>
              ))}

              {!item.anulado && (
                <label className={cn(
                  "flex items-center justify-center gap-1.5 p-2 rounded-2xl border border-dashed border-border text-muted-foreground cursor-pointer hover:bg-muted/40 hover:text-primary hover:border-primary/50 transition-colors",
                  uploadingDocumento && "opacity-50 pointer-events-none"
                )}>
                  <Plus size={13} />
                  <span className="t-dato">
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
              <DialogTitle className="t-fila text-foreground">
                ¿Eliminar documento adjunto?
              </DialogTitle>
              <DialogDescription className="t-meta text-muted-foreground pt-1">
                Esta acción eliminará físicamente el archivo "{docToDelete?.nombre}" de Cloudflare R2 / almacén local. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDocToDelete(null)}
                className="t-dato"
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
                className="t-dato gap-1"
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
              <DialogTitle>Borrar Venta</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas borrar permanentemente esta venta y ocultarla de la lista? Esta acción no se puede deshacer.
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

        {/* Pestañas: historial de movimientos / comandas de la venta */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-muted w-fit">
              {([['historial', 'Historial'], ['comandas', 'Comandas']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPestana(id)}
                  className={cn('px-4 py-1.5 rounded-2xl t-dato cursor-pointer transition-colors',
                    pestana === id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={handleVerificarSync}
              disabled={checkingSync}
              title="Verificar si esta venta está sincronizada en Supabase"
              className={cn(
                "shrink-0 gap-1.5 text-muted-foreground hover:text-foreground",
                syncResult === 'reintentado' && "text-warning-foreground hover:text-warning-foreground",
                syncResult === 'error' && "text-destructive hover:text-destructive"
              )}
            >
              {checkingSync ? (
                <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
              ) : syncResult === 'ok' ? (
                <CloudCheck size={14} weight="bold" />
              ) : syncResult === 'error' ? (
                <CloudWarning size={14} weight="bold" />
              ) : (
                <ArrowsClockwise size={14} weight="bold" />
              )}
              {checkingSync
                ? 'Verificando...'
                : syncResult === 'ok'
                  ? 'Sincronizada'
                  : syncResult === 'reintentado'
                    ? 'Reenviada'
                    : syncResult === 'error'
                      ? 'Error de sync'
                      : 'Sincronizar'}
            </Button>
          </div>
          {pestana === 'comandas' && <VentaComandasPanel venta={venta} movimientos={movimientos} />}
          {pestana === 'historial' && [...movimientos].reverse().map(m => (
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

      <VentaAccionesBar item={item} />
    </div>
  );
}
