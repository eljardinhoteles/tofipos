import { useState } from 'react';
import { Bank, Check, CreditCard, Money, Paperclip, Plus, Receipt, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../../Common/EstadoBadge';
import { PagoComprobanteLink } from '../../Mesas/Sidebar/PagoComprobanteLink';
import { Girando } from '../Espera';
import { pagoDeVenta } from '../estiloReserva';
import { useMetodosPagoConfig } from '../../../hooks/useMetodosPagoConfig';
import type { VentaConMovimientos } from '../../../lib/ventaConMovimientos';
import { ajustarVentaHotel, conciliacionDisponible, totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { atribucionDePago, motivoLegible, registrarAbonoHotel, type DestinoAbono, type MetodoCobro } from '../../../lib/hotelCobros';
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
  /** Cabañas vigentes del grupo (vacío si la reserva es individual): comparten UNA venta. */
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

  return (
    <Seccion icono={Receipt} color="success" titulo={enGrupo ? 'Cobros del grupo' : 'Cobros'}
      accion={<div className="flex items-center gap-2">
        {pago && <EstadoBadge tono={pago.tono}>{pago.etiqueta}</EstadoBadge>}
        {venta?.anulado && <EstadoBadge tono="neutral">Venta anulada</EstadoBadge>}
        {puedeGestionar && !abierto && r.estado === 'confirmada' && !venta?.anulado && (
          <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => onAbrir(true)} disabled={!!venta && venta.saldo <= EPS && venta.montoTotal > EPS}><Plus size={14} weight="bold" /> Registrar anticipo</Button>
        )}
      </div>}>
      {!r.venta_id ? (
        <div className="flex flex-col gap-2">
          <span className="t-cuerpo-fuerte">Aún no tiene venta en el Centro de Ventas</span>
          <span className="t-meta text-muted-foreground">El primer anticipo la crea con el total {enGrupo ? 'del grupo' : 'del POS'} ({dinero(totalPos)}). Si la reserva ya tiene una venta, concíliala.</span>
          {puedeGestionar && onConciliar && conciliacionDisponible && <Button type="button" variant="outline" className="self-start h-10" onClick={() => onConciliar(r)}>Conciliar con una venta existente</Button>}
        </div>
      ) : venta?.anulado || (!venta && ventaPerdida) ? (
        <div className="flex flex-col gap-2">
          <span className="t-cuerpo-fuerte">{venta?.anulado ? 'La venta enlazada está anulada' : 'La venta enlazada ya no existe'}</span>
          <span className="t-meta text-muted-foreground">{venta?.anulado ? 'Se anuló en el Centro de Ventas, así que no admite cobros.' : 'Se eliminó del Centro de Ventas o aún no está en este dispositivo.'} Desenlázala: el próximo anticipo creará una venta nueva con el total del POS.</span>
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
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', reembolso ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success-foreground')}><MetodoIcono size={20} /></span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="t-cuerpo-fuerte capitalize truncate">{reembolso ? 'Reembolso' : 'Anticipo'} · {m.metodo_pago}</span>
                    <span className="t-meta text-muted-foreground truncate">
                      {new Date(m.fecha).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {m.transferencia_banco ? ` · ${m.transferencia_banco}` : ''}{m.tarjeta_red ? ` · ${m.tarjeta_red}` : ''}
                    </span>
                    {enGrupo && <Destino motivo={m.motivo} grupo={grupo} />}
                  </span>
                  {/* Hueco fijo para el comprobante: los importes quedan alineados con o sin adjunto. */}
                  <span className="w-11 flex justify-center shrink-0">{m.comprobante_url && <PagoComprobanteLink url={m.comprobante_url} />}</span>
                  <span className={cn('t-cuerpo-fuerte tabular-nums text-right w-24 shrink-0', reembolso ? 'text-destructive' : 'text-success')}>{reembolso ? '−' : '+'}{dinero(m.monto ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {abierto && <FormAbono r={r} grupo={grupo} saldo={saldo} usuario={usuario} onCancelar={() => onAbrir(false)} onSucio={onSucio} onRegistrado={(n) => { onAbrir(false); onCambio(n); }} />}
    </Seccion>
  );
}

/** A qué cabaña (o a todo el grupo) corresponde un pago; los hechos en Ventas sin asignar quedan como «Sin asignar». */
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
      showToast.success('Anticipo registrado', `Se registró un anticipo de ${dinero(montoN)} en el Centro de Ventas.`);
      onSucio(false);
      onRegistrado(nueva);
    } catch (e) {
      showToast.fallo('registrar el anticipo', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="t-cuerpo-fuerte">Registrar anticipo · saldo {dinero(Math.max(0, saldo))}</span>
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
        {excede && <p className="t-meta text-destructive">El anticipo no puede superar el saldo ({dinero(saldo)}).</p>}
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
        <label className="flex items-center gap-2 h-11 px-3 rounded-2xl border border-dashed border-border t-cuerpo text-muted-foreground cursor-pointer hover:bg-muted/60 hover:text-foreground transition-colors">
          <Paperclip size={16} className="shrink-0" />
          <span className="truncate">{archivo ? archivo.name : 'Adjuntar foto o PDF'}</span>
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => cambiar(setArchivo)(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {!r.venta_id && <p className="t-meta text-muted-foreground">Se creará {grupo.length > 1 ? 'una sola venta para todo el grupo' : 'la venta de esta reserva'} en el Centro de Ventas con el total del POS.</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void registrar()} disabled={guardando || sinSaldo}>
          {guardando ? <><Girando /> Registrando…</> : <><Check size={16} weight="bold" /> Registrar anticipo</>}
        </Button>
      </div>
    </div>
  );
}
