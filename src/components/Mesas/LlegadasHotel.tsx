import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { SignIn, Bed, Info, Clock, Users, DotsThree, EyeSlash } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { initVerticalRxDb } from '../../db/rxdb';
import { useDbEpoch } from '../../hooks/useDbEpoch';
import { useUI } from '../../context/UIContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRxMesas } from '../../hooks/useRxMesas';
import { habitacionDeUnidad } from '../../lib/hotelHabitacionesApi';
import { parecidoNombre } from '../../lib/hotelConciliacion';
import { updateRxHabitacionCuenta } from '../../db/rxdb';
import { showToast } from '@/lib/toast';
import { useLlegadasHotel } from '../../hooks/useLlegadasHotel';
import { usePermisos } from '../../hooks/usePermisos';
import { nombreHuesped, omitirLlegadaMesas, restaurarLlegadaMesas, type ReservaHotel } from '../../lib/hotelReservasApi';

// El detalle de la reserva es el mismo panel del módulo Hotel; se carga solo al abrirlo para no engordar la pantalla de Mesas.
const ReservaDrawer = lazy(() => import('../Hotel/ReservaDrawer').then((m) => ({ default: m.ReservaDrawer })));

type Dia = 'hoy' | 'manana';

interface CuentaLlegada { id: string; mesa_id: string; huesped: string; check_in: string; check_out?: string | null; estado: 'activa' | 'cerrada'; reserva_hotel_id?: string | null; venta_id?: string | null }
// Tamaño de una tarjeta de llegada (y de sus marcadores): la fila no cambia de alto al cargar ni cuando no hay llegadas.
const TAMANO_TARJETA = 'h-[12.25rem] w-[16rem] shrink-0';

// Una cuenta antigua se da por la de una reserva si su ingreso es del mismo día (o ±1) y el nombre del huésped coincide.
const UMBRAL_NOMBRE = 0.5;

function Conteo({ n }: { n: number }) {
  return <span className="min-w-5 rounded-full px-1.5 py-0.5 t-dato leading-none tabular-nums bg-foreground/10 text-muted-foreground">{n}</span>;
}

