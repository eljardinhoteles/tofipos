import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { limpiarReferencia } from '../../lib/nombreMesa';
import {
  Receipt, Prohibit, Paperclip, Trash,
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
import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { useRxClientes } from '../../hooks/useRxClientes';
import { documentoCliente } from '../../lib/documentoCliente';
import { EstadoBadge } from '../Common/EstadoBadge';
import { updateRxVenta, adjuntarComprobanteMovimiento, verificarSyncVenta } from '../../db/rxdb';
import { eliminarComprobante, resolverComprobanteUrl } from '@/lib/comprobantes';
import { VentaClienteCard } from './VentaClienteCard';
import { VentaAccionesBar } from './VentaAccionesBar';
import { MovimientoHistorialCard } from './MovimientoHistorialCard';
import { VentaComandasPanel, useComandasDeVenta } from './VentaComandasPanel';
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
  
  const { venta, movimientos } = item;

  const [uploadingDocumento, setUploadingDocumento] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; url: string; nombre: string; origen: string } | null>(null);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const { clientes } = useRxClientes();
  const clienteVenta = venta.cliente_id ? clientes.find((c: any) => c.id === venta.cliente_id) : undefined;
  // Pestaña del detalle: movimientos de la venta o las comandas vinculadas.
  const [pestana, setPestana] = useState<'historial' | 'archivos' | 'comandas'>('historial');
  const cantidadComandas = useComandasDeVenta(venta, movimientos).length;
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
          <span className="t-titulo uppercase text-secondary-foreground truncate select-text">{venta.cliente_nombre || 'Sin cliente'}</span>
          <span className="t-meta text-muted-foreground truncate select-text">{(clienteVenta && documentoCliente(clienteVenta)) || 'Sin documento'}</span>
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
        {/* Resumen de la venta en una franja de ancho completo más clara que el fondo de la página (sin tarjeta, borde ni
            sombra): el título con todo el ancho; debajo, el origen a la izquierda y monto y saldo a la derecha. Los archivos viven en su
            propia pestaña. */}
        <div className="flex flex-col gap-3 bg-card/60 -mx-6 -mt-6 px-6 py-5">
          <h3 className="t-titulo text-foreground line-clamp-2 select-text">{limpiarReferencia(venta.referencia) || '—'}</h3>

          {/* Dos filas. Título con todo el ancho; debajo, a la izquierda el badge de origen con la fecha de última actualización y a la
              derecha el resumen de importes como una sola pieza —monto | saldo— con las cifras del mismo tamaño. Las
              cifras solo se tiñen cuando hay algo que atender (saldo pendiente o excedente); en cero se apagan. */}
          <div className="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap">
            <div className="flex flex-col items-start gap-1.5">
              <OrigenBadge origen={venta.origen} size="md" />
              <span className="t-meta text-muted-foreground">Última actualización · {dayjs(item.fechaUltimoMovimiento).format('DD MMM, HH:mm')}</span>
            </div>

            <div className="flex items-stretch rounded-2xl bg-background/80 divide-x divide-border/70">
              <div className="flex flex-col gap-0.5 px-5 py-2.5">
                <span className="t-etiqueta text-muted-foreground">Monto</span>
                <span className="t-valor text-foreground tabular-nums">${item.montoTotal.toFixed(2)}</span>
              </div>
              <div className="flex flex-col gap-0.5 px-5 py-2.5">
                <span className="t-etiqueta text-muted-foreground">Saldo</span>
                {item.saldo > 0.01 ? (
                  <span className="t-valor text-warning-foreground tabular-nums">${item.saldo.toFixed(2)}</span>
                ) : item.saldo < -0.01 ? (
                  <span className="t-valor text-info-foreground tabular-nums">+${Math.abs(item.saldo).toFixed(2)}</span>
                ) : (
                  <span className="t-valor text-foreground/35 tabular-nums">$0.00</span>
                )}
              </div>
            </div>
          </div>

          {item.anulado && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-destructive/10 px-4 py-3">
              <div className="flex items-center gap-1.5 text-destructive">
                <Prohibit size={14} weight="fill" />
                <span className="t-etiqueta">Anulado</span>
              </div>
              {item.motivoAnulacion && <p className="t-meta text-destructive leading-relaxed">{item.motivoAnulacion}</p>}
            </div>
          )}
        </div>

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

        {/* Pestañas: historial de movimientos / comandas de la venta */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 w-fit">
              {([['historial', 'Historial'], ['archivos', 'Archivos'], ['comandas', 'Comandas']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPestana(id)}
                  className={cn('px-4 py-1.5 rounded-2xl t-dato cursor-pointer transition-colors',
                    pestana === id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                  {(id === 'comandas' ? cantidadComandas : id === 'archivos' ? item.documentosAdjuntos.length : 0) > 0 && (
                    <span className={cn('ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full t-dato tabular-nums',
                      pestana === id ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground')}>
                      {id === 'comandas' ? cantidadComandas : item.documentosAdjuntos.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
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
          </div>
          {pestana === 'archivos' && (
            item.documentosAdjuntos.length === 0 ? (
              <p className="t-meta text-muted-foreground py-2">Esta venta no tiene archivos. Adjunta uno desde «Comentar / Adjuntar».</p>
            ) : (
              <div className="flex flex-col gap-2">
                {item.documentosAdjuntos.map((doc) => (
                  <div key={doc.id} className="group flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3">
                    <a
                      href={resolverComprobanteUrl(doc.url)}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir archivo"
                      className="flex items-center gap-3 min-w-0 flex-1 text-foreground hover:text-primary transition-colors"
                    >
                      <Paperclip size={18} className="shrink-0 text-muted-foreground" />
                      <span className="flex flex-col min-w-0">
                        <span className="t-cuerpo-fuerte truncate" title={doc.nombre}>{doc.nombre}</span>
                        <span className="t-meta text-muted-foreground">{doc.origen === 'Venta' ? 'Documento de la venta' : MOVIMIENTO_LABEL[doc.origen as VentaMovimientoTipo] ?? doc.origen}</span>
                      </span>
                    </a>
                    {!item.anulado && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setDocToDelete(doc)} disabled={uploadingDocumento}
                        title="Eliminar archivo" aria-label={`Eliminar ${doc.nombre}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash size={16} weight="bold" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
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
