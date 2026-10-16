import { showToast } from "./toast";

// Reporte de cocina consolidado en hoja A4, con el diálogo de impresión nativo del navegador (sin modal propio): se arma el documento
// en un iframe oculto y se imprime ese iframe, así la página de la app no se toca ni hace falta ocultarla con CSS de impresión.
// Es papel: va con estilos propios en Arial, fuera de los tokens de la app (ver DESIGN.md).

export interface ItemReporteA4 {
  nombre: string;
  cantidad: number;
  modificadores?: string[];
  nota?: string;
}

export interface MesaReporteA4 {
  mesaNombre: string;
  habitacionNombre?: string;
  clienteNombre?: string;
  items: ItemReporteA4[];
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (texto: string) => texto.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function consolidar(mesas: MesaReporteA4[]) {
  const mapa = new Map<string, number>();
  for (const mesa of mesas) for (const item of mesa.items) mapa.set(item.nombre, (mapa.get(item.nombre) ?? 0) + item.cantidad);
  return Array.from(mapa, ([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
}

const ESTILOS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
  .encabezado { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  .encabezado h1 { font-size: 18px; font-weight: 900; margin: 0; }
  .encabezado span { font-size: 11px; color: #444; white-space: nowrap; }
  .mesas { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 8mm; }
  .mesa { break-inside: avoid; }
  .mesa h2 { display: flex; flex-direction: column; gap: 1px; font-weight: 900; border-bottom: 1px solid #999; padding-bottom: 4px; margin: 0 0 6px; }
  .mesa h2 .nombre { font-size: 13px; }
  .mesa h2 .extra { font-size: 10px; font-weight: 700; color: #444; }
  .filas { display: flex; flex-direction: column; gap: 4px; }
  .fila { display: flex; align-items: flex-start; gap: 6px; }
  .fila .texto { font-size: 11px; padding-top: 1px; }
  .fila .mods { font-size: 9px; color: #333; }
  .fila .nota { font-size: 9px; color: #555; font-style: italic; }
  .cantidad { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; background: #111; color: #fff; font-size: 10px; font-weight: 900; border-radius: 3px; flex-shrink: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Sin salto de página forzado: el consolidado sigue a las mesas en la misma hoja y solo pasa a la siguiente si no cabe entero. */
  .consolidado { break-inside: avoid; }
  .consolidado h2 { font-size: 14px; font-weight: 900; border-bottom: 2px solid #111; padding-bottom: 4px; margin: 0 0 8px; }
  .consolidado .lista { column-count: 3; column-gap: 8mm; }
  .consolidado .fila { align-items: center; break-inside: avoid; padding: 3px 0; border-bottom: 1px solid #eee; }
`;

function documento(mesas: MesaReporteA4[]) {
  const fecha = new Date().toLocaleString("es", { dateStyle: "full", timeStyle: "short" });
  const consolidado = consolidar(mesas);

  const bloqueMesas = mesas.map((mesa) => {
    const extra = [
      mesa.habitacionNombre && `Hab. ${mesa.habitacionNombre.match(/\d+/)?.[0] ?? mesa.habitacionNombre}`,
      mesa.clienteNombre,
    ].filter(Boolean).join(" · ");
    const filas = mesa.items.map((item) => `
      <div class="fila">
        <span class="cantidad">${item.cantidad}</span>
        <span class="texto">${esc(item.nombre)}
          ${item.modificadores?.length ? `<div class="mods">${esc(item.modificadores.join(", "))}</div>` : ""}
          ${item.nota ? `<div class="nota">${esc(item.nota)}</div>` : ""}
        </span>
      </div>`).join("");
    return `<div class="mesa"><h2><span class="nombre">${esc(mesa.mesaNombre)}</span>${extra ? `<span class="extra">${esc(extra)}</span>` : ""}</h2><div class="filas">${filas}</div></div>`;
  }).join("");

  const filasConsolidado = consolidado.map((fila) =>
    `<div class="fila"><span class="cantidad">${fila.cantidad}</span><span class="texto">${esc(fila.nombre)}</span></div>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de cocina</title><style>${ESTILOS}</style></head><body>
    <div class="encabezado"><h1>Reporte de Cocina Consolidado</h1><span>${esc(fecha)}</span></div>
    ${mesas.length > 0 ? `<div class="mesas">${bloqueMesas}</div>` : ""}
    ${consolidado.length > 0 ? `<div class="consolidado"><h2>Consolidado de Productos</h2><div class="lista">${filasConsolidado}</div></div>` : ""}
  </body></html>`;
}

/** Abre el diálogo de impresión del navegador con el reporte de cocina en A4. */
export function imprimirReporteA4(mesas: MesaReporteA4[]) {
  const marco = document.createElement("iframe");
  marco.title = "Reporte de cocina";
  marco.setAttribute("aria-hidden", "true");
  // Fuera de la vista pero no oculto con display:none (algunos navegadores no imprimen un iframe oculto).
  marco.className = "fixed bottom-0 right-0 size-0 border-0 opacity-0 pointer-events-none";
  const quitar = () => marco.remove();
  marco.onload = () => {
    const ventana = marco.contentWindow;
    if (!ventana) { quitar(); showToast.error("No se pudo abrir la impresión"); return; }
    ventana.onafterprint = quitar;
    ventana.focus();
    ventana.print();
    // Respaldo: si el navegador no avisa al terminar, el iframe se retira solo.
    setTimeout(quitar, 120_000);
  };
  marco.srcdoc = documento(mesas);
  document.body.appendChild(marco);
}
