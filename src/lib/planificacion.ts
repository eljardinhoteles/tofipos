import { useEffect, useMemo, useSyncExternalStore } from 'react';

// Planificación: qué productos se destacan cada día y con qué etiqueta (promoción,
// almuerzo de huéspedes, cena, plato del día…).
//
// Los datos viven en Supabase (plan_etiquetas, plan_celdas, plan_confirmaciones) y no en RxDB: la base local
// ya usa sus 13 colecciones. Este archivo mantiene el estado en memoria, con una copia en localStorage por
// organización para leer el plan sin internet, y lo sincroniza: cada cambio se aplica al instante y se guarda
// en segundo plano (si falla, se avisa y se vuelve a leer lo guardado); los cambios de otros equipos llegan
// por tiempo real, al volver a la pestaña y al recuperar la conexión. Todo el acceso pasa por aquí.

import { supabase } from './supabase';
import { showToast } from './toast';

export type TonoEtiqueta = 'warning' | 'info' | 'special' | 'success' | 'primary' | 'rose' | 'teal' | 'slate';

export interface EtiquetaPlan { id: string; nombre: string; tono: TonoEtiqueta; orden: number }
/** Un producto habilitado en una fecha (YYYY-MM-DD, local) con una etiqueta. */
export interface CeldaPlan { id: string; producto_id: string; fecha: string; etiqueta_id: string }

/** Clases por tono: `chip` para el producto dentro de la celda, `punto` para el marcador. */
/** `activa`: fondo y borde de la celda abierta para añadir productos. */
export const TONOS_ETIQUETA: Record<TonoEtiqueta, { chip: string; punto: string; fila: string; activa: string }> = {
  warning: { chip: 'bg-warning-soft text-warning-foreground border-warning/30', punto: 'bg-warning', fila: 'text-warning-foreground', activa: 'bg-warning-soft ring-warning' },
  info: { chip: 'bg-info-soft text-info-foreground border-info/30', punto: 'bg-info', fila: 'text-info-foreground', activa: 'bg-info-soft ring-info' },
  special: { chip: 'bg-special-soft text-special-foreground border-special/30', punto: 'bg-special', fila: 'text-special-foreground', activa: 'bg-special-soft ring-special' },
  success: { chip: 'bg-success-soft text-success-foreground border-success/30', punto: 'bg-success', fila: 'text-success-foreground', activa: 'bg-success-soft ring-success' },
  primary: { chip: 'bg-primary/10 text-primary border-primary/30', punto: 'bg-primary', fila: 'text-primary', activa: 'bg-primary/10 ring-primary' },
  rose: { chip: 'bg-rose-soft text-rose-foreground border-rose/30', punto: 'bg-rose', fila: 'text-rose-foreground', activa: 'bg-rose-soft ring-rose' },
  teal: { chip: 'bg-teal-soft text-teal-foreground border-teal/30', punto: 'bg-teal', fila: 'text-teal-foreground', activa: 'bg-teal-soft ring-teal' },
  slate: { chip: 'bg-slate-soft text-slate-foreground border-slate/30', punto: 'bg-slate', fila: 'text-slate-foreground', activa: 'bg-slate-soft ring-slate' },
};

/** Colores que se pueden elegir para una etiqueta (nombre visible + tono). */
export const TONOS_ELEGIBLES: Array<{ tono: TonoEtiqueta; nombre: string }> = [
  { tono: 'warning', nombre: 'Naranja' },
  { tono: 'info', nombre: 'Azul' },
  { tono: 'special', nombre: 'Morado' },
  { tono: 'success', nombre: 'Verde' },
  { tono: 'rose', nombre: 'Rojo' },
  { tono: 'teal', nombre: 'Turquesa' },
  { tono: 'slate', nombre: 'Gris' },
];

export const ETIQUETAS_BASE: EtiquetaPlan[] = [
  { id: 'promocion', nombre: 'Promoción', tono: 'warning', orden: 0 },
  { id: 'almuerzo', nombre: 'Almuerzo huéspedes', tono: 'info', orden: 1 },
  { id: 'cena', nombre: 'Cena huéspedes', tono: 'special', orden: 2 },
  { id: 'plato-dia', nombre: 'Plato del día', tono: 'success', orden: 3 },
];

