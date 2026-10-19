import { useState } from 'react';
import { limpiarReferencia } from '../../lib/nombreMesa';
import {
  Receipt, Prohibit, Paperclip, Trash,
  CurrencyDollar, ArrowUp, ArrowDown, Percent, FileText, XCircle, CreditCard, ChatText,
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
import { VentaEstadia } from './VentaEstadia';
import { VentaAccionesBar } from './VentaAccionesBar';
import { MovimientoHistorialCard } from './MovimientoHistorialCard';
import { VentaComandasPanel } from './VentaComandasPanel';
import { VentaReservasHotelPanel } from './VentaReservasHotelPanel';
import { useComandasDeVenta } from '../../hooks/useComandasDeVenta';
import { ORIGEN_BORDE, ORIGEN_FONDO, ORIGEN_ICON, ORIGEN_LABEL, ORIGEN_TEXTO } from '../Common/OrigenBadge';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import type { VentaMovimientoTipo } from '../../db/rxdb';

interface VentaDetalleAccionesProps {
  item: VentaConMovimientos;
}

const MOVIMIENTO_ICON: Record<VentaMovimientoTipo, typeof Receipt> = {
  ajuste: ArrowUp,
  pago: CurrencyDollar,
  reembolso: ArrowDown,
  retencion: Percent,
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
  retencion: 'Retención',
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
  retencion: 'bg-info/15 text-info-foreground',
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
type PestanaVenta = 'historial' | 'archivos' | 'comandas' | 'reservas';
const pestanasDe = (esHotel: boolean): Array<[PestanaVenta, string]> => [
  ['historial', 'Historial'], ['archivos', 'Archivos'], ['comandas', 'Comandas'], ...(esHotel ? [['reservas', 'Reservas Hotel'] as [PestanaVenta, string]] : []),
];

export function VentaDetalleAcciones({ item }: VentaDetalleAccionesProps) {
  
  const { venta, movimientos } = item;

  const [uploadingDocumento, setUploadingDocumento] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; url: string; nombre: string; origen: string } | null>(null);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const { clientes } = useRxClientes();
  const clienteVenta = venta.cliente_id ? clientes.find((c: any) => c.id === venta.cliente_id) : undefined;
  // Pestaña del detalle: movimientos de la venta o las comandas vinculadas.
  const [pestana, setPestana] = useState<'historial' | 'archivos' | 'comandas' | 'reservas'>('historial');
  const [cantidadReservas, setCantidadReservas] = useState(0);
  const esHotel = venta.origen === 'reserva_hotel';
  const comandasDeVenta = useComandasDeVenta(venta, movimientos);
  const cantidadComandas = comandasDeVenta.length;
  const [checkingSync, setCheckingSync] = useState(false);
  const [syncResult, setSyncResult] = useState<'ok' | 'reintentado' | 'error' | null>(null);

  

  const handleVerificarSync = async () => {
    setCheckingSync(true);
    setSyncResult(null);
    try {
      const resultado = await verificarSyncVenta(venta.id);
      if (resultado.enSupabase) {
        setSyncResult('ok');
        showToast.success('Venta sincronizada','Ya está guardada en la nube.');
      } else if (resultado.reintentado) {
        setSyncResult('reintentado');
        showToast.info('Venta reenviada','No estaba sincronizada; se espera la confirmación.');
      } else {
        setSyncResult('error');
        showToast.error(resultado.error || 'No se pudo verificar la sincronización');
      }
    } catch (e) {
      console.error(e);
      setSyncResult('error');
      showToast.fallo('verificar la sincronización', e);
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
      showToast.fallo('eliminar el documento', e);
    } finally {
      setUploadingDocumento(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background-sunken">
      {/* Header fijo, del mismo alto que la fila de filtros: el cliente de la venta, con un botón para ver sus datos. */}
      <div className="h-16 px-6 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="min-w-0 mr-auto flex flex-col">
          <span className="font-redonda t-titulo uppercase text-secondary-foreground truncate select-text">{venta.cliente_nombre || 'Sin cliente'}</span>
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
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
        {/* Resumen de la venta en una tarjeta (mismo estilo que las del historial): junta la información inicial para
            leerla de una vez. A la izquierda título + origen; a la derecha monto y saldo. Las cifras solo se tiñen cuando hay algo que atender (saldo pendiente o excedente); en cero se apagan. */}
        <div className={cn("@container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border px-5 py-4 shadow-2xs", item.anulado ? "bg-muted border-border" : cn(ORIGEN_FONDO[venta.origen], ORIGEN_BORDE[venta.origen]))}>
          <div className="flex flex-col items-start gap-2 min-w-0 flex-1 basis-36">
            <h3 title={limpiarReferencia(venta.referencia) || undefined} className="t-titulo text-foreground line-clamp-3 select-text">{limpiarReferencia(venta.referencia) || '—'}</h3>
            <span className={cn("flex items-center gap-1.5 t-cuerpo-fuerte", item.anulado ? "text-muted-foreground" : ORIGEN_TEXTO[venta.origen])}>
              {(() => { const IconoOrigen = ORIGEN_ICON[venta.origen]; return <IconoOrigen size={18} weight="bold" className="shrink-0" />; })()}
              {ORIGEN_LABEL[venta.origen]}
            </span>
            {/* Reserva de hotel: la estadía va aquí, en la misma tarjeta, con un lápiz para editarla. */}
            {venta.origen === 'reserva_hotel' && !item.anulado && <VentaEstadia key={`${venta.id}-${venta.llegada ?? ''}-${venta.salida ?? ''}`} venta={venta} />}
          </div>

          {/* Monto y saldo siempre en dos filas (etiqueta a la izquierda, valor a la derecha): ocupan poco ancho y le dejan el espacio al
              título y a la estadía. */}
          <div className="flex flex-col rounded-2xl bg-card/70 divide-y divide-border/70 shrink-0 min-w-44">
            <div className="flex items-baseline justify-between gap-4 px-4 py-2">
              <span className="t-etiqueta text-muted-foreground">Monto</span>
              <span className="font-redonda t-valor text-foreground tabular-nums">${item.montoTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-2">
              <span className="t-etiqueta text-muted-foreground">Saldo</span>
              {item.saldo > 0.01 ? (
                <span className="font-redonda t-valor text-warning-foreground tabular-nums">${item.saldo.toFixed(2)}</span>
              ) : item.saldo < -0.01 ? (
                <span className="font-redonda t-valor text-info-foreground tabular-nums">+${Math.abs(item.saldo).toFixed(2)}</span>
              ) : (
                <span className="font-redonda t-valor text-muted-foreground tabular-nums">$0.00</span>
              )}
            </div>
          </div>

          {item.anulado && (
            <div className="basis-full flex flex-col gap-1.5 rounded-2xl bg-destructive/10 px-4 py-3">
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

        {/* Pestañas: historial de movimientos / archivos / comandas de la venta */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 w-fit">
              {pestanasDe(esHotel).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPestana(id)}
                  className={cn('px-4 py-1.5 rounded-2xl t-dato cursor-pointer transition-colors',
                    pestana === id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                  {(id === 'comandas' ? cantidadComandas : id === 'archivos' ? item.documentosAdjuntos.length : id === 'reservas' ? cantidadReservas : 0) > 0 && (
                    <span className={cn('ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full t-dato tabular-nums',
                      pestana === id ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground')}>
                      {id === 'comandas' ? cantidadComandas : id === 'reservas' ? cantidadReservas : item.documentosAdjuntos.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleVerificarSync}
              disabled={checkingSync}
              title="Verificar si esta venta está sincronizada en Supabase"
              className={cn(
                "shrink-0 gap-1.5 t-meta text-muted-foreground hover:text-foreground",
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
                  <div key={doc.id} className="group flex items-center gap-3 rounded-2xl bg-card shadow-2xs px-4 py-3">
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
          {pestana === 'reservas' && esHotel && <VentaReservasHotelPanel ventaId={venta.id} onCantidad={setCantidadReservas} />}
          {pestana === 'comandas' && <VentaComandasPanel relacionadas={comandasDeVenta} />}
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
