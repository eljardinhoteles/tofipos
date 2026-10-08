import type { Comanda, ComandaItem } from '../db/database';
import { generarComandaCocina } from '../services/printTemplateEngine';
import { supabase } from './supabase';

const DEFAULT_BASE_URL = 'http://127.0.0.1:18181';

export type PrinterRole = 'kitchen' | 'receipt';

export type ConfiguredPrinter = {
  id: string;
  name: string;
  target: string;
  roles: PrinterRole[];
  active: boolean;
};

export type PrintServerStatus = {
  ok: boolean;
  queue?: number;
  printerConfigured?: boolean;
  active?: boolean;
  /** true cuando se imprime por la cola en la nube (servidor vinculado). */
  cloud?: boolean;
};

/** Servidor de impresión vinculado a la organización (cola en la nube). */
export type CloudPrintServer = {
  id: string;
  organization_id: string;
  name: string;
  hostname: string | null;
  version: string | null;
  ips: string[];
  system_printers: string[];
  last_seen: string | null;
  paired_at: string | null;
};

function getBaseUrl() {
  return localStorage.getItem('pos_print_server_url') || DEFAULT_BASE_URL;
}

function getPrintToken() {
  return localStorage.getItem('pos_print_server_token') || '';
}

export function savePrintToken(token: string) {
  localStorage.setItem('pos_print_server_token', token.trim());
}

export function savePrintServerUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (trimmed) localStorage.setItem('pos_print_server_url', trimmed);
  else localStorage.removeItem('pos_print_server_url');
}

// ── Cola en la nube ──────────────────────────────────────────────────────────
// Con un servidor vinculado, los trabajos se encolan en Supabase y el servidor
// de la PC los imprime: sin IP ni token por dispositivo y sin contenido mixto
// (la app va por HTTPS). Sin servidor vinculado se usa la API local de siempre.

const CLOUD_CACHE_KEY = 'pos_print_cloud_server';
/** Un servidor se considera conectado si hizo latido en los últimos 90 s. */
const CLOUD_ONLINE_WINDOW_MS = 90_000;

function getOrgId() {
  return localStorage.getItem('pos_active_org_id') || '';
}

export function getCachedCloudPrintServer(): CloudPrintServer | null {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_KEY);
    if (!raw) return null;
    const server = JSON.parse(raw) as CloudPrintServer;
    return server.organization_id === getOrgId() ? server : null;
  } catch {
    return null;
  }
}

export function isCloudServerOnline(server: CloudPrintServer | null): boolean {
  if (!server?.last_seen) return false;
  return Date.now() - new Date(server.last_seen).getTime() < CLOUD_ONLINE_WINDOW_MS;
}

/** Lee el servidor vinculado; sin red devuelve la copia guardada. */
export async function fetchCloudPrintServer(): Promise<CloudPrintServer | null> {
  const orgId = getOrgId();
  if (!orgId) return null;
  try {
    const { data, error } = await supabase
      .from('print_servers')
      .select('id, organization_id, name, hostname, version, ips, system_printers, last_seen, paired_at')
      .eq('organization_id', orgId)
      .eq('_deleted', false)
      .not('paired_at', 'is', null)
      .order('paired_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(data));
    else localStorage.removeItem(CLOUD_CACHE_KEY);
    return (data as CloudPrintServer | null) ?? null;
  } catch {
    return getCachedCloudPrintServer();
  }
}

async function callPrintServerFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('print-server', { body });
  if (error) {
    // supabase-js oculta el mensaje real en `context` (Response).
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => undefined) : undefined;
    throw new Error(detail || error.message);
  }
  return data as T;
}

/** Genera el paquete de vinculación (un solo uso, 15 min) para pegar en la PC del servidor. */
export async function createPrintPairing(): Promise<{ package: string; code: string; expiresAt: string }> {
  const data = await callPrintServerFunction<{ ok: boolean; code: string; expires_at: string }>({
    action: 'create-pairing',
    organization_id: getOrgId(),
  });
  // Solo URL del proyecto + código de un solo uso (15 min). Sin llaves: el servidor
  // se autentica después con su propio secreto.
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const json = JSON.stringify({ u: url, c: data.code });
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { package: `POS1.${b64}`, code: data.code, expiresAt: data.expires_at };
}

