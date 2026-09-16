import { useState, useEffect } from 'react';
import { Paperclip, XCircle, Prohibit, UploadSimple, Trash, ChatText } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { showToast } from '@/lib/toast';
import { useAuth } from '../../context/AuthContext';
import { anularVentaMovimiento, adjuntarComprobanteMovimiento } from '../../db/rxdb';
import { subirComprobante, eliminarComprobante, resolverComprobanteUrl, resolverComprobanteUrlAsync } from '@/lib/comprobantes';
import { useRxUsuarios } from '@/hooks/useRxUsuarios';
import type { RxVentaMovimiento, VentaMovimientoTipo } from '../../db/rxdb';

interface MovimientoHistorialCardProps {
  ventaId: string;
  movimiento: RxVentaMovimiento;
  allMovimientos?: RxVentaMovimiento[];
  icon: typeof XCircle;
  label: string;
  colorClasses: string;
}

/**
 * Fila de historial de un movimiento — con anular puntual inline (se cargó
 * un dato mal): el registro nunca se borra, solo se marca `anulado` y
 * más (monto, motivo, fecha quedan intactos como evidencia), solo se
 * excluye de los cálculos derivados (ver useVentasConMovimientos).
 * Único movimiento que no admite anularse a sí mismo es 'anular' (la anulación de la venta completa).
 */
