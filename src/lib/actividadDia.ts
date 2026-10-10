// Actividad del día: se arma al momento con lo que ya existe (comandas, cobros,
// ventas, ítems y habitaciones). No se guarda nada aparte, así que no ocupa
// espacio en la base de datos. Algunas horas son aproximadas: las comandas solo
// guardan la hora de creación y de envío a cocina; el resto de sus cambios usa la
// última actualización.

import { folioLabel } from './folio'

import { parseReparto } from './reparto';

export type ActividadTono = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export type ActividadTipo =
  | 'mesa_abierta' | 'cocina' | 'cuenta' | 'cobrada' | 'habitacion' | 'cobro'
  | 'anulacion' | 'cortesia' | 'reembolso' | 'checkin' | 'checkout' | 'venta' | 'reparto';

/** A dónde lleva tocar el evento. */
export type ActividadDestino =
  | { tipo: 'comanda'; comandaId: string }
  | { tipo: 'habitacion'; mesaId: string }
  | { tipo: 'venta'; ventaId: string };

export interface ActividadEvento {
  id: string;
  /** ISO de cuándo ocurrió. */
  ts: string;
  tipo: ActividadTipo;
  tono: ActividadTono;
  titulo: string;
  detalle?: string;
  actor?: string;
  /** Eventos que conviene revisar (anulaciones, cortesías, reembolsos). */
  alerta: boolean;
  destino?: ActividadDestino;
}

