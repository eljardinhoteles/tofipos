import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Baby, Bed, ForkKnife, Hash, Info, Moon, PawPrint, User, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TONO_ESTADO, type TarjetaVista } from '../../lib/hotelCalendarioCache';
import type { ReservaHotel } from '../../lib/hotelReservasApi';
import { getReservaCloudbeds } from '../../lib/cloudbeds';
import { estiloDe, pagoDeVenta, type EstiloReserva, type InfoPago } from './estiloReserva';
import { useVentaDeReserva } from '../../hooks/useVentasHotel';
import { planSeCobra } from '../../lib/hotelPlanesApi';
import { textoMascota } from '../../lib/hotelReservasApi';
import { categoriasDeExtras, useCategoriasExtras } from '../../hooks/useCategoriasExtrasHotel';
import { getCategoryIcon } from '@/lib/categoryIcons';
import type { VentaConMovimientos } from '../../lib/ventaConMovimientos';
import { EstadoBadge } from '../Common/EstadoBadge';

// Un poco más largo que un roce: así el popover no sale al pasar el cursor ni se cruza con el inicio de un arrastre.
const RETRASO_HOVER_MS = 600;
const dinero = (n: number) => `$${n.toFixed(2)}`;
const fecha = (f: string) => dayjs(f).format('ddd D MMM');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  tarjeta: TarjetaVista;
  /** Nombre de la habitación de la fila. */
  cabana: string;
  /** Vista de la habitación («Al río»): sale junto a su nombre en el popover. */
  vista?: string | null;
  /** Posición dentro de la fila (el calendario la calcula): borde izquierdo y ancho, en CSS. */
  left: string;
  width: string;
  /** La reserva sigue fuera de la ventana por ese lado: el borde se deja recto. */
  cortaIzq: boolean;
  cortaDer: boolean;
  /** Abre la ficha completa. */
  onAbrir: (t: TarjetaVista) => void;
  /** Arrastre vertical con el mouse para pasarla a otra habitación (mismas fechas). Solo reservas enlazadas con el POS. */
  arrastrable?: boolean;
  /** Fila en la que está dibujada la barra. */
  filaId?: string;
  /** Días visibles de la rejilla: con el ancho de la fila da lo que mide un día, para mover las fechas arrastrando en horizontal. */
  diasVisibles?: number;
  /** `eje`: 'v' = a otra habitación (según la fila bajo el cursor); 'h' = mover las fechas `dias` días (negativo = atrás). */
  onArrastreMover?: (t: TarjetaVista, filaId: string, x: number, y: number, eje: 'h' | 'v') => void;
  onSoltar?: (t: TarjetaVista, filaId: string, x: number, y: number, eje: 'h' | 'v', dias: number) => void;
  onArrastreFin?: () => void;
}

/**
 * Un elemento del calendario: la barra de una reserva o bloqueo Y su popover de datos, en un solo componente. Todo el
 * aspecto (color y icono del canal, franja de pago, noches, borde punteado, gris si ya salió) está aquí y en `estiloReserva`.
 *
 * Con mouse el popover aparece al pasar el cursor (y un clic abre la ficha); con pantalla táctil, el primer toque muestra el
 * popover y desde él se abre la ficha. También aparece al enfocar con teclado.
 */
