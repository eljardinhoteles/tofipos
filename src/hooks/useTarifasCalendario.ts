import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getTarifasCalendario } from '../lib/cloudbeds';

type Tarifas = Record<string, Record<string, number>>;

const VIGENCIA_MS = 30 * 60_000;
// Por MES, como el calendario: mover la ventana unos días no pide nada nuevo. Vive en el módulo (sobrevive a cambiar de pestaña).
const meses = new Map<string, { t: number; tarifas: Tarifas; org: string }>();
const pendientes = new Map<string, Promise<void>>();
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

function cargar(mes: string): Promise<void> {
  const org = orgActiva();
  const hecho = meses.get(mes);
  if (hecho && hecho.org === org && Date.now() - hecho.t < VIGENCIA_MS) return Promise.resolve();
  const clave = `${org}:${mes}`;
  const previa = pendientes.get(clave);
  if (previa) return previa;
  const inicio = `${mes}-01`;
  const p = getTarifasCalendario(inicio, dayjs(inicio).add(1, 'month').format('YYYY-MM-DD'))
    .then((r) => { meses.set(mes, { t: Date.now(), tarifas: r.tarifas, org }); })
    .finally(() => { pendientes.delete(clave); });
  pendientes.set(clave, p);
  return p;
}

/**
 * Tarifas de lista por noche (`roomTypeID` → fecha → tarifa) de los meses pedidos. No pide nada mientras `activo` sea falso.
 * Es un adorno del calendario: si falla, simplemente no hay tarifas (sin avisos ni reintentos).
 */
export function useTarifasCalendario(mesesPedidos: string[], activo: boolean): Tarifas {
  const [, repintar] = useState(0);
  const clave = mesesPedidos.join(',');
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    for (const m of clave.split(',')) cargar(m).then(() => { if (vivo) repintar((n) => n + 1); }, () => { /* sin tarifas */ });
    return () => { vivo = false; };
  }, [clave, activo]);

  if (!activo) return {};
  const org = orgActiva();
  const out: Tarifas = {};
  for (const m of mesesPedidos) {
    const b = meses.get(m);
    if (!b || b.org !== org) continue;
    for (const [tipo, noches] of Object.entries(b.tarifas)) out[tipo] = { ...(out[tipo] ?? {}), ...noches };
  }
  return out;
}
