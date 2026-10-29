import { imprimirHtmlA4 } from "./imprimirReporteA4";
import nunitoLatin from "../../node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2?url";
import nunitoLatinExt from "../../node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-ext-wght-normal.woff2?url";

// Documento de la reserva en hoja A4 (confirmación para el huésped y hoja de registro). Es papel: estilos propios, fuera de los
// tokens de la app (ver DESIGN.md), pero con la misma tipografía del sistema (Nunito Sans autoalojada; el iframe de impresión es
// otro documento y no hereda las fuentes, por eso se declara aquí con la URL absoluta del archivo). Se imprime con el diálogo nativo del navegador, igual que el reporte de cocina.

export interface DocReservaA4 {
  /** Hoja para regalos y cortesías: sin importes, totales ni pagos (se omiten tarifas, extras con precio y cobros). */
  sinImportes?: boolean;
  org: { nombre: string; ruc: string; telefono: string; direccion: string };
  /** Código de la reserva en Cloudbeds, si ya está allá. */
  codigo: string | null;
  canal: string | null;
  cancelada: boolean;
  huesped: { nombre: string; documento: string | null; email: string; telefono: string; pais: string; direccion?: string };
  llegada: string;
  salida: string;
  noches: number;
  cabanas: Array<{ nombre: string; cama: string | null; adultos: number; ninos: number; tarifa: number; manual: boolean; vista?: string | null }>;
  /** `notas`: notas cortas ligadas a ese extra (horario del tour…). */
  extras: Array<{ descripcion: string; monto: number; notas?: string[] }>;
  total: number;
  /** Cobros del Centro de Ventas; null si la reserva aún no tiene venta. */
  cobros: { pagado: number; saldo: number; pagos: Array<{ fecha: string; texto: string; monto: number; reembolso: boolean }> } | null;
  /** Observaciones generales: el texto libre de la reserva y las notas no ligadas a un extra. */
  notas: string | null;
  notasGenerales?: string[];
  /** Mascotas registradas (una línea por habitación), ya en texto; salen en Observaciones. */
  mascotas?: string[];
  /** Plan de alimentación de la reserva, si lo tiene. */
  /** Cuántos adultos y niños tiene el plan y qué incluye a cada grupo (los niños, igual que adultos si no se definió aparte). */
  plan?: { nombre: string; adultos: number; ninos: number; incluyeAdulto: string; incluyeNino: string; incluido: boolean } | null;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPES[c]);
// Iconos de línea para papel (adulto: persona; niño: persona pequeña), heredan el color del texto.
const ICONO_ADULTO = `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="4" r="2.3"/><path d="M3.5 14v-2.2A3.3 3.3 0 0 1 6.8 8.5h2.4a3.3 3.3 0 0 1 3.3 3.3V14"/></svg>`;
const ICONO_NINO = `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="2"/><path d="M4.5 14v-1.2A2.8 2.8 0 0 1 7.3 10h1.4a2.8 2.8 0 0 1 2.8 2.8V14"/></svg>`;
const dinero = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Cada bloque lleva una barra de título con fondo suave; los datos clave van sobre un panel tenue y las tablas con cabecera y
// filas separadas por líneas finas. Un solo acento (verde oscuro) y grises cálidos: se lee bien también en blanco y negro.
const rutaAbsoluta = (u: string) => new URL(u, document.baseURI).href;
const FUENTES = () => `
  @font-face { font-family: "Nunito Sans Variable"; font-style: normal; font-weight: 200 1000; src: url("${rutaAbsoluta(nunitoLatinExt)}") format("woff2-variations"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  @font-face { font-family: "Nunito Sans Variable"; font-style: normal; font-weight: 200 1000; src: url("${rutaAbsoluta(nunitoLatin)}") format("woff2-variations"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`;