export function MovimientoHistorialCard({ ventaId, movimiento: m, allMovimientos, icon: Icon, label, colorClasses }: MovimientoHistorialCardProps) {
  const { currentMesero, adminUser } = useAuth();
  const { usuarios } = useRxUsuarios();
  const [confirmando, setConfirmando] = useState(false);
  const [dialogDeleteOpen, setDialogDeleteOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const autorDoc = m.usuario_id ? usuarios.find((u: any) => u.id === m.usuario_id || u.user_id === m.usuario_id) : undefined;
  
  let adminName = '';
  if (m.usuario_id === adminUser?.id) {
    adminName = adminUser?.user_metadata?.full_name || adminUser?.email?.split('@')[0] || 'Administrador';
  }

  const autorNombre = autorDoc?.nombre 
    || (m.usuario_id === currentMesero?.id ? currentMesero?.nombre : '')
    || adminName
    || (m.usuario_id ? 'Usuario' : '');

  const puedeAnularse = m.tipo !== 'anular' && !m.anulado;
  const admiteComprobante = !m.anulado && ['pago', 'ajuste', 'reembolso', 'anclar'].includes(m.tipo);

  let montoAsociado = 0;
  if (m.pagos_asociados && m.pagos_asociados.length > 0 && allMovimientos) {
    montoAsociado = m.pagos_asociados.reduce((sum, pagoId) => {
      const pago = allMovimientos.find(x => x.id === pagoId);
      return sum + (pago?.monto || 0);
    }, 0);
  }

  const [comprobanteDisplayUrl, setComprobanteDisplayUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (m.comprobante_url) {
      resolverComprobanteUrlAsync(m.comprobante_url).then((res) => {
        if (active) setComprobanteDisplayUrl(res);
      });
    } else {
      setComprobanteDisplayUrl('');
    }
    return () => { active = false; };
  }, [m.comprobante_url]);

  const handleAdjuntarComprobante = async (file: File) => {
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    setUploading(true);
    try {
      const url = await subirComprobante(file, orgId, ventaId);
      await adjuntarComprobanteMovimiento(ventaId, m.id, url);
      showToast.success('Comprobante adjuntado');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo adjuntar el comprobante');
    } finally {
      setUploading(false);
    }
  };

  const handleQuitarComprobante = async () => {
    setUploading(true);
    try {
      if (m.comprobante_url) {
        await eliminarComprobante(m.comprobante_url);
      }
      await adjuntarComprobanteMovimiento(ventaId, m.id, null);
      showToast.success('Comprobante eliminado');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo eliminar el comprobante');
    } finally {
      setUploading(false);
    }
  };

  const handleAnular = async () => {
    if (!motivo.trim()) { showToast.error('Ingresa el motivo de anulación'); return; }
    setSaving(true);
    try {
      await anularVentaMovimiento(ventaId, m.id, motivo.trim(), currentMesero?.id);
      showToast.success('Movimiento anulado');
      setConfirmando(false);
      setMotivo('');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo anular el movimiento');
    } finally {
      setSaving(false);
    }
  };

  const isOffline = m.comprobante_url?.startsWith('offline-file://');
  const fileUrl = m.comprobante_url ? (comprobanteDisplayUrl || resolverComprobanteUrl(m.comprobante_url)) : '';
  const isPdf = m.comprobante_url?.toLowerCase().endsWith('.pdf');

  if (m.tipo === 'ajuste') {
    return (
      <div className={cn(
        "group relative flex items-center justify-between py-1.5 px-2 transition-all rounded-md",
        m.anulado ? "opacity-60 bg-muted/20" : "hover:bg-muted/50"
      )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Icon size={14} weight="bold" className={m.anulado ? "text-muted-foreground" : "text-blue-600"} />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn("text-xs font-semibold", m.anulado ? "text-muted-foreground line-through" : "text-foreground")}>
                Ajuste {m.monto! > 0 ? '+' : '-'}${Math.abs(m.monto || 0).toFixed(2)}
              </span>
              {m.motivo && (
                <span className={cn("text-[11px] truncate", m.anulado ? "text-muted-foreground" : "text-muted-foreground")}>
                  ({m.motivo})
                </span>
              )}
              {autorNombre && (
                <span className={cn("text-[10px] truncate ml-1 opacity-0 group-hover:opacity-70 transition-opacity", m.anulado ? "text-muted-foreground" : "text-muted-foreground")}>
                  • por {autorNombre}
                </span>
              )}
            </div>
            {m.anulado && m.anulado_motivo && (
              <span className="text-[10px] text-destructive font-medium italic truncate">
                Anulado: {m.anulado_motivo}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground/70">
            {dayjs(m.fecha).format('DD MMM, HH:mm')}
          </span>

          {m.anulado && (
            <Badge variant="outline" className="text-[9px] font-bold border-gray-300 text-gray-600 bg-gray-100 px-1.5 py-0">
              Anulado
            </Badge>
          )}

          {puedeAnularse && !confirmando && (
            <button
              type="button" onClick={() => setConfirmando(true)}
              title="Anular este ajuste"
              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            >
              <Prohibit size={13} weight="bold" />
            </button>
          )}
        </div>

        {confirmando && (
          <div className="absolute right-0 top-full mt-1 z-10 bg-card border border-border shadow-lg rounded-lg p-2 flex items-center gap-2">
            <Input
              type="text" placeholder="Motivo de anulación" value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="h-7 text-xs w-40 bg-background"
            />
            <Button type="button" variant="destructive" size="sm" onClick={handleAnular} disabled={saving} className="h-7 text-xs font-bold shrink-0">
              Confirmar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setConfirmando(false); setMotivo(''); }} className="h-7 text-xs shrink-0">
              Cancelar
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (m.tipo === 'comentario') {
    return (
      <div className={cn(
        "group relative rounded-xl p-2.5 flex flex-col gap-2 transition-all",
        m.anulado ? "opacity-60" : "hover:bg-amber-50/40"
      )}>
        <div className="flex items-center justify-between gap-2.5">
          {/* Izquierda: Icono + Texto del comentario + Autor */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              m.anulado ? "text-muted-foreground" : "text-amber-700"
            )}>
              <ChatText size={16} weight="bold" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <p className={cn("text-xs font-bold italic truncate", m.anulado ? "text-muted-foreground line-through" : "text-amber-950")}>
                "{m.motivo || 'Sin texto'}"
              </p>
              {autorNombre && (
                <span className={cn("text-[10px] font-extrabold truncate opacity-0 group-hover:opacity-100 transition-opacity", m.anulado ? "text-muted-foreground/60" : "text-amber-800/80")}>
                  por {autorNombre}
                </span>
              )}
            </div>
          </div>

          {/* Derecha: Fecha/Hora + Icono de anular */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-[10px] font-extrabold", m.anulado ? "text-muted-foreground/70" : "text-amber-800/70")}>
              {dayjs(m.fecha).format('DD MMM, HH:mm')}
            </span>

            {m.anulado && (
              <Badge variant="outline" className="text-[9px] font-bold border-gray-300 text-gray-600 bg-gray-100 px-1.5 py-0">
                Anulado
              </Badge>
            )}

            {puedeAnularse && !confirmando && (
              <button
                type="button" onClick={() => setConfirmando(true)}
                title="Anular este comentario"
                className="p-1 text-amber-800/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              >
                <Prohibit size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {m.anulado && m.anulado_motivo && (
          <span className="text-[10px] text-destructive font-medium italic truncate pl-10">
            Anulado: {m.anulado_motivo}
          </span>
        )}

        {confirmando && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <Input
              type="text" placeholder="Motivo de anulación" value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="h-7 text-xs flex-1 bg-background"
            />
            <Button type="button" variant="destructive" size="sm" onClick={handleAnular} disabled={saving} className="h-7 text-xs font-bold shrink-0">
              Confirmar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setConfirmando(false); setMotivo(''); }} className="h-7 text-xs shrink-0">
              Cancelar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative rounded-xl border border-border bg-card p-2.5 flex flex-col gap-2 transition-all shadow-2xs hover:border-primary/40 hover:shadow-xs",
      m.anulado && "opacity-60 bg-muted/20"
    )}>
      {/* Fila única de contenido */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Thumbnail con Badge de Icono de Tipo de Movimiento */}
        {admiteComprobante && m.comprobante_url ? (
          <div className="relative shrink-0">
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              title="Ver comprobante"
              className="w-11 h-11 rounded-lg border border-border bg-muted/40 overflow-hidden block cursor-pointer"
            >
              {comprobanteDisplayUrl && !isPdf ? (
                <img
                  src={comprobanteDisplayUrl}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Paperclip size={18} className="text-primary" />
                </div>
              )}
            </a>

            {/* Insignia circular con el Icono del Tipo de Movimiento en la esquina inferior derecha */}
            <div className={cn(
              "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-background flex items-center justify-center shadow-xs text-white",
              m.anulado ? "bg-muted-foreground" : colorClasses
            )} title={label}>
              <Icon size={10} weight="bold" />
            </div>
          </div>
        ) : (
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs font-bold",
            m.anulado ? "bg-muted text-muted-foreground" : colorClasses
          )}>
            <Icon size={16} weight="bold" />
          </div>
        )}

        {/* Texto central: Label + Detalle */}
        <div className="flex flex-col min-w-0 flex-1 justify-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("text-xs font-black text-foreground tracking-tight truncate flex items-center gap-1", m.anulado && "line-through")}>
              {label}
            </span>
            {m.monto != null && m.monto !== 0 && (
              <span className="text-xs font-black text-primary shrink-0">${m.monto.toFixed(2)}</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground truncate font-medium flex items-center gap-1.5">
            <span className="truncate">
              {m.motivo || m.numero_factura || (m.metodo_pago ? `Método: ${m.metodo_pago}` : 'Movimiento de venta')}
            </span>
            {montoAsociado > 0 && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 border-l border-border pl-1.5 shrink-0">
                Cubre ${montoAsociado.toFixed(2)}
              </span>
            )}
            {autorNombre && (
              <span className="text-[10px] opacity-0 group-hover:opacity-70 transition-opacity border-l border-border pl-1.5 shrink-0">por {autorNombre}</span>
            )}
          </span>
        </div>

        {/* Bloque derecho: Fecha + Badges + Botón de Basura en 1 fila */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground/70 hidden sm:inline">
            {dayjs(m.fecha).format('DD MMM, HH:mm')}
          </span>

          {/* Badge de almacenamiento y botón de eliminar */}
          {admiteComprobante && m.comprobante_url && (
            <div className="flex items-center gap-1.5">
              {isOffline ? (
                <Badge variant="outline" className="text-[9px] font-bold border-amber-300 text-amber-700 bg-amber-50 gap-1 px-1.5 py-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Local
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] font-bold border-emerald-300 text-emerald-700 bg-emerald-50 gap-1 px-1.5 py-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  R2
                </Badge>
              )}

              <button
                type="button"
                onClick={() => setDialogDeleteOpen(true)}
                disabled={uploading}
                title="Eliminar comprobante"
                className="p-1 rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <Trash size={13} weight="bold" />
              </button>
            </div>
          )}

          {/* Botón rápido para adjuntar cuando no hay comprobante */}
          {admiteComprobante && !m.comprobante_url && (
            <label className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 border border-dashed border-border text-[10px] font-bold text-muted-foreground cursor-pointer hover:bg-muted hover:border-primary/40 transition-all",
              uploading && "opacity-50 pointer-events-none"
            )}>
              <UploadSimple size={12} weight="bold" className="text-primary" />
              {uploading ? '...' : 'Adjuntar'}
              <input
                type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAdjuntarComprobante(file);
                }}
              />
            </label>
          )}

          {puedeAnularse && !confirmando && (
            <button
              type="button" onClick={() => setConfirmando(true)}
              title="Anular este movimiento"
              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            >
              <Prohibit size={14} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {m.anulado && (
        <span className="text-[10px] text-destructive font-medium italic truncate pl-11">
          Anulado: {m.anulado_motivo}
        </span>
      )}

      {confirmando && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <Input
            type="text" placeholder="Motivo de anulación" value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="h-7 text-xs flex-1"
          />
          <Button type="button" variant="destructive" size="sm" onClick={handleAnular} disabled={saving} className="h-7 text-xs font-bold shrink-0">
            Confirmar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setConfirmando(false); setMotivo(''); }} className="h-7 text-xs shrink-0">
            Cancelar
          </Button>
        </div>
      )}

      {/* Dialog de confirmación de eliminación del comprobante */}
      <Dialog open={dialogDeleteOpen} onOpenChange={setDialogDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              ¿Eliminar comprobante adjunto?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Esta acción desvinculará el archivo de este movimiento de venta. Si estás offline, la copia local en el dispositivo también será removida.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogDeleteOpen(false)}
              className="text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={uploading}
              onClick={async () => {
                setDialogDeleteOpen(false);
                await handleQuitarComprobante();
              }}
              className="text-xs font-bold gap-1"
            >
              <Trash size={14} /> Eliminar comprobante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { VentaMovimientoTipo };
