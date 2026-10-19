import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Bed, ForkKnife, Hash, Info, Moon, Note, UserCircle, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TONO_ESTADO, type TarjetaVista } from '../../lib/hotelCalendarioCache';
import type { ReservaHotel } from '../../lib/hotelReservasApi';
import { getReservaCloudbeds } from '../../lib/cloudbeds';
import { estiloDe, pagoDeVenta, type EstiloReserva, type InfoPago } from './estiloReserva';
import { useVentaDeReserva } from '../../hooks/useVentasHotel';
import { planSeCobra } from '../../lib/hotelPlanesApi';
import { categoriasDeExtras, useCategoriasExtras } from '../../hooks/useCategoriasExtrasHotel';
import { getCategoryIcon } from '@/lib/categoryIcons';
import type { VentaConMovimientos } from '../../lib/ventaConMovimientos';
import { EstadoBadge } from '../Common/EstadoBadge';

const RETRASO_HOVER_MS = 250;
const dinero = (n: number) => `$${n.toFixed(2)}`;
const fecha = (f: string) => dayjs(f).format('ddd D MMM');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  tarjeta: TarjetaVista;
  /** Nombre de la cabaña de la fila. */
  cabana: string;
  /** Posición dentro de la fila (el calendario la calcula): borde izquierdo y ancho, en CSS. */
  left: string;
  width: string;
  /** La reserva sigue fuera de la ventana por ese lado: el borde se deja recto. */
  cortaIzq: boolean;
  cortaDer: boolean;
  /** Abre la ficha completa. */
  onAbrir: (t: TarjetaVista) => void;
}

/**
 * Un elemento del calendario: la barra de una reserva o bloqueo Y su popover de datos, en un solo componente. Todo el
 * aspecto (color y icono del canal, franja de pago, noches, borde punteado, gris si ya salió) está aquí y en `estiloReserva`.
 *
 * Con mouse el popover aparece al pasar el cursor (y un clic abre la ficha); con pantalla táctil, el primer toque muestra el
 * popover y desde él se abre la ficha. También aparece al enfocar con teclado.
 */
// Con `memo`: el calendario se repinta con el reloj y con cada aviso de la caché, y la barra solo debe hacerlo si cambian sus datos.
export const ItemReserva = memo(function ItemReserva({ tarjeta: t, cabana, left, width, cortaIzq, cortaDer, onAbrir }: Props) {
  const estilo = estiloDe(t);
  // Estado de pago: solo de la venta conciliada en el Centro de Ventas.
  const venta = useVentaDeReserva(t.local?.venta_id);
  const pago = pagoDeVenta(venta);
  const sinConfirmar = t.estado === 'not_confirmed' || (!!t.local && t.local.sync_estado !== 'sincronizada');
  const noches = dayjs(t.hasta).diff(dayjs(t.desde), 'day');
  const Icono = estilo.icono;
  // Iconos de las categorías de los extras de la reserva (spa, tours…), junto al número de noches.
  const categoriasExtras = useCategoriasExtras();
  const iconosExtras = categoriasDeExtras(t.local?.extras ?? [], categoriasExtras).slice(0, 3);

  const [abierto, setAbierto] = useState(false);
  const [tactil, setTactil] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelar = () => { if (espera.current) { clearTimeout(espera.current); espera.current = null; } };
  useEffect(() => cancelar, []);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverAnchor asChild>
        <button
          type="button" style={{ left, width, backgroundImage: estilo.imagen }} aria-label={`${t.nombre}. ${estilo.etiqueta}`}
          className={cn(
            '@container absolute top-1.5 bottom-1.5 z-10 rounded-xl pr-2.5 flex items-center gap-2 text-left cursor-pointer overflow-hidden transition-[filter] hover:brightness-95',
            'pl-3',
            pago ? pago.fondo : estilo.fondo,
            cortaIzq && 'rounded-l-none', cortaDer && 'rounded-r-none',
            t.estado === 'checked_out' && '[filter:grayscale(0.7)_brightness(1.03)]',
            sinConfirmar ? 'border-2 border-dashed border-current/60' : 'border',
          )}
          onPointerDown={(e) => setTactil(e.pointerType !== 'mouse')}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'mouse') return;
            cancelar();
            espera.current = setTimeout(() => setAbierto(true), RETRASO_HOVER_MS);
          }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') { cancelar(); setAbierto(false); } }}
          onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setAbierto(true); }}
          onBlur={(e) => { if (!tactil && !(e.relatedTarget as HTMLElement | null)?.closest('[data-slot=popover-content]')) setAbierto(false); }}
          onClick={() => {
            cancelar();
            if (tactil) setAbierto((a) => !a); // táctil: el primer toque muestra los datos
            else { setAbierto(false); onAbrir(t); }
          }}
        >
          <span className="flex flex-col min-w-0 grow leading-tight">
            <span className="t-cuerpo-fuerte truncate">{t.nombre}</span>
            <span className="t-meta overflow-hidden whitespace-nowrap opacity-80 flex items-center gap-1">{plural(noches, 'noche', 'noches')}{iconosExtras.map((c, i) => { const Ic = getCategoryIcon(c.icono); return Ic ? <Ic key={c.id} size={13} weight="bold" aria-label={c.nombre} className={cn('shrink-0', i > 0 && 'hidden @min-[9rem]:block')} /> : null; })}{pago && <span className="hidden @min-[9rem]:inline"> · {pago.etiqueta}</span>}</span>
          </span>
          {/* El icono del canal solo cabe en las barras anchas; en las de una noche queda el nombre. */}
          <span className={cn('hidden @min-[6rem]:flex size-6 shrink-0 rounded-full items-center justify-center t-dato font-extrabold', estilo.circulo)}>
            {estilo.letra ?? (Icono ? <Icono size={14} weight="bold" /> : null)}
          </span>
        </button>
      </PopoverAnchor>
      {abierto && (
        <PopoverContent
          side="top" align="center" sideOffset={8} collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Con mouse es solo informativo: no debe interceptar el cursor ni mantenerse abierto al salir de la barra.
          className={cn('w-[22.5rem] max-w-[calc(100vw-1.5rem)] p-0 overflow-visible', !tactil && 'pointer-events-none')}
        >
          <Contenido t={t} estilo={estilo} venta={venta} pago={pago} cabana={cabana} tactil={tactil} onAbrir={() => { setAbierto(false); onAbrir(t); }} />
          <PopoverPrimitive.Arrow className="fill-popover drop-shadow-sm" width={16} height={8} />
        </PopoverContent>
      )}
    </Popover>
  );
});