const ESTILOS = `
  @page { size: A4; margin: 14mm 15mm 14mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9px "Nunito Sans Variable", Arial, sans-serif; color: #3a3a3a; } }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Nunito Sans Variable", Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; font-size: 12px; line-height: 1.45; }

  .encabezado { display: flex; justify-content: space-between; align-items: center; gap: 12mm; padding-bottom: 3.5mm; border-bottom: 1.5px solid #2f5a45; margin-bottom: 5mm; }
  .org h1 { font-size: 16px; font-weight: 800; margin: 0 0 2px; letter-spacing: -.2px; line-height: 1.15; }
  .org p { margin: 0; font-size: 10px; color: #3a3a3a; }
  .doc { text-align: right; }
  .rotulo { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px; color: #2f5a45; }
  .codigo { display: inline-block; margin: 2px 0 3px; padding: 2px 9px; background: #eef2ee; border: 1px solid #d5ddd5; border-radius: 4px; font-size: 14px; font-weight: 600; letter-spacing: 1.2px; font-variant-numeric: tabular-nums; line-height: 1.3; }
  .doc small { display: block; font-size: 9.5px; color: #3a3a3a; }
  .sello { margin-top: 4px; color: #b91c1c; font-weight: 900; font-size: 11px; letter-spacing: 2px; }

  .bloque { margin-top: 5mm; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .plan, .panel, .datos { break-inside: avoid; }
  .bloque.primero { margin-top: 0; }
  h3 { margin: 0; break-after: avoid; padding: 0 10px; display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.3px; color: #2f5a45; }
  h3 svg { width: 15px; height: 15px; flex-shrink: 0; }
  .cuerpo { padding: 2.5mm 10px 0; }
  .etq { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #3a3a3a; margin-bottom: 1px; }

  .datos { display: grid; grid-template-columns: 1.5fr 1fr 1fr; column-gap: 6mm; }
  .datos > div { padding: 1.4mm 0; }
  .datos b { font-size: 12px; font-weight: 400; word-break: break-word; }
  .datos .grande > b:first-of-type { font-size: 14px; font-weight: 800; }
  .datos b.dato2 { display: block; margin-top: 1px; }

  .panel { display: grid; grid-template-columns: 1.5fr 1.5fr .8fr 1fr; background: #f7f8f5; border: 1px solid #e4e6e0; border-radius: 4px; }
  .panel > div { padding: 2.4mm 4mm; border-left: 1px solid #e4e6e0; }
  .panel > div:first-child { border-left: 0; }
  .panel b { font-size: 14px; font-weight: 800; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .9px; color: #2a2a2a; font-weight: 800; padding: 2mm 3mm; background: #eef0ea; border-bottom: 1px solid #c9cdc4; }
  td { padding: 1.9mm 3mm; border-bottom: 1px solid #ecedea; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { font-size: 10px; color: #3a3a3a; margin-top: 1px; }
  .sub.nota { color: #444; margin-top: 2px; padding-left: 8px; border-left: 2px solid #c9a23f; }
  .cabanas { margin-top: 3.5mm; }
  .plan { margin-top: 3.5mm; padding: 2mm 3mm; background: #f7f8f5; border-radius: 4px; display: flex; gap: 6mm; align-items: flex-start; }
  .plan-col { flex: 1; min-width: 0; }
  .plan-gente { flex: 1.4; border-left: 1px solid #dfe3da; padding-left: 4mm; }
  .gente { display: flex; align-items: flex-start; gap: 5px; }
  .gente + .gente { margin-top: 1.5px; }
  .ico { width: 11px; height: 11px; flex: none; margin-top: 1px; color: #2f5d46; }
  .plan b { font-size: 12px; }
  .grupo td { padding: 1.6mm 3mm; background: #f7f8f5; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: #3a3a3a; }

  .vista { color: #666; font-weight: 400; }
  .fila-totales { display: flex; align-items: stretch; gap: 5mm; margin-top: 3mm; break-inside: avoid; }
  .totales { margin: 0 0 0 auto; width: 58%; background: #eef2ee; border-radius: 4px; padding: 2.5mm 4mm; break-inside: avoid; }
  .totales .fila { display: flex; justify-content: space-between; padding: 1px 0; color: #444; font-variant-numeric: tabular-nums; }
  .totales .total { font-size: 17px; font-weight: 900; color: #1a1a1a; padding-bottom: 5px; margin-bottom: 4px; border-bottom: 1px solid #c9d3cb; }
  .totales .saldo { font-weight: 800; color: #1a1a1a; }
  .estado { display: inline-block; margin-top: 3mm; padding: 3px 9px; border-radius: 3px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.1px; }
  .estado.ok { color: #2f5a45; background: #dfeae1; }
  .estado.pend { color: #8a5200; background: #f8ecd0; }
  .pie-cuenta { display: flex; justify-content: flex-end; }

  .subtit { margin: 5mm 0 2mm; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: #2f5a45; }

  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 22mm; margin-top: 16mm; padding: 0 10px; break-inside: avoid; }
  .nota-mano { flex: 1; min-height: 24mm; border: 1px solid #b9b9b9; border-radius: 4px; padding: 1.5mm 2.5mm; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #555; }
  .emitido { margin: 6mm 0 0; font-size: 9px; color: #3a3a3a; text-align: right; }
  .firma { border-top: 1px solid #1a1a1a; padding-top: 2mm; text-align: center; font-size: 10px; color: #3a3a3a; }
`;

