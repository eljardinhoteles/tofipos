import { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Prohibit, ArrowCounterClockwise,
  CurrencyDollar, ArrowUp, CreditCard, ChatText,
} from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RedCobroRadios } from '../Common/RedCobroRadios';
import { ComprobanteAdjunto } from '../Common/ComprobanteAdjunto';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Casilla } from '../Common/Casilla';
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
import { agregarVentaMovimiento } from '../../db/rxdb';
import { subirComprobante } from '@/lib/comprobantes';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import type { RxVentaMovimiento } from '../../db/rxdb';

// 'anclar' quedó como el único paso de facturación — antes existían
// 'anclar' (sin datos, solo destrababa 'facturar') y 'facturar' por
// separado; se fusionaron en una sola acción que pide el número de factura
// directo. El id se mantiene por compatibilidad con historiales previos a
// la fusión (ver useVentasConMovimientos).
type AccionId = 'pago' | 'ajuste' | 'anclar' | 'reembolsar' | 'marcar_credito' | 'comentario' | 'anular';

// Acciones que mueven/afectan dinero admiten adjuntar su propio comprobante
// al confirmar — cada pago/ajuste/reembolso lleva su respaldo individual,
// distinto del documento de venta (factura/confirmación) a nivel de venta.
const ACCIONES_CON_COMPROBANTE: AccionId[] = ['pago', 'ajuste', 'reembolsar', 'anclar', 'comentario'];

// Orden fijo del menú de píldoras (Pago, la más usada, primero; Anular, la más grave, siempre al final).
const ACCIONES_MENU: AccionId[] = ['pago', 'anclar', 'reembolsar', 'ajuste', 'marcar_credito', 'comentario', 'anular'];

const ACCION_LABEL: Record<AccionId, string> = {
  pago: 'Pago',
  ajuste: 'Ajustar',
  anclar: 'Facturar',
  reembolsar: 'Reembolsar',
  marcar_credito: 'Crédito',
  comentario: 'Comentar / Adjuntar',
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
  pago: 'bg-primary border-primary',
  reembolsar: 'bg-warning-foreground border-warning-foreground',
  ajuste: 'bg-info border-info',
  anclar: 'bg-special border-special',
  marcar_credito: 'bg-destructive border-destructive',
  comentario: 'bg-muted-foreground border-muted-foreground',
  anular: 'bg-foreground border-foreground',
};

// Menú de acciones: botones outline con borde; el icono lleva el color de la acción y el hover tiñe suavemente fondo y borde.
const ACCION_HOVER: Record<AccionId, { boton: string; icono: string }> = {
  pago: { boton: 'hover:bg-primary/10 hover:border-primary/30', icono: 'text-primary' },
  reembolsar: { boton: 'hover:bg-warning-soft hover:border-warning/40', icono: 'text-warning-foreground' },
  ajuste: { boton: 'hover:bg-info-soft hover:border-info/30', icono: 'text-info-foreground' },
  anclar: { boton: 'hover:bg-special-soft hover:border-special/30', icono: 'text-special-foreground' },
  marcar_credito: { boton: 'hover:bg-destructive-soft hover:border-destructive/30', icono: 'text-destructive' },
  comentario: { boton: 'hover:bg-muted', icono: 'text-muted-foreground' },
  anular: { boton: 'hover:bg-foreground/10 hover:border-foreground/30', icono: 'text-foreground' },
};


interface VentaAccionesBarProps {
  item: VentaConMovimientos;
}

/**
 * Barra de acciones fija abajo del detalle de venta: menú de píldoras y, al elegir una,
 * su formulario con Cancelar / Confirmar. Cada acción agrega un movimiento nuevo,
 * nunca edita el historial existente.
 */
