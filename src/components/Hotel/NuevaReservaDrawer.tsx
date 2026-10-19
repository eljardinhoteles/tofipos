import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  Bed, CalendarBlank, CaretRight, Check, CheckCircle, ForkKnife, MagnifyingGlass, PencilSimple, ShoppingBag, Trash, User, Users,
  UserPlus, WarningCircle, X,
} from '@phosphor-icons/react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePickerField } from '@/components/ui/date-range-picker-field';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Girando, SkeletonFilas } from './Espera';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useExtrasSeleccion } from '../../hooks/useExtrasSeleccion';
import { createRxCliente, updateRxCliente, type RxCliente } from '../../db/rxdb';
import { SelectorProductos } from './SelectorProductos';
import { SelectorPlan } from './detalle/SelectorPlan';
import { usePlanesAlimentacion } from '../../hooks/usePlanesAlimentacion';
import { copiaDePlan, planSeCobra } from '../../lib/hotelPlanesApi';
import { PasoRevision } from './nueva/PasoRevision';
import { ProgresoReserva } from './nueva/ProgresoReserva';
import { PASOS, type Elegida, type EstadoLinea, type Linea, type Paso } from './nueva/tipos';
import { Contador } from './detalle/Contador';
import { Seccion } from './detalle/comunes';
import { dinero, etiquetaCampo, plural } from './detalle/formatos';
import { getDisponibilidad, type DisponibilidadResp, type OfertaCabana } from '../../lib/cloudbeds';
import type { HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { disponibilidadDesdeCalendario } from '../../lib/hotelCalendarioCache';
import { partirNombre } from '../../lib/hotelConciliacion';
import { ClienteSelector } from '../Common/ClienteSelector';
import {
  agregarExtrasHotel, crearGrupoReservasHotel, sincronizarExtraPlanHotel, crearReservaHotel, nombreHuesped,
  leerReservaHotel, type LineaGrupo, type ProgresoCreacion, type ReservaHotel,
} from '../../lib/hotelReservasApi';
import { asegurarVentaHotel } from '../../lib/hotelCobros';
import type { PresetReserva } from './ReservaDrawer';

/**
 * Nueva reserva en 4 pasos, dentro del panel lateral:
 *   1. Estadía: fechas, huéspedes y cabañas disponibles (Cloudbeds, en vivo).
 *   2. Cliente: buscar una ficha de Clientes o escribir los datos (y guardarla como cliente nuevo).
 *   3. Extras: productos del sistema (spa, tours…), por cabaña.
 *   4. Revisar y confirmar.
 * Se guarda primero en el POS y luego se sube a Cloudbeds con la tarifa estándar (la manual vale solo en el POS).
 */


const MAX_NOCHES = 30;
type TipoDoc = 'cedula' | 'ruc' | 'pasaporte';
const ETIQUETA_DOC: Record<TipoDoc, string> = { cedula: 'Cédula', ruc: 'RUC', pasaporte: 'Pasaporte' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const etiqueta = etiquetaCampo;

function planesDe(o: OfertaCabana) {
  return [
    { rateID: o.rateID, nombre: o.nombrePlan || 'Tarifa estándar', total: o.totalRate },
    ...(o.planes ?? []).filter((p) => p.reservable).map((p) => ({ rateID: p.rateID, nombre: p.nombrePlan || 'Otro plan', total: p.totalRate })),
  ];
}

/** Pendiente de calcular: bloquea el paso, pero no se repite en la franja roja (el total del pie ya dice «Sin calcular»). */
const AVISO_CALCULAR = 'Calcula la tarifa antes de continuar';
const SIN_CAMA = '__sin__';
const LINEA_BASE = { cama: '', planRateID: null, manual: false, monto: '', motivo: '' } as const;

/** Capacidad de cada cabaña (adultos + niños) según Cloudbeds; sin dato, sin límite. */
const capsDe = (ofertas: OfertaCabana[] | undefined, habitaciones: HabitacionHotel[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const o of ofertas ?? []) {
    out[o.roomTypeID] = o.capacidad ?? habitaciones.find((h) => h.cloudbeds_room_type_id === o.roomTypeID)?.capacidad ?? Infinity;
  }
  return out;
};

/**
 * Reparte `a` adultos y `n` niños entre las cabañas elegidas respetando la capacidad de cada una: primero un adulto por
 * cabaña, luego el resto de adultos y por último los niños, de uno en uno y por turnos entre las que aún tienen cupo
 * (así queda parejo). Si el grupo no cabe, el exceso queda sin ubicar y el pie lo avisa.
 */
function repartirSel(sel: Record<string, Linea>, a: number, n: number, caps: Record<string, number>): Record<string, Linea> {
  const ids = Object.keys(sel);
  if (ids.length === 0) return sel;
  const res = Object.fromEntries(ids.map((id) => [id, { a: 0, n: 0 }]));
  const cupo = (id: string) => (caps[id] ?? Infinity) - res[id].a - res[id].n;
  let adultos = a;
  for (const id of ids) if (adultos > 0 && cupo(id) > 0) { res[id].a += 1; adultos -= 1; }
  const turnos = (cuantos: number, campo: 'a' | 'n') => {
    let restante = cuantos;
    let avanzo = true;
    while (restante > 0 && avanzo) {
      avanzo = false;
      for (const id of ids) if (restante > 0 && cupo(id) > 0) { res[id][campo] += 1; restante -= 1; avanzo = true; }
    }
    return restante;
  };
  turnos(adultos, 'a');
  turnos(n, 'n');
  return Object.fromEntries(ids.map((id) => [id, { ...sel[id], adultos: res[id].a, ninos: res[id].n }]));
}

const claveCotizacion = (llegada: string, salida: string, a: number, n: number) => `${llegada}|${salida}|${a}|${n}`;

interface Props {
  preset?: PresetReserva | null;
  habitaciones: HabitacionHotel[];
  /** Versión del calendario de la página (cambia tras crear o cancelar): para la lista provisional de libres. */
  version?: number;
  onClose: () => void;
  onCreada?: (reservas: ReservaHotel[]) => void;
}

/** Se monta solo mientras está abierto: cada apertura empieza limpia (con la cabaña y fechas del calendario, si vienen). */
export function NuevaReservaDrawer({ preset, habitaciones, version = 0, onClose, onCreada }: Props) {
  const { currentMesero } = useAuth();
  const { openConfirm } = useUI();

  const [paso, setPaso] = useState<Paso>(1);
  const [intentado, setIntentado] = useState<Record<Paso, boolean>>({ 1: false, 2: false, 3: false, 4: false });
  const tituloPaso = useRef<HTMLHeadingElement>(null);

  // ---------- Paso 1: estadía ----------
  const [llegada, setLlegada] = useState(preset?.llegada ?? '');
  const [salida, setSalida] = useState(preset?.salida ?? (preset?.llegada ? dayjs(preset.llegada).add(1, 'day').format('YYYY-MM-DD') : ''));
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<DisponibilidadResp | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  // La lista mostrada salió del calendario y la consulta real a Cloudbeds aún no llega (o falló: ver `avisoBusqueda`).
  const [provisional, setProvisional] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [avisoBusqueda, setAvisoBusqueda] = useState('');
  const [sel, setSel] = useState<Record<string, Linea>>({});
  const consulta = useRef(0);
  // Tarifas según la ocupación de cada cabaña (una consulta por combinación distinta de adultos y niños).
  const [cotizaciones, setCotizaciones] = useState<Record<string, DisponibilidadResp>>({});
  const [cotizando, setCotizando] = useState(false);
  const [errorCupo, setErrorCupo] = useState<string[]>([]);
  // Cabañas que no admiten el reparto que se les dio (por cabaña, para marcarlas en su tarjeta).
  const [sinCupo, setSinCupo] = useState<Record<string, string>>({});
  const preelegir = useRef(preset?.roomTypeID ?? null);

  const noches = llegada && salida ? dayjs(salida).diff(dayjs(llegada), 'day') : 0;
  const fechasOk = noches >= 1 && noches <= MAX_NOCHES;

  // La disponibilidad se consulta SOLO al pulsar «Buscar disponibilidad» (o una vez al abrir desde el calendario): así se
  // rellenan fechas y huéspedes sin disparar una consulta a Cloudbeds por cada cambio.
  const [buscadoCon, setBuscadoCon] = useState('');
  // La lista de libres no depende de los huéspedes (Cloudbeds filtraría por capacidad): se busca con la ocupación mínima y
  // la tarifa de cada cabaña se calcula después, según los huéspedes que se le asignen.
  const claveActual = `${llegada}|${salida}`;
  const desactualizado = !!resultado && buscadoCon !== claveActual;

  /**
   * Dos consultas en carrera: la lista PROVISIONAL sale al instante del calendario ya cargado y la REAL de Cloudbeds la
   * reemplaza al llegar (Cloudbeds a veces tarda varios segundos). Si la real falla, queda la del calendario con un aviso:
   * al crear, el Worker comprueba la disponibilidad en vivo, así que nunca se reserva algo ocupado.
   */
  const buscar = () => {
    setIntentado((a) => ({ ...a, 1: true }));
    if (!fechasOk || buscando) return;
    const mia = ++consulta.current;
    const vigenteConsulta = () => mia === consulta.current;
    const clave = claveActual;
    setBuscando(true);
    setConfirmando(true);
    setErrorBusqueda('');
    setAvisoBusqueda('');
    let mostrada = false;
    let llegoReal = false;
    let libresProvisionales: Set<string> | null = null;
    const aplicar = (r: DisponibilidadResp, real: boolean) => {
      const primera = !mostrada;
      mostrada = true;
      setResultado(r);
      setProvisional(!real);
      setBuscadoCon(clave);
      setBuscando(false);
      // Se conservan las cabañas elegidas que sigan disponibles; la del calendario se elige sola la primera vez.
      // (El ref se lee y se limpia FUERA del actualizador: React puede ejecutarlo dos veces.)
      const pre = preelegir.current ? r.ofertas.find((o) => o.roomTypeID === preelegir.current && o.reservable) : undefined;
      preelegir.current = null;
      setSel((prev) => {
        const next: Record<string, Linea> = {};
        for (const o of r.ofertas) if (o.reservable && prev[o.roomTypeID]) next[o.roomTypeID] = prev[o.roomTypeID];
        if (pre && !next[pre.roomTypeID]) next[pre.roomTypeID] = { ...LINEA_BASE, adultos, ninos };
        return repartirSel(next, adultos, ninos, capsDe(r.ofertas, habitaciones));
      });
      if (primera) setCotizaciones({});
      if (!real) libresProvisionales = new Set(r.ofertas.filter((o) => o.reservable).map((o) => o.roomTypeID));
      else if (libresProvisionales) {
        const ids = libresProvisionales;
        const ocupadas = [...ids].filter((id) => !r.ofertas.some((o) => o.roomTypeID === id && o.reservable)).length;
        if (ocupadas > 0) setAvisoBusqueda(`Cloudbeds confirmó que ${ocupadas === 1 ? 'una cabaña que parecía libre no lo está' : `${ocupadas} cabañas que parecían libres no lo están`}: ya no aparece${ocupadas === 1 ? '' : 'n'} en la lista.`);
      }
    };
    const desdeCalendario = disponibilidadDesdeCalendario(llegada, salida, habitaciones, version).catch(() => null);
    void desdeCalendario.then((r) => { if (r && !llegoReal && vigenteConsulta()) aplicar(r, false); });
    void (async () => {
      try {
        const r = await getDisponibilidad(llegada, salida, 1, 0, { lista: true });
        llegoReal = true;
        if (vigenteConsulta()) aplicar(r, true);
      } catch (e) {
        // Se espera a la del calendario: si llega, se queda esa con un aviso en vez de un error.
        await desdeCalendario;
        if (!vigenteConsulta()) return;
        const msg = e instanceof Error ? e.message : 'No se pudo consultar la disponibilidad';
        if (mostrada) setAvisoBusqueda(`No se pudo confirmar con Cloudbeds (${msg}). La lista sale del calendario; al crear la reserva se comprueba en vivo.`);
        else { setResultado(null); setErrorBusqueda(msg); }
      } finally {
        if (vigenteConsulta()) { setBuscando(false); setConfirmando(false); }
      }
    })();
  };

  // Al venir de una casilla del calendario ya hay fechas y cabaña: se busca una vez al abrir.
  const buscarAlAbrir = useRef(buscar);
  useEffect(() => { buscarAlAbrir.current = buscar; });
  useEffect(() => {
    if (!preset?.llegada) return;
    const t = setTimeout(() => buscarAlAbrir.current(), 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caps = useMemo(() => capsDe(resultado?.ofertas, habitaciones), [resultado, habitaciones]);

  // Solo las cabañas libres: las ocupadas o cerradas no se muestran para no alargar la lista.
  const libres = useMemo(() => (resultado ? resultado.ofertas.filter((o) => o.reservable) : []), [resultado]);
  // Cabañas que fallan SOLO por la estadía mínima: con más noches sí estarían libres.
  const estadiaMinima = useMemo(() => {
    const fallan = resultado ? resultado.ofertas.filter((o) => !o.reservable && o.motivo === 'No cumple la estadía mínima') : [];
    if (fallan.length === 0) return null;
    const pedidas = fallan.map((o) => o.minNoches ?? 0).filter((n) => n > 0);
    return { cabanas: fallan.length, noches: pedidas.length ? Math.min(...pedidas) : null };
  }, [resultado]);

  // Mínimo de cabañas para el grupo, tomando primero las de mayor capacidad (null si falta el dato o no cabe).
  const minimoCabanas = useMemo(() => {
    const cups = libres.map((o) => caps[o.roomTypeID]).sort((x, y) => y - x);
    if (cups.length === 0 || cups.some((c) => !Number.isFinite(c))) return null;
    let falta = adultos + ninos;
    let n = 0;
    for (const c of cups) { if (falta <= 0) break; falta -= c; n += 1; }
    return falta > 0 ? null : n;
  }, [libres, caps, adultos, ninos]);

  const elegidas = useMemo(() => {
    if (!resultado) return [];
    return resultado.ofertas.filter((o) => sel[o.roomTypeID]).map((base) => {
      const l = sel[base.roomTypeID];
      // La tarifa buena es la de la ocupación de ESTA cabaña; mientras no se calcule se usa la base (1 adulto).
      const cot = cotizaciones[claveCotizacion(resultado.start, resultado.end, l.adultos, l.ninos)]?.ofertas.find((x) => x.roomTypeID === base.roomTypeID);
      const o = cot ?? base;
      const planes = planesDe(o);
      const plan = planes.find((p) => p.rateID === l.planRateID) ?? planes[0];
      const monto = parseFloat(l.monto);
      const manualValida = l.manual && monto >= 0 && !Number.isNaN(monto);
      const hab = habitaciones.find((h) => h.cloudbeds_room_type_id === o.roomTypeID);
      return { o, l, planes, plan, manualValida, monto, totalPOS: manualValida ? monto : plan.total, nombre: hab?.nombre ?? o.roomTypeName, hab, cotizado: !!cot, camas: hab?.camas ?? [] };
    });
  }, [resultado, sel, habitaciones, cotizaciones]);
  const esGrupo = elegidas.length > 1;

  // Al sumar o quitar una cabaña, el grupo se reparte de nuevo a partes iguales (se puede ajustar a mano después).
  const alternar = (o: OfertaCabana) => {
    setErrorCupo([]); setSinCupo({});
    setSel((a) => {
      const { [o.roomTypeID]: ya, ...resto } = a;
      return repartirSel(ya ? resto : { ...a, [o.roomTypeID]: { ...LINEA_BASE, adultos, ninos } }, adultos, ninos, caps);
    });
  };
  const cambiarGrupo = (a: number, n: number) => { setAdultos(a); setNinos(n); setErrorCupo([]); setSinCupo({}); setSel((prev) => repartirSel(prev, a, n, caps)); };
  const repartirAuto = () => { setErrorCupo([]); setSinCupo({}); setSel((prev) => repartirSel(prev, adultos, ninos, caps)); };
  // Los totales del grupo son el punto de partida del reparto, no un límite: al ajustar una cabaña a mano, el grupo pasa a
  // ser la suma de lo que tiene cada cabaña (así se puede elegir cualquier combinación entre las libres).
  const ajustar = (id: string, patch: Partial<Linea>) => {
    const siguiente = { ...sel, [id]: { ...sel[id], ...patch } };
    setSel(siguiente);
    if ('adultos' in patch || 'ninos' in patch) {
      setErrorCupo([]); setSinCupo({});
      setAdultos(Object.values(siguiente).reduce((t, l) => t + l.adultos, 0));
      setNinos(Object.values(siguiente).reduce((t, l) => t + l.ninos, 0));
    }
  };

  // ---------- Paso 2: cliente ----------
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [cliente, setCliente] = useState<RxCliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pais, setPais] = useState('EC');
  // Documento del huésped: va a su ficha de Clientes (Cloudbeds no lo recibe).
  // Plan de alimentación: undefined = sin tocar (se usa el predeterminado, si hay); null = «Sin plan».
  const { planes, defecto: planDefecto } = usePlanesAlimentacion();
  const [planElegido, setPlanElegido] = useState<string | null | undefined>(undefined);
  const planId = planElegido === undefined ? planDefecto?.id ?? null : planElegido;
  const plan = planes.find((p) => p.id === planId) ?? null;
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('cedula');
  const [numeroDoc, setNumeroDoc] = useState('');
  const [notas, setNotas] = useState('');
  const [guardarCliente, setGuardarCliente] = useState(true);

  const elegirCliente = (c: RxCliente) => {
    const n = partirNombre(c.nombre);
    setCliente(c);
    setNombre(n.nombre);
    setApellido(n.apellido);
    setEmail(c.email ?? '');
    setTelefono(c.telefono ?? '');
    if (c.tipo_cliente === 'extranjero' && pais === 'EC') setPais('');
    setTipoDoc(c.tipo_doc && c.tipo_doc !== 'otro' ? c.tipo_doc : c.tipo_cliente === 'extranjero' ? 'pasaporte' : 'cedula');
    setNumeroDoc((c.numero_doc || c.dni || '').trim());
    setBusquedaCliente('');
  };
  const quitarCliente = () => { setCliente(null); setNombre(''); setApellido(''); setEmail(''); setTelefono(''); setPais('EC'); setTipoDoc('cedula'); setNumeroDoc(''); };

  // ---------- Paso 3: extras ----------
  const ext = useExtrasSeleccion(elegidas[0]?.o.roomTypeID ?? '');
  const { items: extras, activos, categorias, cantidades: cantidadesPorProducto, tasaIva, preciosConIva, sumar: sumarProducto, restar: restarProducto, cambiar: cambiarExtra, quitar: quitarExtra, monto: montoExtra } = ext;
  const [extraAbierto, setExtraAbierto] = useState<string | null>(null); // fila expandida en el pie
  // Si se quitó una cabaña después de añadirle extras, esos extras pasan a la primera cabaña elegida (no se pierden).
  const extrasOk = extras.map((x) => (elegidas.some((e) => e.o.roomTypeID === x.roomTypeID) ? x : { ...x, roomTypeID: elegidas[0]?.o.roomTypeID ?? '' }));
  const { total: totalExtras, neto: netoExtras, iva: ivaExtras } = ext;

  // ---------- Totales y validación ----------
  const totalEstadia = elegidas.reduce((a, e) => a + e.totalPOS, 0);
  const total = totalEstadia + totalExtras;

  const sumaAdultos = elegidas.reduce((a, e) => a + e.l.adultos, 0);
  const sumaNinos = elegidas.reduce((a, e) => a + e.l.ninos, 0);

  // Paso 1: primero se reparte el grupo, luego se pulsa «Calcular tarifa» (una consulta por ocupación distinta) y recién
  // entonces se puede continuar. Cambiar el reparto invalida el cálculo.
  // La franja del pie resume el grupo (suma de lo que tiene cada cabaña) y avisa solo de lo que sí es un problema.
  const textoReparto = (() => {
    const partes: string[] = [];
    const sinAdulto = elegidas.filter((e) => e.l.adultos < 1).length;
    if (sinAdulto > 0) partes.push(sinAdulto === 1 ? 'una cabaña sin adultos: cada una necesita al menos uno' : `${sinAdulto} cabañas sin adultos: cada una necesita al menos uno`);
    if (elegidas.some((e) => e.l.adultos + e.l.ninos > (caps[e.o.roomTypeID] ?? Infinity))) partes.push('una cabaña supera su capacidad');
    if (partes.length > 0) return `Revisa el reparto: ${partes.join(', ')}`;
    return `Grupo: ${plural(sumaAdultos, 'adulto', 'adultos')}${sumaNinos ? ` y ${plural(sumaNinos, 'niño', 'niños')}` : ''} en ${plural(elegidas.length, 'cabaña', 'cabañas')}`;
  })();
  const repartoOk = !elegidas.some((e) => e.l.adultos < 1 || e.l.adultos + e.l.ninos > (caps[e.o.roomTypeID] ?? Infinity));
  const todoCotizado = elegidas.length > 0 && elegidas.every((e) => e.cotizado);

  const faltas = {
    1: [
      !fechasOk && `Elige fechas de 1 a ${MAX_NOCHES} noches`,
      fechasOk && !resultado && !errorBusqueda && 'Pulsa «Buscar disponibilidad» para ver las cabañas libres',
      fechasOk && !!errorBusqueda && 'Reintenta la consulta de disponibilidad',
      desactualizado && 'Cambiaste las fechas: vuelve a buscar',
      elegidas.length > 0 && elegidas.some((e) => e.l.adultos < 1) && 'Cada cabaña necesita al menos un adulto',
      elegidas.some((e) => e.l.adultos + e.l.ninos > (caps[e.o.roomTypeID] ?? Infinity)) && 'Una cabaña supera su capacidad máxima',
      fechasOk && !!resultado && !desactualizado && elegidas.length === 0 && 'Elige al menos una cabaña',
      elegidas.some((e) => e.l.manual && !e.manualValida) && 'Escribe el total de la tarifa manual',
    ].filter(Boolean) as string[],
    2: [
      !nombre.trim() && 'Falta el nombre',
      !apellido.trim() && 'Falta el apellido',
      !EMAIL_RE.test(email.trim()) && 'Falta un correo válido (Cloudbeds lo exige)',
      !/^[A-Za-z]{2}$/.test(pais.trim()) && 'El país es un código de 2 letras (EC, US…)',
      (cliente || guardarCliente) && !numeroDoc.trim() && 'Falta el documento (cédula, RUC o pasaporte)',
    ].filter(Boolean) as string[],
    3: extras.some((x) => !(parseFloat(x.precio) >= 0) || x.cantidad < 1) ? ['Revisa el precio y la cantidad de los extras'] : [],
    4: [],
  } as Record<Paso, string[]>;

  const faltasReparto = faltas[1];
  faltas[1] = [...faltasReparto, ...errorCupo, ...(faltasReparto.length === 0 && errorCupo.length === 0 && !todoCotizado && elegidas.length > 0 ? [AVISO_CALCULAR] : [])];

  // Lo del reparto lo explica su propia franja y lo de calcular el total del pie: aquí no se repite.
  const avisos = faltas[paso].filter((f) => f !== AVISO_CALCULAR && !/^(Reparte|Cada cabaña necesita|Una cabaña supera|Escribe el total de la tarifa manual)/.test(f));

  const irA = (n: Paso) => {
    setPaso(n);
    // El foco va al título del paso: un lector de pantalla anuncia dónde está.
    setTimeout(() => tituloPaso.current?.focus(), 0);
  };
  /**
   * Calcula la tarifa de cada cabaña según SU ocupación (una consulta por combinación distinta de adultos y niños) y
   * comprueba que la admite: Cloudbeds deja fuera las cabañas sin capacidad suficiente. Devuelve true si todo cuadra.
   */
  const cotizar = async (): Promise<boolean> => {
    if (!resultado) return false;
    // Solo se consultan las cabañas ELEGIDAS, agrupadas por ocupación (una consulta por combinación distinta de adultos y niños).
    const porCombo = new Map<string, string[]>();
    for (const e of elegidas) {
      const k = claveCotizacion(resultado.start, resultado.end, e.l.adultos, e.l.ninos);
      if (cotizaciones[k]?.ofertas.some((o) => o.roomTypeID === e.o.roomTypeID)) continue; // ya calculada
      porCombo.set(k, [...(porCombo.get(k) ?? []), e.o.roomTypeID]);
    }
    let nuevas = cotizaciones;
    if (porCombo.size > 0) {
      setCotizando(true);
      try {
        const res = await Promise.all([...porCombo].map(async ([k, ids]) => {
          const [, , a, n] = k.split('|');
          const r = await getDisponibilidad(resultado.start, resultado.end, Number(a), Number(n), { roomTypeIDs: ids });
          return [k, r] as const;
        }));
        nuevas = { ...cotizaciones };
        for (const [k, r] of res) nuevas[k] = { ...r, ofertas: [...(cotizaciones[k]?.ofertas.filter((o) => !r.ofertas.some((x) => x.roomTypeID === o.roomTypeID)) ?? []), ...r.ofertas] };
        setCotizaciones(nuevas);
      } catch (e) {
        setErrorCupo([`No se pudo calcular la tarifa: ${e instanceof Error ? e.message : 'Cloudbeds no respondió'}`]);
        return false;
      } finally {
        setCotizando(false);
      }
    }
    const marcas: Record<string, string> = {};
    const problemas = elegidas.flatMap((e) => {
      const o = nuevas[claveCotizacion(resultado.start, resultado.end, e.l.adultos, e.l.ninos)]?.ofertas.find((x) => x.roomTypeID === e.o.roomTypeID);
      const quien = `${plural(e.l.adultos, 'adulto', 'adultos')}${e.l.ninos ? ` y ${plural(e.l.ninos, 'niño', 'niños')}` : ''}`;
      if (o && o.reservable) return [];
      marcas[e.o.roomTypeID] = `No admite ${quien}${o?.motivo ? ` (${o.motivo})` : ''}. Cambia el reparto y vuelve a calcular.`;
      return [`${e.nombre} no admite ${quien}. Cambia el reparto y calcula de nuevo.`];
    });
    setSinCupo(marcas);
    setErrorCupo(problemas);
    return problemas.length === 0;
  };

  const calcularTarifa = async () => {
    setIntentado((a) => ({ ...a, 1: true }));
    if (faltasReparto.length > 0) return;
    await cotizar();
  };

  const continuar = () => {
    setIntentado((a) => ({ ...a, [paso]: true }));
    if (faltas[paso].length > 0) return;
    irA((paso + 1) as Paso);
  };
  // Un paso ya visitado se puede volver a abrir desde el indicador; los siguientes solo si los anteriores están completos.

  // ---------- Confirmar ----------
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState<Array<{ id: string; nombre: string; estado: EstadoLinea }>>([]);

  const confirmar = async () => {
    if (!resultado || [1, 2, 3].some((n) => faltas[n as Paso].length > 0)) return;
    setGuardando(true);
    setAvance(elegidas.map((e) => ({ id: e.o.roomTypeID, nombre: e.nombre, estado: 'guardando' })));
    const alProgreso = (p: ProgresoCreacion) => {
      if (p.fase === 'guardado') setAvance((a) => a.map((l) => ({ ...l, estado: 'subiendo' })));
      else setAvance((a) => a.map((l) => (l.id === p.roomTypeID ? { ...l, estado: p.sync === 'sincronizada' ? 'ok' : p.sync } : l)));
    };
    try {
      // 1) Ficha del cliente: nueva, o se completan los datos que le faltaban.
      let clienteId: string | null = cliente?.id ?? null;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      if (!cliente && guardarCliente) {
        clienteId = crypto.randomUUID();
        await createRxCliente({
          id: clienteId,
          nombre: `${nombre.trim()} ${apellido.trim()}`.trim(),
          email: email.trim() || undefined,
          telefono: telefono.trim() || undefined,
          tipo_cliente: tipoDoc === 'pasaporte' || pais.trim().toUpperCase() !== 'EC' ? 'extranjero' : 'persona_natural',
          dni: numeroDoc.trim() || undefined,
          tipo_doc: numeroDoc.trim() ? tipoDoc : undefined,
          numero_doc: numeroDoc.trim() || undefined,
          organization_id: orgId,
        });
      } else if (cliente) {
        const patch: Partial<RxCliente> = {};
        if (!cliente.email && email.trim()) patch.email = email.trim();
        if (!cliente.telefono && telefono.trim()) patch.telefono = telefono.trim();
        if (!(cliente.dni || cliente.numero_doc) && numeroDoc.trim()) { patch.dni = numeroDoc.trim(); patch.numero_doc = numeroDoc.trim(); patch.tipo_doc = tipoDoc; }
        if (Object.keys(patch).length > 0) await updateRxCliente(cliente.id, patch);
      }

      // 2) Reservas: en el POS y luego en Cloudbeds (una por cabaña; en grupo, enlazadas).
      const lineas: LineaGrupo[] = elegidas.map((e) => ({
        roomTypeID: e.o.roomTypeID, cabana: e.nombre, codigo: e.hab?.codigo ?? null, rateID: e.plan.rateID,
        cama: e.l.cama || null, adultos: e.l.adultos, ninos: e.l.ninos, totalEstadia: e.plan.total, totalManual: e.manualValida ? e.monto : null, motivoTarifa: e.l.motivo,
      }));
      const huesped = { nombre, apellido, email, telefono, pais };
      const comun = { plan: plan ? copiaDePlan(plan) : null, llegada: resultado.start, salida: resultado.end, huesped, notas, usuarioId: currentMesero?.id, usuarioNombre: currentMesero?.nombre, clienteId };
      let creadas: ReservaHotel[];
      let estados: Array<{ sync: string; mensaje?: string }>;
      if (lineas.length === 1) {
        const l = lineas[0];
        const res = await crearReservaHotel({ ...comun, roomTypeID: l.roomTypeID, cama: l.cama, cabana: l.cabana, rateID: l.rateID, adultos: l.adultos, ninos: l.ninos, totalEstadia: l.totalEstadia, totalManual: l.totalManual, motivoTarifa: l.motivoTarifa }, alProgreso);
        creadas = [res.reserva];
        estados = [res];
      } else {
        const res = await crearGrupoReservasHotel({ ...comun, lineas }, alProgreso);
        creadas = res.reservas;
        estados = res.resultados;
      }

      // 3) Extras, por cabaña (una sola nota en Cloudbeds por reserva). Un fallo aquí no deshace la reserva.
      let extrasFallidos = 0;
      for (const r of creadas) {
        const suyos = extrasOk.filter((x) => x.roomTypeID === r.room_type_id);
        if (suyos.length === 0 || r.estado === 'cancelada') continue;
        setAvance((a) => a.map((l) => (l.id === r.room_type_id && l.estado === 'ok' ? { ...l, estado: 'extras' } : l)));
        try {
          await agregarExtrasHotel(r, suyos.map((x) => ({
            descripcion: `${x.cantidad > 1 ? `${x.cantidad}× ` : ''}${x.producto.nombre}`,
            monto: montoExtra(x),
            producto_id: x.producto.id,
            cantidad: x.cantidad,
          })), currentMesero?.nombre);
        } catch { extrasFallidos += suyos.length; }
        setAvance((a) => a.map((l) => (l.id === r.room_type_id && l.estado === 'extras' ? { ...l, estado: 'ok' } : l)));
      }

      // Plan de alimentación con precio: se suma como un extra (adultos y niños de cada cabaña × noches).
      for (const c of creadas) {
        if (c.estado === 'cancelada' || !planSeCobra(c.plan_alimentacion)) continue;
        await sincronizarExtraPlanHotel(c).catch((e) => console.warn('No se pudo añadir el plan de alimentación', e));
      }

      // 4) Venta en el Centro de Ventas: una sola (también en grupo) con el total de las reservas vigentes, para que los abonos
      // se registren dentro de ella. Un fallo aquí no deshace la reserva: el primer anticipo la crea.
      try {
        const frescas = (await Promise.all(creadas.map((c) => leerReservaHotel(c.id).catch(() => null)))).map((f, i) => f ?? creadas[i]);
        const vigentes = frescas.filter((f) => f.estado === 'confirmada');
        if (vigentes.length > 0) await asegurarVentaHotel(vigentes[0], currentMesero?.id, vigentes);
      } catch (e) {
        console.warn('No se pudo crear la venta de la reserva', e);
        showToast.warning('La reserva quedó creada, pero no su venta', 'Se creará con el primer anticipo, o concíliala desde su detalle.');
      }

      const ok = estados.filter((e) => e.sync === 'sincronizada').length;
      const pendientes = estados.filter((e) => e.sync === 'pendiente').length;
      const rechazadas = creadas.filter((_, i) => estados[i].sync === 'error');
      const rango = `${dayjs(resultado.start).format('DD/MM')} al ${dayjs(resultado.end).format('DD/MM')}`;
      if (rechazadas.length === 0 && pendientes === 0) {
        showToast.success(esGrupo ? `Grupo reservado · ${ok} cabañas` : 'Reserva creada', `${nombreHuesped(creadas[0])} · ${rango}`);
      } else {
        if (pendientes > 0) showToast.warning(`${plural(pendientes, 'reserva quedó', 'reservas quedaron')} sin subir a Cloudbeds`, 'Están guardadas en el POS y se reintentan solas. Revísalas en «Por sincronizar».');
        rechazadas.forEach((r) => showToast.error(`Cloudbeds rechazó ${r.cabana}`, estados[creadas.indexOf(r)].mensaje));
        if (ok > 0) showToast.success(`${plural(ok, 'cabaña reservada', 'cabañas reservadas')}`, rango);
      }
      if (extrasFallidos > 0) showToast.warning(`${plural(extrasFallidos, 'extra no se guardó', 'extras no se guardaron')}`, 'La reserva sí quedó creada. Agrégalos desde su detalle.');
      onCreada?.(creadas);
      onClose();
    } catch (e) {
      showToast.fallo('crear la reserva', e);
      setGuardando(false);
    }
  };

  // Hay algo que perder si ya se avanzó de paso o se cambió lo que traía el calendario (fechas, huéspedes, cabañas).
  const salidaInicial = preset?.salida ?? (preset?.llegada ? dayjs(preset.llegada).add(1, 'day').format('YYYY-MM-DD') : '');
  const hayCambios = paso > 1 || adultos !== 2 || ninos !== 0 || llegada !== (preset?.llegada ?? '') || salida !== salidaInicial
    || Object.keys(sel).length > (preset?.roomTypeID ? 1 : 0);
  const puedeIrA = (n: Paso) => n <= paso || PASOS.filter((p) => p.n < n).every((p) => faltas[p.n].length === 0);
  const cerrar = () => {
    if (guardando) return;
    if (hayCambios) openConfirm('¿Descartar la reserva?', 'Aún no se ha creado. Si sales ahora, se pierde lo que llenaste.', onClose);
    else onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) cerrar(); }}>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl p-0 flex flex-col gap-0 data-[side=right]:border-l-0 bg-background shadow-2xl">
        <SheetHeader className="px-5 py-3 border-b border-border bg-card flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-left">
          <SheetTitle className="t-titulo shrink-0">Nueva reserva</SheetTitle>
          <SheetDescription className="sr-only">Paso {paso} de 4 · {PASOS[paso - 1].titulo}</SheetDescription>
          <div className="order-last basis-full sm:order-none sm:basis-auto sm:flex-1 min-w-0">
            <Indicador paso={paso} puedeIrA={puedeIrA} completo={(n) => n < paso && faltas[n].length === 0} onIr={irA} deshabilitado={guardando} />
          </div>
          <button type="button" onClick={cerrar} disabled={guardando} aria-label="Cerrar sin crear la reserva"
            className="ml-auto sm:ml-0 size-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 shrink-0">
            <X size={18} weight="bold" />
          </button>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          <h3 ref={tituloPaso} tabIndex={-1} className="sr-only">{`Paso ${paso}: ${PASOS[paso - 1].titulo}`}</h3>

          {guardando ? (
            <ProgresoReserva avance={avance} />
          ) : paso === 1 ? (
            <>
              <section className="flex flex-col gap-3" aria-label="Fechas y huéspedes">
                <div className="flex flex-col gap-1.5">
                  <span className={etiqueta}>Llegada y salida</span>
                  <DateRangePickerField desde={llegada} hasta={salida} minimo={dayjs().format('YYYY-MM-DD')} maxNoches={MAX_NOCHES} sufijo={fechasOk ? plural(noches, 'noche', 'noches') : undefined} onChange={(d, h) => { setLlegada(d); setSalida(h); }} aria-label="Elegir llegada y salida" />
                  {intentado[1] && !fechasOk && <p className="t-meta text-destructive">Elige la llegada y la salida (de 1 a {MAX_NOCHES} noches).</p>}
                </div>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <Contador etiquetaTexto="Adultos total" valor={adultos} min={1} max={60} onCambio={(n) => cambiarGrupo(n, ninos)} />
                  <Contador etiquetaTexto="Niños total" valor={ninos} min={0} max={60} onCambio={(n) => cambiarGrupo(adultos, n)} />
                  <Button type="button" className="h-11 gap-2 ml-auto grow sm:grow-0 px-5" onClick={buscar} disabled={buscando || !fechasOk}>
                    {buscando ? <><Girando /> Consultando…</> : <><MagnifyingGlass size={16} weight="bold" /> {resultado && !desactualizado ? 'Buscar de nuevo' : 'Buscar disponibilidad'}</>}
                  </Button>
                </div>
              </section>

              <section className="flex flex-col gap-2.5" aria-labelledby="nr-cabanas">
                <div className="flex items-center justify-between gap-2">
                  <h4 id="nr-cabanas" className="t-fila flex items-center gap-2"><Bed size={18} className="text-primary" /> Cabañas disponibles</h4>
                  <span className="t-meta text-muted-foreground" role="status" aria-live="polite">
                    {buscando ? 'Consultando Cloudbeds…' : resultado ? `${libres.length} ${libres.length === 1 ? 'libre' : 'libres'}` : ''}
                    {!buscando && provisional && confirmando && <span className="inline-flex items-center gap-1.5 ml-2"><Girando size={12} /> Confirmando con Cloudbeds…</span>}
                  </span>
                </div>
                {avisoBusqueda && !buscando && (
                  <p role="status" className="t-meta text-warning-foreground rounded-2xl bg-warning-soft px-3 py-2">{avisoBusqueda}</p>
                )}
                {!resultado && !buscando && !errorBusqueda && (
                  <p className="t-meta text-muted-foreground rounded-2xl bg-muted px-3 py-3">
                    {fechasOk ? 'Ajusta los huéspedes si hace falta y pulsa «Buscar disponibilidad».' : 'Elige las fechas y los huéspedes, y luego busca disponibilidad.'}
                  </p>
                )}
                {errorBusqueda && !buscando && (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-destructive-soft text-destructive px-3 py-2">
                    <span className="t-meta">No se pudo consultar la disponibilidad. {errorBusqueda}</span>
                    <Button type="button" variant="outline" className="h-11 shrink-0" onClick={buscar}>Reintentar</Button>
                  </div>
                )}
                {buscando && !resultado && <SkeletonFilas n={4} alto="h-16" />}
                {resultado && libres.length > 0 && minimoCabanas && (
                  <p className="t-meta text-muted-foreground">
                    Para {plural(adultos + ninos, 'persona', 'personas')} hace{minimoCabanas === 1 ? '' : 'n'} falta al menos {plural(minimoCabanas, 'cabaña', 'cabañas')}.
                  </p>
                )}
                {desactualizado && !buscando && (
                  <p role="status" className="t-meta text-warning-foreground rounded-2xl bg-warning-soft px-3 py-2">Cambiaste las fechas o los huéspedes. Pulsa «Buscar disponibilidad» para actualizar esta lista.</p>
                )}
                {resultado && libres.length === 0 && (
                  <p className="t-meta text-warning-foreground rounded-2xl bg-warning-soft px-3 py-2">
                    {estadiaMinima
                      ? `Estas fechas exigen una estadía mínima${estadiaMinima.noches ? ` de ${plural(estadiaMinima.noches, 'noche', 'noches')}` : ''} (elegiste ${plural(noches, 'noche', 'noches')}). Amplía la salida para ver las cabañas disponibles.`
                      : 'No hay cabañas libres para estas fechas y huéspedes. Prueba con otras fechas.'}
                  </p>
                )}
                {resultado && libres.length > 0 && estadiaMinima && (
                  <p className="t-meta text-muted-foreground">
                    {plural(estadiaMinima.cabanas, 'cabaña más no aparece', 'cabañas más no aparecen')} porque piden una estadía mínima{estadiaMinima.noches ? ` de ${plural(estadiaMinima.noches, 'noche', 'noches')}` : ''}.
                  </p>
                )}
                {resultado && libres.length > 0 && (
                  <div className={cn('flex flex-col gap-2 transition-opacity', (buscando || desactualizado) && 'opacity-60')}>
                    {libres.map((o) => {
                      const activa = !!sel[o.roomTypeID];
                      const nombreCabana = habitaciones.find((h) => h.cloudbeds_room_type_id === o.roomTypeID)?.nombre ?? o.roomTypeName;
                      return (
                        <div key={o.roomTypeID} className={cn('rounded-2xl border bg-card transition-colors', activa ? 'border-primary ring-2 ring-primary/20' : 'border-border')}>
                          <button type="button" onClick={() => alternar(o)} aria-pressed={activa}
                            className="w-full min-h-12 flex items-center justify-between gap-3 px-3 py-2 text-left rounded-2xl cursor-pointer hover:bg-muted/40">
                            <span className="flex items-center gap-3 min-w-0">
                              <span className={cn('size-5 rounded-md border-2 flex items-center justify-center shrink-0', activa ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                                {activa && <Check size={13} weight="bold" />}
                              </span>
                              <span className="flex flex-col min-w-0">
                                <span className="t-cuerpo-fuerte truncate leading-tight">{nombreCabana}</span>
                                <span className="t-meta text-muted-foreground">{activa && elegidas.find((x) => x.o.roomTypeID === o.roomTypeID)?.cotizado ? `${dinero(noches > 0 ? (elegidas.find((x) => x.o.roomTypeID === o.roomTypeID)?.plan.total ?? 0) / noches : 0)} por noche` : `Libre${Number.isFinite(caps[o.roomTypeID]) ? ` · hasta ${caps[o.roomTypeID]} personas` : ''}`}</span>
                              </span>
                            </span>
                            <span className="flex flex-col items-end shrink-0">
                              {(() => {
                                const e = elegidas.find((x) => x.o.roomTypeID === o.roomTypeID);
                                if (!activa || !e) return null;
                                if (sinCupo[o.roomTypeID]) return <span className="t-meta text-destructive">Sin cupo</span>;
                                return e.cotizado ? <span className="t-valor">{dinero(e.plan.total)}</span> : <span className="t-meta text-muted-foreground">Sin calcular</span>;
                              })()}
                            </span>
                          </button>
                          {activa && (() => {
                            const e = elegidas.find((x) => x.o.roomTypeID === o.roomTypeID);
                            return e ? <ConfigCabana e={e} esGrupo={esGrupo} intentado={intentado[1]} error={sinCupo[o.roomTypeID]} capacidad={caps[o.roomTypeID] ?? Infinity} onAjustar={(p) => ajustar(o.roomTypeID, p)} /> : null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : paso === 2 ? (
            <>
              {!cliente ? (
                <Seccion icono={MagnifyingGlass} titulo="Buscar en Clientes">
                  <ClienteSelector value={busquedaCliente} onChange={setBusquedaCliente} onSelect={elegirCliente} placeholder="Nombre, correo, teléfono o documento" tono="info" />
                </Seccion>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
                  <span className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"><User size={18} weight="bold" /></span>
                  <span className="flex flex-col min-w-0 grow">
                    <span className="t-cuerpo-fuerte truncate">{cliente.nombre}</span>
                    <span className="t-meta text-muted-foreground">Cliente del POS: la reserva queda enlazada a su ficha</span>
                  </span>
                  <Button type="button" variant="outline" onClick={quitarCliente}>Cambiar</Button>
                </div>
              )}

              <Seccion icono={cliente ? PencilSimple : UserPlus} titulo={cliente ? 'Datos para Cloudbeds' : 'Datos del huésped'}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Nombre" id="nr-nombre" requerido error={intentado[2] && !nombre.trim() ? 'Escribe el nombre' : ''}>
                    <Input id="nr-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" aria-invalid={intentado[2] && !nombre.trim()} className="h-11 text-base" />
                  </Campo>
                  <Campo label="Apellido" id="nr-apellido" requerido error={intentado[2] && !apellido.trim() ? 'Escribe el apellido' : ''}>
                    <Input id="nr-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="family-name" aria-invalid={intentado[2] && !apellido.trim()} className="h-11 text-base" />
                  </Campo>
                  <Campo label="Correo" id="nr-email" requerido error={intentado[2] && !EMAIL_RE.test(email.trim()) ? 'Escribe un correo válido: Cloudbeds lo exige' : ''}>
                    <Input id="nr-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={intentado[2] && !EMAIL_RE.test(email.trim())} className="h-11 text-base" />
                  </Campo>
                  <Campo label="Teléfono" id="nr-tel">
                    <Input id="nr-tel" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" className="h-11 text-base" />
                  </Campo>
                  <Campo label="Documento" id="nr-doc" requerido={!!(cliente || guardarCliente)} error={intentado[2] && (cliente || guardarCliente) && !numeroDoc.trim() ? 'Escribe la cédula, RUC o pasaporte' : ''}>
                    <div className="flex gap-2">
                      <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as TipoDoc)}>
                        <SelectTrigger className="data-[size=default]:h-11 w-32 shrink-0 px-2.5 text-base rounded-2xl bg-card border-border shadow-xs" aria-label="Tipo de documento"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(ETIQUETA_DOC) as TipoDoc[]).map((t) => <SelectItem key={t} value={t} className="t-cuerpo">{ETIQUETA_DOC[t]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input id="nr-doc" value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} placeholder={tipoDoc === 'pasaporte' ? 'N.º de pasaporte' : tipoDoc === 'ruc' ? '13 dígitos' : '10 dígitos'} aria-invalid={intentado[2] && (cliente || guardarCliente) && !numeroDoc.trim()} className="h-11 text-base" />
                    </div>
                  </Campo>
                  <Campo label="País (2 letras)" id="nr-pais" requerido error={intentado[2] && !/^[A-Za-z]{2}$/.test(pais.trim()) ? 'Usa el código de 2 letras: EC, US, CO…' : ''}>
                    <Input id="nr-pais" value={pais} maxLength={2} onChange={(e) => setPais(e.target.value.toUpperCase())} aria-invalid={intentado[2] && !/^[A-Za-z]{2}$/.test(pais.trim())} className="h-11 text-base uppercase w-24" />
                  </Campo>
                </div>
                {!cliente && (
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 cursor-pointer">
                    <span className="flex flex-col">
                      <span className="t-cuerpo-fuerte">Guardar en Clientes</span>
                      <span className="t-meta text-muted-foreground">Crea su ficha para la próxima vez y para el Centro de Ventas</span>
                    </span>
                    <Switch checked={guardarCliente} onCheckedChange={setGuardarCliente} aria-label="Guardar el huésped en Clientes" />
                  </label>
                )}
                <Campo label="Notas internas (solo POS)" id="nr-notas">
                  <Textarea id="nr-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Llegada tarde, alergias, celebración…" className="min-h-16 text-base" />
                </Campo>
              </Seccion>
            </>
          ) : paso === 3 ? (
            <>
              {planes.length > 0 && (
                <Seccion icono={ForkKnife} color="warning" titulo="Plan de alimentación">
                  <SelectorPlan planes={planes} valor={planId} onChange={setPlanElegido} adultos={sumaAdultos} ninos={sumaNinos} noches={noches} />
                </Seccion>
              )}
            <SelectorProductos productos={activos} categorias={categorias} cantidades={cantidadesPorProducto} tasaIva={tasaIva} preciosConIva={preciosConIva} onSumar={sumarProducto} onRestar={restarProducto} />
            </>
          ) : (
            <PasoRevision
              llegada={llegada} salida={salida} noches={noches} elegidas={elegidas} esGrupo={esGrupo}
              huesped={{ nombre: `${nombre} ${apellido}`.trim(), email, telefono, pais, documento: numeroDoc.trim() ? `${ETIQUETA_DOC[tipoDoc]} ${numeroDoc.trim()}` : '' }} cliente={cliente} guardarCliente={guardarCliente} notas={notas}
              plan={plan ? plan.nombre : null} extras={extrasOk} montoExtra={montoExtra} totalEstadia={totalEstadia} totalExtras={totalExtras} netoExtras={netoExtras} ivaExtras={ivaExtras} onEditar={irA}
            />
          )}

          {/* Gestión del grupo: píldora flotante al centro, sobre el pie (no ocupa una fila más). */}
          {!guardando && paso === 1 && elegidas.length > 0 && (
            <div className="sticky bottom-0 -mb-2 pt-2 flex justify-center pointer-events-none shrink-0">
              <div
                role="status" aria-live="polite"
                className={cn('pointer-events-auto max-w-full flex items-center gap-1.5 rounded-full border pl-3.5 pr-1.5 py-1 shadow-lg t-meta',
                  repartoOk ? 'bg-card border-border text-foreground' : 'bg-warning-soft border-warning/40 text-warning-foreground')}
              >
                {repartoOk ? <CheckCircle size={16} weight="fill" className="text-success shrink-0" /> : <WarningCircle size={16} weight="fill" className="shrink-0" />}
                <span className="truncate">{textoReparto}</span>
                {esGrupo && <button type="button" onClick={repartirAuto} className="h-8 px-3 rounded-full t-cuerpo-fuerte hover:bg-muted cursor-pointer shrink-0">Repartir</button>}
              </div>
            </div>
          )}
        </div>

        {!guardando && intentado[paso] && avisos.length > 0 && (
          <div role="alert" className="border-t border-destructive/30 bg-destructive-soft text-destructive px-4 py-2.5 flex items-start gap-2 t-meta">
            <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>{avisos.join(' · ')}</span>
          </div>
        )}
        {!guardando && paso === 3 && extras.length > 0 && (
          <div className="border-t border-border bg-muted/40 px-4 py-2.5 flex flex-col gap-1.5 max-h-[34dvh] overflow-y-auto" aria-label="Extras añadidos">
            <span className="t-etiqueta text-muted-foreground flex items-center gap-1.5"><ShoppingBag size={14} /> Extras añadidos ({extras.length}) · toca uno para editarlo</span>
            <ul className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shrink-0">
              {extrasOk.map((x) => {
                const abierto = extraAbierto === x.key;
                return (
                  <li key={x.key} className="border-b border-border/60 last:border-b-0">
                    <button type="button" onClick={() => setExtraAbierto(abierto ? null : x.key)} aria-expanded={abierto}
                      className={cn('w-full min-h-11 px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors', abierto ? 'bg-muted/60' : 'hover:bg-muted/40')}>
                      <span className="t-cuerpo-fuerte tabular-nums text-muted-foreground shrink-0">{x.cantidad}×</span>
                      <span className="flex-1 min-w-0 truncate t-cuerpo">{x.producto.nombre}</span>
                      <span className="t-cuerpo-fuerte tabular-nums shrink-0">{dinero(montoExtra(x))}</span>
                      <CaretRight size={14} weight="bold" className={cn('text-muted-foreground shrink-0 transition-transform', abierto && 'rotate-90')} />
                    </button>
                    {abierto && (
                      <div className="px-3 pb-2.5 pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 bg-muted/60">
                        <Contador enLinea etiquetaTexto={`Cantidad de ${x.producto.nombre}`} corto="Cantidad" valor={x.cantidad} min={1} max={99} onCambio={(n) => cambiarExtra(x.key, { cantidad: n })} />
                        {x.producto.precio_variable && (
                          <label className="flex items-center gap-1.5 t-meta text-muted-foreground">
                            Precio
                            <input type="number" inputMode="decimal" step="0.01" min={0} value={x.precio} onChange={(e) => cambiarExtra(x.key, { precio: e.target.value })} className="h-9 w-24 rounded-xl border border-border bg-card px-2 text-base text-foreground" />
                          </label>
                        )}
                        {esGrupo && (
                          <label className="flex items-center gap-1.5 t-meta text-muted-foreground">
                            Cabaña
                            <select value={x.roomTypeID} onChange={(e) => cambiarExtra(x.key, { roomTypeID: e.target.value })} className="h-9 rounded-xl border border-border bg-card px-2 text-base text-foreground cursor-pointer">
                              {elegidas.map((e) => <option key={e.o.roomTypeID} value={e.o.roomTypeID}>{e.nombre}</option>)}
                            </select>
                          </label>
                        )}
                        <button type="button" onClick={() => { quitarExtra(x.key); setExtraAbierto(null); }} className="ml-auto h-9 px-3 rounded-xl flex items-center gap-1.5 t-meta text-destructive hover:bg-destructive/10 cursor-pointer">
                          <Trash size={15} /> Quitar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!guardando && (
          <div className="border-t border-border bg-card flex flex-col">
            {/* Contexto de la reserva, siempre a la vista: fechas, huéspedes y cabañas. */}
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 t-cuerpo text-foreground border-b border-border" aria-label="Resumen de la reserva">
              {fechasOk && (
                <li className="flex items-center gap-2">
                  <CalendarBlank size={18} className="text-primary shrink-0" />
                  <span><span className="capitalize">{dayjs(llegada).format('ddd D MMM')} → {dayjs(salida).format('ddd D MMM')}</span> <span className="text-muted-foreground">· {plural(noches, 'noche', 'noches')}</span></span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <Users size={18} className="text-primary shrink-0" />
                {plural(elegidas.length > 0 ? sumaAdultos : adultos, 'adulto', 'adultos')}
                {(elegidas.length > 0 ? sumaNinos : ninos) > 0 ? `, ${plural(elegidas.length > 0 ? sumaNinos : ninos, 'niño', 'niños')}` : ''}
              </li>
              <li className="flex items-center gap-2">
                <Bed size={18} className="text-primary shrink-0" />
                {elegidas.length > 0 ? plural(elegidas.length, 'cabaña', 'cabañas') : 'sin cabañas elegidas'}
              </li>
            </ul>
            <div className="flex items-end justify-between gap-3 px-4 pt-3 pb-4">
              <dl className="min-w-0 flex items-end gap-6">
                <div className="flex flex-col">
                  <dt className="t-meta text-muted-foreground">Total</dt>
                  <dd className="t-valor text-2xl leading-tight tabular-nums">
                    {paso === 1 && !todoCotizado ? <span className="text-muted-foreground text-lg">{cotizando ? 'Calculando…' : 'Sin calcular'}</span> : dinero(total)}
                  </dd>
                </div>
                {extras.length > 0 && todoCotizado && (
                  <>
                    <div className="flex flex-col"><dt className="t-meta text-muted-foreground">Estadía</dt><dd className="t-cuerpo tabular-nums">{dinero(totalEstadia)}</dd></div>
                    <div className="flex flex-col"><dt className="t-meta text-muted-foreground">Extras</dt><dd className="t-cuerpo-fuerte tabular-nums text-success">{dinero(totalExtras)}</dd></div>
                  </>
                )}
              </dl>
              <div className="flex items-center gap-2 shrink-0">
              {paso > 1 && <Button type="button" variant="outline" className="h-11" onClick={() => irA((paso - 1) as Paso)}>Atrás</Button>}
              {paso < 4 ? (
                paso === 1 && !todoCotizado ? (
                  <Button type="button" className="h-11 px-5 gap-2" onClick={() => void calcularTarifa()} disabled={cotizando || elegidas.length === 0}>
                    {cotizando ? <><Girando /> Calculando…</> : 'Calcular tarifa'}
                  </Button>
                ) : (
                  <Button type="button" className="h-11 px-5" onClick={continuar}>{paso === 3 && extras.length === 0 ? 'Continuar sin extras' : 'Continuar'}</Button>
                )
              ) : (
                <Button type="button" className="h-11 px-5 gap-2" onClick={() => void confirmar()}>
                  <Check size={16} weight="bold" /> {esGrupo ? `Reservar ${elegidas.length} cabañas` : 'Crear reserva'}
                </Button>
              )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------- piezas ----------

/** Pasos como wizard: círculo numerado (check al completarse), título y una línea que une cada paso con el siguiente. */
function Indicador({ paso, puedeIrA, completo, onIr, deshabilitado }: { paso: Paso; puedeIrA: (n: Paso) => boolean; completo: (n: Paso) => boolean; onIr: (n: Paso) => void; deshabilitado: boolean }) {
  return (
    <nav aria-label="Pasos de la reserva">
      <ol className="flex items-center">
        {PASOS.map((p, i) => {
          const actual = p.n === paso;
          const hecho = completo(p.n);
          const habilitado = !deshabilitado && !actual && puedeIrA(p.n);
          return (
            <li key={p.n} className={cn('flex items-center', i < PASOS.length - 1 && 'flex-1')}>
              <button type="button" onClick={() => onIr(p.n)} disabled={!habilitado} aria-current={actual ? 'step' : undefined}
                className={cn('flex items-center gap-2 min-h-9 rounded-2xl pr-2', habilitado ? 'cursor-pointer hover:bg-muted' : 'cursor-default')}>
                <span className={cn('size-7 shrink-0 rounded-full flex items-center justify-center t-dato border-2 transition-colors',
                  hecho ? 'bg-primary border-primary text-primary-foreground' : actual ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground')}>
                  {hecho ? <Check size={14} weight="bold" /> : p.n}
                </span>
                <span className={cn('t-meta', actual ? 'text-foreground font-bold' : 'text-muted-foreground', !actual && 'hidden sm:inline')}>{p.titulo}</span>
              </button>
              {i < PASOS.length - 1 && <span className={cn('h-0.5 flex-1 mx-1 rounded-full min-w-3', hecho ? 'bg-primary' : 'bg-border')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Campo({ label, id, requerido, error, children }: { label: string; id: string; requerido?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label htmlFor={id} className={etiqueta}>{label}{requerido && <span aria-hidden> *</span>}</Label>
      {children}
      {error && <p className="t-meta text-destructive">{error}</p>}
    </div>
  );
}


/** Ajustes de una cabaña elegida: huéspedes (en grupo), plan de tarifa y tarifa manual del POS. */
function ConfigCabana({ e, esGrupo, intentado, error, capacidad, onAjustar }: { e: Elegida; esGrupo: boolean; intentado: boolean; error?: string; capacidad: number; onAjustar: (p: Partial<Linea>) => void }) {
  const id = `nr-${e.o.roomTypeID}`;
  return (
    <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
      {error && <p role="alert" className="t-meta text-destructive rounded-xl bg-destructive-soft px-3 py-2">{error}</p>}
      {e.camas.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="t-meta text-muted-foreground shrink-0">Cama</span>
          <Select value={e.l.cama || SIN_CAMA} onValueChange={(v) => onAjustar({ cama: v === SIN_CAMA ? '' : v })}>
            <SelectTrigger className="data-[size=default]:h-10 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs" aria-label={`Cama de ${e.nombre}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_CAMA} className="t-cuerpo">Sin definir</SelectItem>
              {e.camas.map((c) => <SelectItem key={c} value={c} className="t-cuerpo">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {/* Una sola fila: reparto de huéspedes (en grupo) y tarifa manual. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {esGrupo && (
          <>
            <Contador enLinea etiquetaTexto="Adultos en esta cabaña" corto="Adultos" valor={e.l.adultos} min={0} max={Math.min(60, capacidad - e.l.ninos)} onCambio={(n) => onAjustar({ adultos: n })} />
            <Contador enLinea etiquetaTexto="Niños en esta cabaña" corto="Niños" valor={e.l.ninos} min={0} max={Math.min(60, capacidad - e.l.adultos)} onCambio={(n) => onAjustar({ ninos: n })} />
          </>
        )}
        <label className="flex items-center gap-2 cursor-pointer ml-auto min-h-9" title="Descuento o cortesía. Cloudbeds conserva su tarifa estándar.">
          <span className="t-meta text-muted-foreground">Tarifa manual</span>
          <Switch checked={e.l.manual} onCheckedChange={(v) => onAjustar({ manual: v })} aria-label={`Tarifa manual para ${e.nombre}`} />
        </label>
      </div>
      {e.cotizado && e.planes.length > 1 && (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Plan de tarifa">
          <span className={etiqueta}>Plan de tarifa</span>
          {e.planes.map((p) => (
            <button key={p.rateID ?? p.nombre} type="button" role="radio" aria-checked={e.plan.rateID === p.rateID} onClick={() => onAjustar({ planRateID: p.rateID })}
              className={cn('min-h-11 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer transition-colors', e.plan.rateID === p.rateID ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60')}>
              <span className="t-cuerpo truncate">{p.nombre}</span>
              <span className="t-cuerpo-fuerte shrink-0">{dinero(p.total)}</span>
            </button>
          ))}
        </div>
      )}
      {e.l.manual && (
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Total POS" id={`${id}-monto`} requerido error={intentado && !e.manualValida ? 'Escribe el total' : ''}>
            <Input id={`${id}-monto`} type="number" inputMode="decimal" step="0.01" min={0} value={e.l.monto} onChange={(ev) => onAjustar({ monto: ev.target.value })} aria-invalid={intentado && !e.manualValida} placeholder={e.cotizado ? e.plan.total.toFixed(2) : '0.00'} className="h-10 text-base" />
          </Campo>
          <Campo label="Motivo" id={`${id}-motivo`}>
            <Input id={`${id}-motivo`} value={e.l.motivo} onChange={(ev) => onAjustar({ motivo: ev.target.value })} placeholder="Ej. cortesía" className="h-10 text-base" />
          </Campo>
        </div>
      )}
    </div>
  );
}
