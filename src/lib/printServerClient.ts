import type { Comanda, ComandaItem } from '../db/database';
import { generarComandaCocina } from '../services/printTemplateEngine';

const DEFAULT_BASE_URL = 'http://127.0.0.1:18181';

type PrinterPayload = {
  name: string;
  target: string;
  paper_width?: number;
  active?: boolean;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `print server error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getPrintServerStatus(): Promise<PrintServerStatus> {
  return requestJson<PrintServerStatus>('/health');
}

export async function savePrintServerPrinter(config: PrinterPayload) {
  return requestJson('/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function testPrintServerPrinter(content?: string) {
  return requestJson('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'test',
      title: 'Prueba de impresión',
      payload: {},
      raw_text: content ?? '=== PRUEBA DE IMPRESORA ===\nSi lees esto, funciona.\n\n\n',
    }),
  });
}

export async function queueKitchenPrint(params: {
  comanda: Comanda;
  items: ComandaItem[];
  mesaNombre: string;
  esAdicional?: boolean;
  habitacionNombre?: string;
}) {
  const { comanda, items, mesaNombre, esAdicional = false, habitacionNombre } = params;
  const rawText = generarComandaCocina(comanda, items as any, mesaNombre, esAdicional, habitacionNombre, true);
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
      },
      raw_text: rawText,
    }),
  });
}