export function VentaAccionesBar({ item }: VentaAccionesBarProps) {
  const { currentMesero, adminUser } = useAuth();
  const getUsuarioId = () => currentMesero?.id || adminUser?.id;
  const { bancos, redesTarjeta } = useMetodosPagoConfig();
  const { venta, movimientos } = item;
  const [saving, setSaving] = useState(false);

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
  const [ajustarVentaPago, setAjustarVentaPago] = useState(false);
  const [motivoAjustePago, setMotivoAjustePago] = useState('');
  const [pagosSeleccionados, setPagosSeleccionados] = useState<Set<string>>(new Set());
  const [accion, setAccion] = useState<AccionId | null>(null);

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

  // Sin acción elegida se muestra el menú de tarjetas; al elegir una se abre su formulario.
  const accionActiva = accion && accionesDisponibles.includes(accion) ? accion : null;

  useEffect(() => {
    setAccion(null);
    setComprobanteFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta.id]);

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
      setAccion(null);
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
    if (metodoPago === 'tarjeta' && !redTarjeta) { showToast.error('Selecciona la red de cobro de la tarjeta'); return; }

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
    // Comentario, documento o ambos. Con documento y sin texto, el nombre del archivo queda como texto del movimiento.
    const texto = textoComentario.trim();
    if (!texto && !comprobanteFile) { showToast.error('Escribe un comentario o adjunta un documento'); return; }
    const conArchivo = !!comprobanteFile;
    const motivo = texto || comprobanteFile!.name;
    if (await registrar({ tipo: 'comentario', motivo, usuario_id: getUsuarioId() })) {
      showToast.success(texto && conArchivo ? 'Comentario y documento agregados' : conArchivo ? 'Documento adjuntado' : 'Comentario agregado');
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

  const handleConfirmar = () => {
    if (accionActiva === 'pago') return handlePago();
    if (accionActiva === 'ajuste') return handleAjuste();
    if (accionActiva === 'anclar') return handleFacturar();
    if (accionActiva === 'reembolsar') return handleReembolsar();
    if (accionActiva === 'marcar_credito') return handleMarcarCredito();
    if (accionActiva === 'comentario') return handleComentario();
    if (accionActiva === 'anular') return handleAnular();
  };

  if (accionesDisponibles.length === 0) return null;

  return (
        <div className={cn("shrink-0 p-4 flex flex-col gap-3", accionActiva && "bg-card shadow-[0_-4px_12px_-6px_oklch(0_0_0/0.12)]")}>
          {!accionActiva ? (
            <div className="flex flex-wrap justify-center gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              {/* Píldoras flotantes: siempre las mismas 7 en el mismo orden; las que no aplican a esta venta quedan inactivas. Se acomodan en las filas que el ancho permita. */}
              {ACCIONES_MENU.map(a => {
                const Icon = ACCION_ICON[a];
                const disponible = accionesDisponibles.includes(a);
                const motivo = a === 'reembolsar' ? 'Aún no hay pagos que reembolsar' : a === 'marcar_credito' ? 'La venta ya es a crédito' : undefined;
                return (
                  <Button key={a} type="button" variant="outline" disabled={!disponible} title={!disponible ? motivo : undefined}
                    onClick={() => setAccion(a)}
                    className={cn("rounded-full h-11 gap-2.5 px-5 shadow-md transition-colors", ACCION_HOVER[a].boton)}>
                    <Icon size={20} className={cn("shrink-0", ACCION_HOVER[a].icono)} />
                    <span>{ACCION_LABEL[a]}</span>
                    {a === 'pago' && (
                      <span className="t-meta text-muted-foreground">
                        {item.saldo > 0.01 ? `Saldo $${item.saldo.toFixed(2)}` : 'Sin saldo'}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", ACCION_COLOR[accionActiva], accionActiva === 'anular' ? "text-background" : "text-white")}>
                {(() => { const Icon = ACCION_ICON[accionActiva]; return <Icon size={18} weight="bold" />; })()}
              </span>
              <span className="t-titulo text-secondary-foreground truncate">{ACCION_LABEL[accionActiva]}</span>
            </span>
            <div className="shrink-0 flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setAccion(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmar}
                disabled={saving || (accionActiva === 'pago' && metodoPago === 'tarjeta' && !redTarjeta)}
                className={cn(accionActiva === 'anular' ? "text-background" : "text-white", ACCION_COLOR[accionActiva])}
              >
                {saving ? 'Guardando...' : 'Confirmar'}
              </Button>
            </div>
          </div>

          {/* Formulario minimalista de la acción seleccionada */}
          <div className="flex flex-col gap-3">
            {accionActiva === 'pago' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Monto</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" placeholder="0.00" value={montoPago}
                      onChange={(e) => setMontoPago(e.target.value)}
                      className="h-12 text-base"
                    />
                    {item.saldo > 0.01 && (
                      <Button type="button" variant="outline" size="icon" onClick={() => setMontoPago(item.saldo.toFixed(2))}
                        title={`Usar saldo pendiente ($${item.saldo.toFixed(2)})`} aria-label="Usar saldo pendiente"
                        className="size-12 shrink-0 text-muted-foreground hover:text-primary">
                        <CurrencyDollar size={18} weight="bold" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Método de pago</Label>
                  <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as typeof metodoPago)}>
                    <SelectTrigger className="w-full data-[size=default]:h-12 px-2.5 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['efectivo', 'tarjeta', 'transferencia', 'otros'] as const).map(m => (
                        <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {metodoPago === 'transferencia' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <Label className="t-etiqueta! text-muted-foreground">Banco</Label>
                      <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                        <SelectTrigger className="w-full data-[size=default]:h-12 px-2.5 text-base">
                          <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos'} />
                        </SelectTrigger>
                        <SelectContent>
                          {bancos.map(b => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="t-etiqueta! text-muted-foreground">N.º Comprobante</Label>
                      <Input
                        type="text" placeholder="Ej. 000123456" value={numeroComprobanteTransf}
                        onChange={(e) => setNumeroComprobanteTransf(e.target.value)}
                        className="h-12 text-base"
                      />
                    </div>
                  </>
                )}

                {metodoPago === 'tarjeta' && (
                  <div className="col-span-2 flex flex-col gap-1">
                    <Label className="t-etiqueta! text-muted-foreground">Red de cobro *</Label>
                    <RedCobroRadios redes={redesTarjeta} value={redTarjeta} onChange={setRedTarjeta} invalido={!redTarjeta} />
                  </div>
                )}

                <div className="col-span-2 flex flex-col gap-2 mt-2 pt-2 border-t border-border/50">
                  <Casilla checked={ajustarVentaPago} onChange={setAjustarVentaPago}>Ajustar venta para evitar excedente</Casilla>
                  {ajustarVentaPago && (
                    <div className="flex flex-col gap-1 mt-1">
                      <Label className="t-etiqueta! text-muted-foreground">Motivo del ajuste</Label>
                      <Input
                        type="text" placeholder="Ej. Propina, recargo adicional..." value={motivoAjustePago}
                        onChange={(e) => setMotivoAjustePago(e.target.value)}
                        className="h-12 text-base"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {accionActiva === 'ajuste' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Monto (+ aumentar, - reducir)</Label>
                  <Input
                    type="number" placeholder="0.00" value={montoAjuste}
                    onChange={(e) => setMontoAjuste(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Motivo (opcional)</Label>
                  <Textarea
                    placeholder="Describe el motivo del ajuste..." value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    className="min-h-12 text-base resize-none"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'anclar' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Número de factura</Label>
                  <Input
                    type="text" placeholder="Ej. F-001-00023" value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                
                {(() => {
                  const pagosDisponibles = movimientos.filter(m => m.tipo === 'pago' && !m.anulado && m.monto);
                  if (pagosDisponibles.length === 0) return null;
                  
                  return (
                    <div className="flex flex-col gap-2 p-3 bg-muted/40 border border-border/50 rounded-2xl mt-1">
                      <Label className="t-etiqueta! text-muted-foreground">Pagos asociados a esta factura (opcional)</Label>
                      <div className="flex flex-col gap-2">
                        {pagosDisponibles.map(pago => (
                          <Casilla key={pago.id} checked={pagosSeleccionados.has(pago.id)}
                            onChange={(v) => {
                              const next = new Set(pagosSeleccionados);
                              if (v) next.add(pago.id); else next.delete(pago.id);
                              setPagosSeleccionados(next);
                            }}>
                            ${pago.monto?.toFixed(2)} - {pago.metodo_pago} {dayjs(pago.fecha).format('(DD/MM HH:mm)')}
                          </Casilla>
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
                  <Label className="t-etiqueta! text-muted-foreground">Monto a reembolsar</Label>
                  <Input
                    type="number" placeholder="0.00" value={montoReembolso}
                    onChange={(e) => setMontoReembolso(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Motivo (opcional)</Label>
                  <Textarea
                    placeholder="Describe el motivo..." value={motivoReembolso}
                    onChange={(e) => setMotivoReembolso(e.target.value)}
                    className="min-h-12 text-base resize-none"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'marcar_credito' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="t-etiqueta! text-muted-foreground">Motivo (opcional)</Label>
                  <Input
                    type="text" placeholder="Ej. acuerdo de crédito" value={motivoCredito}
                    onChange={(e) => setMotivoCredito(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
              </div>
            )}

            {accionActiva === 'comentario' && (
              <div className="flex flex-col gap-1">
                <Label className="t-etiqueta! text-muted-foreground">Comentario (opcional si adjuntas un documento)</Label>
                <Textarea
                  placeholder="Escribe una observación..." value={textoComentario}
                  onChange={(e) => setTextoComentario(e.target.value)}
                  className="min-h-14 text-base resize-none"
                />
              </div>
            )}

            {accionActiva === 'anular' && (
              <div className="flex flex-col gap-1">
                <Label className="t-etiqueta! text-muted-foreground">Motivo de anulación</Label>
                <Input
                  type="text" placeholder="Ej. error en cobro" value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
            )}

            {/* Comprobante opcional (si aplica) — deshabilitado para pagos en
                efectivo, que no tienen comprobante que subir. */}
            {ACCIONES_CON_COMPROBANTE.includes(accionActiva) && (
              <ComprobanteAdjunto
                file={comprobanteFile}
                onChange={setComprobanteFile}
                disabled={comprobanteDeshabilitado}
                title={comprobanteDeshabilitado ? 'Un pago en efectivo no requiere comprobante' : undefined}
                placeholder={accionActiva === 'comentario' ? 'Adjuntar documento (opcional)' : 'Adjuntar comprobante (opcional)'}
              />
            )}
          </div>
            </div>
          )}
        </div>
  );
}
