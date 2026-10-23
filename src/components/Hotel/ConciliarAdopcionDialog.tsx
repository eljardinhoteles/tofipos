import { useMemo, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { Bed, CalendarBlank, Check, Plus, Receipt, User, WarningCircle } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { BannerEspera, Girando } from './Espera';
import { useAuth } from '../../context/AuthContext';
import { useRxClientes } from '../../hooks/useRxClientes';
import { useVentasConMovimientos } from '../../hooks/useVentasConMovimientos';
import { agregarVentaMovimiento, createRxCliente, createRxVenta, updateRxCliente, updateRxVenta, type RxCliente } from '../../db/rxdb';
import type { ReservaCloudbedsDetalle } from '../../lib/cloudbeds';
import { habitacionDeUnidad, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { adoptarReservaHotel, conciliacionDisponible, desenlazarVentaHotel, enlazarReservaHotel, type ReservaHotel } from '../../lib/hotelReservasApi';
import {
  ETIQUETA_CAMPO, candidatosCliente, candidatosVenta, diferencias, nombreCompleto, valoresCloudbeds, type CampoCliente,
} from '../../lib/hotelConciliacion';

const dinero = (n: number) => `$${n.toFixed(2)}`;
const fechaCorta = (f?: string) => (f ? dayjs(f).format('DD/MM/YY') : '—');
const EPS = 0.005;

type EleccionVenta = { tipo: 'existente'; id: string } | { tipo: 'nueva' } | { tipo: 'ninguna' };
type EleccionCliente = { tipo: 'existente'; id: string } | { tipo: 'nuevo' } | { tipo: 'ninguno' };

interface Props {
  det: ReservaCloudbedsDetalle;
  habitaciones: HabitacionHotel[];
  /** Reservas del POS ya cargadas: para avisar si una venta ya está conciliada con otra habitación. */
  reservas: ReservaHotel[];
  /** Si viene, la reserva YA está en el POS (adoptada antes o creada aquí): solo se concilia, no se adopta. */
  reserva?: ReservaHotel;
  onClose: () => void;
  onHecha: (r: ReservaHotel) => void;
}

/**
 * Adoptar una reserva de Cloudbeds conciliándola, 1 a 1 y a mano, con el Centro de Ventas (donde viven sus cobros) y con
 * la ficha del cliente. Nada se decide solo: el POS sugiere candidatos y la persona elige. Cloudbeds no se modifica, y
 * Cloudbeds y Ventas no se cruzan (los saldos no se sincronizan).
 */
export function ConciliarAdopcionDialog({ det, habitaciones, reservas, reserva, onClose, onHecha }: Props) {
  const { currentMesero } = useAuth();
  const { clientes } = useRxClientes() as { clientes: RxCliente[] };
  const { items } = useVentasConMovimientos();

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [venta, setVenta] = useState<EleccionVenta | null>(null);
  const [ajustarVenta, setAjustarVenta] = useState(false);
  const [cliente, setCliente] = useState<EleccionCliente | null>(reserva?.cliente_id ? { tipo: 'existente', id: reserva.cliente_id } : null);
  const [campos, setCampos] = useState<Partial<Record<CampoCliente, 'pos' | 'cloudbeds'>>>({});
  const [guardando, setGuardando] = useState(false);

  const hab = det.habitaciones[0];
  const cabana = (hab ? habitacionDeUnidad(habitaciones, hab.roomTypeID, hab.roomID) : undefined)?.nombre ?? hab?.nombreUnidad ?? hab?.nombre ?? '—';
  const nombre = nombreCompleto(det) || 'Huésped';
  const cb = valoresCloudbeds(det);

  const enlazadas = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservas) if (r.venta_id && r.estado === 'confirmada' && r.id !== reserva?.id) m.set(r.venta_id, (m.get(r.venta_id) ?? 0) + 1);
    return m;
  }, [reservas, reserva?.id]);
  const sugeridasVenta = useMemo(() => candidatosVenta(det, items, clientes, enlazadas), [det, items, clientes, enlazadas]);
  const sugeridosCliente = useMemo(() => candidatosCliente(det, clientes), [det, clientes]);

  const ventaElegida = venta?.tipo === 'existente' ? items.find((i) => i.venta.id === venta.id) : undefined;
  const conflictoTarifa = !!ventaElegida && Math.abs(ventaElegida.montoTotal - det.total) > EPS;
  const clienteElegido = cliente?.tipo === 'existente' ? clientes.find((c) => c.id === cliente.id) : undefined;
  const difs = clienteElegido ? diferencias(det, clienteElegido) : [];
  // Lo que Cloudbeds tiene y la ficha no: se completa solo (no es un conflicto).
  const completar = clienteElegido
    ? (['email', 'telefono'] as CampoCliente[]).filter((k) => cb[k] && !(k === 'email' ? clienteElegido.email : clienteElegido.telefono))
    : [];

  // Al pasar al cliente, si la venta elegida ya tiene uno, se propone ese.
  const irACliente = () => {
    if (!cliente && ventaElegida?.venta.cliente_id && clientes.some((c) => c.id === ventaElegida.venta.cliente_id)) {
      setCliente({ tipo: 'existente', id: ventaElegida.venta.cliente_id });
    }
    setPaso(2);
  };

  const confirmar = async () => {
    if (!venta || !cliente) return;
    setGuardando(true);
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    let ventaNuevaId: string | null = null;
    let adoptada: ReservaHotel | null = null;
    try {
      // 1) Cliente: crear la ficha o unificar los datos elegidos.
      let clienteId: string | null = null;
      let clienteNombre = nombre;
      let huesped: { nombre: string; apellido: string; email: string; telefono: string } | undefined;
      if (cliente.tipo === 'nuevo') {
        clienteId = crypto.randomUUID();
        await createRxCliente({
          id: clienteId,
          nombre,
          email: cb.email || undefined,
          telefono: cb.telefono || undefined,
          tipo_cliente: det.huesped.pais && det.huesped.pais.toUpperCase() !== 'EC' ? 'extranjero' : 'persona_natural',
          organization_id: orgId,
        });
      } else if (clienteElegido) {
        clienteId = clienteElegido.id;
        const patch: Partial<RxCliente> = {};
        for (const k of difs) if (campos[k] === 'cloudbeds') patch[k] = cb[k];
        for (const k of completar) patch[k] = cb[k];
        if (Object.keys(patch).length > 0) await updateRxCliente(clienteElegido.id, patch);
        const final = { nombre: patch.nombre ?? clienteElegido.nombre, email: patch.email ?? clienteElegido.email ?? cb.email, telefono: patch.telefono ?? clienteElegido.telefono ?? cb.telefono };
        clienteNombre = final.nombre;
        // La reserva guarda nombre y apellido por separado: si manda el nombre del POS se parte en la primera palabra.
        const [primero, ...resto] = final.nombre.trim().split(/\s+/);
        const usaNombrePOS = campos.nombre !== 'cloudbeds' && difs.includes('nombre');
        huesped = {
          nombre: usaNombrePOS ? primero : det.huesped.nombre,
          apellido: usaNombrePOS ? resto.join(' ') : det.huesped.apellido,
          email: final.email ?? '',
          telefono: final.telefono ?? '',
        };
      }

      // 2) Reserva del POS enlazada (si ya estaba enlazada, falla aquí y no se crea nada en Ventas).
      ventaNuevaId = venta.tipo === 'nueva' ? crypto.randomUUID() : null;
      const ventaId = venta.tipo === 'existente' ? venta.id : ventaNuevaId;
      const tarifaManual = ventaElegida && conflictoTarifa && !ajustarVenta
        ? { total: ventaElegida.montoTotal, motivo: 'Total de la venta conciliada' }
        : null;
      adoptada = reserva
        ? await enlazarReservaHotel(reserva, { ventaId, clienteId, huesped, tarifaManual })
        : await adoptarReservaHotel(det, habitaciones, { ventaId, clienteId, huesped, tarifaManual });

      // 3) Centro de Ventas.
      if (venta.tipo === 'nueva' && ventaNuevaId) {
        await createRxVenta({
          id: ventaNuevaId,
          origen: 'reserva_hotel',
          tipo: 'directa',
          cliente_id: clienteId ?? undefined,
          cliente_nombre: clienteNombre,
          referencia: `Reserva de hotel — ${clienteNombre} · ${cabana}`,
          llegada: det.llegada,
          salida: det.salida,
          organization_id: orgId,
          usuario_id: currentMesero?.id,
        }, det.total);
      } else if (ventaElegida) {
        if (clienteId && ventaElegida.venta.cliente_id !== clienteId) {
          await updateRxVenta(ventaElegida.venta.id, { cliente_id: clienteId, cliente_nombre: clienteNombre });
        }
        if (conflictoTarifa && ajustarVenta) {
          await agregarVentaMovimiento({
            venta_id: ventaElegida.venta.id,
            tipo: 'ajuste',
            monto: Math.round((det.total - ventaElegida.montoTotal) * 100) / 100,
            motivo: `Conciliación con la tarifa de Cloudbeds (reserva ${det.reservationID})`,
            usuario_id: currentMesero?.id,
          });
        }
      }

      showToast.success('Reserva conciliada', det.fuenteExterna ? 'Es de un canal externo: sus fechas y su cancelación se gestionan en Cloudbeds.' : undefined);
      onHecha(adoptada);
    } catch (e) {
      // La reserva ya quedó enlazada pero la venta nueva no se creó: se quita el enlace para no apuntar a una venta inexistente.
      if (adoptada && ventaNuevaId) await desenlazarVentaHotel(adoptada.id).catch(() => {});
      showToast.fallo(adoptada ? 'completar la conciliación con el Centro de Ventas' : 'conciliar la reserva', e);
      if (adoptada) onHecha(adoptada);
    } finally {
      setGuardando(false);
    }
  };

  const puedeContinuar = paso === 1 ? !!venta : paso === 2 ? !!cliente && difs.every((k) => campos[k]) : true;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="t-titulo">{reserva ? 'Conciliar con el Centro de Ventas' : 'Conciliar reserva'}</DialogTitle>
          <DialogDescription className="t-meta">
            {nombre} · {cabana} · {fechaCorta(det.llegada)} → {fechaCorta(det.salida)} · {reserva ? 'Total POS' : 'Tarifa Cloudbeds'} {dinero(det.total)}
          </DialogDescription>
        </DialogHeader>

        <Pasos paso={paso} />
        {guardando && <BannerEspera texto="Conciliando la reserva…" detalle="No cierres esta ventana" />}

        <div className="min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
          {!conciliacionDisponible && (
            <Aviso>Falta ejecutar la migración <b>20261018000100_hotel_reservas_venta_cliente.sql</b> en Supabase: sin ella no se puede guardar el enlace con la venta ni con el cliente.</Aviso>
          )}

          {paso === 1 && (
            <>
              <p className="t-cuerpo text-muted-foreground">¿En qué venta del Centro de Ventas se registran los cobros de esta reserva?</p>
              {sugeridasVenta.length === 0 && <p className="t-meta text-muted-foreground">No hay ventas de hotel con fechas o nombre parecidos.</p>}
              {sugeridasVenta.map(({ item, motivos, yaEnlazadaCon }) => (
                <Opcion key={item.venta.id} activa={venta?.tipo === 'existente' && venta.id === item.venta.id} onClick={() => setVenta({ tipo: 'existente', id: item.venta.id })} icono={Receipt}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="t-cuerpo-fuerte truncate">{item.venta.cliente_nombre || item.venta.referencia || 'Venta sin nombre'}</span>
                    <span className="t-meta text-muted-foreground">{fechaCorta(item.venta.llegada)} → {fechaCorta(item.venta.salida)}</span>
                  </div>
                  <div className="t-meta text-muted-foreground">
                    Total {dinero(item.montoTotal)} · Pagado {dinero(item.totalPagado)} · Saldo {dinero(item.saldo)}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {motivos.map((m) => <EstadoBadge key={m} tono="info">{m}</EstadoBadge>)}
                    {yaEnlazadaCon > 0 && <EstadoBadge tono="warning">Ya conciliada con {yaEnlazadaCon} {yaEnlazadaCon === 1 ? 'habitación' : 'habitaciones'}</EstadoBadge>}
                  </div>
                </Opcion>
              ))}
              <Opcion activa={venta?.tipo === 'nueva'} onClick={() => setVenta({ tipo: 'nueva' })} icono={Plus}>
                <span className="t-cuerpo-fuerte">Crear venta nueva por {dinero(det.total)}</span>
                <span className="t-meta text-muted-foreground">Reserva de hotel, directa, con la tarifa de Cloudbeds. Los pagos se registran después en Ventas.</span>
              </Opcion>
              <Opcion activa={venta?.tipo === 'ninguna'} onClick={() => setVenta({ tipo: 'ninguna' })}>
                <span className="t-cuerpo-fuerte">Sin venta por ahora</span>
                <span className="t-meta text-muted-foreground">Se puede conciliar más adelante.</span>
              </Opcion>

              {ventaElegida && conflictoTarifa && (
                <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-3">
                  <span className="t-cuerpo-fuerte text-warning-foreground">
                    La venta suma {dinero(ventaElegida.montoTotal)} y Cloudbeds tiene {dinero(det.total)}. ¿Cuál manda en el POS?
                  </span>
                  <Eleccion activa={!ajustarVenta} onClick={() => setAjustarVenta(false)}>
                    Mantener la venta ({dinero(ventaElegida.montoTotal)}): queda como tarifa manual del POS. Cloudbeds no cambia.
                  </Eleccion>
                  <Eleccion activa={ajustarVenta} onClick={() => setAjustarVenta(true)}>
                    Ajustar la venta a Cloudbeds: se agrega un ajuste de {dinero(det.total - ventaElegida.montoTotal)} en el Centro de Ventas.
                  </Eleccion>
                </div>
              )}
            </>
          )}

          {paso === 2 && (
            <>
              <p className="t-cuerpo text-muted-foreground">¿Qué ficha de cliente del POS es este huésped?</p>
              <Datos titulo="En Cloudbeds" filas={[['Nombre', cb.nombre], ['Correo', cb.email], ['Teléfono', cb.telefono], ['País', det.huesped.pais]]} />
              {sugeridosCliente.map(({ cliente: c, motivos }) => (
                <Opcion key={c.id} activa={cliente?.tipo === 'existente' && cliente.id === c.id} onClick={() => { setCliente({ tipo: 'existente', id: c.id }); setCampos({}); }} icono={User}>
                  <span className="t-cuerpo-fuerte">{c.nombre}</span>
                  <span className="t-meta text-muted-foreground">{[c.email, c.telefono, c.numero_doc].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">{motivos.map((m) => <EstadoBadge key={m} tono="info">{m}</EstadoBadge>)}</div>
                </Opcion>
              ))}
              {sugeridosCliente.length === 0 && <p className="t-meta text-muted-foreground">No hay clientes con ese correo, teléfono o nombre.</p>}
              <Opcion activa={cliente?.tipo === 'nuevo'} onClick={() => setCliente({ tipo: 'nuevo' })} icono={Plus}>
                <span className="t-cuerpo-fuerte">Crear cliente con los datos de Cloudbeds</span>
              </Opcion>
              <Opcion activa={cliente?.tipo === 'ninguno'} onClick={() => setCliente({ tipo: 'ninguno' })}>
                <span className="t-cuerpo-fuerte">Sin ficha de cliente</span>
              </Opcion>

              {clienteElegido && difs.length > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
                  <span className="t-cuerpo-fuerte">Datos distintos: elige cuál queda</span>
                  {difs.map((k) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <span className="t-etiqueta text-muted-foreground">{ETIQUETA_CAMPO[k]}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Eleccion activa={campos[k] === 'pos'} onClick={() => setCampos((c) => ({ ...c, [k]: 'pos' }))}>POS: {String(clienteElegido[k] ?? '')}</Eleccion>
                        <Eleccion activa={campos[k] === 'cloudbeds'} onClick={() => setCampos((c) => ({ ...c, [k]: 'cloudbeds' }))}>Cloudbeds: {cb[k]}</Eleccion>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {clienteElegido && completar.length > 0 && (
                <p className="t-meta text-muted-foreground">Se completará en la ficha: {completar.map((k) => `${ETIQUETA_CAMPO[k].toLowerCase()} ${cb[k]}`).join(' · ')}.</p>
              )}
            </>
          )}

          {paso === 3 && venta && cliente && (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border p-4">
              <Resumen icono={Bed}>{reserva ? `La reserva ${det.reservationID} (${cabana}) ya está en el POS: se concilia con Ventas y el cliente.` : `Se enlaza la reserva ${det.reservationID} (${cabana}) con el POS.`} En Cloudbeds no cambia nada.</Resumen>
              <Resumen icono={CalendarBlank}>{fechaCorta(det.llegada)} → {fechaCorta(det.salida)} · tarifa del POS {dinero(ventaElegida && conflictoTarifa && !ajustarVenta ? ventaElegida.montoTotal : det.total)}</Resumen>
              <Resumen icono={Receipt}>
                {venta.tipo === 'nueva' ? `Se crea una venta de hotel por ${dinero(det.total)} en el Centro de Ventas.`
                  : venta.tipo === 'existente' && ventaElegida ? `Se concilia con la venta de ${ventaElegida.venta.cliente_nombre || ventaElegida.venta.referencia || 'hotel'} (pagado ${dinero(ventaElegida.totalPagado)}).${conflictoTarifa && ajustarVenta ? ` Se agrega un ajuste de ${dinero(det.total - ventaElegida.montoTotal)}.` : ''}`
                  : 'Sin venta: los cobros se concilian más adelante.'}
              </Resumen>
              <Resumen icono={User}>
                {cliente.tipo === 'nuevo' ? `Se crea el cliente ${nombre}.`
                  : clienteElegido ? `Cliente ${clienteElegido.nombre}${difs.some((k) => campos[k] === 'cloudbeds') || completar.length > 0 ? ' · se actualiza su ficha' : ''}.`
                  : 'Sin ficha de cliente.'}
              </Resumen>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {paso > 1 && <Button type="button" variant="outline" disabled={guardando} onClick={() => setPaso((p) => (p - 1) as 1 | 2 | 3)}>Atrás</Button>}
          {paso < 3 ? (
            <Button type="button" disabled={!puedeContinuar || !conciliacionDisponible} onClick={() => (paso === 1 ? irACliente() : setPaso(3))}>Continuar</Button>
          ) : (
            <Button type="button" disabled={guardando || !conciliacionDisponible} onClick={() => void confirmar()} className="gap-2">
              {guardando ? <Girando /> : <Check size={16} weight="bold" />} Conciliar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pasos({ paso }: { paso: 1 | 2 | 3 }) {
  const nombres = ['Venta', 'Cliente', 'Revisar'];
  return (
    <ol className="flex items-center gap-2">
      {nombres.map((n, i) => (
        <li key={n} className={cn('flex items-center gap-2 t-meta', i + 1 === paso ? 'text-foreground font-bold' : 'text-muted-foreground')}>
          <span className={cn('size-6 rounded-full flex items-center justify-center t-dato', i + 1 <= paso ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{i + 1}</span>
          {n}
          {i < nombres.length - 1 && <span className="w-6 h-px bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function Opcion({ activa, onClick, icono: Icono, children }: { activa: boolean; onClick: () => void; icono?: typeof Receipt; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activa}
      className={cn('flex items-start gap-3 rounded-2xl border p-3 text-left cursor-pointer transition-colors',
        activa ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border hover:bg-muted/60')}
    >
      <span className={cn('size-5 mt-0.5 shrink-0 rounded-full border-2 flex items-center justify-center', activa ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
        {activa && <Check size={11} weight="bold" />}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 grow">{children}</span>
      {Icono && <Icono size={18} className="text-muted-foreground shrink-0 mt-0.5" />}
    </button>
  );
}

function Eleccion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activa}
      className={cn('rounded-xl border px-3 py-2 text-left t-cuerpo cursor-pointer transition-colors break-words',
        activa ? 'border-primary bg-primary/5 ring-2 ring-primary/30 text-foreground' : 'border-border bg-card hover:bg-muted/60 text-muted-foreground')}
    >
      {children}
    </button>
  );
}

function Datos({ titulo, filas }: { titulo: string; filas: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl bg-muted p-3 flex flex-col gap-1">
      <span className="t-etiqueta text-muted-foreground">{titulo}</span>
      {filas.filter(([, v]) => v).map(([k, v]) => (
        <span key={k} className="t-cuerpo"><span className="text-muted-foreground">{k}:</span> {v}</span>
      ))}
    </div>
  );
}

function Resumen({ icono: Icono, children }: { icono: typeof Receipt; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icono size={18} className="text-muted-foreground shrink-0 mt-0.5" />
      <span className="t-cuerpo">{children}</span>
    </div>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-warning-soft text-warning-foreground p-3 t-meta">
      <WarningCircle size={18} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}