// Solo PC. Reservas del módulo Hotel que llegan hoy (y las atrasadas sin cuenta) o mañana, UNA POR HABITACIÓN reservada: tocar una
// tarjeta la deja elegida y la próxima habitación libre que se abra toma sus datos y queda ligada a esa reserva (y a su venta).
export function LlegadasHotel() {
  const dbEpoch = useDbEpoch();
  const { llegadaCheckin, setLlegadaCheckin, setSelectedMesaEsHabitacion, setViewingComandaId, setSelectedMesaId } = useUI();
  const { mesas } = useRxMesas();
  const [dia, setDia] = useState<Dia>('hoy');
  const { reservas, habitaciones, recargar, cargado } = useLlegadasHotel();
  const permisos = usePermisos();
  // Reserva abierta en el panel de detalle del Hotel (la «i» de cada tarjeta).
  const [detalle, setDetalle] = useState<ReservaHotel | null>(null);
  // Cuentas de habitación (activas y cerradas): se cruzan con las reservas por enlace, por venta (cuentas antiguas) o por nombre y fecha.
  const [cuentas, setCuentas] = useState<CuentaLlegada[]>([]);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | undefined;
    (async () => {
      const db = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      sub = db.habitacion_cuentas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$
        .subscribe((docs: Array<{ toJSON: () => CuentaLlegada }>) => { if (alive) setCuentas(docs.map((x) => x.toJSON())); });
    })().catch(() => {});
    return () => { alive = false; sub?.unsubscribe(); };
  }, [dbEpoch]);

  // La habitación de Mesas asignada a una reserva (enlace del Hotel, opcional): solo cuenta si existe y está libre.
  const mesaAsignada = (r: ReservaHotel) => {
    const id = habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.mesa_id;
    const m = id ? (mesas as Array<{ id: string; nombre: string; estado?: string }>).find((x) => x.id === id) : undefined;
    return m && m.estado === 'libre' ? m : undefined;
  };
  const datosLlegada = (r: ReservaHotel, huesped: string, sugerida?: string) => ({
    reservaId: r.id, cloudbedsId: r.cloudbeds_reservation_id ?? undefined, ventaId: r.venta_id ?? undefined, habitacion: r.cabana, mesaSugeridaId: sugerida, huesped,
    clienteId: r.cliente_id ?? undefined, llegada: r.llegada, salida: r.salida,
  });

  const nombreMesa = (id: string) => (mesas as Array<{ id: string; nombre: string }>).find((m) => m.id === id)?.nombre ?? 'Habitación';
  const hoy = dayjs().format('YYYY-MM-DD');
  const manana = dayjs().add(1, 'day').format('YYYY-MM-DD');

  const { delDia, deManana, candidatasPara, ocultas } = useMemo(() => {
    // Las llegadas que NO se listan, con el motivo: así nunca desaparece una sin explicación.
    const ocultas: Array<{ r: ReservaHotel; motivo: string; restaurable: boolean }> = [];
    const ordenadas = [...reservas].sort((a, b) => a.llegada.localeCompare(b.llegada) || a.cabana.localeCompare(b.cabana, 'es', { numeric: true }));
    const porReserva = new Set(cuentas.map((c) => c.reserva_hotel_id).filter((x): x is string => !!x));
    const ventasDeReservas = new Set(reservas.map((r) => r.venta_id).filter((x): x is string => !!x));
    // Cuentas sin enlace con una reserva: las de una venta de reserva se cubren por venta (tantas reservas como cuentas); el resto se
    // intenta emparejar por nombre y fecha. Cada cuenta se usa una sola vez.
    const sinEnlace = cuentas.filter((c) => !c.reserva_hotel_id);
    const restantes = new Map<string, number>();
    for (const c of sinEnlace) if (c.venta_id && ventasDeReservas.has(c.venta_id)) restantes.set(c.venta_id, (restantes.get(c.venta_id) ?? 0) + 1);
    const libres = sinEnlace.filter((c) => !(c.venta_id && ventasDeReservas.has(c.venta_id)));
    const mesaDe = (r: ReservaHotel) => habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.mesa_id;
    const similitud = (c: CuentaLlegada, r: ReservaHotel) => parecidoNombre(c.huesped, nombreHuesped(r));
    const cercana = (c: CuentaLlegada, r: ReservaHotel) => Math.abs(dayjs(c.check_in).diff(dayjs(r.llegada), 'day')) <= 1;

    const pendientes = ordenadas.filter((r) => {
      if (r.sin_cuenta_mesas) { ocultas.push({ r, motivo: 'La ocultaste: no se abrirá cuenta', restaurable: true }); return false; }
      if (porReserva.has(r.id)) { ocultas.push({ r, motivo: 'Ya tiene una cuenta de habitación', restaurable: false }); return false; }
      const porVenta = r.venta_id ? restantes.get(r.venta_id) ?? 0 : 0;
      if (porVenta > 0 && r.venta_id) { restantes.set(r.venta_id, porVenta - 1); ocultas.push({ r, motivo: 'Una cuenta antigua comparte su venta', restaurable: false }); return false; }
      // Una cuenta sin enlace se da por la de esta reserva si el nombre coincide, o si es de la MISMA habitación e ingresó el mismo día de la llegada
      // y no es de un huésped anterior que sale ese día: sin esa salvedad, el huésped que se va tapaba a quien llega a su misma habitación.
      const i = libres.findIndex((c) => cercana(c, r) && (similitud(c, r) >= UMBRAL_NOMBRE
        || (!!mesaDe(r) && mesaDe(r) === c.mesa_id && c.check_in === r.llegada && !(c.check_out && c.check_out <= r.llegada))));
      if (i >= 0) { ocultas.push({ r, motivo: `Se tomó por la cuenta de ${libres[i].huesped} (${nombreMesa(libres[i].mesa_id)})`, restaurable: false }); libres.splice(i, 1); return false; }
      return true;
    });
    // Para vincular a mano: las cuentas ACTIVAS que siguen sin reserva, las más parecidas primero.
    const candidatasPara = (r: ReservaHotel) => libres
      .filter((c) => c.estado === 'activa')
      .map((c) => ({ c, puntos: similitud(c, r) + (cercana(c, r) ? 0.5 : 0) }))
      .sort((x, y) => y.puntos - x.puntos)
      .map((x) => x.c);
    return { delDia: pendientes.filter((r) => r.llegada <= hoy), deManana: pendientes.filter((r) => r.llegada === manana), candidatasPara, ocultas };
  }, [reservas, cuentas, habitaciones, hoy, manana, mesas]);

  // Solo se puede elegir una llegada de hoy (o atrasada): si lo elegido ya no está ahí (se abrió su cuenta, se canceló la reserva), se suelta.
  useEffect(() => {
    if (llegadaCheckin && !delDia.some((r) => r.id === llegadaCheckin.reservaId)) setLlegadaCheckin(null);
  }, [llegadaCheckin, delDia, setLlegadaCheckin]);

  const lista = dia === 'hoy' ? delDia : deManana;

  const cambiarDia = (valor: Dia) => {
    setDia(valor);
    // Mañana es solo de consulta: se suelta lo elegido para no dejar las habitaciones bloqueadas sin tarjeta a la vista.
    if (valor === 'manana') setLlegadaCheckin(null);
  };


  return (
    <section aria-label="Llegadas de hotel" className="hidden md:flex mb-5 flex-col gap-2">
      {/* items-start: el título arranca a la misma altura que el de la primera zona; el control segmentado cuelga a la derecha. */}
      <div className="flex items-start justify-between gap-3">
        {/* items-start: el título queda siempre en el mismo sitio, aparezca o no el botón de «ocultas» (más alto que él), que se sube para centrarse con el texto. */}
        <div className="flex items-start gap-3 min-w-0">
          <h2 className="t-etiqueta flex items-center gap-1.5 text-muted-foreground"><SignIn size={13} weight="bold" /> Llegadas</h2>
          {ocultas.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="-mt-1.5 h-7 px-2.5 rounded-full border border-border bg-card t-meta text-muted-foreground hover:bg-muted cursor-pointer inline-flex items-center gap-1.5" title="Llegadas del Hotel que no se listan y por qué">
                  <EyeSlash size={13} weight="bold" aria-hidden /> {ocultas.length} {ocultas.length === 1 ? 'oculta' : 'ocultas'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-2 flex flex-col gap-1">
                <span className="t-etiqueta text-muted-foreground px-2 pt-1">No se listan porque…</span>
                {ocultas.map(({ r, motivo, restaurable }) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/60">
                    <span className="flex flex-col min-w-0 grow">
                      <span className="t-cuerpo-fuerte truncate">{nombreHuesped(r)} · {r.cabana}</span>
                      <span className="t-meta text-muted-foreground">{motivo}</span>
                    </span>
                    {restaurable && <Button type="button" variant="outline" className="h-9 shrink-0" onClick={() => { void restaurarLlegadaMesas(r).then(() => { showToast.success('Llegada vuelta a mostrar'); recargar(); }).catch((e) => showToast.fallo('mostrar la llegada', e)); }}>Mostrar</Button>}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {/* Control segmentado del UI kit (distinto de los chips de zonas). */}
        <Tabs value={dia} onValueChange={(v) => cambiarDia(v as Dia)}>
          <TabsList aria-label="Día de llegada" className="w-auto h-9">
            <TabsTrigger value="hoy" className="px-3">Hoy <Conteo n={delDia.length} /></TabsTrigger>
            <TabsTrigger value="manana" className="px-3">Mañana <Conteo n={deManana.length} /></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!cargado ? (
        // Leyendo las reservas: tarjetas grises del mismo tamaño, para que lo de abajo no salte.
        <div className="flex items-stretch gap-2.5" aria-busy="true" aria-label="Cargando llegadas">
          {[0, 1].map((i) => <div key={i} className={`${TAMANO_TARJETA} rounded-2xl bg-muted/70 animate-pulse`} />)}
        </div>
      ) : lista.length === 0 ? (
        <div className={`${TAMANO_TARJETA} rounded-2xl border border-dashed border-border bg-card/60 flex flex-col items-center justify-center gap-1.5 text-center px-4`}>
          <SignIn size={22} weight="bold" className="text-muted-foreground" aria-hidden />
          <span className="t-cuerpo-fuerte text-muted-foreground">{dia === 'hoy' ? 'No hay reservas que lleguen hoy' : 'No hay reservas que lleguen mañana'}</span>
          {ocultas.length > 0 && <span className="t-meta text-muted-foreground">Hay {ocultas.length} oculta{ocultas.length === 1 ? '' : 's'}: revísalas arriba.</span>}
        </div>
      ) : (
        <div className="flex items-stretch gap-2.5 overflow-x-auto hide-scrollbar py-1.5 -my-1.5 -mx-5 px-5">
          {lista.map((l) => {
            const huesped = nombreHuesped(l);
            const pax = l.adultos + l.ninos;
            const esManana = l.llegada > hoy;
            const atrasada = l.llegada < hoy;
            const elegida = !esManana && llegadaCheckin?.reservaId === l.id;
            const asignada = mesaAsignada(l);
            const dias = dayjs(hoy).diff(dayjs(l.llegada), 'day');
            // Tres estados que se leen de un vistazo: hoy (azul, con acción), atrasada (rojo, con acción) y mañana (neutra, solo consulta).
            const estado = esManana ? 'Mañana' : atrasada ? `Atrasada ${dias} ${dias === 1 ? 'día' : 'días'}` : 'Llega hoy';
            const estadoClase = esManana ? 'bg-muted text-muted-foreground' : atrasada ? 'bg-destructive-soft text-destructive' : 'bg-info-soft text-info-foreground';
            const cuerpo = (
              <>
                <span className={cn('t-dato self-start px-2 py-0.5 rounded-md', estadoClase)}>{estado}</span>
                <span className={cn('font-redonda t-titulo truncate mt-0.5', esManana ? 'text-secondary-foreground' : 'text-foreground')} title={huesped}>{huesped}</span>
                <span className="t-cuerpo-fuerte truncate flex items-center gap-1.5" title={l.cabana}><Bed size={14} weight="bold" className="shrink-0 text-muted-foreground" /> {l.cabana}</span>
                <span className="t-meta text-muted-foreground tabular-nums flex items-center gap-1.5">
                  <span className="capitalize">{dayjs(l.llegada).locale('es').format('ddd D MMM')}</span> → <span className="capitalize">{dayjs(l.salida).locale('es').format('ddd D MMM')}</span>
                  <span className="flex items-center gap-0.5"><Users size={12} aria-hidden /> {pax}</span>
                </span>
              </>
            );
            // Renglón de acción siempre presente y de una sola línea (cambia de texto, no de alto): elegir no empuja las habitaciones de abajo.
            const accion = (
              <span className={cn('t-dato flex items-center gap-1.5 mt-1 truncate', esManana ? 'text-muted-foreground' : elegida ? 'text-info-foreground' : 'text-muted-foreground')}>
                {esManana
                  ? <><Clock size={13} weight="bold" className="shrink-0" /> Aún no llega</>
                  : elegida
                    ? <><Bed size={13} weight="fill" className="shrink-0" /> Elige una habitación libre</>
                    : <><Bed size={13} weight="bold" className="shrink-0" /> Toca para abrir cuenta</>}
              </span>
            );
            return (
              <div key={l.id} className="relative shrink-0 w-64 flex">
                {esManana ? (
                  <div className="w-full rounded-2xl border-2 border-dashed border-border p-3.5 pr-12 flex flex-col gap-1 cursor-default">
                    {cuerpo}{accion}
                  </div>
                ) : (
                  <div className={cn('w-full rounded-2xl border-2 flex flex-col transition-all', elegida ? 'border-info bg-info-soft' : 'bg-card shadow-2xs border-transparent hover:border-info/40')}>
                    <button type="button" aria-pressed={elegida}
                      onClick={() => setLlegadaCheckin(elegida ? null : datosLlegada(l, huesped, asignada?.id))}
                      className={cn('w-full text-left p-3.5 pr-12 flex flex-col gap-1 cursor-pointer', asignada ? 'rounded-t-2xl' : 'rounded-2xl grow')}>
                      {cuerpo}{accion}
                    </button>
                    {/* Abrir directamente la habitación asignada es opcional: tocar la tarjeta y otra habitación libre sigue funcionando. */}
                    {asignada && (
                      <div className="px-3 pb-3 pt-0.5 mt-auto">
                        <button type="button" title={`Abrir la habitación asignada: ${asignada.nombre}`} aria-label={`Abrir la habitación asignada ${asignada.nombre}`}
                          onClick={() => { setLlegadaCheckin(datosLlegada(l, huesped, asignada.id)); setViewingComandaId(null); setSelectedMesaEsHabitacion(true); setSelectedMesaId(asignada.id); }}
                          className="w-full h-9 px-3 rounded-xl flex items-center justify-center gap-1.5 t-dato bg-info-soft text-info-foreground hover:bg-info/20 transition-colors cursor-pointer min-w-0">
                          <Bed size={14} weight="fill" className="shrink-0" />
                          <span className="truncate">Abrir {asignada.nombre.match(/Hab\.\s*\d+/)?.[0] ?? asignada.nombre}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button type="button" title="Ver la reserva" aria-label={`Ver la reserva de ${huesped}`} onClick={() => setDetalle(l)}
                  className="absolute top-2 right-2 size-9 pointer-coarse:size-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-info-foreground hover:bg-info-soft transition-colors cursor-pointer">
                  <Info size={18} weight="bold" />
                </button>
                {atrasada && (
                  <AccionesAtrasada reserva={l} candidatas={candidatasPara(l).map((c) => ({ id: c.id, ventaId: c.venta_id ?? undefined, texto: `${c.huesped} · ${nombreMesa(c.mesa_id)} · desde ${dayjs(c.check_in).format('DD/MM')}` }))} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {detalle && (
        <Suspense fallback={null}>
          <ReservaDrawer
            open reserva={detalle} habitaciones={habitaciones} reservas={reservas} onAbrirHermana={setDetalle}
            puedeGestionar={permisos.gestionarHotel} onClose={() => setDetalle(null)} onCambio={() => recargar()}
          />
        </Suspense>
      )}
    </section>
  );
}

// Para una llegada atrasada: ¿ya se atendió con el sistema anterior? Se vincula con la cuenta que ya está abierta, o se oculta.
function AccionesAtrasada({ reserva: r, candidatas }: { reserva: ReservaHotel; candidatas: Array<{ id: string; ventaId?: string; texto: string }> }) {
  const [abierto, setAbierto] = useState(false);
  const [cuentaId, setCuentaId] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const huesped = nombreHuesped(r);

  const vincular = async () => {
    const c = candidatas.find((x) => x.id === cuentaId);
    if (!c) return;
    setTrabajando(true);
    try {
      // La cuenta ya abierta pasa a pertenecer a esta reserva: deja de salir como llegada pendiente.
      await updateRxHabitacionCuenta(c.id, { reserva_hotel_id: r.id, ...(r.venta_id && !c.ventaId ? { venta_id: r.venta_id } : {}) });
      showToast.success('Cuenta vinculada', `${huesped} · ${r.cabana}`);
      setAbierto(false);
    } catch (e) { showToast.fallo('vincular la cuenta', e); } finally { setTrabajando(false); }
  };
  const omitir = async () => {
    setTrabajando(true);
    try {
      await omitirLlegadaMesas(r);
      showToast.success('Llegada ocultada', 'No se abrirá cuenta de habitación para esta reserva.');
      setAbierto(false);
    } catch (e) { showToast.fallo('ocultar la llegada', e); } finally { setTrabajando(false); }
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button type="button" title="Resolver esta llegada atrasada" aria-label={`Resolver la llegada atrasada de ${huesped}`}
          className="absolute top-11 right-2 size-9 pointer-coarse:size-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
          <DotsThree size={20} weight="bold" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} className="w-80 flex flex-col gap-2.5 p-4">
        <span className="t-etiqueta text-muted-foreground">¿Esta llegada ya se atendió?</span>
        <p className="t-meta text-muted-foreground">{huesped} · {r.cabana}. Si su cuenta ya está abierta (del sistema anterior), vincúlala; si no va a abrir cuenta aquí, oculta la llegada.</p>
        {candidatas.length > 0 ? (
          <div className="flex items-center gap-2">
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger className="data-[size=default]:h-10 min-w-0 flex-1 px-2.5 text-sm rounded-xl bg-card border-border shadow-xs" aria-label="Cuenta abierta de esta reserva"><SelectValue placeholder="Vincular con una cuenta abierta" /></SelectTrigger>
              <SelectContent>{candidatas.map((c) => <SelectItem key={c.id} value={c.id} className="t-cuerpo">{c.texto}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" className="h-10 shrink-0" onClick={() => void vincular()} disabled={!cuentaId || trabajando}>Vincular</Button>
          </div>
        ) : (
          <p className="t-meta text-muted-foreground">No hay cuentas abiertas sin reserva para vincular.</p>
        )}
        <Button type="button" variant="outline" className="h-10 justify-start gap-2" onClick={() => void omitir()} disabled={trabajando}>
          <EyeSlash size={16} aria-hidden /> No abrirá cuenta: ocultar esta llegada
        </Button>
      </PopoverContent>
    </Popover>
  );
}
