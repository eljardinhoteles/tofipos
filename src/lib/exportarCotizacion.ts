import { toPng } from 'html-to-image';
import { imprimirHtmlA4 } from './imprimirReporteA4';

/** Ancho del documento: angosto y alto (vertical), para que se lea bien en el celular y en WhatsApp. */
export const ANCHO_DOCUMENTO = 600;

// Salidas del documento de cotización: imagen PNG (descargar, copiar) y PDF (impresión del navegador sobre esa misma imagen).

/** El documento ya dibujado en pantalla, como PNG a doble resolución. */
export async function cotizacionAPng(nodo: HTMLElement): Promise<string> {
  await document.fonts?.ready;
  return toPng(nodo, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
}

const aBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

export async function descargarPng(dataUrl: string, nombre: string): Promise<void> {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${nombre}.png`;
  a.click();
}

/** Copia la imagen al portapapeles (para pegarla en WhatsApp Web, correo…). Lanza si el navegador no lo permite. */
export async function copiarPng(dataUrl: string): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Este navegador no permite copiar imágenes. Descárgala.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': await aBlob(dataUrl) })]);
}

/** PDF: abre el diálogo de impresión con la imagen ajustada a una hoja A4 (elegir «Guardar como PDF»). */
export function imprimirPng(dataUrl: string, titulo: string): void {
  imprimirHtmlA4(
    `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}img{display:block;width:210mm;max-height:297mm;object-fit:contain;object-position:top}</style></head><body><img src="${dataUrl}" alt="${titulo}"></body></html>`,
    titulo,
  );
}
