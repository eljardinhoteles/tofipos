import { useState, useEffect } from 'react';
import { Paperclip, XCircle, Prohibit, UploadSimple, Trash, ChatText, CaretDown, CloudCheck } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { EstadoBadge } from '../Common/EstadoBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { showToast } from '@/lib/toast';
import { useAuth } from '../../context/AuthContext';
import { anularVentaMovimiento, adjuntarComprobanteMovimiento, marcarSinComprobanteMovimiento } from '../../db/rxdb';
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
// Columnas fijas a la derecha de todas las filas del historial (tarjeta, ajuste y comentario): acción (Adjuntar,
// nube o Anulado) | final (flecha del detalle o botón de anular). La fecha va siempre al inicio de la segunda
// línea de texto, en el mismo lugar en cualquier tipo de movimiento.
const COL_ACCION = 'w-28 flex items-center justify-end';
const COL_FINAL = 'w-9 flex items-center justify-center';

export function MovimientoHistorialCard({ ventaId, movimiento: m, allMovimientos, icon: Icon, label, colorClasses }: MovimientoHistorialCardProps) {
  const { currentMesero, adminUser } = useAuth();
  const { usuarios } = useRxUsuarios();
  const [confirmando, setConfirmando] = useState(false);
  const [dialogDeleteOpen, setDialogDeleteOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

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
  const admiteComprobante = !m.anulado && ['pago', 'ajuste', 'reembolso', 'retencion', 'anclar'].includes(m.tipo);

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

  const METODOS: Record<string, string> = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
    credito_agencia: 'Crédito de agencia', otros: 'Otros',
  };
  const detalles: Array<[string, string]> = [];
  if (m.metodo_pago) detalles.push(['Método', METODOS[m.metodo_pago] ?? m.metodo_pago]);
  if (m.transferencia_banco) detalles.push(['Banco', m.transferencia_banco]);
  if (m.transferencia_referencia) detalles.push(['N.º de comprobante', m.transferencia_referencia]);
  if (m.tarjeta_red) detalles.push(['Red de tarjeta', m.tarjeta_red]);
  if (m.numero_factura) detalles.push(['Factura', m.numero_factura]);
  if (m.motivo) detalles.push(['Motivo', m.motivo]);
  if (m.sin_comprobante) detalles.push(['Comprobante', 'No requiere (voucher del terminal)']);
  detalles.push(['Fecha', dayjs(m.fecha).format('DD MMM YYYY, HH:mm')]);
  if (autorNombre) detalles.push(['Registrado por', autorNombre]);
  const toggleDetalle = () => setDetalleAbierto(v => !v);

  // Pago de tarjeta sin comprobante adjunto: se puede marcar como cobrado en caja (el terminal imprime el voucher).
  const puedeMarcarSinComprobante = !m.anulado && m.tipo === 'pago' && m.metodo_pago === 'tarjeta' && !m.comprobante_url;
  const handleAlternarSinComprobante = async () => {
    try {
      await marcarSinComprobanteMovimiento(ventaId, m.id, !m.sin_comprobante);
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo actualizar el pago');
    }
  };

  // Anular un movimiento: botón de icono (visible al pasar el cursor; siempre visible en táctil) y confirmación con motivo.
  const botonAnular = (titulo: string, tamano = 16) => puedeAnularse && !confirmando && (
    <Button type="button" variant="ghost" size="icon" title={titulo} aria-label={titulo}
      onClick={(e) => { e.stopPropagation(); setConfirmando(true); }}
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
      <Prohibit size={tamano} weight="bold" />
    </Button>
  );
  const confirmarAnulacion = (
    <>
      <Input
        type="text" placeholder="Motivo de anulación" aria-label="Motivo de anulación" value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-12 text-base flex-1 min-w-40 bg-background"
      />
      <Button type="button" variant="destructive" onClick={handleAnular} disabled={saving} className="shrink-0">
        Confirmar
      </Button>
      <Button type="button" variant="ghost" onClick={() => { setConfirmando(false); setMotivo(''); }} className="shrink-0">
        Cancelar
      </Button>
    </>
  );

  if (m.tipo === 'ajuste') {
    return (
      <div className={cn(
        "group relative flex items-center justify-between py-1.5 px-2.5 transition-all rounded-2xl",
        m.anulado ? "opacity-60 bg-muted/40" : "hover:bg-muted/60"
      )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="w-9 shrink-0 flex items-center justify-center">
            <Icon size={16} weight="bold" className={m.anulado ? "text-muted-foreground" : "text-info-foreground"} />
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className={cn("t-cuerpo-fuerte tabular-nums whitespace-nowrap", m.anulado ? "text-muted-foreground line-through" : "text-foreground")}>
              Ajuste {m.monto! > 0 ? '+' : '-'}${Math.abs(m.monto || 0).toFixed(2)}
            </span>
            <span className="t-meta text-muted-foreground">
              <span className="tabular-nums">{dayjs(m.fecha).format('DD MMM, HH:mm')}</span>
              {autorNombre && (
                <span className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity"> · por {autorNombre}</span>
              )}
            </span>
            {/* El motivo se lee completo (puede ser largo): en su propia línea y con saltos, sin recortar. */}
            {m.motivo && (
              <span className="t-meta text-secondary-foreground whitespace-pre-wrap break-words mt-0.5">{m.motivo}</span>
            )}
            {m.anulado && m.anulado_motivo && (
              <span className="t-meta text-destructive italic break-words">
                Anulado: {m.anulado_motivo}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">

          <div className={COL_ACCION}>
            {m.anulado && <EstadoBadge tono="destructive">Anulado</EstadoBadge>}
          </div>

          <span className={COL_FINAL}>{botonAnular('Anular este ajuste')}</span>
        </div>

        {confirmando && (
          <div className="absolute right-0 top-full mt-1 z-10 bg-card border border-border shadow-lg rounded-2xl p-2 flex items-center gap-2">
            {confirmarAnulacion}
          </div>
        )}
      </div>
    );
  }

  if (m.tipo === 'comentario') {
    // Burbuja de chat alineada a la derecha, en el tono suave de advertencia del tema (crema).
    return (
      <div className="group relative flex flex-col items-end gap-1.5 py-1 px-2.5">
        <div className="flex items-center justify-end gap-1.5 max-w-full">
          <span className="shrink-0">{botonAnular('Anular este comentario')}</span>
          <div className={cn(
            "max-w-[min(32rem,85%)] min-w-0 rounded-2xl rounded-br-md px-3.5 py-2.5 flex flex-col gap-1 bg-warning-soft",
            m.anulado && "opacity-60"
          )}>
            <p className={cn("t-cuerpo whitespace-pre-wrap break-words", m.anulado ? "text-muted-foreground line-through" : "text-secondary-foreground")}>
              {m.motivo || 'Sin texto'}
            </p>
            <span className="t-meta text-muted-foreground flex items-center justify-end gap-1.5">
              <ChatText size={14} weight="bold" className="shrink-0" />
              <span className="tabular-nums">{dayjs(m.fecha).format('DD MMM, HH:mm')}</span>
              {autorNombre && <span>· por {autorNombre}</span>}
            </span>
            {m.anulado && (
              <span className="self-end"><EstadoBadge tono="destructive">Anulado</EstadoBadge></span>
            )}
            {m.anulado && m.anulado_motivo && (
              <span className="t-meta text-destructive italic break-words text-right">
                Anulado: {m.anulado_motivo}
              </span>
            )}
          </div>
        </div>

        {confirmando && (
          <div className="flex items-center gap-2 pt-1 w-full">
            {confirmarAnulacion}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative rounded-2xl bg-card p-2.5 flex flex-col gap-2 transition-all shadow-2xs",
      m.anulado && "opacity-60 bg-muted/40"
    )}>
      {/* Fila única de contenido: al tocarla se despliegan los datos del movimiento */}
      <div
        role="button" tabIndex={0} aria-expanded={detalleAbierto}
        onClick={toggleDetalle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleDetalle(); } }}
        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
      >
        {/* Thumbnail con Badge de Icono de Tipo de Movimiento */}
        {admiteComprobante && m.comprobante_url ? (
          <div className="relative shrink-0">
            <a
              href={fileUrl}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noreferrer"
              title="Ver comprobante"
              className="w-11 h-11 rounded-xl border border-border bg-muted/40 overflow-hidden block cursor-pointer"
            >
              {comprobanteDisplayUrl && !isPdf ? (
                <img
                  src={comprobanteDisplayUrl}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Paperclip size={18} className="text-muted-foreground" />
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
            <span className={cn("t-cuerpo-fuerte text-foreground truncate flex items-center gap-1", m.anulado && "line-through")}>
              {label}
            </span>
            {m.monto != null && m.monto !== 0 && (
              <span className="t-cuerpo-fuerte tabular-nums text-foreground shrink-0">${m.monto.toFixed(2)}</span>
            )}
          </div>
          <span className="t-meta text-muted-foreground truncate flex items-center gap-1.5">
            <span className="shrink-0 tabular-nums">{dayjs(m.fecha).format('DD MMM, HH:mm')}</span>
            <span className="truncate border-l border-border pl-1.5">
              {m.motivo || m.numero_factura || (m.metodo_pago ? `Método: ${m.metodo_pago}` : 'Movimiento de venta')}
            </span>
            {montoAsociado > 0 && (
              <span className="t-dato text-secondary-foreground border-l border-border pl-1.5 shrink-0">
                Cubre ${montoAsociado.toFixed(2)}
              </span>
            )}
            {autorNombre && (
              <span className="t-meta opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity border-l border-border pl-1.5 shrink-0">por {autorNombre}</span>
            )}
          </span>
        </div>

        {/* Bloque derecho: fecha, nube/local, anular y flecha del detalle */}
        <div className="flex items-center gap-2 shrink-0">

          <div className={COL_ACCION}>
          {admiteComprobante && m.comprobante_url && (
            <div className="flex items-center gap-1.5">
              {isOffline ? (
                <EstadoBadge tono="warning" title="Aún no se sube a la nube">Local</EstadoBadge>
              ) : (
                <EstadoBadge tono="info" title="Subido"><CloudCheck size={16} weight="bold" aria-label="Subido" /></EstadoBadge>
              )}
            </div>
          )}

          {/* Botón rápido para adjuntar cuando no hay comprobante */}
          {admiteComprobante && !m.comprobante_url && (
            <label onClick={(e) => e.stopPropagation()} className={cn(
              "min-h-8 pointer-coarse:min-h-11 flex items-center gap-1.5 px-3 rounded-2xl bg-muted/60 t-dato text-muted-foreground cursor-pointer hover:bg-muted transition-colors touch-manipulation",
              uploading && "opacity-50 pointer-events-none"
            )}>
              <UploadSimple size={14} weight="bold" />
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
          </div>

          <span className={COL_FINAL}>
            <CaretDown size={14} weight="bold" className={cn('text-muted-foreground transition-transform', detalleAbierto && 'rotate-180')} />
          </span>
        </div>
      </div>

      {detalleAbierto && (
        <div className="rounded-2xl bg-muted/40 p-3 flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-baseline">
            {detalles.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="t-etiqueta text-muted-foreground">{k}</dt>
                <dd className="t-cuerpo-fuerte text-foreground break-words text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {m.comprobante_url && comprobanteDisplayUrl && !isPdf && (
            <a href={fileUrl} target="_blank" rel="noreferrer" title="Abrir comprobante" className="block">
              <img src={comprobanteDisplayUrl} alt="Comprobante" className="w-full max-h-64 object-contain rounded-xl border border-border bg-card" />
            </a>
          )}
          {m.comprobante_url && isPdf && (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="t-dato text-primary flex items-center gap-1.5">
              <Paperclip size={14} /> Abrir comprobante (PDF)
            </a>
          )}
          {!m.comprobante_url && admiteComprobante && (
            <span className="t-meta text-muted-foreground">Sin comprobante adjunto.</span>
          )}
          {((admiteComprobante && m.comprobante_url) || (puedeAnularse && !confirmando) || puedeMarcarSinComprobante) && (
            <div className="self-end flex items-center gap-2">
              {puedeMarcarSinComprobante && (
                <Button type="button" variant="ghost" onClick={handleAlternarSinComprobante} disabled={uploading} className="gap-1.5 text-muted-foreground hover:text-foreground">
                  {m.sin_comprobante ? 'Requiere comprobante' : 'No requiere comprobante'}
                </Button>
              )}
              {puedeAnularse && !confirmando && (
                <Button type="button" variant="ghost" onClick={() => setConfirmando(true)} title="Anular movimiento" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Prohibit size={16} weight="bold" /> Anular
                </Button>
              )}
              {admiteComprobante && m.comprobante_url && (
                <Button type="button" variant="destructive" onClick={() => setDialogDeleteOpen(true)} disabled={uploading} title="Eliminar comprobante" className="gap-1.5">
                  <Trash size={16} weight="bold" /> Eliminar
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {m.anulado && (
        <span className="t-meta text-destructive italic truncate pl-11">
          Anulado: {m.anulado_motivo}
        </span>
      )}

      {confirmando && (
        <div className="flex items-center gap-2 pt-1">
          {confirmarAnulacion}
        </div>
      )}

      {/* Dialog de confirmación de eliminación del comprobante. Va en un portal, pero los eventos de React suben
          por el árbol de componentes hasta la tarjeta (que abre/cierra el detalle al tocarla): se cortan aquí. */}
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Dialog open={dialogDeleteOpen} onOpenChange={setDialogDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="t-titulo text-foreground">
              ¿Eliminar comprobante adjunto?
            </DialogTitle>
            <DialogDescription className="t-meta text-muted-foreground pt-1">
              Esta acción desvinculará el archivo de este movimiento de venta. Si estás offline, la copia local en el dispositivo también será removida.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={uploading}
              onClick={async () => {
                setDialogDeleteOpen(false);
                await handleQuitarComprobante();
              }}
              className="gap-1.5"
            >
              <Trash size={16} /> Eliminar comprobante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

export type { VentaMovimientoTipo };