/**
 * Confirmación (firma) del menú de un día. Es un registro que no se edita: al anular, se marca
 * `anulada_*` y la siguiente firma crea otro registro, así queda el historial completo.
 */
export interface ConfirmacionPlan {
  id: string;
  fecha: string;
  confirmado_por: string;
  confirmado_at: string;
  /** Huella del contenido del día al firmar: si luego no coincide, el día se tocó sin pasar por el aviso. */
  huella: string;
  anulada_at?: string | null;
  anulada_por?: string | null;
}

interface Estado { etiquetas: EtiquetaPlan[]; celdas: CeldaPlan[]; confirmaciones: ConfirmacionPlan[] }

const claveOrg = (org: string) => `pos_plan_v2_${org}`;
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

function leerCopia(org: string): Estado {
  try {
    const raw = JSON.parse(localStorage.getItem(claveOrg(org)) || 'null');
    if (raw && Array.isArray(raw.celdas) && Array.isArray(raw.etiquetas)) {
      return { etiquetas: raw.etiquetas, celdas: raw.celdas, confirmaciones: Array.isArray(raw.confirmaciones) ? raw.confirmaciones : [] };
    }
  } catch { /* sin storage o dato dañado */ }
  return { etiquetas: ETIQUETAS_BASE, celdas: [], confirmaciones: [] };
}

let estado: Estado = { etiquetas: ETIQUETAS_BASE, celdas: [], confirmaciones: [] };
const oyentes = new Set<() => void>();

function guardar(siguiente: Estado) {
  estado = siguiente;
  try { localStorage.setItem(claveOrg(orgIniciada || orgActiva()), JSON.stringify(estado)); } catch { /* sin storage */ }
  oyentes.forEach((l) => l());
}

// ── Sincronización con Supabase ─────────────────────────────────────────────────────────────────

let orgIniciada = '';
let escrituras = 0; // cambios en vuelo: mientras haya, una lectura no pisa lo que se acaba de editar
let temporizador: ReturnType<typeof setTimeout> | null = null;
let canal: ReturnType<typeof supabase.channel> | null = null;
let avisoEnlace = false;

/** Lee las tres tablas y reemplaza el estado. Las etiquetas vacías se muestran con las de base. */
async function leerRemoto() {
  const org = orgIniciada;
  if (!org || escrituras > 0 || !navigator.onLine) return;
  const [et, ce, co] = await Promise.all([
    supabase.from('plan_etiquetas').select('id, nombre, tono, orden').eq('organization_id', org),
    supabase.from('plan_celdas').select('id, producto_id, fecha, etiqueta_id').eq('organization_id', org),
    supabase.from('plan_confirmaciones').select('id, fecha, confirmado_por, confirmado_at, huella, anulada_at, anulada_por').eq('organization_id', org).order('confirmado_at', { ascending: true }),
  ]);
  if (et.error || ce.error || co.error) throw new Error((et.error || ce.error || co.error)!.message);
  if (org !== orgIniciada || escrituras > 0) return;
  const etiquetas = (et.data ?? []).length > 0 ? (et.data as EtiquetaPlan[]) : ETIQUETAS_BASE;
  guardar({
    etiquetas,
    celdas: (ce.data ?? []) as CeldaPlan[],
    confirmaciones: (co.data ?? []).map((c: any) => ({ ...c, anulada_at: c.anulada_at ?? null, anulada_por: c.anulada_por ?? null })) as ConfirmacionPlan[],
  });
}

/** Pide una lectura en un momento (agrupa avisos seguidos de tiempo real). */
function pedirLectura(espera = 300) {
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    leerRemoto().catch(() => {
      if (!avisoEnlace) { avisoEnlace = true; showToast.info('Plan sin actualizar', 'No se pudo leer el plan; se muestra lo guardado en este equipo.'); }
    });
  }, espera);
}

/** Arranca (o reinicia, si cambió la organización) la copia local, la lectura y el tiempo real. */
function iniciar() {
  const org = orgActiva();
  if (!org || org === orgIniciada) return;
  orgIniciada = org;
  estado = leerCopia(org);
  oyentes.forEach((l) => l());
  if (canal) { void supabase.removeChannel(canal); canal = null; }
  canal = supabase.channel(`planificador-${org}`);
  for (const tabla of ['plan_etiquetas', 'plan_celdas', 'plan_confirmaciones']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: `organization_id=eq.${org}` }, () => pedirLectura());
  }
  canal.subscribe();
  pedirLectura(0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => pedirLectura(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedirLectura(0); });
}