interface Datos {
  comandas: any[];
  items: any[];
  pagos: any[];
  ventas: any[];
  habitaciones: any[];
  mesas: any[];
  usuarios: any[];
  /** ISO del inicio del día (medianoche local). */
  inicio: string;
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const CERRADAS = ['cerrado', 'facturado'];

export function construirActividad(d: Datos): ActividadEvento[] {
  const { inicio } = d;
  const hoyStr = inicio.length >= 10 ? new Date(inicio).toLocaleDateString('en-CA') : '';
  // Acepta ISO ("2026-10-06T14:00:00Z") y fechas sueltas ("2026-10-06").
  const esHoy = (ts?: string | null) => {
    if (!ts) return false;
    return ts.length === 10 ? ts >= hoyStr : ts >= inicio;
  };

  const mesaPorId = new Map(d.mesas.map(m => [m.id, m]));
  const comandaPorId = new Map(d.comandas.map(c => [c.id, c]));
  const habPorId = new Map(d.habitaciones.map(h => [h.id, h]));
  const usuarioPorId = new Map(d.usuarios.map(u => [u.id, u.nombre || u.email]));
  const actor = (id?: string | null) => (id ? usuarioPorId.get(id) : undefined);

  const mesaNombre = (mesaId?: string, fallback?: string) => mesaPorId.get(mesaId || '')?.nombre || fallback || 'Mesa';
  const etiquetaComanda = (c: any) => {
    const base = mesaNombre(c.mesa_id, c.mesa_nombre);
    return c.subcomanda_nombre ? `${base} · ${c.subcomanda_nombre}` : base;
  };
  const habitacionNumero = (hab: any) => {
    const n = mesaPorId.get(hab?.mesa_id || '')?.nombre || '';
    return n.match(/Hab\.\s*(\d+)/)?.[1] || n || '—';
  };

  const out: ActividadEvento[] = [];
  const push = (e: Omit<ActividadEvento, 'alerta'> & { alerta?: boolean }) => out.push({ alerta: false, ...e });

  const cerradasHoy = new Set<string>();

  for (const c of d.comandas) {
    const etiqueta = etiquetaComanda(c);
    const folio = c.folio != null ? `#${folioLabel(c)}` : '';

    if (esHoy(c.created_at)) {
      const extra = [c.personas ? `${c.personas} pers.` : '', c.cliente || ''].filter(Boolean).join(' · ');
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `ab-${c.id}`, ts: c.created_at, tipo: 'mesa_abierta', tono: 'primary', titulo: 'Mesa abierta',
        detalle: [etiqueta, folio, extra].filter(Boolean).join(' · '), actor: c.mesero });
    }
    if (esHoy(c.confirmada_at)) {
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `co-${c.id}`, ts: c.confirmada_at, tipo: 'cocina', tono: 'neutral', titulo: 'Enviada a cocina',
        detalle: [etiqueta, folio].filter(Boolean).join(' · '), actor: c.mesero });
    }
    if (!esHoy(c.updated_at)) continue;

    if (c.estado === 'anulada') {
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `an-${c.id}`, ts: c.updated_at, tipo: 'anulacion', tono: 'danger', titulo: 'Comanda anulada', alerta: true,
        detalle: [etiqueta, folio, c.motivo_anulacion].filter(Boolean).join(' · '), actor: c.mesero });
    } else if (CERRADAS.includes(c.estado)) {
      cerradasHoy.add(c.id);
      const hab = c.habitacion_cuenta_id ? habPorId.get(c.habitacion_cuenta_id) : null;
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `ce-${c.id}`, ts: c.updated_at, tipo: 'cobrada', tono: 'success',
        titulo: hab ? 'Cobrada en checkout de habitación' : 'Mesa cobrada',
        detalle: [etiqueta, folio, money(c.total), hab ? `Hab. ${habitacionNumero(hab)}` : ''].filter(Boolean).join(' · '),
        actor: c.mesero });
    } else if (c.habitacion_cuenta_id && c.sincronizado !== false) {
      const hab = habPorId.get(c.habitacion_cuenta_id);
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `ha-${c.id}`, ts: c.updated_at, tipo: 'habitacion', tono: 'info',
        titulo: `Cargada a habitación ${hab ? habitacionNumero(hab) : ''}`.trim(),
        detalle: [etiqueta, folio, money(c.total), hab?.huesped].filter(Boolean).join(' · '), actor: c.mesero });
    } else if (c.estado === 'cuenta') {
      push({ destino: { tipo: 'comanda', comandaId: c.id }, id: `cu-${c.id}`, ts: c.updated_at, tipo: 'cuenta', tono: 'warning', titulo: 'Cuenta pedida',
        detalle: [etiqueta, folio, money(c.total)].filter(Boolean).join(' · '), actor: c.mesero });
    }
  }

  // Cobros sueltos (anticipos, abonos, pagos parciales). Si la comanda se cerró hoy,
  // el evento "cobrada" ya lo cuenta: no se repite.
  for (const p of d.pagos) {
    if (p.anulado || !esHoy(p.fecha) || cerradasHoy.has(p.comanda_id)) continue;
    const c = comandaPorId.get(p.comanda_id);
    push({ destino: { tipo: 'comanda', comandaId: p.comanda_id }, id: `pa-${p.id}`, ts: p.fecha, tipo: 'cobro', tono: 'success', titulo: 'Cobro registrado',
      detalle: [c ? etiquetaComanda(c) : '', money(p.monto), p.metodo_pago || ''].filter(Boolean).join(' · '),
      actor: actor(p.usuario_id) });
  }

  // Movimientos de ventas: lo que toca dinero fuera del cobro normal de mesas.
  for (const v of d.ventas) {
    for (const m of v.movimientos ?? []) {
      if (m.anulado || !esHoy(m.fecha)) continue;
      const ref = v.referencia || v.cliente_nombre || '';
      const quien = actor(m.usuario_id);
      if (m.tipo === 'reembolso') {
        push({ destino: v.comanda_id ? { tipo: 'comanda', comandaId: v.comanda_id } : { tipo: 'venta', ventaId: v.id }, id: `vm-${m.id}`, ts: m.fecha, tipo: 'reembolso', tono: 'warning', titulo: 'Reembolso', alerta: true,
          detalle: [ref, money(m.monto ?? 0), m.motivo].filter(Boolean).join(' · '), actor: quien });
      } else if (m.tipo === 'anular') {
        push({ destino: v.comanda_id ? { tipo: 'comanda', comandaId: v.comanda_id } : { tipo: 'venta', ventaId: v.id }, id: `vm-${m.id}`, ts: m.fecha, tipo: 'anulacion', tono: 'danger', titulo: 'Venta anulada', alerta: true,
          detalle: [ref, m.motivo].filter(Boolean).join(' · '), actor: quien });
      } else if (m.tipo === 'facturar') {
        push({ destino: v.comanda_id ? { tipo: 'comanda', comandaId: v.comanda_id } : { tipo: 'venta', ventaId: v.id }, id: `vm-${m.id}`, ts: m.fecha, tipo: 'venta', tono: 'neutral', titulo: 'Venta facturada',
          detalle: [ref, m.numero_factura].filter(Boolean).join(' · '), actor: quien });
      } else if (m.tipo === 'pago' && v.origen !== 'mesa') {
        push({ destino: v.comanda_id ? { tipo: 'comanda', comandaId: v.comanda_id } : { tipo: 'venta', ventaId: v.id }, id: `vm-${m.id}`, ts: m.fecha, tipo: 'cobro', tono: 'success', titulo: 'Pago registrado',
          detalle: [ref, money(m.monto ?? 0), m.metodo_pago].filter(Boolean).join(' · '), actor: quien });
      }
    }
  }

  // Ítems: anulaciones, cortesías y platos repartidos.
  for (const it of d.items) {
    const c = comandaPorId.get(it.comanda_id);
    const etiqueta = c ? etiquetaComanda(c) : '';
    const meta = parseReparto(it);
    if (it.anulado && esHoy(it.anulado_at)) {
      push({ destino: { tipo: 'comanda', comandaId: it.comanda_id }, id: `ia-${it.id}`, ts: it.anulado_at, tipo: 'anulacion', tono: 'danger', titulo: 'Ítem anulado', alerta: true,
        detalle: [`${it.cantidad}× ${it.nombre}`, etiqueta, it.anulado_motivo].filter(Boolean).join(' · '), actor: actor(it.anulado_por) });
    } else if ((it.cortesia_cantidad || 0) > 0 && esHoy(it.updated_at) && !meta) {
      push({ destino: { tipo: 'comanda', comandaId: it.comanda_id }, id: `ic-${it.id}`, ts: it.updated_at, tipo: 'cortesia', tono: 'warning', titulo: 'Cortesía', alerta: true,
        detalle: [`${it.cortesia_cantidad}× ${it.nombre}`, etiqueta, it.cortesia_motivo].filter(Boolean).join(' · ') });
    } else if (meta?.tipo === 'origen' && esHoy(it.updated_at)) {
      push({ destino: { tipo: 'comanda', comandaId: it.comanda_id }, id: `ir-${it.id}`, ts: it.updated_at, tipo: 'reparto', tono: 'neutral', titulo: 'Plato repartido',
        detalle: [it.nombre, etiqueta, `entre ${meta.partes.length} cuentas`].filter(Boolean).join(' · ') });
    }
  }

  // Habitaciones: check-in y check-out.
  for (const h of d.habitaciones) {
    const num = habitacionNumero(h);
    if (esHoy(h.created_at)) {
      push({ destino: h.mesa_id ? { tipo: 'habitacion', mesaId: h.mesa_id } : undefined, id: `ci-${h.id}`, ts: h.created_at, tipo: 'checkin', tono: 'info', titulo: `Check-in habitación ${num}`, detalle: h.huesped });
    }
    if (h.estado === 'cerrada' && esHoy(h.updated_at)) {
      push({ destino: h.mesa_id ? { tipo: 'habitacion', mesaId: h.mesa_id } : undefined, id: `co2-${h.id}`, ts: h.updated_at, tipo: 'checkout', tono: 'info', titulo: `Check-out habitación ${num}`, detalle: h.huesped });
    }
  }

  return out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 400);
}

export function inicioDelDia(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
