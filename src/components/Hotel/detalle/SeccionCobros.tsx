import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bank, Check, CreditCard, LinkSimple, Money, Plus, Receipt, SlidersHorizontal, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ClienteBuscador } from '../../Common/ClienteBuscador';
import { agregarVentaMovimiento, updateRxVenta } from '../../../db/rxdb';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../../Common/EstadoBadge';
import { PagoComprobanteLink } from '../../Mesas/Sidebar/PagoComprobanteLink';
import { Girando } from '../Espera';
import { pagoDeVenta } from '../estiloReserva';
import { useMetodosPagoConfig } from '../../../hooks/useMetodosPagoConfig';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { VentaConMovimientos } from '../../../lib/ventaConMovimientos';
import { ajustarVentaHotel, conciliacionDisponible, desenlazarVentaHotel, totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { atribucionDePago, facturasDePago, motivoLegible, registrarAbonoHotel, verificarEnlaceGrupo, type DestinoAbono, type MetodoCobro } from '../../../lib/hotelCobros';
import { ComprobanteAdjunto } from '../../Common/ComprobanteAdjunto';
import { Seccion } from './comunes';
import { EPS, dinero, etiquetaCampo } from './formatos';

const METODOS: MetodoCobro[] = ['efectivo', 'tarjeta', 'transferencia', 'otros'];
const selectClass = 'h-11 w-full px-3 text-base rounded-2xl bg-card border-border shadow-xs';

interface Props {
  r: ReservaHotel;
  venta: VentaConMovimientos | undefined;
  /** La venta enlazada no existe en el Centro de Ventas (se eliminó o no está en este dispositivo). */
  ventaPerdida?: boolean;
  onDesenlazar?: () => void;
  /** Habitaciones vigentes del grupo (vacío si la reserva es individual): comparten UNA venta. */
  grupo: ReservaHotel[];
  puedeGestionar: boolean;
  usuario: { id?: string; nombre?: string };
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  onSucio: (sucio: boolean) => void;
  /** Tras registrar un anticipo o ajustar la venta (la reserva puede haber ganado su venta). */
  onCambio: (r: ReservaHotel) => void;
  onConciliar?: (r: ReservaHotel) => void;
}

/**
 * Cobros de la reserva. Los pagos viven en el Centro de Ventas (la venta de la reserva): desde aquí se registran ahí mismo,
 * con su método, banco/red y comprobante, y Ventas sigue siendo la fuente de todo. Sin venta, el primer anticipo la crea.
 */
export function SeccionCobros({ r, venta, ventaPerdida, onDesenlazar, grupo, puedeGestionar, usuario, abierto, onAbrir, onSucio, onCambio, onConciliar }: Props) {
  const pago = pagoDeVenta(venta);
  const enGrupo = grupo.length > 1;
  const totalPos = enGrupo ? grupo.reduce((a, g) => a + totalConExtras(g), 0) : totalConExtras(r);
  const dif = venta && !venta.anulado ? Math.round((totalPos - venta.montoTotal) * 100) / 100 : 0;
  const descuadre = Math.abs(dif) > EPS;
  const movimientos = (venta?.movimientos ?? []).filter((m) => (m.tipo === 'pago' || m.tipo === 'reembolso') && !m.anulado);
  const saldo = venta && !venta.anulado ? venta.saldo : totalPos;
  const [ajustando, setAjustando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // El Centro de Ventas abre la venta marcada en sessionStorage (mismo mecanismo que «Ver en C. de Ventas» de Mesas).
  const verEnVentas = () => {
    const ventaId = r.venta_id ?? grupo.find((g) => g.venta_id)?.venta_id;
    if (!ventaId) return;
    if (isMobile) { showToast.info('El pago se ve en Centro de Ventas', 'Disponible en la versión de escritorio.'); return; }
    try { sessionStorage.setItem('pos_venta_a_abrir', ventaId); } catch { /* sin storage: abre sin selección */ }
    navigate('/v2/centro-ventas');
  };
  // Alguna habitación del grupo sin venta mientras otra sí la tiene: quedó suelta y no aparece con cobros.
  const hayCabanaSuelta = enGrupo && grupo.some((g) => g.venta_id) && grupo.some((g) => !g.venta_id);

  const verificarEnlace = async () => {
    setVerificando(true);
    try {
      const res = await verificarEnlaceGrupo(grupo, usuario.id);
      if (res.enlazadas.length > 0) {
        showToast.success(`${res.enlazadas.length === 1 ? 'Habitación enlazada' : 'Habitaciones enlazadas'}: ${res.enlazadas.join(', ')}`, res.ajuste > 0 ? `Se sumaron ${dinero(res.ajuste)} a la venta del grupo.` : 'La venta ya incluía su importe.');
        onCambio(r);
      } else if (res.sinVenta) {
        showToast.info('El grupo aún no tiene venta', 'Se creará con el primer pago.');
      } else {
        showToast.success('Todo en orden', 'Todas las habitaciones del grupo están enlazadas a la misma venta.');
      }
    } catch (e) {
      showToast.fallo('verificar el enlace', e);
    } finally {
      setVerificando(false);
    }
  };
  // Cambiar de venta: la reserva quedó enlazada a una venta NUEVA y vacía (p. ej. al volver a crearla) y los cobros están en otra.
  // Solo con la venta actual sin pagos: se desenlaza, se anula esa venta vacía (si nadie más la usa) y se abre la conciliación.
  const [cambiandoVenta, setCambiandoVenta] = useState(false);
  const [confirmaCambio, setConfirmaCambio] = useState(false);
  const puedeCambiarVenta = puedeGestionar && !!onConciliar && conciliacionDisponible && !!venta && !venta.anulado && venta.totalPagado <= EPS && !!r.venta_id;
  const cambiarVenta = async () => {
    if (!venta || !onConciliar) return;
    setCambiandoVenta(true);
    try {
      const comparte = grupo.some((g) => g.id !== r.id && g.venta_id === r.venta_id);
      await desenlazarVentaHotel(r.id);
      if (!comparte) {
        await agregarVentaMovimiento({ venta_id: venta.venta.id, tipo: 'anular', motivo: 'Venta vacía creada al volver a crear la reserva: se enlaza a la venta existente', usuario_id: usuario.id });
      }
      setConfirmaCambio(false);
      onConciliar({ ...r, venta_id: null });
    } catch (e) {
      showToast.fallo('cambiar de venta', e);
    } finally {
      setCambiandoVenta(false);
    }
  };
  // Crédito corporativo: igual que en el Centro de Ventas (la venta queda pendiente de cobro a nombre de un cliente o agencia).
  const [creditoAbierto, setCreditoAbierto] = useState(false);
  const [creditoCliente, setCreditoCliente] = useState<string>(venta?.venta.cliente_id ?? '');
  const [creditoMotivo, setCreditoMotivo] = useState('');
  const [marcando, setMarcando] = useState(false);
  const marcarCredito = async () => {
    if (!venta || !creditoCliente) return;
    setMarcando(true);
    try {
      if (creditoCliente !== (venta.venta.cliente_id ?? '')) await updateRxVenta(venta.venta.id, { cliente_id: creditoCliente });
      await agregarVentaMovimiento({ venta_id: venta.venta.id, tipo: 'marcar_credito', motivo: creditoMotivo.trim() || undefined, usuario_id: usuario.id });
      showToast.success('Venta marcada como crédito');
      setCreditoAbierto(false);
      setCreditoMotivo('');
      onCambio(r);
    } catch (e) {
      showToast.fallo('marcar la venta como crédito', e);
    } finally {
      setMarcando(false);
    }
  };
  const avance = venta && venta.montoTotal > EPS ? Math.min(100, Math.max(0, (venta.totalPagado / venta.montoTotal) * 100)) : 0;

  const ajustar = async () => {
    setAjustando(true);
    try {
      await ajustarVentaHotel(r, dif, 'Ajuste desde el Hotel: la tarifa o los extras de la reserva cambiaron');
      showToast.success('Venta ajustada', `Se agregó un ajuste de ${dif > 0 ? '+' : '−'}${dinero(Math.abs(dif))} en el Centro de Ventas.`);
      onCambio(r);
    } catch (e) {
      showToast.fallo('ajustar la venta', e);
    } finally {
      setAjustando(false);
    }
  };

  // Acciones secundarias de la venta, en un menú junto a «Añadir pago» para no llenar el encabezado.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const accionesMenu: Array<{ clave: string; icono: typeof LinkSimple; texto: string; ayuda: string; onClick: () => void; deshabilitada?: boolean }> = [
    ...(enGrupo && puedeGestionar ? [{
      clave: 'enlace', icono: LinkSimple, texto: hayCabanaSuelta ? 'Enlazar habitaciones' : 'Verificar enlace',
      ayuda: 'Comprueba que todas las habitaciones del grupo estén enlazadas a la misma venta y repara las sueltas',
      onClick: () => void verificarEnlace(), deshabilitada: verificando,
    }] : []),
    ...(puedeCambiarVenta ? [{
      clave: 'cambiar', icono: LinkSimple, texto: 'Cambiar venta',
      ayuda: 'Enlaza la reserva a otra venta que ya tiene los cobros', onClick: () => setConfirmaCambio(true),
    }] : []),
    ...(puedeGestionar && venta && !venta.anulado && venta.venta.tipo === 'directa' ? [{
      clave: 'credito', icono: CreditCard, texto: 'Marcar como crédito',
      ayuda: 'Pasa la venta a crédito de un cliente o agencia', onClick: () => { setCreditoCliente(venta.venta.cliente_id ?? ''); setCreditoAbierto(true); },
    }] : []),
  ];

  return (
    <Seccion icono={Receipt} color="success" titulo={enGrupo ? 'Cobros del grupo' : 'Cobros'}
      accion={<div className="flex items-center gap-2">
        {venta?.anulado && <EstadoBadge tono="neutral">Venta anulada</EstadoBadge>}
        {accionesMenu.length > 0 && (
          <Popover open={menuAbierto} onOpenChange={setMenuAbierto}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="size-9" title="Más acciones de la venta" aria-label="Más acciones de la venta">
                {verificando ? <Girando /> : <SlidersHorizontal size={16} weight="bold" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-1.5 flex flex-col">
              {accionesMenu.map((a) => (
                <button key={a.clave} type="button" disabled={a.deshabilitada} title={a.ayuda}
                  onClick={() => { setMenuAbierto(false); a.onClick(); }}
                  className="min-h-11 px-3 rounded-xl flex items-center gap-2.5 text-left t-cuerpo-fuerte hover:bg-muted cursor-pointer disabled:opacity-50">
                  <a.icono size={16} weight="bold" className="shrink-0 text-muted-foreground" /> {a.texto}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
        {puedeGestionar && !abierto && r.estado === 'confirmada' && !venta?.anulado && (
          <Button type="button" variant="default" className="h-9 gap-1.5" onClick={() => onAbrir(true)} disabled={!!venta && venta.saldo <= EPS && venta.montoTotal > EPS}><Plus size={14} weight="bold" /> Añadir pago</Button>
        )}
      </div>}>
      {!r.venta_id ? (
        <div className="flex flex-col gap-2">
          <span className="t-cuerpo-fuerte">Aún no tiene venta en el Centro de Ventas</span>
          <span className="t-meta text-muted-foreground">El primer pago la crea con el total {enGrupo ? 'del grupo' : 'del POS'} ({dinero(totalPos)}). Si la reserva ya tiene una venta, concíliala.</span>
          {puedeGestionar && onConciliar && conciliacionDisponible && <Button type="button" variant="outline" className="self-start h-10" onClick={() => onConciliar(r)}>Conciliar con una venta existente</Button>}
        </div>
      ) : venta?.anulado || (!venta && ventaPerdida) ? (
        <div className="flex flex-col gap-2">
          <span className="t-cuerpo-fuerte">{venta?.anulado ? 'La venta enlazada está anulada' : 'La venta enlazada ya no existe'}</span>
          <span className="t-meta text-muted-foreground">{venta?.anulado ? 'Se anuló en el Centro de Ventas, así que no admite cobros.' : 'Se eliminó del Centro de Ventas o aún no está en este dispositivo.'} Desenlázala: el próximo pago creará una venta nueva con el total del POS.</span>
          {puedeGestionar && onDesenlazar && <Button type="button" variant="outline" className="self-start h-10" onClick={onDesenlazar}>Desenlazar venta</Button>}
        </div>
      ) : !venta ? (
        <p className="t-meta text-muted-foreground">Cargando la venta del Centro de Ventas…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Cifra t="Total venta" v={dinero(venta.montoTotal)} />
            <Cifra t="Pagado" v={dinero(venta.totalPagado)} tono={venta.totalPagado > EPS ? 'ok' : undefined} />
            <Cifra t="Saldo" v={dinero(venta.saldo)} tono={venta.saldo > EPS ? 'pendiente' : 'ok'} />
          </div>
          <div role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del pago" className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-[width]', pago ? pago.barra : 'bg-muted')} style={{ width: `${avance}%` }} />
          </div>
          {descuadre && puedeGestionar && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft text-warning-foreground px-3 py-2">
              <span className="t-meta flex items-center gap-1.5"><WarningCircle size={16} weight="fill" className="shrink-0" /> La venta ({dinero(venta.montoTotal)}) no coincide con el total del POS ({dinero(totalPos)}).</span>
              <Button type="button" variant="outline" className="h-9" onClick={() => void ajustar()} disabled={ajustando}>
                {ajustando ? <Girando /> : `Ajustar venta ${dif > 0 ? '+' : '−'}${dinero(Math.abs(dif))}`}
              </Button>
            </div>
          )}
        </>
      )}

      {movimientos.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="t-etiqueta text-muted-foreground">Pagos registrados · {movimientos.length}</span>
          <ul className="flex flex-col" aria-label="Pagos registrados">
            {movimientos.map((m) => {
              const MetodoIcono = m.metodo_pago === 'tarjeta' ? CreditCard : m.metodo_pago === 'transferencia' ? Bank : Money;
              const reembolso = m.tipo === 'reembolso';
              return (
                <li key={m.id} className="relative flex items-center gap-3 py-2 px-2 -mx-2 rounded-xl hover:bg-muted/60 transition-colors">
                  <span className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', reembolso ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success-foreground')}><MetodoIcono size={20} /></span>
                  <span className="flex flex-col min-w-0 flex-1">
                    {/* Enlace extendido: el botón cubre toda la fila (el comprobante queda por encima para seguir siendo tocable). */}
                    <button type="button" onClick={verEnVentas} title="Ver en el Centro de Ventas" className="t-cuerpo-fuerte capitalize truncate text-left cursor-pointer after:absolute after:inset-0 after:content-['']">{reembolso ? 'Reembolso' : 'Pago'} · {m.metodo_pago}</button>
                    <span className="t-meta text-muted-foreground truncate">
                      {new Date(m.fecha).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {m.transferencia_banco ? ` · ${m.transferencia_banco}` : ''}{m.tarjeta_red ? ` · ${m.tarjeta_red}` : ''}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {enGrupo && <Destino motivo={m.motivo} grupo={grupo} />}
                      {!reembolso && <FacturaDePago numeros={facturasDePago(venta?.movimientos ?? [], m.id)} />}
                    </span>
                  </span>
                  {/* Hueco fijo para el comprobante: los importes quedan alineados con o sin adjunto. */}
                  <span className="relative z-10 w-11 flex justify-center shrink-0">{m.comprobante_url && <PagoComprobanteLink url={m.comprobante_url} />}</span>
                  <span className={cn('t-cuerpo-fuerte tabular-nums text-right w-24 shrink-0', reembolso ? 'text-destructive' : 'text-success')}>{reembolso ? '−' : '+'}{dinero(m.monto ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AlertDialog open={confirmaCambio} onOpenChange={(o) => { if (!cambiandoVenta) setConfirmaCambio(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar la venta de esta reserva</AlertDialogTitle>
            <AlertDialogDescription>La venta actual no tiene pagos. Se desenlaza de la reserva y, si ninguna otra reserva la usa, se anula (queda en el historial). Después eliges la venta existente con los cobros.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cambiandoVenta}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={cambiandoVenta} onClick={(e) => { e.preventDefault(); void cambiarVenta(); }}>{cambiandoVenta ? 'Cambiando…' : 'Continuar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={creditoAbierto} onOpenChange={(o) => { if (!marcando) setCreditoAbierto(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar la venta como crédito</AlertDialogTitle>
            <AlertDialogDescription>El saldo queda pendiente de cobro a nombre del cliente o agencia. Se puede cobrar después desde aquí o desde el Centro de Ventas. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="t-etiqueta! text-muted-foreground">Cliente o agencia *</Label>
              <ClienteBuscador value={creditoCliente} onChange={setCreditoCliente} placeholder="Cliente / agencia (requerido)" inputClassName="h-10 pl-9 t-cuerpo" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cred-motivo" className="t-etiqueta! text-muted-foreground">Motivo (opcional)</Label>
              <Input id="cred-motivo" value={creditoMotivo} onChange={(e) => setCreditoMotivo(e.target.value)} placeholder="Ej. acuerdo de crédito" className="h-11 text-base" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={marcando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!creditoCliente || marcando} onClick={(e) => { e.preventDefault(); void marcarCredito(); }}>{marcando ? 'Guardando…' : 'Marcar como crédito'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {abierto && <FormAbono r={r} grupo={grupo} saldo={saldo} usuario={usuario} onCancelar={() => onAbrir(false)} onSucio={onSucio} onRegistrado={(n) => { onAbrir(false); onCambio(n); }} />}
    </Seccion>
  );
}

/** Si el pago ya está cubierto por una factura (vínculo hecho en el Centro de Ventas). */
function FacturaDePago({ numeros }: { numeros: string[] }) {
  return numeros.length > 0
    ? <EstadoBadge tono="success" className="py-0.5">Factura {numeros.join(', ')}</EstadoBadge>
    : <EstadoBadge tono="warning" className="py-0.5" title="Ninguna factura cubre este pago todavía">Sin facturar</EstadoBadge>;
}

/** A qué habitación (o a todo el grupo) corresponde un pago; los hechos en Ventas sin asignar quedan como «Sin asignar». */
function Destino({ motivo, grupo }: { motivo?: string; grupo: ReservaHotel[] }) {
  const at = atribucionDePago(motivo);
  const texto = !at ? (motivoLegible(motivo) || 'Sin asignar') : at.destino === 'grupo' ? 'Todo el grupo' : grupo.find((g) => g.id === at.destino)?.cabana ?? at.texto;
  return <span className={cn('t-meta self-start rounded-md px-1.5 py-0.5', at ? 'bg-primary/10 text-foreground' : 'bg-muted text-muted-foreground')}>{texto}</span>;
}

function Cifra({ t, v, tono }: { t: string; v: string; tono?: 'ok' | 'pendiente' }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="t-meta text-muted-foreground">{t}</span>
      <span className={cn('t-valor text-xl tabular-nums', tono === 'ok' && 'text-success', tono === 'pendiente' && 'text-warning-foreground')}>{v}</span>
    </div>
  );
}

function FormAbono({ r, grupo, saldo, usuario, onCancelar, onSucio, onRegistrado }: {
  r: ReservaHotel; grupo: ReservaHotel[]; saldo: number; usuario: { id?: string; nombre?: string };
  onCancelar: () => void; onSucio: (s: boolean) => void; onRegistrado: (r: ReservaHotel) => void;
}) {
  const { bancos, redesTarjeta } = useMetodosPagoConfig();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoCobro>('efectivo');
  const [banco, setBanco] = useState('');
  const [numero, setNumero] = useState('');
  const [red, setRed] = useState('');
  const [destino, setDestino] = useState<DestinoAbono>('grupo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const montoN = parseFloat(monto);
  const sinSaldo = saldo <= EPS;
  const excede = Number.isFinite(montoN) && montoN > saldo + EPS;
  const faltas = {
    monto: !(montoN > 0) || excede,
    red: metodo === 'tarjeta' && !red,
    numero: metodo === 'transferencia' && !numero.trim(),
  };

  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); onSucio(true); };

  const registrar = async () => {
    setIntentado(true);
    if (Object.values(faltas).some(Boolean)) return;
    setGuardando(true);
    try {
      const nueva = await registrarAbonoHotel(r, { monto: montoN, metodo, bancoDestino: banco || undefined, numeroComprobante: numero.trim() || undefined, redTarjeta: red || undefined, comprobanteFile: archivo }, usuario, { grupo, destino });
      showToast.success('Pago registrado', `Se registró un pago de ${dinero(montoN)} en el Centro de Ventas.`);
      onSucio(false);
      onRegistrado(nueva);
    } catch (e) {
      showToast.fallo('registrar el pago', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="t-cuerpo-fuerte">Añadir pago · saldo {dinero(Math.max(0, saldo))}</span>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ab-monto" className={etiquetaCampo}>Monto</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 t-fila text-muted-foreground pointer-events-none">$</span>
            <Input id="ab-monto" type="number" inputMode="decimal" step="0.01" min={0} max={Math.max(0, saldo)} placeholder="0.00" value={monto} autoFocus disabled={sinSaldo}
              onChange={(e) => cambiar(setMonto)(e.target.value)} aria-invalid={intentado && faltas.monto} className="h-11 pl-8 text-lg font-extrabold" />
          </div>
          {!sinSaldo && <Button type="button" variant="outline" className="h-11 px-4 shrink-0" onClick={() => cambiar(setMonto)(saldo.toFixed(2))}>Todo el saldo</Button>}
        </div>
        {excede && <p className="t-meta text-destructive">El pago no puede superar el saldo ({dinero(saldo)}).</p>}
        {sinSaldo && <p className="t-meta text-muted-foreground">No hay saldo pendiente: la reserva ya está cubierta.</p>}
      </div>
      {grupo.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label className={etiquetaCampo}>Este pago es de</Label>
          <Select value={destino} onValueChange={(v) => cambiar(setDestino)(v)}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="grupo" className="t-cuerpo">Todo el grupo</SelectItem>
              {grupo.map((g) => <SelectItem key={g.id} value={g.id} className="t-cuerpo">{g.cabana}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label className={etiquetaCampo}>Método de pago</Label>
        <Select value={metodo} onValueChange={(v) => cambiar(setMetodo)(v as MetodoCobro)}>
          <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
          <SelectContent>{METODOS.map((m) => <SelectItem key={m} value={m} className="t-cuerpo capitalize">{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {metodo === 'transferencia' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className={etiquetaCampo}>Banco destino</Label>
            <Select value={banco || undefined} onValueChange={(v) => cambiar(setBanco)(v)}>
              <SelectTrigger className={selectClass}><SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos configurados'} /></SelectTrigger>
              <SelectContent>{bancos.map((b) => <SelectItem key={b} value={b} className="t-cuerpo">{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ab-num" className={etiquetaCampo}>N.º de comprobante *</Label>
            <Input id="ab-num" value={numero} onChange={(e) => cambiar(setNumero)(e.target.value)} placeholder="Ej. 000123456" aria-invalid={intentado && faltas.numero} className="h-11 text-base" />
            {intentado && faltas.numero && <p className="t-meta text-destructive">Es obligatorio en una transferencia.</p>}
          </div>
        </div>
      )}
      {metodo === 'tarjeta' && (
        <div className="flex flex-col gap-1.5">
          <Label className={etiquetaCampo}>Red de cobro *</Label>
          <Select value={red || undefined} onValueChange={(v) => cambiar(setRed)(v)}>
            <SelectTrigger className={cn(selectClass, intentado && faltas.red && 'border-destructive/60')}><SelectValue placeholder={redesTarjeta.length ? 'Selecciona (obligatorio)' : 'Sin redes configuradas'} /></SelectTrigger>
            <SelectContent>{redesTarjeta.map((x) => <SelectItem key={x} value={x} className="t-cuerpo">{x}</SelectItem>)}</SelectContent>
          </Select>
          {intentado && faltas.red && <p className="t-meta text-destructive">Elige la red de cobro de la tarjeta.</p>}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label className={etiquetaCampo}>Comprobante (opcional)</Label>
        <ComprobanteAdjunto file={archivo} onChange={cambiar(setArchivo)} />
      </div>
      {!r.venta_id && <p className="t-meta text-muted-foreground">Se creará {grupo.length > 1 ? 'una sola venta para todo el grupo' : 'la venta de esta reserva'} en el Centro de Ventas con el total del POS.</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void registrar()} disabled={guardando || sinSaldo}>
          {guardando ? <><Girando /> Registrando…</> : <><Check size={16} weight="bold" /> Registrar pago</>}
        </Button>
      </div>
    </div>
  );
}
