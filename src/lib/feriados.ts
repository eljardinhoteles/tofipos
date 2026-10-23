import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// Feriados de la organización: solo marcan días en los calendarios (no afectan nada más). Se leen directo de Supabase
// (tabla `feriados`, sin RxDB), con una copia local para verlos sin internet y tiempo real entre equipos.

export interface Feriado { fecha: string; nombre: string }

const claveOrg = (org: string) => `pos_feriados_${org}`;
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

let lista: Feriado[] = [];
let porFecha = new Map<string, string>();
let orgIniciada = '';
let canal: ReturnType<typeof supabase.channel> | null = null;
const oyentes = new Set<() => void>();

function publicar(siguiente: Feriado[]) {
  lista = [...siguiente].sort((a, b) => a.fecha.localeCompare(b.fecha));
  porFecha = new Map(lista.map((f) => [f.fecha, f.nombre]));
  try { localStorage.setItem(claveOrg(orgIniciada || orgActiva()), JSON.stringify(lista)); } catch { /* sin storage */ }
  oyentes.forEach((l) => l());
}

function leerCopia(org: string): Feriado[] {
  try {
    const raw = JSON.parse(localStorage.getItem(claveOrg(org)) || 'null');
    if (Array.isArray(raw)) return raw.filter((f) => f && typeof f.fecha === 'string' && typeof f.nombre === 'string');
  } catch { /* sin storage o dato dañado */ }
  return [];
}

async function leerRemoto() {
  const org = orgIniciada;
  if (!org || !navigator.onLine) return;
  const { data, error } = await supabase.from('feriados').select('fecha, nombre').eq('organization_id', org);
  if (error || org !== orgIniciada) return; // sin la tabla (migración pendiente) o sin permiso: se queda la copia local
  publicar((data ?? []) as Feriado[]);
}

function iniciar() {
  const org = orgActiva();
  if (!org || org === orgIniciada) return;
  orgIniciada = org;
  const copia = leerCopia(org);
  lista = copia; porFecha = new Map(copia.map((f) => [f.fecha, f.nombre]));
  oyentes.forEach((l) => l());
  if (canal) { void supabase.removeChannel(canal); canal = null; }
  canal = supabase.channel(`feriados-${org}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feriados', filter: `organization_id=eq.${org}` }, () => { void leerRemoto(); })
    .subscribe();
  void leerRemoto();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void leerRemoto(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { iniciar(); void leerRemoto(); } });
}

function suscribir(l: () => void) {
  iniciar();
  oyentes.add(l);
  return () => { oyentes.delete(l); };
}

/** Feriados de la organización (ordenados) y el nombre del feriado de una fecha 'YYYY-MM-DD' (undefined si no es). */
export function useFeriados() {
  const actual = useSyncExternalStore(suscribir, () => lista);
  return { feriados: actual, nombreDe: (fecha: string) => porFecha.get(fecha) };
}

/** Guarda (o renombra) el feriado de una fecha. */
export async function guardarFeriado(fecha: string, nombre: string): Promise<void> {
  const org = orgActiva();
  const limpio = nombre.trim();
  if (!org) throw new Error('No hay organización activa');
  if (!limpio) throw new Error('Escribe el nombre del feriado');
  const { error } = await supabase.from('feriados').upsert({ organization_id: org, fecha, nombre: limpio }, { onConflict: 'organization_id,fecha' });
  if (error) throw new Error(/relation .*feriados|schema cache/i.test(error.message) ? 'Falta ejecutar la migración 20261024000200_feriados.sql en Supabase' : error.message);
  publicar([...lista.filter((f) => f.fecha !== fecha), { fecha, nombre: limpio }]);
}

/** Quita el feriado de una fecha. */
export async function quitarFeriado(fecha: string): Promise<void> {
  const org = orgActiva();
  if (!org) return;
  const { error } = await supabase.from('feriados').delete().eq('organization_id', org).eq('fecha', fecha);
  if (error) throw new Error(error.message);
  publicar(lista.filter((f) => f.fecha !== fecha));
}