/**
 * Guarda un cambio en segundo plano. Si falla (sin conexión, sin permiso), avisa y vuelve a leer lo que hay
 * guardado para que la pantalla no muestre un cambio que no existe.
 */
function escribir(que: string, op: () => PromiseLike<{ error: { message: string } | null }>) {
  escrituras++;
  Promise.resolve(op())
    .then(({ error }) => { if (error) throw new Error(error.message); })
    .catch((e) => {
      console.error('[planificador]', que, e);
      showToast.error(`No se guardó: ${que}`, navigator.onLine ? 'Intenta de nuevo.' : 'Sin conexión: el plan se guarda con internet.');
    })
    .finally(() => { escrituras--; if (escrituras === 0) pedirLectura(0); });
}

const filaEtiqueta = (org: string, e: EtiquetaPlan) => ({ organization_id: org, id: e.id, nombre: e.nombre, tono: e.tono, orden: e.orden });

/** Guarda la lista completa de etiquetas (también persiste las de base la primera vez) y borra las que sobran. */
function persistirEtiquetas(previas: EtiquetaPlan[], siguientes: EtiquetaPlan[], que: string) {
  const org = orgActiva();
  if (!org) return;
  const quitadas = previas.filter((p) => !siguientes.some((n) => n.id === p.id)).map((p) => p.id);
  escribir(que, async () => {
    const up = await supabase.from('plan_etiquetas').upsert(siguientes.map((e) => filaEtiqueta(org, e)), { onConflict: 'organization_id,id' });
    if (up.error) return up;
    if (quitadas.length > 0) return supabase.from('plan_etiquetas').delete().eq('organization_id', org).in('id', quitadas);
    return up;
  });
}

const id = () => crypto.randomUUID();