const SVG = (trazo: string) => `<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`;
const ICONOS = {
  huesped: SVG('<circle cx="128" cy="96" r="40"/><path d="M48 216c8-40 40-64 80-64s72 24 80 64"/>'),
  estadia: SVG('<rect x="40" y="48" width="176" height="168" rx="8"/><path d="M40 96h176M88 28v32M168 28v32"/>'),
};

const par = (t: string, v: string, clase = "") => `<div class="${clase}"><span class="etq">${esc(t)}</span><b>${esc(v || "—")}</b></div>`;

export function documentoReservaA4(d: DocReservaA4): string {
  const si = !!d.sinImportes;
  const emitido = new Date().toLocaleString("es", { dateStyle: "long", timeStyle: "short" });
  const org = [d.org.ruc && `RUC ${d.org.ruc}`, d.org.direccion].filter(Boolean).map((t) => `<p>${esc(t as string)}</p>`).join("");
  const huespedes = d.cabanas.reduce((a, c) => a + c.adultos + c.ninos, 0);
  // Una sola fila por habitación: nombre (con noches), ocupación y cama, e importe.
  const detalleCabanas = d.cabanas.map((c) => `
    <tr><td>${esc(c.nombre)}${c.vista ? `<span class="vista"> · ${esc(c.vista)}</span>` : ""}<div class="sub">${esc(plural(d.noches, "noche", "noches"))}${c.manual && !si ? " · tarifa especial" : ""}</div></td><td>${esc(plural(c.adultos, "adulto", "adultos"))}${c.ninos ? `, ${esc(plural(c.ninos, "niño", "niños"))}` : ""}${c.cama ? ` · Cama <b>${esc(c.cama)}</b>` : ""}</td>${si ? "" : `<td class="num">${dinero(c.tarifa)}</td>`}</tr>`).join("");
  const filasExtras = d.extras.map((e) => `<tr><td>${esc(e.descripcion)}${(e.notas ?? []).map((n) => `<div class="sub nota">${esc(n)}</div>`).join("")}</td>${si ? "" : `<td class="num">${dinero(e.monto)}</td>`}</tr>`).join("");
  const pagos = (d.cobros?.pagos ?? []).map((p) =>
    `<tr><td style="white-space:nowrap;width:28mm">${esc(p.fecha)}</td><td>${esc(p.texto)}</td><td class="num">${p.reembolso ? "−" : ""}${dinero(p.monto)}</td></tr>`).join("");
  const pagada = !!d.cobros && d.cobros.saldo <= 0.005 && d.total > 0.005;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva ${esc(d.huesped.nombre)}</title><style>${FUENTES()}${ESTILOS}</style></head><body>
    <div class="encabezado">
      <div class="org"><h1>${esc(d.org.nombre || "Reserva")}</h1>${org}</div>
      <div class="doc">
        <div class="rotulo">Confirmación de reserva</div>
        ${d.codigo ? `<div class="codigo">${esc(d.codigo)}</div>` : ""}
        ${d.cancelada ? `<div class="sello">CANCELADA</div>` : ""}
      </div>
    </div>

    <div class="bloque primero"><h3>${ICONOS.huesped}Datos del huésped</h3>
      <div class="cuerpo"><div class="datos"><div class="grande"><span class="etq">Nombre</span><b>${esc(d.huesped.nombre || "—")}</b>${d.huesped.documento ? `<b class="dato2">${esc(d.huesped.documento)}</b>` : ""}</div><div><span class="etq">Contacto</span><b>${esc(d.huesped.telefono || "—")}</b>${d.huesped.email ? `<b class="dato2">${esc(d.huesped.email)}</b>` : ""}${d.huesped.direccion ? `<b class="dato2">${esc(d.huesped.direccion)}</b>` : ""}</div>${par("País · Origen", [d.huesped.pais, d.canal].filter(Boolean).join(" · "))}</div></div>
    </div>
    ${d.notas || d.notasGenerales?.length || d.mascotas?.length ? `<div class="bloque"><h3>Observaciones</h3><div class="cuerpo">${(d.mascotas ?? []).map((m) => `<p style="margin:0 0 1.5mm"><b>Mascota:</b> ${esc(m)}</p>`).join("")}${d.notas ? `<p style="margin:0 0 2mm;white-space:pre-line">${esc(d.notas)}</p>` : ""}${(d.notasGenerales ?? []).map((n) => `<p style="margin:0 0 1.5mm">• ${esc(n)}</p>`).join("")}</div></div>` : ""}

    <div class="bloque"><h3>${ICONOS.estadia}Datos de la estadía</h3>
      <div class="cuerpo">
        <div class="panel">${par("Llegada", d.llegada)}${par("Salida", d.salida)}${par("Noches", String(d.noches))}${par("Huéspedes", String(huespedes))}</div>
        ${d.plan ? `<div class="plan"><div class="plan-col"><span class="etq">Plan de alimentación</span><b>${esc(d.plan.nombre)}</b><span class="sub"> · ${d.plan.incluido ? "incluido en la tarifa" : "se cobra aparte"}</span></div><div class="plan-col plan-gente">${[[d.plan.adultos, "adulto", "adultos", d.plan.incluyeAdulto, ICONO_ADULTO], [d.plan.ninos, "niño", "niños", d.plan.incluyeNino, ICONO_NINO]].filter((g) => (g[0] as number) > 0).map((g) => `<div class="sub gente">${g[4]}<span><b>${esc(plural(g[0] as number, g[1] as string, g[2] as string))}:</b> ${esc((g[3] as string) || "—")}</span></div>`).join("")}</div></div>` : ""}
        <div class="subtit">Detalle de alojamiento</div>
        <table class="cabanas"><thead><tr><th>${d.cabanas.length > 1 ? "Habitaciones" : "Habitación"}</th><th>Ocupación</th>${si ? "" : '<th class="num">Importe</th>'}</tr></thead><tbody>${detalleCabanas}</tbody></table>
      </div>
    </div>

    <div class="bloque">
      <div class="cuerpo">
        ${filasExtras ? `<table><thead><tr><th>Extras</th>${si ? "" : '<th class="num">Importe</th>'}</tr></thead><tbody>${filasExtras}</tbody></table>` : ""}
        <div class="fila-totales"><div class="nota-mano"><span>Notas de check in</span></div>
        ${si ? "" : `<div class="totales">
          <div class="fila total"><span>Total</span><span>${dinero(d.total)}</span></div>
          ${d.cobros ? `<div class="fila"><span>Pagado</span><span>${dinero(d.cobros.pagado)}</span></div><div class="fila saldo"><span>Saldo</span><span>${dinero(d.cobros.saldo)}</span></div>` : ""}
        </div>`}
        </div>
        ${d.cobros && !si ? `<div class="pie-cuenta"><span class="estado ${pagada ? "ok" : "pend"}">${pagada ? "Pagado en su totalidad" : "Saldo pendiente de pago"}</span></div>` : ""}
        ${pagos && !si ? `<div class="subtit">Pagos recibidos</div><table><thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>${pagos}</tbody></table>` : ""}
      </div>
    </div>

    <div class="firmas"><div class="firma">Firma para constancia de Check in</div></div>
    <p class="emitido">Emitido ${esc(emitido)}</p>
  </body></html>`;
}

/** Abre el diálogo de impresión del navegador con el documento de la reserva en A4. */
export function imprimirReservaA4(d: DocReservaA4) {
  imprimirHtmlA4(documentoReservaA4(d), `Reserva ${d.huesped.nombre}`);
}
