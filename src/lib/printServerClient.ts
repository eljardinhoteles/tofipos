import type { Comanda, ComandaItem } from '../db/database';
import { generarComandaCocina } from '../services/printTemplateEngine';

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
  const data = await requestJson<{ ok: boolean; printers: string[] }>('/system-printers');
  return data.printers;
}

/** Impresoras configuradas en el print server (subset del catálogo, con roles asignados). */
export async function listConfiguredPrinters(): Promise<ConfiguredPrinter[]> {
  const data = await requestJson<{ ok: boolean; printers: ConfiguredPrinter[] }>('/printers');
  return data.printers;
}

export async function addConfiguredPrinter(printer: { name: string; target: string; roles: PrinterRole[]; active?: boolean }) {
  return requestJson<{ ok: boolean; printer: ConfiguredPrinter }>('/printers', {
    method: 'POST',
    body: JSON.stringify(printer),
  });
}

export async function updateConfiguredPrinter(id: string, patch: Partial<{ name: string; target: string; roles: PrinterRole[]; active: boolean }>) {
  return requestJson<{ ok: boolean; printer: ConfiguredPrinter }>(`/printers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deleteConfiguredPrinter(id: string) {
  return requestJson<{ ok: boolean }>(`/printers/${id}`, { method: 'DELETE' });
}

export async function getPrintServerStatus(): Promise<PrintServerStatus> {
  return requestJson<PrintServerStatus>('/health');
}

export async function testPrintServerPrinter(printerId: string, content?: string) {
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'test',
      title: 'Prueba de impresión',
      payload: {},
      printer_id: printerId,
      raw_text: content ?? '=== PRUEBA DE IMPRESORA ===\nSi lees esto, funciona.\n\n\n',
    }),
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
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'receipt',
      title: `Precuenta - ${mesaNombre}`,
      payload: { comanda, mesaNombre },
      raw_text: rawText,
    }),
  });
}

/** Reimpresión de un ticket/recibo ya generado (p.ej. con generarTicketPago), sin regenerar el contenido. */
export async function queueReprintTicket(params: { rawText: string; mesaNombre: string; comanda: Comanda }) {
  const { rawText, mesaNombre, comanda } = params;
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'receipt',
      title: `Reimpresión - ${mesaNombre}`,
      payload: { comanda, mesaNombre },
      raw_text: rawText,
    }),
  });
}

/** Envía texto crudo ya formateado (p.ej. un reporte consolidado) al rol 'kitchen', sin comanda puntual asociada. */
export async function queueRawKitchenPrint(rawText: string, title = 'Reporte de Cocina') {
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'kitchen',
      title,
      payload: {},
      raw_text: rawText,
    }),
  });
}

export async function queueKitchenPrint(params: {
  comanda: Comanda;
  items: ComandaItem[];
  mesaNombre: string;
  esAdicional?: boolean;
  habitacionNombre?: string;
  itemsAnulados?: ComandaItem[];
}) {
  const { comanda, items, mesaNombre, esAdicional = false, habitacionNombre, itemsAnulados = [] } = params;
  const rawText = generarComandaCocina(comanda, items as any, mesaNombre, esAdicional, habitacionNombre, true, itemsAnulados as any);
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
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
    }),
  });
}