/** Huella corta (FNV-1a) del contenido de un día: etiqueta + producto, ordenado. */
export function huellaDia(celdas: CeldaPlan[], fecha: string): string {
  const base = celdas.filter((c) => c.fecha === fecha).map((c) => `${c.etiqueta_id}:${c.producto_id}`).sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Confirmación vigente de un día (la última que no se anuló), o undefined. */
export function confirmacionVigente(confirmaciones: ConfirmacionPlan[], fecha: string): ConfirmacionPlan | undefined {
  return [...confirmaciones].reverse().find((c) => c.fecha === fecha && !c.anulada_at);
}

const diaConfirmado = (fecha: string) => !!confirmacionVigente(estado.confirmaciones, fecha);

/** Firma el menú del día. No hace nada si está vacío o ya confirmado. */
export function confirmarDia(fecha: string, usuario: string): boolean {
  if (diaConfirmado(fecha) || !estado.celdas.some((c) => c.fecha === fecha)) return false;
  const reg: ConfirmacionPlan = { id: id(), fecha, confirmado_por: usuario, confirmado_at: new Date().toISOString(), huella: huellaDia(estado.celdas, fecha) };
  guardar({ ...estado, confirmaciones: [...estado.confirmaciones, reg] });
  const org = orgActiva();
  escribir('la confirmación del menú', () => supabase.from('plan_confirmaciones').insert({
    organization_id: org, id: reg.id, fecha: reg.fecha, confirmado_por: reg.confirmado_por, confirmado_at: reg.confirmado_at, huella: reg.huella,
  }));
  return true;
}

/** Rompe la confirmación del día (los productos se conservan; hay que volver a firmar). */
export function anularConfirmacion(fecha: string, usuario: string): boolean {
  const vigente = confirmacionVigente(estado.confirmaciones, fecha);
  if (!vigente) return false;
  const anuladaAt = new Date().toISOString();
  guardar({
    ...estado,
    confirmaciones: estado.confirmaciones.map((c) => (c.id === vigente.id ? { ...c, anulada_at: anuladaAt, anulada_por: usuario } : c)),
  });
  const org = orgActiva();
  escribir('la anulación de la confirmación', () => supabase.from('plan_confirmaciones').update({ anulada_at: anuladaAt, anulada_por: usuario }).eq('organization_id', org).eq('id', vigente.id));
  return true;
}

// ── Etiquetas (se administran en Ajustes › Planificador) ─────────────────────────────────────────

const normalizar = (t: string) => t.trim().replace(/\s+/g, ' ');
const mismoNombre = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

export type ResultadoEtiqueta = { ok: true } | { ok: false; motivo: string };

export function crearEtiqueta(nombre: string, tono: TonoEtiqueta): ResultadoEtiqueta {
  const n = normalizar(nombre);
  if (!n) return { ok: false, motivo: 'Escribe un nombre.' };
  if (estado.etiquetas.some((e) => mismoNombre(e.nombre, n))) return { ok: false, motivo: 'Ya existe una etiqueta con ese nombre.' };
  const orden = estado.etiquetas.reduce((m, e) => Math.max(m, e.orden), -1) + 1;
  const previas = estado.etiquetas;
  const siguientes = [...previas, { id: id(), nombre: n, tono, orden }];
  guardar({ ...estado, etiquetas: siguientes });
  persistirEtiquetas(previas, siguientes, 'la etiqueta');
  return { ok: true };
}

export function editarEtiqueta(etiquetaId: string, cambios: { nombre?: string; tono?: TonoEtiqueta }): ResultadoEtiqueta {
  const actual = estado.etiquetas.find((e) => e.id === etiquetaId);
  if (!actual) return { ok: false, motivo: 'La etiqueta ya no existe.' };
  const nombre = cambios.nombre === undefined ? actual.nombre : normalizar(cambios.nombre);
  if (!nombre) return { ok: false, motivo: 'El nombre no puede quedar vacío.' };
  if (estado.etiquetas.some((e) => e.id !== etiquetaId && mismoNombre(e.nombre, nombre))) return { ok: false, motivo: 'Ya existe una etiqueta con ese nombre.' };
  const previas = estado.etiquetas;
  const siguientes = previas.map((e) => (e.id === etiquetaId ? { ...e, nombre, tono: cambios.tono ?? e.tono } : e));
  guardar({ ...estado, etiquetas: siguientes });
  persistirEtiquetas(previas, siguientes, 'la etiqueta');
  return { ok: true };
}

/** Sube (-1) o baja (+1) una etiqueta en el orden de las filas. */
export function moverEtiqueta(etiquetaId: string, direccion: -1 | 1) {
  const ordenadas = [...estado.etiquetas].sort((a, b) => a.orden - b.orden);
  const i = ordenadas.findIndex((e) => e.id === etiquetaId);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= ordenadas.length) return;
  [ordenadas[i], ordenadas[j]] = [ordenadas[j], ordenadas[i]];
  const previas = estado.etiquetas;
  const siguientes = ordenadas.map((e, k) => ({ ...e, orden: k }));
  guardar({ ...estado, etiquetas: siguientes });
  persistirEtiquetas(previas, siguientes, 'el orden de las etiquetas');
}

/** Cuántos productos hay planificados con esta etiqueta (para avisar antes de borrarla). */
export function productosDeEtiqueta(etiquetaId: string): number {
  return estado.celdas.filter((c) => c.etiqueta_id === etiquetaId).length;
}

/**
 * Elimina la etiqueta y sus productos planificados. No se permite si algún día confirmado la usa: esos
 * menús están firmados y no se tocan sin anular antes su confirmación.
 */
export function eliminarEtiqueta(etiquetaId: string): ResultadoEtiqueta {
  const enConfirmados = estado.celdas.some((c) => c.etiqueta_id === etiquetaId && diaConfirmado(c.fecha));
  if (enConfirmados) return { ok: false, motivo: 'La usa un menú ya confirmado. Anula esa confirmación primero.' };
  const restantes = estado.etiquetas.filter((e) => e.id !== etiquetaId).sort((a, b) => a.orden - b.orden).map((e, k) => ({ ...e, orden: k }));
  const previas = estado.etiquetas;
  guardar({ ...estado, etiquetas: restantes, celdas: estado.celdas.filter((c) => c.etiqueta_id !== etiquetaId) });
  const org = orgActiva();
  escribir('los productos de la etiqueta', () => supabase.from('plan_celdas').delete().eq('organization_id', org).eq('etiqueta_id', etiquetaId));
  persistirEtiquetas(previas, restantes, 'la etiqueta');
  return { ok: true };
}