export async function unpairPrintServer(serverId: string) {
  await callPrintServerFunction({ action: 'unpair', organization_id: getOrgId(), server_id: serverId });
  localStorage.removeItem(CLOUD_CACHE_KEY);
}

function isLoopbackBase() {
  try {
    const host = new URL(getBaseUrl()).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  } catch {
    return false;
  }
}

type NewPrintJob = {
  kind: 'kitchen' | 'receipt' | 'test';
  title: string;
  payload?: unknown;
  raw_text: string;
  printer_id?: string;
};

// ── Red local con IP descubierta ─────────────────────────────────────────────
// El servidor publica sus IPs privadas en la nube (print_servers.ips). Los
// dispositivos las leen, prueban cuál responde y imprimen directo por la red
// local: más rápido y funciona sin internet. Requiere el token de impresión
// guardado en el dispositivo (Ajustes → Impresión).

const LAN_PORT = 18181;
const LAN_CACHE_KEY = 'pos_print_lan_base';
const LAN_PROBE_TIMEOUT_MS = 1500;
const LAN_SEND_TIMEOUT_MS = 10_000;
/** Tras un fallo de la red local, la salta un rato para no pagar el intento en cada impresión. */
let lanSkipUntil = 0;

function lanCandidates(cloud: CloudPrintServer): string[] {
  const manual = localStorage.getItem('pos_print_server_url');
  const fromCloud = (cloud.ips ?? []).map((ip) => `http://${ip}:${LAN_PORT}`);
  return [...new Set([manual, ...fromCloud].filter((u): u is string => Boolean(u)))];
}