function Fila({ icono: Icono, children }: { icono: typeof Info; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-1">
      <Icono size={18} weight="regular" className="text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 t-cuerpo text-muted-foreground flex-1">{children}</div>
    </div>
  );
}

// Tarifa de una reserva que no pasó por el POS: la lista del calendario no la trae, se consulta al abrir el popover.
const tarifasCloudbeds = new Map<string, number>();
function useTarifaCloudbeds(t: TarjetaVista, necesaria: boolean) {
  const [, avisar] = useState(0);
  useEffect(() => {
    if (!necesaria || tarifasCloudbeds.has(t.id)) return;
    let vivo = true;
    getReservaCloudbeds(t.id).then((r) => { tarifasCloudbeds.set(t.id, r.total); if (vivo) avisar((n) => n + 1); }).catch(() => {});
    return () => { vivo = false; };
  }, [necesaria, t.id]);
  return tarifasCloudbeds.get(t.id) ?? null;
}

/**
 * Importes. La tarifa viene de Cloudbeds; el POS puede fijar una manual (Cloudbeds conserva la normal) y suma los extras.
 * Los pagos se registran en el POS, así que el saldo de Cloudbeds se muestra solo como referencia, sin sincronizar.
 */
function Importes({ local, tarifaCloudbeds, saldoCloudbeds }: { local?: ReservaHotel; tarifaCloudbeds: number | null; saldoCloudbeds: number | null }) {
  const extras = local ? local.extras.reduce((a, e) => a + e.monto, 0) : 0;
  const tarifa = local ? local.total_estadia : tarifaCloudbeds;
  if (tarifa == null && saldoCloudbeds == null) return null;
  const total = local ? local.total_estadia + extras : tarifa;
  return (
    <>
      <div role="separator" className="border-t border-dashed border-border my-0.5" />
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-meta text-muted-foreground">
            {local?.tarifa_manual ? 'Tarifa manual' : 'Tarifa'}{extras > 0 ? ` + ${dinero(extras)} extras` : ''}
          </span>
          <span className="t-cuerpo-fuerte font-semibold">{total != null ? dinero(total) : '—'}</span>
        </div>
        {saldoCloudbeds != null && (
          <span className="t-meta text-muted-foreground text-xs">Saldo en Cloudbeds: {dinero(saldoCloudbeds)} (referencia)</span>
        )}
      </div>
    </>
  );
}

/** Cobros de la venta conciliada (Centro de Ventas): el estado real de pago de la reserva. */
function CobrosVenta({ venta, pago }: { venta: VentaConMovimientos; pago: InfoPago }) {
  const avance = venta.montoTotal > 0 ? Math.min(100, Math.max(0, ((venta.montoTotal - venta.saldo) / venta.montoTotal) * 100)) : 0;
  const tieneSaldo = venta.saldo > 0.005;
  return (
    <>
      <div role="separator" className="border-t border-dashed border-border my-0.5" />
      <div className="flex flex-col gap-1.5 px-1" title="Cobros registrados en el Centro de Ventas">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-meta text-muted-foreground">
            Pagado <b className="text-foreground font-semibold">{dinero(venta.totalPagado)}</b> de {dinero(venta.montoTotal)}
          </span>
          {tieneSaldo ? (
            <span className="t-cuerpo-fuerte text-warning-foreground shrink-0 font-semibold">
              Saldo {dinero(venta.saldo)}
            </span>
          ) : (
            <span className="t-meta text-success font-medium shrink-0">Pagado</span>
          )}
        </div>
        <div role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del pago" className="h-1 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', pago.barra)} style={{ width: `${avance}%` }} />
        </div>
      </div>
    </>
  );
}