export function agregarCelda(producto_id: string, fecha: string, etiqueta_id: string) {
  // Un día confirmado no se edita: primero hay que anular la confirmación.
  if (diaConfirmado(fecha)) return;
  if (estado.celdas.some((c) => c.producto_id === producto_id && c.fecha === fecha && c.etiqueta_id === etiqueta_id)) return;
  const celda: CeldaPlan = { id: id(), producto_id, fecha, etiqueta_id };
  guardar({ ...estado, celdas: [...estado.celdas, celda] });
  const org = orgActiva();
  escribir('el producto del menú', () => supabase.from('plan_celdas').upsert(
    { organization_id: org, id: celda.id, producto_id, fecha, etiqueta_id },
    { onConflict: 'organization_id,fecha,etiqueta_id,producto_id', ignoreDuplicates: true },
  ));
}

export function quitarCelda(celdaId: string) {
  const celda = estado.celdas.find((c) => c.id === celdaId);
  if (celda && diaConfirmado(celda.fecha)) return;
  guardar({ ...estado, celdas: estado.celdas.filter((c) => c.id !== celdaId) });
  const org = orgActiva();
  escribir('el producto del menú', () => supabase.from('plan_celdas').delete().eq('organization_id', org).eq('id', celdaId));
}

const suscribir = (cb: () => void) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; };

export function usePlanificacion() {
  useEffect(() => { iniciar(); }, []);
  const actual = useSyncExternalStore(suscribir, () => estado);
  // Ordenadas una sola vez por cambio de etiquetas (no en cada render): mantiene estable la referencia.
  const etiquetas = useMemo(() => [...actual.etiquetas].sort((a, b) => a.orden - b.orden), [actual.etiquetas]);
  return { etiquetas, celdas: actual.celdas, confirmaciones: actual.confirmaciones };
}

/** Hoy en formato AAAA-MM-DD (hora local), el mismo de `CeldaPlan.fecha`. */
export const hoyPlan = () => new Date().toLocaleDateString('en-CA');

export interface GrupoPlanHoy { etiqueta: EtiquetaPlan; productoIds: Set<string> }

/**
 * Lo planificado para hoy, listo para Mesas: los productos de cada etiqueta (en el orden de las etiquetas) y
 * las etiquetas de cada producto. Solo cuenta el menú de hoy si está confirmado: un día sin firmar es un borrador.
 */
export function usePlanHoy() {
  const { etiquetas, celdas, confirmaciones } = usePlanificacion();
  return useMemo(() => {
    const hoy = hoyPlan();
    const grupos: GrupoPlanHoy[] = [];
    const porProducto = new Map<string, EtiquetaPlan[]>();
    if (!confirmacionVigente(confirmaciones, hoy)) return { grupos, porProducto };
    for (const etiqueta of etiquetas) {
      const ids = celdas.filter((c) => c.fecha === hoy && c.etiqueta_id === etiqueta.id).map((c) => c.producto_id);
      if (ids.length === 0) continue;
      grupos.push({ etiqueta, productoIds: new Set(ids) });
      for (const idp of ids) porProducto.set(idp, [...(porProducto.get(idp) ?? []), etiqueta]);
    }
    return { grupos, porProducto };
  }, [etiquetas, celdas, confirmaciones]);
}

// Celda abierta en el planificador. Vive aquí (no en la página) porque el sidebar
// para elegir sus productos se pinta en el sidebar derecho global del layout, el
// mismo de Mesas.
export interface DestinoPlan { etiqueta_id: string; fecha: string; /** "Hoy - Sábado · 10 oct" */ diaTexto: string }

let destino: DestinoPlan | null = null;
const oyentesDestino = new Set<() => void>();

export function abrirDestino(d: DestinoPlan | null) {
  destino = d;
  oyentesDestino.forEach((l) => l());
}

/** Abre la celda, o la cierra si ya era la abierta (toque sobre la misma celda). */
export function alternarDestino(d: DestinoPlan) {
  abrirDestino(destino && destino.etiqueta_id === d.etiqueta_id && destino.fecha === d.fecha ? null : d);
}

export function useDestinoPlan() {
  return useSyncExternalStore(
    (cb) => { oyentesDestino.add(cb); return () => { oyentesDestino.delete(cb); }; },
    () => destino,
  );
}
