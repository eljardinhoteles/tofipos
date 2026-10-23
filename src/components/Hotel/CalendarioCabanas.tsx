import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Bed, CalendarBlank, CaretLeft, CaretRight, CalendarPlus, Plus, Prohibit } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TarjetaInfoDialog } from './TarjetaInfoDialog';
import { ESTADOS_PAGO, estiloDe, type EstiloReserva } from './estiloReserva';
import { ItemReserva } from './ItemReserva';
import type { TarjetaCalendario } from '../../lib/cloudbeds';
import { bloques, cargarMes, mesDe, mesMas, oyentes, tarjetasDeMeses, vigente, type TarjetaVista } from '../../lib/hotelCalendarioCache';
import { claveEnlace, habitacionDeUnidad, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { buscadorDeReservaLocal } from '../../lib/hotelUnidades';
import { MoverHabitacionDialog } from './MoverHabitacionDialog';
import { MoverFechasDialog } from './MoverFechasDialog';
import { nombreHuesped, type ReservaHotel } from '../../lib/hotelReservasApi';

// Días que se ven a la vez. Las celdas se reparten TODO el ancho disponible, así que en una pantalla normal no hay
// desplazamiento horizontal.
const DIAS = 10;
// Columna de nombres: se adapta al ancho de la pantalla (entre 8,5 y 13 rem). En su esquina van los botones de navegación,
// que necesitan unos 8 rem.
const ANCHO_NOMBRE = 'clamp(8.5rem, 15vw, 13rem)';
// Ancho mínimo por día: solo en pantallas muy estrechas (celular) aparece un desplazamiento horizontal en vez de aplastar las barras.
const ANCHO_DIA_MIN = 56;
// Alto mínimo de cada fila (clase `min-h-16` = 4 rem = 64 px, en la fila de habitaciones): si la ventana es tan baja que no caben todas
// con ese alto, la rejilla se desplaza en vertical (la cabecera queda fija) en lugar de aplastar las barras.
// Días que avanzan o retroceden las flechas.
const PASO_FLECHAS = 2;
/** El día de referencia (hoy, o la fecha elegida) va en la 3.ª columna: se ven dos días anteriores y los siguientes. */
const COLUMNA_REFERENCIA = 2;
const conReferencia = (f: string | Date) => dayjs(f).subtract(COLUMNA_REFERENCIA, 'day').format('YYYY-MM-DD');
// La rejilla es fija (sale del mapa de habitaciones) y solo las tarjetas viajan por la red. Cloudbeds tarda lo mismo
// en dar un mes entero que dos semanas, así que se pide por MESES y se recortan los días que se ven.
const MESES_ADELANTE = 2;
const MESES_ATRAS = 1;

interface Props {
  /** Mapa de habitaciones del POS: define las filas de la rejilla fija. */
  habitaciones: HabitacionHotel[];
  reservas: ReservaHotel[];
  puedeGestionar: boolean;
  /** Cambia cuando algo se creó/canceló: lo guardado deja de ser fiable y se vuelve a pedir. */
  version: number;
  /** `roomID`: la unidad elegida cuando el tipo tiene varias (undefined = la única unidad del tipo). */
  onNueva: (llegada: string, roomTypeID: string, salida?: string, roomID?: string) => void;
  onBloquear: (desde: string, roomTypeID: string, hasta?: string, roomID?: string) => void;
  onAbrir: (r: ReservaHotel) => void;
  onAdoptar: (t: TarjetaCalendario) => Promise<void>;
  onEliminarBloqueo: (t: TarjetaCalendario) => Promise<void>;
  /** Se movió una reserva a otra habitación (arrastrándola): hay que recargar. */
  onMovida?: () => void;
}

/**
 * Calendario por habitación: rejilla fija (habitaciones × días) con las reservas y bloqueos de Cloudbeds montados encima
 * como tarjetas. Una casilla vacía no garantiza que esté libre: al crear la reserva se comprueba en vivo.
 */
export function CalendarioCabanas({ habitaciones, reservas, puedeGestionar, version, onNueva, onBloquear, onAbrir, onAdoptar, onEliminarBloqueo, onMovida }: Props) {
  // Selección por clics en una fila: el primero marca la llegada (`sel`), el segundo la última noche y abre el menú (`menu`).
  const [sel, setSel] = useState<{ hid: string; ini: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ hid: string; ini: string; fin: string } | null>(null);
  const [desde, setDesde] = useState(() => conReferencia(dayjs().toDate()));
  const [error, setError] = useState('');
  const [info, setInfo] = useState<TarjetaVista | null>(null);
  const [saltoAbierto, setSaltoAbierto] = useState(false);
  // Arrastrar una reserva a otra habitación: fila sobre la que está el cursor (con el motivo si no se puede soltar ahí) y confirmación.
  const [objetivo, setObjetivo] = useState<{ id: string; error: string | null } | null>(null);
  const [moviendo, setMoviendo] = useState<{ r: ReservaHotel; destino: string; nombre: string } | null>(null);
  // Mover las fechas arrastrando en horizontal (misma habitación y duración).
  const [moviendoFechas, setMoviendoFechas] = useState<{ r: ReservaHotel; llegada: string; salida: string; grupo: ReservaHotel[] } | null>(null);
  const versionVista = useRef(version);
  useEffect(() => {
    if (!sel) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [sel]);
  // `datos` sube cada vez que llegan tarjetas a la caché compartida: es lo que invalida `porHabitacion`.
  const [datos, refrescar] = useReducer((n: number) => n + 1, 0);
  // Cada cambio de ventana invalida la precarga anterior para no acumular consultas.
  const ronda = useRef(0);

  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => dayjs(desde).add(i, 'day')), [desde]);
  const fechas = useMemo(() => dias.map((d) => d.format('YYYY-MM-DD')), [dias]);
  const meses = useMemo(() => [...new Set(fechas.map(mesDe))], [fechas]);

  const asegurar = useCallback(async (forzar = false) => {
    const mio = ++ronda.current;
    // Tras crear, cancelar o cambiar algo desde aquí se consulta a Cloudbeds en vivo: no se espera al refresco de fondo.
    const cambioPropio = versionVista.current !== version;
    versionVista.current = version;
    const vivo = forzar || cambioPropio;
    const faltan = meses.filter((m) => vivo || !vigente(bloques.get(m), version));
    setError('');
    // El indicador de carga vive en el header del módulo (`PulsoSincronizacion`): aquí solo se espera y se muestra un fallo.
    if (faltan.length > 0) {
      const resultados = await Promise.allSettled(faltan.map((m) => cargarMes(m, version, vivo)));
      if (mio !== ronda.current) return;
      refrescar();
      const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      // Con tarjetas viejas a la vista el aviso es suficiente: no se borra nada.
      if (fallo) setError(fallo.reason instanceof Error ? fallo.reason.message : 'No se pudo consultar Cloudbeds');
    }
    // Precarga en segundo plano, de uno en uno (la API de Cloudbeds tiene límite de peticiones).
    const ultimo = meses[meses.length - 1];
    const primero = meses[0];
    const cola = [
      ...Array.from({ length: MESES_ADELANTE }, (_, i) => mesMas(ultimo, i + 1)),
      ...Array.from({ length: MESES_ATRAS }, (_, i) => mesMas(primero, -(i + 1))),
    ];
    for (const m of cola) {
      if (mio !== ronda.current) return;
      if (vigente(bloques.get(m), version)) continue;
      try { await cargarMes(m, version); if (mio === ronda.current) refrescar(); } catch { /* es solo precarga */ }
    }
  }, [meses, version]);

  // Repintar cuando llegan datos de fondo y revalidar al volver a la pestaña.
  useEffect(() => {
    oyentes.add(refrescar);
    const alVolver = () => { if (document.visibilityState === 'visible') void asegurar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { oyentes.delete(refrescar); document.removeEventListener('visibilitychange', alVolver); };
  }, [asegurar]);

  // Se lanza en un temporizador (no síncrono dentro del efecto) y se cancela si la ventana cambia antes.
  useEffect(() => {
    const t = setTimeout(() => { void asegurar(); }, 0);
    return () => clearTimeout(t);
  }, [asegurar]);

  const filas = useMemo(() => habitaciones.filter((h) => h.activo), [habitaciones]);
  // Cada tarjeta de Cloudbeds se enlaza con su reserva del POS (por código, por id del POS o, en un grupo adoptado, por grupo + unidad).
  const localDe = useMemo(() => buscadorDeReservaLocal(reservas), [reservas]);

  // Tarjetas de la ventana: las de Cloudbeds (de los meses que toca, sin repetir las que cruzan de mes) más las
  // reservas del POS que aún no llegaron a Cloudbeds. Se recalcula solo tras cada carga (`datos`) o si cambian las
  // reservas: así las barras conservan su identidad y `ItemReserva` (memo) no se repinta con el reloj ni con cada aviso.
  const { porHabitacion, sinFila, sinUnidad } = useMemo(() => {
    const unicas = new Map<string, TarjetaVista>();
    for (const t of tarjetasDeMeses(meses)) {
      unicas.set(`${t.tipo}:${t.id}:${t.roomTypeID}:${t.roomID ?? ''}`, { ...t, local: t.tipo === 'reserva' ? localDe(t) : undefined });
    }
    for (const r of reservas) {
      if (r.estado !== 'confirmada' || r.sync_estado === 'sincronizada' || r.cloudbeds_reservation_id) continue;
      unicas.set(`local:${r.id}`, {
        tipo: 'reserva', id: r.id, roomTypeID: r.room_type_id, roomID: r.room_id, nombre: nombreHuesped(r), desde: r.llegada, hasta: r.salida,
        estado: 'pending_local', local: r,
      });
    }
    // Cada tarjeta va a la fila de SU unidad: con un tipo = una habitación es la fila del tipo; con varias unidades por tipo, la de su roomID.
    const out = new Map<string, TarjetaVista[]>();
    // Reservas o bloqueos de Cloudbeds cuya unidad no tiene habitación en el POS: no se pueden dibujar y se avisa (solo de reservas).
    const sinFila = new Set<string>();
    // Reservas de un tipo con varias unidades que aún no tienen unidad asignada (como el «sin asignar» de Cloudbeds).
    const sinUnidad = new Map<string, TarjetaVista[]>();
    const tiposConUnidades = new Set(filas.filter((h) => h.cloudbeds_room_id).map((h) => h.cloudbeds_room_type_id));
    for (const t of unicas.values()) {
      const h = habitacionDeUnidad(filas, t.roomTypeID, t.roomID);
      if (h) out.set(h.id, [...(out.get(h.id) ?? []), t]);
      else if (!t.roomID && tiposConUnidades.has(t.roomTypeID)) sinUnidad.set(t.roomTypeID, [...(sinUnidad.get(t.roomTypeID) ?? []), t]);
      else if (t.tipo === 'reserva' && t.estado !== 'pending_local' && habitaciones.some((x) => x.cloudbeds_room_type_id === t.roomTypeID)) sinFila.add(t.id);
    }
    for (const lista of out.values()) lista.sort((a, b) => a.desde.localeCompare(b.desde));
    return { porHabitacion: out, sinFila: sinFila.size, sinUnidad };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `datos` y `version` marcan que la caché del módulo cambió
  }, [meses, reservas, localDe, filas, habitaciones, datos, version]);

  const hoy = dayjs().format('YYYY-MM-DD');
  const primera = fechas[0];
  const ultimaExcl = dayjs(fechas[DIAS - 1]).add(1, 'day').format('YYYY-MM-DD');
  // Tramos de la ventana por mes (para la fila superior): dónde empieza cada mes y cuántos días se ven de él.
  const tramosMes = fechas.reduce<Array<{ clave: string; inicio: number; cuantos: number }>>((acc, f, i) => {
    const clave = mesDe(f);
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.cuantos += 1; else acc.push({ clave, inicio: i, cuantos: 1 });
    return acc;
  }, []);
  // Primer día de un mes que no es el primero de la ventana: ahí va la línea que separa un mes del siguiente.
  const cambioDeMes = (f: string, i: number) => i > 0 && f.endsWith('-01');
  const lineaDia = (f: string, i: number) => cambioDeMes(f, i) ? 'border-l-2 border-border' : 'border-l border-border/70 first:border-l-0';

  const mover = (d: number) => setDesde(dayjs(desde).add(d, 'day').format('YYYY-MM-DD'));

  const abrir = useCallback((t: TarjetaVista) => {
    if (t.local) onAbrir(t.local);
    else setInfo(t);
  }, [onAbrir]);

  // Las columnas de la rejilla se reparten el ancho por igual; las barras se colocan con porcentajes sobre ellas.
  const columnas = { gridTemplateColumns: `repeat(${DIAS}, minmax(0, 1fr))` } as const;

  /**
   * Una barra empieza a mitad del día de llegada y termina a mitad del día de salida: el cambio de huésped en un mismo
   * día se ve como dos barras que se tocan, y la noche se lee de un vistazo. Si sale de la ventana se corta en el borde.
   */
  const posicion = (t: TarjetaVista) => {
    const ini = t.desde < primera ? 0 : dayjs(t.desde).diff(dayjs(primera), 'day') + 0.5;
    // La salida cae a mitad del día de salida: si es el día siguiente a la última columna, la barra se corta en el borde.
    const fin = Math.min(DIAS, dayjs(t.hasta).diff(dayjs(primera), 'day') + 0.5);
    return {
      left: `calc(${(ini / DIAS) * 100}% + 2px)`,
      width: `calc(${((fin - ini) / DIAS) * 100}% - 4px)`,
      cortaIzq: t.desde < primera,
      cortaDer: t.hasta >= ultimaExcl,
    };
  };

  // Se puede arrastrar una reserva enlazada con el POS, vigente y que no venga de un canal externo ni de un grupo adoptado.
  const sePuedeMover = (t: TarjetaVista) => {
    const r = t.local;
    return puedeGestionar && t.tipo === 'reserva' && !!r && r.estado === 'confirmada' && !r.fuente_externa && !r.cloudbeds_grupo_ref && t.hasta > hoy && t.estado !== 'checked_out';
  };
  const barra = (t: TarjetaVista, cabana: string, filaId: string) => (
    <ItemReserva key={`${t.tipo}-${t.id}-${t.roomTypeID}-${t.roomID ?? ''}`} tarjeta={t} cabana={cabana} onAbrir={abrir} {...posicion(t)}
      arrastrable={sePuedeMover(t)} filaId={filaId} diasVisibles={DIAS} onArrastreMover={arrastreMover} onSoltar={soltar} onArrastreFin={finArrastre} />
  );

  // Filas que se dibujan: las habitaciones y, tras las unidades de un tipo con varias, las filas «Sin asignar» con las reservas de
  // ese tipo que no tienen unidad. Si se cruzan en fechas se reparten en carriles (una fila por carril), como en Cloudbeds.
  const { filasVista, porFila } = useMemo(() => {
    const porFila = new Map(porHabitacion);
    const filasVista: HabitacionHotel[] = [];
    filas.forEach((h, i) => {
      filasVista.push(h);
      const siguiente = filas[i + 1];
      const tipo = h.cloudbeds_room_type_id;
      if (!tipo || !h.cloudbeds_room_id || siguiente?.cloudbeds_room_type_id === tipo) return;
      const visibles = (sinUnidad.get(tipo) ?? []).filter((t) => t.hasta > primera && t.desde < ultimaExcl).sort((a, b) => a.desde.localeCompare(b.desde));
      const carriles: TarjetaVista[][] = [];
      for (const t of visibles) {
        const carril = carriles.find((c) => c[c.length - 1].hasta <= t.desde);
        if (carril) carril.push(t); else carriles.push([t]);
      }
      carriles.forEach((c, n) => {
        const virtual: HabitacionHotel = { ...h, id: `sin:${tipo}:${n}`, nombre: 'Sin asignar', codigo: null, cloudbeds_room_id: null, camas: [] };
        filasVista.push(virtual);
        porFila.set(virtual.id, c);
      });
    });
    return { filasVista, porFila };
  }, [filas, porHabitacion, sinUnidad, primera, ultimaExcl]);

  // Arrastre: los manejadores son estables (leen la vista actual de estos refs) para no romper el `memo` de las barras.
  const vistaRef = useRef({ filasVista, porFila });
  const reservasRef = useRef(reservas);
  useEffect(() => { vistaRef.current = { filasVista, porFila }; reservasRef.current = reservas; });

  /** Por qué no se puede soltar la reserva en esa fila (null = se puede). */
  const errorDestino = useCallback((t: TarjetaVista, h: HabitacionHotel): string | null => {
    const r = t.local;
    if (!r) return 'Solo se pueden mover reservas enlazadas con el POS';
    if (h.id.startsWith('sin:')) return 'No se puede mover a «Sin asignar»';
    if (!h.cloudbeds_room_type_id) return 'Esa habitación no está enlazada con Cloudbeds';
    const ocupada = (vistaRef.current.porFila.get(h.id) ?? []).some((c) => c.desde < t.hasta && c.hasta > t.desde && c.local?.id !== r.id);
    if (ocupada) return 'Esa habitación está ocupada en esas fechas';
    if (h.capacidad && r.adultos + r.ninos > h.capacidad) return `Esa habitación admite hasta ${h.capacidad} personas`;
    return null;
  }, []);

  /** La fila de habitación que hay bajo el cursor (se ignora la propia barra que se arrastra). */
  const filaBajo = useCallback((x: number, y: number): HabitacionHotel | undefined => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('[data-arrastrando]')) continue;
      const id = el.closest('[data-fila-id]')?.getAttribute('data-fila-id');
      if (id) return vistaRef.current.filasVista.find((f) => f.id === id);
    }
    return undefined;
  }, []);

  const arrastreMover = useCallback((t: TarjetaVista, origen: string, x: number, y: number, eje: 'h' | 'v') => {
    const h = eje === 'v' ? filaBajo(x, y) : undefined;
    setObjetivo((prev) => {
      if (!h || h.id === origen) return prev === null ? prev : null;
      const error = errorDestino(t, h);
      return prev && prev.id === h.id && prev.error === error ? prev : { id: h.id, error };
    });
  }, [filaBajo, errorDestino]);

  const finArrastre = useCallback(() => setObjetivo(null), []);

  const soltar = useCallback((t: TarjetaVista, origen: string, x: number, y: number, eje: 'h' | 'v', dias: number) => {
    // Horizontal: mover las fechas `dias` días en la misma habitación (misma duración).
    if (eje === 'h') {
      const r = t.local;
      if (!r || dias === 0) return;
      const llegada = dayjs(r.llegada).add(dias, 'day').format('YYYY-MM-DD');
      const salida = dayjs(r.salida).add(dias, 'day').format('YYYY-MM-DD');
      if (llegada < dayjs().format('YYYY-MM-DD')) { showToast.warning('No se puede mover ahí', 'La llegada quedaría en una fecha pasada.'); return; }
      const choca = (vistaRef.current.porFila.get(origen) ?? []).some((c) => c.local?.id !== r.id && c.desde < salida && c.hasta > llegada);
      if (choca) { showToast.warning('No se puede mover ahí', 'Esa habitación tiene otra reserva o bloqueo en esas fechas.'); return; }
      const grupo = r.grupo_id ? reservasRef.current.filter((x) => x.grupo_id === r.grupo_id && x.estado === 'confirmada') : [];
      setMoviendoFechas({ r, llegada, salida, grupo: grupo.length > 1 ? grupo : [r] });
      return;
    }
    const h = filaBajo(x, y);
    if (!h || h.id === origen || !t.local) return;
    const error = errorDestino(t, h);
    if (error) { showToast.warning('No se puede mover ahí', error); return; }
    setMoviendo({ r: t.local, destino: claveEnlace(h.cloudbeds_room_type_id, h.cloudbeds_room_id), nombre: h.nombre });
  }, [filaBajo, errorDestino]);

  // Leyenda: solo lo que aparece en la ventana que se ve.
  const leyenda = (() => {
    const m = new Map<string, EstiloReserva>();
    for (const lista of porFila.values()) {
      for (const t of lista) if (t.hasta > primera && t.desde < ultimaExcl) { const e = estiloDe(t); m.set(e.clave, e); }
    }
    return [...m.values()];
  })();

  return (
    <div className="relative flex flex-col gap-2.5 pb-3 min-h-0 flex-1">
      {sinFila > 0 && (
        <p role="status" className="rounded-xl bg-warning-soft text-warning-foreground px-3 py-2 t-meta">
          {sinFila === 1 ? 'Hay 1 reserva de Cloudbeds que no se ve' : `Hay ${sinFila} reservas de Cloudbeds que no se ven`} porque su unidad no tiene habitación enlazada en el POS. En Ajustes → Habitaciones usa «Importar desde Cloudbeds».
        </p>
      )}
      {/* Guía flotante de la selección por clics: aparece solo mientras hay una llegada marcada, al centro y separada del
          borde superior. Es superpuesta (no ocupa espacio) y no intercepta clics. */}
      {sel && (
        <p role="status" aria-live="polite"
          className="absolute left-1/2 -translate-x-1/2 top-0.5 z-50 max-w-[90%] truncate rounded-full bg-foreground text-background px-3.5 py-1 t-meta font-bold shadow-xl pointer-events-none animate-in fade-in-0 slide-in-from-top-1 duration-150">
          Toca la última noche · otro toque en la misma casilla = 1 noche · Esc cancela
        </p>
      )}
      {error && <p className="t-meta text-destructive rounded-2xl bg-destructive-soft px-3 py-2 mx-6">{error}</p>}

      {filas.length === 0 ? (
        <div className="mx-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center t-cuerpo text-muted-foreground">
          Aún no hay habitaciones activas. Crea el mapa en la pestaña «Habitaciones» (puedes importarlo de Cloudbeds).
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border-b border-border bg-card">
          <div className="flex flex-col min-h-full" style={{ minWidth: `calc(8.5rem + ${DIAS * ANCHO_DIA_MIN}px)` }}>
            {/* Cabecera: arriba el mes y el año (un tramo por mes), abajo el día de la semana y su número (hoy resaltado). */}
            <div className="flex sticky top-0 z-30 shrink-0 bg-card border-b border-border">
              <div className="sticky left-0 z-30 bg-card shrink-0 border-r border-border/80 flex flex-col items-center justify-center gap-1.5 px-1.5" style={{ width: ANCHO_NOMBRE }}>
                <div className="flex w-full items-center gap-1">
                  <button type="button" aria-label="Retroceder 2 días" title="Retroceder 2 días" onClick={() => mover(-PASO_FLECHAS)} className="size-8 shrink-0 flex items-center justify-center rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors"><CaretLeft size={14} weight="bold" /></button>
                  <button type="button" title="Ir a hoy" onClick={() => setDesde(conReferencia(hoy))} className="h-8 flex-1 min-w-0 t-dato flex items-center justify-center rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors">Hoy</button>
                  <button type="button" aria-label="Avanzar 2 días" title="Avanzar 2 días" onClick={() => mover(PASO_FLECHAS)} className="size-8 shrink-0 flex items-center justify-center rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors"><CaretRight size={14} weight="bold" /></button>
                </div>
                <Popover open={saltoAbierto} onOpenChange={setSaltoAbierto}>
                  <PopoverTrigger asChild>
                    <button type="button" title="Ir a una fecha" className="h-8 w-full gap-1.5 t-dato whitespace-nowrap flex items-center justify-center rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors">
                      <CalendarBlank size={14} weight="bold" /> Ir a fecha
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    {/* La fecha elegida queda como primer día visible. */}
                    <Calendar mode="single" selected={dayjs(desde).add(COLUMNA_REFERENCIA, 'day').toDate()} onSelect={(d) => { if (d) { setDesde(conReferencia(d)); setSaltoAbierto(false); } }} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grow flex flex-col">
                <div className="grid border-b border-border/70" style={columnas}>
                  {tramosMes.map((m, k) => (
                    <div
                      key={m.clave} style={{ gridColumn: `${m.inicio + 1} / span ${m.cuantos}` }}
                      className={cn('px-3 py-1.5 t-etiqueta truncate text-foreground', k > 0 && 'border-l-2 border-border', k % 2 === 0 ? 'bg-muted/60' : 'bg-muted')}
                    >
                      {/* Con pocos días visibles el nombre completo no cabe: se abrevia. */}
                      {dayjs(`${m.clave}-01`).format(m.cuantos >= 4 ? 'MMMM YYYY' : m.cuantos >= 2 ? 'MMM YYYY' : 'MMM')}
                    </div>
                  ))}
                </div>
                <div className="grid" style={columnas}>
                  {dias.map((d, i) => (
                    <div key={d.format('YYYY-MM-DD')} className={cn('flex flex-col items-center gap-0.5 py-2', lineaDia(d.format('YYYY-MM-DD'), i))}>
                      <span className="t-etiqueta text-muted-foreground uppercase">{d.format('dd')}</span>
                      <span className={cn('t-fila min-w-8 text-center rounded-lg px-1.5', d.format('YYYY-MM-DD') === hoy ? 'bg-nav text-nav-foreground' : 'text-foreground')}>{d.format('D')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {filasVista.map((h, i) => {
              const sinAsignar = h.id.startsWith('sin:');
              const tarjetas = h.cloudbeds_room_type_id ? porFila.get(h.id) ?? [] : [];
              // Tipos con varias unidades (Matrimonial #2, #4…): un encabezado con el nombre del tipo antes de sus unidades.
              const encabezadoTipo = h.cloudbeds_room_id && (i === 0 || filasVista[i - 1].cloudbeds_room_type_id !== h.cloudbeds_room_type_id)
                ? h.nombre.replace(/\s*#?\d+\s*$/, '') || h.nombre
                : null;
              return (
                <Fragment key={h.id}>
                {encabezadoTipo && (
                  <div className="flex min-h-7 border-b border-border/80 bg-muted/60">
                    <span className="sticky left-0 z-20 px-4 flex items-center t-etiqueta text-muted-foreground uppercase tracking-wide" style={{ width: ANCHO_NOMBRE }}>{encabezadoTipo}</span>
                  </div>
                )}
                <div data-fila-id={h.id} className={cn('flex flex-1 min-h-16 border-b border-border/80 last:border-b-0 transition-colors', objetivo?.id === h.id && (objetivo.error ? 'bg-destructive/10 ring-2 ring-inset ring-destructive/40' : 'bg-primary/10 ring-2 ring-inset ring-primary/40'))}>
                  <div className="sticky left-0 z-20 bg-card shrink-0 flex items-center px-4 border-r border-border/80" style={{ width: ANCHO_NOMBRE }}>
                    {sinAsignar
                      ? <span className="t-cuerpo text-muted-foreground italic leading-snug min-w-0" title="Reservas de este tipo que en Cloudbeds aún no tienen habitación asignada">{h.id.endsWith(':0') ? 'Sin asignar' : ''}</span>
                      : <span className="t-cuerpo-fuerte line-clamp-2 leading-snug break-words min-w-0" title={h.nombre}>{h.nombre}</span>}
                  </div>
                  <div className="relative grow">
                    {/* Fondo: líneas verticales muy suaves; hoy resaltado y los días pasados atenuados. Cada casilla vacía reserva. */}
                    <div className="absolute inset-0 grid" style={columnas}>
                      {fechas.map((f, idx) => {
                        const reservable = !!h.cloudbeds_room_type_id && !sinAsignar && puedeGestionar && f >= hoy;
                        const finSel = sel?.hid === h.id ? (sobre && sobre >= sel.ini ? sobre : sel.ini) : null;
                        const enRango = (sel?.hid === h.id && f >= sel.ini && f <= finSel!) || (menu?.hid === h.id && f >= menu.ini && f <= menu.fin);
                        const salida = menu ? dayjs(menu.fin).add(1, 'day').format('YYYY-MM-DD') : '';
                        const nochesMenu = menu ? dayjs(menu.fin).diff(dayjs(menu.ini), 'day') + 1 : 0;
                        const alClic = () => {
                          if (!sel || sel.hid !== h.id || f < sel.ini) { setSel({ hid: h.id, ini: f }); setMenu(null); return; }
                          const sal = dayjs(f).add(1, 'day').format('YYYY-MM-DD');
                          if (tarjetas.some((t) => t.desde < sal && t.hasta > sel.ini)) {
                            showToast.warning('Hay una reserva o bloqueo en esas fechas', 'Elige otra llegada y otra última noche.');
                            setSel({ hid: h.id, ini: f }); return;
                          }
                          setMenu({ hid: h.id, ini: sel.ini, fin: f }); setSel(null); setSobre(null);
                        };
                        return (
                          <div key={f} className={cn(lineaDia(f, idx), f === hoy && 'bg-primary/[0.08]', f < hoy && 'bg-muted/40', !h.cloudbeds_room_type_id && 'bg-muted/60', enRango && 'bg-primary/20')}
                            title={h.cloudbeds_room_type_id ? undefined : 'Habitación sin enlazar con Cloudbeds'}>
                            {reservable && (
                              <Popover open={menu?.hid === h.id && menu.fin === f} onOpenChange={(o) => { if (!o) setMenu(null); }}>
                                <PopoverAnchor asChild>
                                  <button type="button" aria-label={`Elegir ${h.nombre} el ${f}`} onClick={alClic} onMouseEnter={() => { if (sel) setSobre(f); }}
                                    className="group size-full flex items-center justify-center cursor-pointer hover:bg-primary/5 transition-colors">
                                    <Plus size={14} weight="bold" className="text-primary opacity-0 group-hover:opacity-50 transition-opacity" />
                                  </button>
                                </PopoverAnchor>
                                {menu?.hid === h.id && menu.fin === f && (
                                  <PopoverContent side="bottom" align="center" sideOffset={6} collisionPadding={12} className="w-72 max-w-[calc(100vw-1.5rem)] p-3 flex flex-col gap-3 overflow-visible">
                                    <div className="flex flex-col gap-2.5 px-1 pt-1">
                                      <div className="flex items-start gap-3">
                                        <Bed size={18} weight="regular" className="text-muted-foreground shrink-0 mt-0.5" />
                                        <span className="t-cuerpo-fuerte text-foreground min-w-0 leading-snug">{h.nombre}</span>
                                      </div>
                                      <div className="flex items-start gap-3">
                                        <CalendarBlank size={18} weight="regular" className="text-muted-foreground shrink-0 mt-0.5" />
                                        <span className="t-cuerpo text-muted-foreground capitalize">{dayjs(menu.ini).format('ddd D MMM')} → {dayjs(salida).format('ddd D MMM YYYY')} <span className="normal-case">· {nochesMenu} {nochesMenu === 1 ? 'noche' : 'noches'}</span></span>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <Button type="button" className="w-full" onClick={() => { const m = menu; setMenu(null); onNueva(m.ini, h.cloudbeds_room_type_id!, salida, h.cloudbeds_room_id ?? undefined); }}>
                                        <CalendarPlus size={16} weight="bold" />Nueva reserva
                                      </Button>
                                      <Button type="button" variant="outline" className="w-full" onClick={() => { const m = menu; setMenu(null); onBloquear(m.ini, h.cloudbeds_room_type_id!, salida, h.cloudbeds_room_id ?? undefined); }}>
                                        <Prohibit size={16} weight="bold" />Bloqueo
                                      </Button>
                                    </div>
                                    <PopoverPrimitive.Arrow className="fill-popover drop-shadow-sm" width={16} height={8} />
                                  </PopoverContent>
                                )}
                              </Popover>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {tarjetas.filter((t) => t.hasta > primera && t.desde < ultimaExcl).map((t) => barra(t, h.nombre, h.id))}
                  </div>
                </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Leyenda de lo que se ve en pantalla. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 shrink-0">
        {leyenda.map((e) => {
          const Icono = e.icono;
          return (
            <span key={e.clave} className="inline-flex items-center gap-1.5 t-meta text-muted-foreground">
              <span style={{ backgroundImage: e.imagen }} className={cn('size-4 rounded-full flex items-center justify-center', e.circulo)}>
                {e.letra ? <span className="text-[9px] font-extrabold leading-none">{e.letra}</span> : Icono ? <Icono size={10} weight="bold" /> : null}
              </span>
              {e.etiqueta}
            </span>
          );
        })}
        <span className="t-etiqueta text-muted-foreground ml-2">Pago (Centro de Ventas)</span>
        {ESTADOS_PAGO.map((p) => (
          <span key={p.clave} className="inline-flex items-center gap-1.5 t-meta text-muted-foreground">
            <span className={cn('w-4 h-4 rounded border', p.fondo)} />{p.etiqueta}
          </span>
        ))}
        <span className="t-meta text-muted-foreground">· Blanco: sin venta conciliada · Punteado: sin confirmar o pendiente · Gris: ya salió</span>
      </div>

      {moviendo && (
        <MoverHabitacionDialog
          r={moviendo.r} habitaciones={habitaciones} destino={moviendo.destino} nombreDestino={moviendo.nombre}
          onClose={() => setMoviendo(null)} onHecho={() => onMovida?.()}
        />
      )}
      {moviendoFechas && (
        <MoverFechasDialog
          r={moviendoFechas.r} grupo={moviendoFechas.grupo} llegada={moviendoFechas.llegada} salida={moviendoFechas.salida}
          onClose={() => setMoviendoFechas(null)} onHecho={() => onMovida?.()}
        />
      )}
      <TarjetaInfoDialog info={info} habitaciones={habitaciones} onClose={() => setInfo(null)} puedeGestionar={puedeGestionar} onAdoptar={onAdoptar} onEliminarBloqueo={onEliminarBloqueo} />
    </div>
  );
}
