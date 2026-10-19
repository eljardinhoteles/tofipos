import { imprimirHtmlA4 } from "./imprimirReporteA4";

// Documento de la reserva en hoja A4 (confirmación para el huésped y hoja de registro). Es papel: estilos propios en Arial,
// fuera de los tokens de la app (ver DESIGN.md). Se imprime con el diálogo nativo del navegador, igual que el reporte de cocina.

export interface DocReservaA4 {
  org: { nombre: string; ruc: string; telefono: string; direccion: string };
  /** Código de la reserva en Cloudbeds, si ya está allá. */
  codigo: string | null;
  canal: string | null;
  cancelada: boolean;
  huesped: { nombre: string; documento: string | null; email: string; telefono: string; pais: string };
  llegada: string;
  salida: string;
  noches: number;
  cabanas: Array<{ nombre: string; cama: string | null; adultos: number; ninos: number; tarifa: number; manual: boolean }>;
  /** `notas`: notas cortas ligadas a ese extra (horario del tour…). */
  extras: Array<{ descripcion: string; monto: number; notas?: string[] }>;
  total: number;
  /** Cobros del Centro de Ventas; null si la reserva aún no tiene venta. */
  cobros: { pagado: number; saldo: number; pagos: Array<{ fecha: string; texto: string; monto: number; reembolso: boolean }> } | null;
  /** Observaciones generales: el texto libre de la reserva y las notas no ligadas a un extra. */
  notas: string | null;
  notasGenerales?: string[];
  /** Plan de alimentación de la reserva, si lo tiene. */
  /** `incluye`: qué incluye, por adultos y niños (una sola línea sin etiqueta si es igual). */
  plan?: { nombre: string; incluye: Array<{ quien: string | null; texto: string }>; incluido: boolean } | null;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const dinero = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Cada bloque lleva una barra de título con fondo suave; los datos clave van sobre un panel tenue y las tablas con cabecera y
// filas separadas por líneas finas. Un solo acento (verde oscuro) y grises cálidos: se lee bien también en blanco y negro.
const ESTILOS = `
  @page { size: A4; margin: 14mm 15mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; font-size: 12px; line-height: 1.45; }

  .encabezado { display: flex; justify-content: space-between; align-items: flex-end; gap: 12mm; padding-bottom: 4mm; border-bottom: 2px solid #2f5a45; margin-bottom: 5mm; }
  .org h1 { font-size: 23px; font-weight: 900; margin: 0 0 3px; letter-spacing: -.4px; line-height: 1.1; }
  .org p { margin: 0; font-size: 10.5px; color: #555; }
  .doc { text-align: right; }
  .rotulo { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px; color: #2f5a45; }
  .codigo { display: inline-block; margin: 3px 0; padding: 3px 10px; background: #eef2ee; border-radius: 4px; font-size: 20px; font-weight: 900; letter-spacing: 1.5px; font-family: "Courier New", monospace; line-height: 1.25; }
  .doc small { display: block; font-size: 9.5px; color: #666; }
  .sello { margin-top: 4px; color: #b91c1c; font-weight: 900; font-size: 11px; letter-spacing: 2px; }

  .bloque { margin-top: 5mm; }
  tr { break-inside: avoid; }
  .bloque.primero { margin-top: 0; }
  h3 { margin: 0; break-after: avoid; padding: 0 10px; display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.3px; color: #2f5a45; }
  h3 svg { width: 15px; height: 15px; flex-shrink: 0; }
  .cuerpo { padding: 2.5mm 10px 0; }
  .etq { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #6b6b6b; margin-bottom: 1px; }

  .datos { display: grid; grid-template-columns: 1.5fr 1fr 1fr; column-gap: 6mm; }
  .datos > div { padding: 1.4mm 0; }
  .datos > div:nth-child(-n+3) { border-bottom: 1px solid #e4e6e0; padding-bottom: 2mm; }
  .datos > div:nth-child(n+4) { padding-top: 2mm; }
  .datos b { font-size: 12px; font-weight: 700; word-break: break-word; }
  .datos .grande b { font-size: 14px; font-weight: 800; }

  .panel { display: grid; grid-template-columns: 1.5fr 1.5fr .8fr 1fr; background: #f7f8f5; border: 1px solid #e4e6e0; border-radius: 4px; }
  .panel > div { padding: 2.4mm 4mm; border-left: 1px solid #e4e6e0; }
  .panel > div:first-child { border-left: 0; }
  .panel b { font-size: 14px; font-weight: 800; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .9px; color: #6b6b6b; font-weight: 700; padding: 2mm 3mm; background: #f7f8f5; border-bottom: 1px solid #d9dcd5; }
  td { padding: 1.9mm 3mm; border-bottom: 1px solid #ecedea; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { font-size: 10px; color: #6b6b6b; margin-top: 1px; }
  .sub.nota { color: #444; margin-top: 2px; padding-left: 8px; border-left: 2px solid #c9a23f; }
  .cabanas { margin-top: 3.5mm; }
  .plan { margin-top: 3.5mm; padding: 2mm 3mm; background: #f7f8f5; border-radius: 4px; }
  .plan b { font-size: 12px; }
  .grupo td { padding: 1.6mm 3mm; background: #f7f8f5; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: #6b6b6b; }

  .totales { margin: 3mm 0 0 auto; width: 58%; background: #eef2ee; border-radius: 4px; padding: 2.5mm 4mm; break-inside: avoid; }
  .totales .fila { display: flex; justify-content: space-between; padding: 1px 0; color: #444; font-variant-numeric: tabular-nums; }
  .totales .total { font-size: 17px; font-weight: 900; color: #1a1a1a; padding-bottom: 5px; margin-bottom: 4px; border-bottom: 1px solid #c9d3cb; }
  .totales .saldo { font-weight: 800; color: #1a1a1a; }
  .estado { display: inline-block; margin-top: 3mm; padding: 3px 9px; border-radius: 3px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.1px; }
  .estado.ok { color: #2f5a45; background: #dfeae1; }
  .estado.pend { color: #8a5200; background: #f8ecd0; }
  .pie-cuenta { display: flex; justify-content: flex-end; }

  .subtit { margin: 5mm 0 2mm; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: #2f5a45; }

  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 22mm; margin-top: 16mm; padding: 0 10px; break-inside: avoid; }
  .firma { border-top: 1px solid #1a1a1a; padding-top: 2mm; text-align: center; font-size: 10px; color: #555; }
  .pie { margin: 8mm 0 0; font-size: 9.5px; color: #888; text-align: center; }
`;

const SVG = (trazo: string) => `<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`;
const ICONOS = {
  huesped: SVG('<circle cx="128" cy="96" r="40"/><path d="M48 216c8-40 40-64 80-64s72 24 80 64"/>'),
  estadia: SVG('<rect x="40" y="48" width="176" height="168" rx="8"/><path d="M40 96h176M88 28v32M168 28v32"/>'),
  cuenta: SVG('<path d="M64 32h128a8 8 0 0 1 8 8v184l-24-16-24 16-24-16-24 16-24-16-24 16V40a8 8 0 0 1 8-8z"/><path d="M96 88h64M96 128h64"/>'),
};

const par = (t: string, v: string, clase = "") => `<div class="${clase}"><span class="etq">${esc(t)}</span><b>${esc(v || "—")}</b></div>`;

export function documentoReservaA4(d: DocReservaA4): string {
  const emitido = new Date().toLocaleString("es", { dateStyle: "long", timeStyle: "short" });
  const org = [d.org.ruc && `RUC ${d.org.ruc}`, d.org.direccion, d.org.telefono && `Tel. ${d.org.telefono}`].filter(Boolean).map((t) => `<p>${esc(t as string)}</p>`).join("");
  const huespedes = d.cabanas.reduce((a, c) => a + c.adultos + c.ninos, 0);
  const detalleCabanas = d.cabanas.map((c) => `
    <tr><td>${esc(c.nombre)}</td><td class="num">${esc(plural(c.adultos, "adulto", "adultos"))}${c.ninos ? `, ${esc(plural(c.ninos, "niño", "niños"))}` : ""}${c.cama ? ` · cama ${esc(c.cama)}` : ""}</td></tr>`).join("");
  const filasTarifas = d.cabanas.map((c) => `
    <tr><td>${esc(c.nombre)}<div class="sub">${esc(plural(d.noches, "noche", "noches"))}${c.manual ? " · tarifa especial" : ""}</div></td><td class="num">${dinero(c.tarifa)}</td></tr>`).join("");
  const filasExtras = d.extras.map((e) => `<tr><td>${esc(e.descripcion)}${(e.notas ?? []).map((n) => `<div class="sub nota">${esc(n)}</div>`).join("")}</td><td class="num">${dinero(e.monto)}</td></tr>`).join("");
  const pagos = (d.cobros?.pagos ?? []).map((p) =>
    `<tr><td style="white-space:nowrap;width:28mm">${esc(p.fecha)}</td><td>${esc(p.texto)}</td><td class="num">${p.reembolso ? "−" : ""}${dinero(p.monto)}</td></tr>`).join("");
  const pagada = !!d.cobros && d.cobros.saldo <= 0.005 && d.total > 0.005;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva ${esc(d.huesped.nombre)}</title><style>${ESTILOS}</style></head><body>
    <div class="encabezado">
      <div class="org"><h1>${esc(d.org.nombre || "Reserva")}</h1>${org}</div>
      <div class="doc">
        <div class="rotulo">Confirmación de reserva</div>
        ${d.codigo ? `<div class="codigo">${esc(d.codigo)}</div>` : ""}
        <small>Emitido ${esc(emitido)}</small>
        ${d.cancelada ? `<div class="sello">CANCELADA</div>` : ""}
      </div>
    </div>

    <div class="bloque primero"><h3>${ICONOS.huesped}Datos del huésped</h3>
      <div class="cuerpo"><div class="datos">${par("Nombre", d.huesped.nombre, "grande")}${par("Documento", d.huesped.documento ?? "")}${par("País", d.huesped.pais)}${par("Correo", d.huesped.email)}${par("Teléfono", d.huesped.telefono)}${par("Canal de reserva", d.canal ?? "")}</div></div>
    </div>

    <div class="bloque"><h3>${ICONOS.estadia}Datos de la estadía</h3>
      <div class="cuerpo">
        <div class="panel">${par("Llegada", d.llegada)}${par("Salida", d.salida)}${par("Noches", String(d.noches))}${par("Huéspedes", String(huespedes))}</div>
        ${d.plan ? `<div class="plan"><span class="etq">Plan de alimentación</span><b>${esc(d.plan.nombre)}</b><span class="sub"> · ${d.plan.incluido ? "incluido en la tarifa" : "ver estado de cuenta"}</span>${d.plan.incluye.map((l) => `<div class="sub">${l.quien ? `<b>${esc(l.quien)}:</b> ` : ""}${esc(l.texto)}</div>`).join("")}</div>` : ""}
        <table class="cabanas"><thead><tr><th>${d.cabanas.length > 1 ? "Cabañas" : "Cabaña"}</th><th class="num">Ocupación</th></tr></thead><tbody>${detalleCabanas}</tbody></table>
      </div>
    </div>

    <div class="bloque"><h3>${ICONOS.cuenta}Estado de cuenta</h3>
      <div class="cuerpo">
        <table><thead><tr><th>Concepto</th><th class="num">Importe</th></tr></thead><tbody>${filasTarifas}${filasExtras ? `<tr class="grupo"><td colspan="2">Extras</td></tr>${filasExtras}` : ""}</tbody></table>
        <div class="totales">
          <div class="fila total"><span>Total</span><span>${dinero(d.total)}</span></div>
          ${d.cobros ? `<div class="fila"><span>Pagado</span><span>${dinero(d.cobros.pagado)}</span></div><div class="fila saldo"><span>Saldo</span><span>${dinero(d.cobros.saldo)}</span></div>` : ""}
        </div>
        ${d.cobros ? `<div class="pie-cuenta"><span class="estado ${pagada ? "ok" : "pend"}">${pagada ? "Pagado en su totalidad" : "Saldo pendiente de pago"}</span></div>` : ""}
        ${pagos ? `<div class="subtit">Pagos recibidos</div><table><thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>${pagos}</tbody></table>` : ""}
      </div>
    </div>

    ${d.notas || d.notasGenerales?.length ? `<div class="bloque"><h3>Observaciones</h3><div class="cuerpo">${d.notas ? `<p style="margin:0 0 2mm;white-space:pre-line">${esc(d.notas)}</p>` : ""}${(d.notasGenerales ?? []).map((n) => `<p style="margin:0 0 1.5mm">• ${esc(n)}</p>`).join("")}</div></div>` : ""}

    <div class="firmas"><div class="firma">Firma del huésped</div><div class="firma">${esc(d.org.nombre || "El establecimiento")}</div></div>
    <p class="pie">Gracias por elegirnos. Conserve este documento como constancia de su reserva.</p>
  </body></html>`;
}

/** Abre el diálogo de impresión del navegador con el documento de la reserva en A4. */
export function imprimirReservaA4(d: DocReservaA4) {
  imprimirHtmlA4(documentoReservaA4(d), `Reserva ${d.huesped.nombre}`);
}