// Con `memo`: el calendario se repinta con el reloj y con cada aviso de la caché, y la barra solo debe hacerlo si cambian sus datos.
export const ItemReserva = memo(function ItemReserva({ tarjeta: t, cabana, vista, left, width, cortaIzq, cortaDer, onAbrir, arrastrable, filaId, diasVisibles, onArrastreMover, onSoltar, onArrastreFin }: Props) {
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

  // El popover hereda el color del estado de pago (o, sin venta, el del canal): base de color con los datos en una tarjeta blanca encima.
  // Sin venta (p. ej. una reserva aún no adoptada) el estilo es blanco: blanco sobre blanco no se distingue, así que la base toma un tinte del color del canal.
  const hexCanal = estilo.circulo.match(/bg-\[(#[0-9A-Fa-f]{3,8})\]/)?.[1];
  const tinte = !pago && /\bbg-card\b/.test(estilo.fondo)
    ? { fondo: hexCanal ? `color-mix(in oklab, ${hexCanal} 15%, white)` : 'var(--muted)', borde: hexCanal ? `color-mix(in oklab, ${hexCanal} 40%, white)` : 'var(--border)' }
    : null;
  const baseFondo = tinte ? '' : (pago?.fondo ?? estilo.fondo).split(' ').filter((c) => !c.startsWith('border')).join(' ');
  const bordeBase = (pago?.fondo ?? estilo.fondo).split(' ').find((c) => c.startsWith('border-'));
  const colorBase = baseFondo.match(/bg-\[(#[0-9A-Fa-f]{3,8})\]/)?.[1];
  const colorBorde = bordeBase?.match(/border-\[(#[0-9A-Fa-f]{3,8})\]/)?.[1];

  const [abierto, setAbierto] = useState(false);
  const [tactil, setTactil] = useState(false);
  // Arrastre (solo mouse). El eje se fija con el primer movimiento: vertical = a otra habitación (mismas fechas); horizontal = mover
  // las fechas (misma habitación y duración), de día en día. `mov` null = sin arrastrar.
  const [mov, setMov] = useState<{ x: number; y: number; eje: 'h' | 'v'; dias: number } | null>(null);
  const inicioArrastre = useRef<{ x: number; y: number; pxDia: number } | null>(null);
  const huboArrastre = useRef(false);
  const terminarArrastre = () => { inicioArrastre.current = null; setMov(null); onArrastreFin?.(); };
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelar = () => { if (espera.current) { clearTimeout(espera.current); espera.current = null; } };
  useEffect(() => cancelar, []);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverAnchor asChild>
        <button
          type="button" style={{ left, width, backgroundImage: estilo.imagen, ...(mov ? { transform: `translate(${mov.x}px, ${mov.y}px)` } : {}) }} aria-label={`${t.nombre}. ${estilo.etiqueta}`}
          data-arrastrando={mov ? '' : undefined}
          className={cn(
            '@container absolute top-1.5 bottom-1.5 z-10 rounded-xl pr-2.5 flex items-center gap-2 text-left cursor-pointer overflow-hidden transition-[filter] hover:brightness-95',
            'pl-3',
            pago ? pago.fondo : estilo.fondo,
            cortaIzq && 'rounded-l-none', cortaDer && 'rounded-r-none',
            t.estado === 'checked_out' && '[filter:grayscale(0.7)_brightness(1.03)]',
            sinConfirmar ? 'border-2 border-dashed border-current/60' : 'border',
            arrastrable && !mov && 'cursor-grab',
            mov && 'z-40! cursor-grabbing shadow-xl opacity-90 select-none touch-none',
          )}
          onPointerDown={(e) => {
            setTactil(e.pointerType !== 'mouse');
            if (e.pointerType === 'mouse') { cancelar(); setAbierto(false); }
            if (arrastrable && e.pointerType === 'mouse' && e.button === 0) {
              const ancho = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
              inicioArrastre.current = { x: e.clientX, y: e.clientY, pxDia: diasVisibles && ancho > 0 ? ancho / diasVisibles : 0 };
              huboArrastre.current = false;
            }
          }}
          onPointerMove={(e) => {
            const i = inicioArrastre.current;
            if (!i) return;
            // Un clic con un poco de temblor no es un arrastre: se empieza al pasar de 6 px.
            const dx = e.clientX - i.x;
            const dyy = e.clientY - i.y;
            if (!mov && Math.hypot(dx, dyy) < 6) return;
            let eje = mov?.eje;
            if (!eje) {
              // Sin el ancho de un día no se pueden mover fechas: solo vertical.
              eje = Math.abs(dx) > Math.abs(dyy) && i.pxDia > 0 ? 'h' : 'v';
              e.currentTarget.setPointerCapture(e.pointerId); cancelar(); setAbierto(false);
            }
            huboArrastre.current = true;
            const dias = eje === 'h' ? Math.round(dx / i.pxDia) : 0;
            setMov(eje === 'h' ? { x: dias * i.pxDia, y: 0, eje, dias } : { x: 0, y: dyy, eje, dias: 0 });
            onArrastreMover?.(t, filaId ?? '', e.clientX, e.clientY, eje);
          }}
          onPointerUp={(e) => {
            if (!mov) { inicioArrastre.current = null; return; }
            onSoltar?.(t, filaId ?? '', e.clientX, e.clientY, mov.eje, mov.dias);
            terminarArrastre();
          }}
          onPointerCancel={() => { if (mov) terminarArrastre(); else inicioArrastre.current = null; }}
          onKeyDown={(e) => { if (e.key === 'Escape' && mov) terminarArrastre(); }}
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
            if (huboArrastre.current) { huboArrastre.current = false; return; } // el clic que sigue a un arrastre no abre la ficha
            if (tactil) setAbierto((a) => !a); // táctil: el primer toque muestra los datos
            else { setAbierto(false); onAbrir(t); }
          }}
        >
          <span className="flex flex-col min-w-0 grow leading-tight">
            <span className="t-cuerpo-fuerte truncate">{t.nombre}</span>
            <span className="t-meta overflow-hidden whitespace-nowrap opacity-80 flex items-center gap-1">{mov?.eje === 'h' && mov.dias !== 0 ? `${dayjs(t.desde).add(mov.dias, 'day').format('D MMM')} → ${dayjs(t.hasta).add(mov.dias, 'day').format('D MMM')}` : plural(noches, 'noche', 'noches')}{iconosExtras.map((c, i) => { const Ic = getCategoryIcon(c.icono); return Ic ? <Ic key={c.id} size={13} weight="fill" aria-label={c.nombre} className={cn('shrink-0', i > 0 && 'hidden @min-[9rem]:block')} /> : null; })}{t.local?.mascota && <PawPrint size={13} weight="fill" aria-label={`Mascota: ${textoMascota(t.local.mascota)}`} className="shrink-0 hidden @min-[6rem]:block" />}</span>
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
          className={cn('w-[22.5rem] max-w-[calc(100vw-1.5rem)] p-0 overflow-visible shadow-[0_18px_44px_-10px_rgba(15,23,42,0.35),0_6px_16px_-4px_rgba(15,23,42,0.18)]', !tinte && bordeBase, !tactil && 'pointer-events-none')}
          style={tinte ? { borderColor: tinte.borde } : undefined}
        >
          <Contenido t={t} estilo={estilo} venta={venta} pago={pago} base={baseFondo} fondoPropio={tinte?.fondo} cabana={cabana} vista={vista} tactil={tactil} onAbrir={() => { setAbierto(false); onAbrir(t); }} />
          {/* Flecha del color de la base, con solo sus dos lados en el color del borde, y subida 1 px para tapar la línea del borde en su arranque. */}
          <PopoverPrimitive.Arrow asChild width={18} height={9}>
            <svg viewBox="0 0 18 9" className="drop-shadow-md overflow-visible" style={{ transform: 'translateY(-1px)' }} aria-hidden>
              <path d="M0 0 L9 9 L18 0 Z" fill={tinte?.fondo ?? colorBase ?? 'var(--muted)'} />
              <path d="M0 0 L9 9 L18 0" fill="none" stroke={tinte?.borde ?? colorBorde ?? 'var(--border)'} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </PopoverPrimitive.Arrow>
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
          ) : null}
        </div>
        <div role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del pago" className="h-1 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', pago.barra)} style={{ width: `${avance}%` }} />
        </div>
      </div>
    </>
  );
}

function Contenido({ t, estilo, venta, pago, base, fondoPropio, cabana, vista, tactil, onAbrir }: { t: TarjetaVista; estilo: EstiloReserva; venta?: VentaConMovimientos; pago: InfoPago | null; base: string; fondoPropio?: string; cabana: string; vista?: string | null; tactil: boolean; onAbrir: () => void }) {
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

  const lineasCama = (local?.cama ?? '').split(' · ').map((l) => l.trim()).filter(Boolean);
  const planTexto = local?.plan_alimentacion ? `${local.plan_alimentacion.nombre} · ${planSeCobra(local.plan_alimentacion) ? 'con cargo' : 'incluido'}` : '';

  // Una sola jerarquía: canal y pago arriba, fechas, huésped, habitación, notas y cobros, separados por líneas finas (sin cajas ni píldoras).
  return (
    <div className={cn('flex flex-col rounded-[inherit]', base)} style={fondoPropio ? { backgroundColor: fondoPropio } : undefined}>
      {/* Base gris con la cabecera (canal, pago, noches, estado y fechas); los datos van en una tarjeta blanca encima */}
      <section className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-6 rounded-full flex items-center justify-center shrink-0 t-dato font-extrabold', estilo.circulo)}>
            {estilo.letra ?? (Icono ? <Icono size={13} weight="bold" /> : null)}
          </span>
          <span className="t-fila truncate">{esBloqueo ? estilo.etiqueta : (t.fuente ?? local?.fuente_nombre ?? estilo.etiqueta)}</span>
          {pago && <span className="ml-auto shrink-0"><EstadoBadge tono={pago.tono}>{pago.etiqueta}</EstadoBadge></span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 t-meta font-medium">
            <Moon size={14} weight="bold" className="text-primary shrink-0" />
            {plural(noches, 'noche', 'noches')} · {estado}
          </span>
          <span className="t-meta text-muted-foreground capitalize text-xs">
            {fecha(t.desde)} → {fecha(t.hasta)}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-3 p-3.5 m-1.5 mt-0 rounded-xl bg-card text-foreground">
      {esBloqueo ? (
        <>
          {t.motivo && <Fila icono={Info}><span className="whitespace-pre-line">{t.motivo}</span></Fila>}
          <Fila icono={Bed}>{cabana}</Fila>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="t-titulo leading-tight truncate">{t.nombre}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 t-cuerpo text-muted-foreground">
              {adultos != null && <span className="inline-flex items-center gap-1"><User size={15} weight="bold" aria-hidden />{plural(adultos, 'adulto', 'adultos')}</span>}
              {ninos > 0 && <span className="inline-flex items-center gap-1"><Baby size={15} weight="bold" aria-hidden />{plural(ninos, 'niño', 'niños')}</span>}
              {local?.grupo_id && <span className="inline-flex items-center gap-1"><UsersThree size={15} weight="bold" aria-hidden />Grupo</span>}
            </span>
            {planTexto && <span className="inline-flex items-center gap-1 t-cuerpo text-muted-foreground"><ForkKnife size={15} weight="bold" aria-hidden />{planTexto}</span>}
            {local?.mascota && <span className="inline-flex items-center gap-1 t-cuerpo text-muted-foreground"><PawPrint size={15} weight="fill" aria-hidden />{textoMascota(local.mascota)}</span>}
          </div>

          <Fila icono={Bed}>
            <span className="block text-foreground t-fila">{cabana}{vista && <span className="text-muted-foreground font-normal"> · {vista}</span>}</span>
            {lineasCama.map((l) => <span key={l} className="block t-meta">{l}</span>)}
          </Fila>

          {notasLocal.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="t-etiqueta text-muted-foreground">{plural(notasLocal.length, 'nota', 'notas')}</span>
              {notasLocal.slice(0, 3).map((n) => (
                <span key={n.id} className="flex items-start gap-2 t-meta text-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-warning shrink-0 mt-[0.4rem]" />
                  <span className="line-clamp-2 min-w-0">{n.extra ? <b>{n.extra}: </b> : null}{n.texto}</span>
                </span>
              ))}
              {notasLocal.length > 3 && <span className="t-meta text-muted-foreground pl-3.5">y {notasLocal.length - 3} más…</span>}
            </div>
          )}
          {pendiente && <Fila icono={WarningCircle}><span className="text-warning-foreground">Aún no está en Cloudbeds: se reintenta sola</span></Fila>}
          {!local && <Fila icono={Hash}>Código {t.id}</Fila>}
          {venta && pago
            ? <CobrosVenta venta={venta} pago={pago} />
            : <Importes local={local} tarifaCloudbeds={tarifaCloudbeds} saldoCloudbeds={t.saldo ?? null} />}
        </>
      )}

      {tactil
        ? <Button type="button" onClick={onAbrir} className="w-full">{local || esBloqueo ? 'Abrir' : 'Ver detalle'}</Button>
        : <p className="t-meta text-muted-foreground text-center">Clic para abrir</p>}
      </div>
    </div>
  );
}
