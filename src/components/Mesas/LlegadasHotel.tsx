import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { SignIn, Bed, Info, Clock } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { initVerticalRxDb } from '../../db/rxdb';
import { useDbEpoch } from '../../hooks/useDbEpoch';
import { useUI } from '../../context/UIContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calcularVenta } from '../../lib/ventaConMovimientos';
import { limpiarReferencia } from '../../lib/nombreMesa';

type Dia = 'hoy' | 'manana';
// Reservas que llegaron hace más de esto y siguen sin cuenta ya no se listan (se ven en Centro de Ventas).
const DIAS_ATRASO_MAX = 7;

interface Llegada { id: string; huesped: string; clienteId?: string; llegada: string; salida?: string; venta: any }

function Conteo({ n }: { n: number }) {
  return <span className="min-w-5 rounded-full px-1.5 py-0.5 t-dato leading-none tabular-nums bg-foreground/10 text-muted-foreground">{n}</span>;
}

// Solo PC. Reservas de hotel que llegan hoy (y las atrasadas sin cuenta) o mañana, sobre las habitaciones: tocar una
// tarjeta la deja elegida y la próxima habitación libre que se abra toma sus datos y queda ligada a la venta.
// Una venta abre una sola habitación; si el grupo es de varias, las demás se abren a mano.
export function LlegadasHotel() {
  const dbEpoch = useDbEpoch();
  const { llegadaCheckin, setLlegadaCheckin } = useUI();
  const [dia, setDia] = useState<Dia>('hoy');
  const [ventas, setVentas] = useState<any[]>([]);
  const [conCuenta, setConCuenta] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const subs: Array<{ unsubscribe: () => void }> = [];
    (async () => {
      const db = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      subs.push(db.ventas.find({ selector: { organization_id: orgId, origen: 'reserva_hotel', _deleted: { $ne: true } } }).$
        .subscribe((docs: any[]) => { if (alive) setVentas(docs.map(d => d.toJSON())); }));
      subs.push(db.habitacion_cuentas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$
        .subscribe((docs: any[]) => {
          if (alive) setConCuenta(new Set(docs.map(d => d.toJSON().venta_id).filter(Boolean)));
        }));
    })().catch(() => {});
    return () => { alive = false; subs.forEach(s => s.unsubscribe()); };
  }, [dbEpoch]);

  const hoy = dayjs().format('YYYY-MM-DD');
  const manana = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const desde = dayjs().subtract(DIAS_ATRASO_MAX, 'day').format('YYYY-MM-DD');

  const { delDia, deManana } = useMemo(() => {
    const pendientes: Llegada[] = ventas
      .filter(v => v.llegada && !conCuenta.has(v.id) && !(v.movimientos ?? []).some((m: any) => m.tipo === 'anular' && !m.anulado))
      .map(v => ({ id: v.id, huesped: v.cliente_nombre || 'Sin nombre', clienteId: v.cliente_id || undefined, llegada: v.llegada, salida: v.salida || undefined, venta: v }));
    return {
      delDia: pendientes.filter(l => l.llegada <= hoy && l.llegada >= desde).sort((a, b) => a.llegada.localeCompare(b.llegada)),
      deManana: pendientes.filter(l => l.llegada === manana),
    };
  }, [ventas, conCuenta, hoy, manana, desde]);

  // Solo se puede elegir una llegada de hoy (o atrasada): si lo elegido ya no está ahí (se abrió su cuenta, se anuló la venta), se suelta.
  useEffect(() => {
    if (llegadaCheckin && !delDia.some(l => l.id === llegadaCheckin.ventaId)) setLlegadaCheckin(null);
  }, [llegadaCheckin, delDia, setLlegadaCheckin]);

  if (delDia.length === 0 && deManana.length === 0) return null;
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
        <h2 className="t-etiqueta flex items-center gap-1.5 text-muted-foreground"><SignIn size={13} weight="bold" /> Llegadas</h2>
        {/* Control segmentado del UI kit (distinto de los chips de zonas). */}
        <Tabs value={dia} onValueChange={(v) => cambiarDia(v as Dia)}>
          <TabsList aria-label="Día de llegada" className="w-auto h-9">
            <TabsTrigger value="hoy" className="px-3">Hoy <Conteo n={delDia.length} /></TabsTrigger>
            <TabsTrigger value="manana" className="px-3">Mañana <Conteo n={deManana.length} /></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {lista.length === 0 ? (
        <p className="t-meta text-muted-foreground">{dia === 'hoy' ? 'No hay llegadas pendientes hoy.' : 'No hay llegadas registradas para mañana.'}</p>
      ) : (
        <div className="flex items-stretch gap-2 overflow-x-auto hide-scrollbar py-1 -my-1 -mx-5 px-5">
          {lista.map(l => {
            const esManana = l.llegada > hoy;
            const atrasada = l.llegada < hoy;
            const elegida = !esManana && llegadaCheckin?.ventaId === l.id;
            const dias = dayjs(hoy).diff(dayjs(l.llegada), 'day');
            // Tres estados que se leen de un vistazo: hoy (azul, con acción), atrasada (rojo, con acción) y mañana (neutra, solo consulta).
            const estado = esManana ? 'Mañana' : atrasada ? `Atrasada ${dias} ${dias === 1 ? 'día' : 'días'}` : 'Llega hoy';
            const estadoClase = esManana ? 'bg-muted text-muted-foreground' : atrasada ? 'bg-destructive-soft text-destructive' : 'bg-info-soft text-info-foreground';
            const contenido = (
              <>
                <span className={cn('t-dato self-start px-2 py-0.5 rounded-md', estadoClase)}>{estado}</span>
                <span className={cn('font-redonda t-titulo truncate', esManana ? 'text-secondary-foreground' : 'text-foreground')}>{l.huesped}</span>
                <span className="t-meta text-muted-foreground tabular-nums">
                  {dayjs(l.llegada).locale('es').format('ddd DD/MM')}{l.salida ? ` → ${dayjs(l.salida).locale('es').format('ddd DD/MM')}` : ''}
                </span>
                {/* Renglón de acción siempre presente (cambia de texto, no de alto): elegir no empuja las habitaciones de abajo. */}
                <span className={cn('t-dato flex items-center gap-1 mt-0.5', esManana ? 'text-muted-foreground' : elegida ? 'text-info-foreground' : 'text-muted-foreground')}>
                  {esManana
                    ? <><Clock size={13} weight="bold" /> Aún no llega</>
                    : elegida
                      ? <><Bed size={13} weight="fill" /> Elige una habitación libre</>
                      : <><Bed size={13} weight="bold" /> Toca para abrir cuenta</>}
                </span>
              </>
            );
            return (
              <div key={l.id} className="relative shrink-0 w-64">
                {esManana ? (
                  <div className="w-full h-full rounded-2xl border-2 border-dashed border-border p-3.5 pr-12 flex flex-col gap-1 cursor-default">
                    {contenido}
                  </div>
                ) : (
                  <button type="button" aria-pressed={elegida}
                    onClick={() => setLlegadaCheckin(elegida ? null : { ventaId: l.id, huesped: l.huesped, clienteId: l.clienteId, llegada: l.llegada, salida: l.salida })}
                    className={cn('w-full h-full text-left rounded-2xl p-3.5 pr-12 flex flex-col gap-1 cursor-pointer transition-all border-2',
                      elegida ? 'border-info bg-info-soft' : 'bg-card shadow-2xs border-transparent hover:border-info/40')}>
                    {contenido}
                  </button>
                )}
                <DetalleLlegada llegada={l} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const dinero = (n: number) => `$${n.toFixed(2)}`;

// Botón de info de la tarjeta: descripción de la venta, estadía y cuánto lleva pagado.
function DetalleLlegada({ llegada: l }: { llegada: Llegada }) {
  const v = calcularVenta(l.venta);
  const noches = l.salida ? dayjs(l.salida).diff(dayjs(l.llegada), 'day') : null;
  const descripcion = limpiarReferencia(l.venta.referencia);
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4">
      <span className="t-etiqueta text-muted-foreground shrink-0">{etiqueta}</span>
      <span className="t-cuerpo text-foreground text-right tabular-nums min-w-0 break-words">{valor}</span>
    </div>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Ver detalle de la venta" aria-label={`Ver detalle de la reserva de ${l.huesped}`}
          className="absolute top-2 right-2 size-9 pointer-coarse:size-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-info-foreground hover:bg-info-soft transition-colors cursor-pointer">
          <Info size={18} weight="bold" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} className="w-80 flex flex-col gap-2.5 p-4">
        <span className="font-redonda t-titulo text-foreground">{l.huesped}</span>
        {descripcion && <p className="t-cuerpo text-secondary-foreground whitespace-pre-wrap break-words">{descripcion}</p>}
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {fila('Llegada', dayjs(l.llegada).format('DD/MM/YYYY'))}
          {fila('Salida', l.salida ? dayjs(l.salida).format('DD/MM/YYYY') : '—')}
          {noches != null && noches > 0 && fila('Noches', noches)}
          {fila('Tipo de cobro', l.venta.tipo === 'credito' ? 'Crédito' : 'Directo')}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {fila('Monto', dinero(v.montoTotal))}
          {fila('Pagado', dinero(v.totalPagado))}
          {fila('Saldo', dinero(Math.max(0, v.saldo)))}
        </div>
        {v.textoComentarios && (
          <div className="border-t border-border pt-2.5">
            <span className="t-etiqueta text-muted-foreground">Comentarios</span>
            <p className="t-cuerpo text-secondary-foreground whitespace-pre-wrap break-words mt-1">{v.textoComentarios}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