function Contenido({ t, estilo, venta, pago, cabana, tactil, onAbrir }: { t: TarjetaVista; estilo: EstiloReserva; venta?: VentaConMovimientos; pago: InfoPago | null; cabana: string; tactil: boolean; onAbrir: () => void }) {
  const Icono = estilo.icono;
  const noches = dayjs(t.hasta).diff(dayjs(t.desde), 'day');
  const local = t.local;
  const esBloqueo = t.tipo === 'bloqueo';
  const pendiente = !!local && local.sync_estado !== 'sincronizada';

  const estado = esBloqueo ? estilo.etiqueta
    : pendiente ? 'Pendiente de subir'
    : TONO_ESTADO[t.estado ?? '']?.texto ?? 'Reserva';

  // Huéspedes: lo que guardó el POS, o lo que informa Cloudbeds.
  const adultos = local?.adultos ?? t.adultos;
  const ninos = local?.ninos ?? t.ninos ?? 0;
  const notasLocal = local?.notas_items ?? [];
  const tarifaCloudbeds = useTarifaCloudbeds(t, !esBloqueo && !local);

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <section className="rounded-xl bg-muted p-2.5 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-6 rounded-full flex items-center justify-center shrink-0 t-dato font-extrabold', estilo.circulo)}>
            {estilo.letra ?? (Icono ? <Icono size={13} weight="bold" /> : null)}
          </span>
          <span className="t-fila truncate">{esBloqueo ? estilo.etiqueta : (t.fuente ?? local?.fuente_nombre ?? estilo.etiqueta)}</span>
          {pago && <span className="ml-auto shrink-0"><EstadoBadge tono={pago.tono}>{pago.etiqueta}</EstadoBadge></span>}
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border/50">
          <span className="flex items-center gap-1.5 t-meta font-medium">
            <Moon size={14} weight="bold" className="text-primary shrink-0" />
            {plural(noches, 'noche', 'noches')} · {estado}
          </span>
          <span className="t-meta text-muted-foreground capitalize text-xs">
            {fecha(t.desde)} → {fecha(t.hasta)}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-2.5">
        {esBloqueo ? (
          <>
            {t.motivo && <Fila icono={Info}><span className="whitespace-pre-line">{t.motivo}</span></Fila>}
            <Fila icono={Bed}>{cabana}</Fila>
          </>
        ) : (
          <>
            <Fila icono={UserCircle}>
              <span className="block text-foreground t-fila">{t.nombre}</span>
              {adultos != null && (
                <span className="block">
                  {plural(adultos, 'adulto', 'adultos')}{ninos > 0 ? `, ${plural(ninos, 'niño', 'niños')}` : ''}
                </span>
              )}
            </Fila>
            <Fila icono={Bed}>
              {cabana}{local?.grupo_id ? ' · grupo del POS' : ''}
              {local?.cama && <span className="block">Cama: {local.cama}</span>}
            </Fila>
            {local?.plan_alimentacion && <Fila icono={ForkKnife}>{local.plan_alimentacion.nombre}<span className="text-muted-foreground"> · {planSeCobra(local.plan_alimentacion) ? 'con cargo' : 'incluido'}</span></Fila>}
            {notasLocal.length > 0 && (
              <Fila icono={Note}>
                <span className="block text-foreground t-fila">{plural(notasLocal.length, 'nota', 'notas')}</span>
                {notasLocal.slice(0, 3).map((n) => <span key={n.id} className="block line-clamp-2">{n.extra ? `${n.extra}: ` : ''}{n.texto}</span>)}
                {notasLocal.length > 3 && <span className="block">y {notasLocal.length - 3} más…</span>}
              </Fila>
            )}
            {local?.grupo_id && <Fila icono={UsersThree}>Parte de un grupo; cada cabaña es independiente</Fila>}
            {pendiente && <Fila icono={WarningCircle}><span className="text-warning-foreground">Aún no está en Cloudbeds: se reintenta sola</span></Fila>}
            {!local && <Fila icono={Hash}>Código {t.id}</Fila>}
            {venta && pago
              ? <CobrosVenta venta={venta} pago={pago} />
              : <Importes local={local} tarifaCloudbeds={tarifaCloudbeds} saldoCloudbeds={t.saldo ?? null} />}
          </>
        )}
      </div>

      {tactil
        ? <Button type="button" onClick={onAbrir} className="w-full">{local || esBloqueo ? 'Abrir' : 'Ver detalle'}</Button>
        : <p className="t-meta text-muted-foreground text-center">Clic para abrir</p>}
    </div>
  );
}