async function probeLan(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(LAN_PROBE_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

async function findLanBase(cloud: CloudPrintServer): Promise<string | null> {
  const candidates = lanCandidates(cloud);
  const cached = localStorage.getItem(LAN_CACHE_KEY);
  if (cached && candidates.includes(cached) && (await probeLan(cached))) return cached;
  const results = await Promise.all(candidates.map(async (base) => ((await probeLan(base)) ? base : null)));
  const found = results.find(Boolean) ?? null;
  if (found) localStorage.setItem(LAN_CACHE_KEY, found);
  else localStorage.removeItem(LAN_CACHE_KEY);
  return found;
}

/**
 * Envía el trabajo por la red local. 'unreachable'/'unauthorized' son fallos
 * inmediatos y seguros para reintentar por la nube. Un tiempo de espera agotado
 * NO lo es: el servidor pudo haber impreso, y reintentar duplicaría el ticket.
 */
async function sendViaLan(base: string, job: NewPrintJob): Promise<'ok' | 'unreachable' | 'unauthorized'> {
  let res: Response;
  try {
    res = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Print-Token': getPrintToken() },
      body: JSON.stringify({ ...job, payload: job.payload ?? {}, printer_id: job.printer_id }),
      signal: AbortSignal.timeout(LAN_SEND_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('La impresora no confirmó a tiempo. Revisa si el ticket salió antes de reintentar.');
    }
    return 'unreachable';
  }
  if (res.status === 401) return 'unauthorized';
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `print server error ${res.status}`);
  return 'ok';
}

/**
 * Encola un trabajo de impresión. Sin servidor vinculado: API local de siempre.
 * Con servidor vinculado, en este orden:
 *   1. Red local con la IP descubierta (si hay token guardado): rápida y sin internet.
 *   2. Nube (print_jobs): funciona desde cualquier dispositivo, aunque la red local esté bloqueada.
 *   3. API local directa, solo si la app corre en la misma PC del servidor.
 */
async function enqueueJob(job: NewPrintJob) {
  const localJob = () =>
    requestJson('/jobs', {
      method: 'POST',
      body: JSON.stringify({ ...job, payload: job.payload ?? {}, printer_id: job.printer_id }),
    });

  const cloud = getCachedCloudPrintServer();
  if (!cloud) return localJob();

  if (getPrintToken() && Date.now() >= lanSkipUntil) {
    const base = await findLanBase(cloud);
    if (base) {
      const result = await sendViaLan(base, job);
      if (result === 'ok') return { ok: true, via: 'lan' as const };
    }
    lanSkipUntil = Date.now() + 60_000;
  }

  try {
    const { error } = await supabase.from('print_jobs').insert({
      id: crypto.randomUUID(),
      organization_id: getOrgId(),
      kind: job.kind,
      title: job.title,
      // El servidor imprime `raw_text`; el payload solo sirve de referencia.
      payload: {},
      raw_text: job.raw_text,
      printer_id: job.printer_id ?? null,
      status: 'pending',
    });
    if (error) throw new Error(error.message);
    return { ok: true, via: 'cloud' as const };
  } catch (err) {
    if (isLoopbackBase()) return localJob();
    throw new Error(
      navigator.onLine
        ? `No se pudo enviar a imprimir: ${err instanceof Error ? err.message : 'error desconocido'}`
        : 'Sin internet y sin acceso a la red local del servidor: no se pudo enviar a imprimir.'
    );
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Print-Token': getPrintToken(),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `print server error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Impresoras que Windows ya conoce (catálogo del sistema, para elegir sin escribir nombres a mano). */
export async function listSystemPrinters(): Promise<string[]> {
  if (getCachedCloudPrintServer()) {
    const server = await fetchCloudPrintServer();
    return server?.system_printers ?? [];
  }
  const data = await requestJson<{ ok: boolean; printers: string[] }>('/system-printers');
  return data.printers;
}

/** Impresoras configuradas en el print server (subset del catálogo, con roles asignados). */
export async function listConfiguredPrinters(): Promise<ConfiguredPrinter[]> {
  const cloud = getCachedCloudPrintServer();
  if (cloud) {
    const { data, error } = await supabase
      .from('print_printers')
      .select('id, name, target, roles, active')
      .eq('server_id', cloud.id)
      .eq('_deleted', false)
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as ConfiguredPrinter[];
  }
  const data = await requestJson<{ ok: boolean; printers: ConfiguredPrinter[] }>('/printers');
  return data.printers;
}

export async function addConfiguredPrinter(printer: { name: string; target: string; roles: PrinterRole[]; active?: boolean }) {
  const cloud = getCachedCloudPrintServer();
  if (cloud) {
    const { data, error } = await supabase
      .from('print_printers')
      .insert({ organization_id: cloud.organization_id, server_id: cloud.id, ...printer, active: printer.active ?? true })
      .select('id, name, target, roles, active')
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, printer: data as ConfiguredPrinter };
  }
  return requestJson<{ ok: boolean; printer: ConfiguredPrinter }>('/printers', {
    method: 'POST',
    body: JSON.stringify(printer),
  });
}

export async function updateConfiguredPrinter(id: string, patch: Partial<{ name: string; target: string; roles: PrinterRole[]; active: boolean }>) {
  if (getCachedCloudPrintServer()) {
    const { data, error } = await supabase
      .from('print_printers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, target, roles, active')
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, printer: data as ConfiguredPrinter };
  }
  return requestJson<{ ok: boolean; printer: ConfiguredPrinter }>(`/printers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deleteConfiguredPrinter(id: string) {
  if (getCachedCloudPrintServer()) {
    const { error } = await supabase.from('print_printers').update({ _deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  return requestJson<{ ok: boolean }>(`/printers/${id}`, { method: 'DELETE' });
}

/**
 * Estado del servidor de impresión. Con servidor vinculado es su último latido en
 * la nube (una sola consulta). `detailed` añade cola y estado de impresoras: solo
 * para Ajustes, no para el indicador que se refresca cada pocos segundos.
 */
export async function getPrintServerStatus(opts?: { detailed?: boolean }): Promise<PrintServerStatus> {
  const cloud = await fetchCloudPrintServer();
  if (cloud) {
    const online = isCloudServerOnline(cloud);
    if (!opts?.detailed) return { ok: online, cloud: true };
    const [{ count: pending }, { data: printers }] = await Promise.all([
      supabase
        .from('print_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', cloud.organization_id)
        .in('status', ['pending', 'printing']),
      supabase.from('print_printers').select('active').eq('server_id', cloud.id).eq('_deleted', false),
    ]);
    const hasActive = (printers ?? []).some((p: { active: boolean }) => p.active);
    return { ok: online, queue: pending ?? 0, printerConfigured: hasActive, active: hasActive, cloud: true };
  }
  return requestJson<PrintServerStatus>('/health');
}

export async function testPrintServerPrinter(printerId: string, content?: string) {
  return enqueueJob({
      kind: 'test',
      title: 'Prueba de impresión',
      payload: {},
      printer_id: printerId,
      raw_text: content ?? '=== PRUEBA DE IMPRESORA ===\nSi lees esto, funciona.\n\n\n',
    });
}

export async function queueReceiptPrint(params: {
  comanda: Comanda;
  items: ComandaItem[];
  mesaNombre: string;
  ivaPorcentaje: number;
  pagos?: any[];
  habitacionNombre?: string;
}) {
  const { comanda, items, mesaNombre, ivaPorcentaje, pagos = [], habitacionNombre } = params;
  const { generarPrecuenta } = await import('../services/printTemplateEngine');
  const rawText = generarPrecuenta(comanda, items as any, mesaNombre, ivaPorcentaje, pagos, habitacionNombre, true);
  return enqueueJob({
      kind: 'receipt',
      title: `Precuenta - ${mesaNombre}`,
      payload: { comanda, mesaNombre },
      raw_text: rawText,
    });
}

/** Reimpresión de un ticket/recibo ya generado (p.ej. con generarTicketPago), sin regenerar el contenido. */
export async function queueReprintTicket(params: { rawText: string; mesaNombre: string; comanda: Comanda }) {
  const { rawText, mesaNombre, comanda } = params;
  return enqueueJob({
      kind: 'receipt',
      title: `Reimpresión - ${mesaNombre}`,
      payload: { comanda, mesaNombre },
      raw_text: rawText,
    });
}

/** Envía la solicitud de datos de facturación (ticket rápido, sin comanda) al rol 'receipt'. */
export async function queueSolicitudFacturacionPrint(rawText: string) {
  return enqueueJob({
      kind: 'receipt',
      title: 'Solicitud de Datos de Facturación',
      payload: {},
      raw_text: rawText,
    });
}

/** Envía texto crudo ya formateado (p.ej. un reporte consolidado) al rol 'kitchen', sin comanda puntual asociada. */
export async function queueRawKitchenPrint(rawText: string, title = 'Reporte de Cocina') {
  return enqueueJob({
      kind: 'kitchen',
      title,
      payload: {},
      raw_text: rawText,
    });
}

export async function queueKitchenPrint(params: {
  comanda: Comanda;
  items: ComandaItem[];
  mesaNombre: string;
  esAdicional?: boolean;
  habitacionNombre?: string;
  itemsAnulados?: ComandaItem[];
  /** Líneas extra bajo la fecha del encabezado (datos de una reserva). */
  infoExtra?: string;
}) {
  const { comanda, items, mesaNombre, esAdicional = false, habitacionNombre, itemsAnulados = [], infoExtra } = params;
  const rawText = generarComandaCocina(comanda, items as any, mesaNombre, esAdicional, habitacionNombre, true, itemsAnulados as any, infoExtra);
  return enqueueJob({
      kind: 'kitchen',
      title: `Cocina - ${mesaNombre}`,
      payload: {
        comanda,
        mesaNombre,
        esAdicional,
        habitacionNombre,
        items,
        itemsAnulados,
      },
      raw_text: rawText,
    });
}
