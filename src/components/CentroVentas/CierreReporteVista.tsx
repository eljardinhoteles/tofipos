import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import { ArrowLeft, DownloadSimple, Printer, Receipt } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { imprimirConAviso } from '@/lib/imprimir';
import { showToast } from '@/lib/toast';
import { queueRawReceiptPrint } from '@/lib/printServerClient';
import { generarTicketCierreTurno, type DatosTicketCierre } from '../../services/printTemplateEngine';
import type { CierreTurno } from '../../lib/cierreTurno';

const esperar = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

const dinero = (n: number) => `$${n.toFixed(2)}`;

function ReporteDocumento({ datos }: { datos: DatosTicketCierre }) {
  const origenesConCobros = datos.porOrigen.filter(o => o.total > 0);
  const d = datos.detalle;
  return (
    <div className="cierre-page">
      <div className="cierre-header">
        <h1>Cierre de turno</h1>
        <span>{datos.fecha}</span>
      </div>
      <p className="cierre-origenes">Cierre realizado por: <strong>{datos.responsable}</strong></p>
      <p className="cierre-origenes">
        Orígenes incluidos: <strong>{datos.origenes.join(', ')}</strong>
        {datos.omitidos.length > 0 && <> · Omitidos: {datos.omitidos.join(', ')}</>}
      </p>

      <div className="cierre-totales">
        <div><span>Total cobrado</span><strong>{dinero(datos.totalCobrado)}</strong></div>
        <div><span>Reembolsos</span><strong>{dinero(datos.totalReembolsado)}</strong></div>
        <div><span>Saldo pendiente</span><strong>{dinero(datos.saldoPendiente)}</strong></div>
        <div><span>Ventas</span><strong>{datos.ventas}{datos.anuladas > 0 ? ` (+${datos.anuladas} anuladas)` : ''}</strong></div>
      </div>

      <h2>Cobros por método</h2>
      <table>
        <tbody>
          <tr><td>Efectivo</td><td className="num">{dinero(datos.pagos.efectivo)}</td></tr>
          <tr><td>Tarjeta</td><td className="num">{dinero(datos.pagos.tarjeta)}</td></tr>
          <tr><td>Transferencia</td><td className="num">{dinero(datos.pagos.transferencia)}</td></tr>
          <tr><td>Otros</td><td className="num">{dinero(datos.pagos.otros)}</td></tr>
        </tbody>
      </table>

      {origenesConCobros.length > 0 && (
        <>
          <h2>Cobros por origen</h2>
          {origenesConCobros.map(o => (
            <div key={o.titulo} className="cierre-origen">
              <div className="cierre-origen-titulo"><span>{o.titulo}</span><span>{dinero(o.total)}</span></div>
              <table>
                <tbody>
                  {o.lineas.map((l, i) => (
                    <tr key={i} className={l.sub ? 'sub' : undefined}><td>{l.label}</td><td className="num">{dinero(l.monto)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {d?.creditos && d.creditos.length > 0 && (
        <>
          <h2>Ventas a crédito ({d.creditos.length}) · {dinero(datos.creditos?.total ?? 0)}</h2>
          <table><tbody>
            {d.creditos.map((v, i) => <tr key={i}><td>{v.cliente}{v.referencia ? ` · ${v.referencia}` : ''}</td><td className="num">{dinero(v.monto)}</td></tr>)}
          </tbody></table>
        </>
      )}

      {d && d.sinComprobante.length > 0 && (
        <>
          <h2>Cobros sin comprobante ({d.sinComprobante.length})</h2>
          <table><tbody>
            {d.sinComprobante.map((p, i) => <tr key={i}><td>{p.cliente} · {p.metodo}</td><td className="num">{dinero(p.monto)}</td></tr>)}
          </tbody></table>
        </>
      )}

      {d && d.sinFactura.length > 0 && (
        <>
          <h2>Ventas sin factura ({d.sinFactura.length})</h2>
          <table><tbody>
            {d.sinFactura.map((v, i) => <tr key={i}><td>{v.cliente}{v.referencia ? ` · ${v.referencia}` : ''}</td><td className="num">{dinero(v.monto)}</td></tr>)}
          </tbody></table>
        </>
      )}

      {d && d.pendientes.length > 0 && (
        <>
          <h2>Saldos pendientes ({d.pendientes.length})</h2>
          <table><tbody>
            {d.pendientes.map((v, i) => <tr key={i}><td>{v.cliente}{v.referencia ? ` · ${v.referencia}` : ''}</td><td className="num">{dinero(v.saldo)}</td></tr>)}
          </tbody></table>
        </>
      )}

      {!d && (
        <p className="cierre-origenes">Cobros sin comprobante: {datos.sinComprobante} · Ventas sin factura: {datos.sinFactura}</p>
      )}

      <h2>Novedades de caja</h2>
      <p className="cierre-novedades">{datos.novedades.trim() || 'Sin novedades.'}</p>
    </div>
  );
}

const seccion = 'flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs';
const tituloSeccion = 't-etiqueta text-muted-foreground';

/** Fila de dato: rótulo, línea punteada y valor. */
function Fila({ label, value, sub = false, destacado = false }: { label: string; value: string; sub?: boolean; destacado?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${sub ? 'pl-5' : ''}`}>
      <span className={`${sub ? 't-meta' : 't-cuerpo'} text-muted-foreground whitespace-nowrap`}>{label}</span>
      <span className="flex-1 border-b border-dotted border-border" />
      <span className={`${destacado ? 't-valor' : sub ? 't-meta' : 't-cuerpo-fuerte'} tabular-nums whitespace-nowrap text-foreground`}>{value}</span>
    </div>
  );
}

/**
 * Reporte de caja de un cierre guardado, dentro de la app: resumen, cobros por método y origen, créditos,
 * pendientes y novedades. El ticket y el A4 se imprimen desde los botones del header.
 */
export function CierreReporteVista({ cierre, onVolver }: { cierre: CierreTurno; onVolver: () => void }) {
  const datos = cierre.ticket;
  const d = datos?.detalle;

  const imprimirTicket = () => {
    if (!datos) return;
    void imprimirConAviso(() => queueRawReceiptPrint(generarTicketCierreTurno(datos, true), 'Cierre de turno'), 'Ticket de cierre de turno');
  };
  // Imagen del reporte para compartir (WhatsApp entre cajero y supervisor). En celular y tablet abre el menú de
  // compartir del sistema con la imagen adjunta; donde no se puede (PC), la descarga como PNG.
  const contenidoRef = useRef<HTMLDivElement>(null);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const compartirImagen = async () => {
    const nodo = contenidoRef.current;
    if (!nodo || !datos) return;
    setGenerandoImagen(true);
    // El reporte vive dentro de un área con scroll: capturarlo ahí lo recorta. Se copia a un contenedor fuera de
    // pantalla, de ancho fijo y alto libre, y se espera a las fuentes para que el alto medido sea el real.
    const ANCHO = 768;
    const aparte = document.createElement('div');
    aparte.style.cssText = `position:fixed;left:-10000px;top:0;width:${ANCHO}px;overflow:visible;pointer-events:none;`;
    const copia = nodo.cloneNode(true) as HTMLElement;
    copia.style.width = `${ANCHO}px`;
    copia.style.maxWidth = 'none';
    copia.style.height = 'auto';
    aparte.appendChild(copia);
    document.body.appendChild(aparte);
    try {
      // Sin esperas que puedan quedarse colgadas: si las fuentes no responden, se sigue igual.
      await Promise.race([document.fonts?.ready, esperar(1500)]);
      await esperar(60);
      const fondo = getComputedStyle(document.body).backgroundColor;
      const blob = await Promise.race([
        toBlob(copia, { pixelRatio: 2, backgroundColor: fondo, width: ANCHO, height: copia.scrollHeight + 8 }),
        esperar(20000).then(() => { throw new Error('tiempo agotado generando la imagen'); }),
      ]);
      if (!blob) throw new Error('sin imagen');
      const nombre = `cierre-caja-${cierre.fecha_dia}.png`;
      const archivo = new File([blob], nombre, { type: 'image/png' });
      if (navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: `Cierre de caja ${cierre.fecha_dia}` });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === 'AbortError') return; // el usuario cerró el menú
          // Cualquier otro fallo del menú de compartir: se descarga igual.
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast.success('Imagen descargada', 'Ya puedes enviarla por WhatsApp.');
    } catch (e) {
      console.error('No se pudo generar la imagen del cierre:', e);
      showToast.error('No se pudo generar la imagen');
    } finally {
      aparte.remove();
      setGenerandoImagen(false);
    }
  };
  const imprimirA4 = () => {
    window.print();
    showToast.success('Imprimiendo', 'Enviado a la impresora A4.');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-16 px-6 border-b border-border bg-card flex items-center gap-3 shrink-0 print:hidden">
        <div className="min-w-0 mr-auto flex flex-col">
          <span className="t-titulo text-secondary-foreground truncate">Reporte de caja</span>
          <span className="t-meta text-muted-foreground truncate">Cerrado por {cierre.usuario_nombre}</span>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onVolver}>
            <ArrowLeft size={18} weight="bold" /> Historial
          </Button>
          <Button type="button" variant="outline" onClick={() => void compartirImagen()} disabled={!datos || generandoImagen}>
            <DownloadSimple size={18} weight="bold" /> {generandoImagen ? 'Generando…' : 'Compartir imagen'}
          </Button>
          <Button type="button" variant="outline" onClick={imprimirTicket} disabled={!datos}>
            <Receipt size={18} weight="bold" /> Ticket
          </Button>
          <Button type="button" onClick={imprimirA4} disabled={!datos}>
            <Printer size={18} weight="bold" /> Imprimir A4
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar print:hidden">
        <div ref={contenidoRef} className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-4 bg-background">
          {datos && (
            <div className="flex flex-col gap-0.5">
              <h3 className="t-titulo text-foreground">Cierre de caja · {datos.fecha}</h3>
              <span className="t-meta text-muted-foreground">
                Cerrado por {cierre.usuario_nombre} · {new Date(cierre.fecha_cierre).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          )}
          {!datos ? (
            <p className="t-meta text-muted-foreground text-center py-12">Este cierre no guardó el detalle para el reporte.</p>
          ) : (
            <>
              <section className={seccion}>
                <h4 className={tituloSeccion}>Resumen del turno</h4>
                <span className="t-meta text-muted-foreground capitalize -mt-2">{datos.fecha}</span>
                <div className="flex flex-col gap-1">
                  <Fila label="Orígenes incluidos" value={datos.origenes.join(', ')} />
                  {datos.omitidos.length > 0 && <Fila label="Omitidos" value={datos.omitidos.join(', ')} />}
                  <Fila label="Total cobrado" value={dinero(datos.totalCobrado)} destacado />
                  <Fila label="Reembolsos" value={dinero(datos.totalReembolsado)} />
                  <Fila label="Saldo pendiente" value={dinero(datos.saldoPendiente)} />
                  <Fila label="Ventas" value={`${datos.ventas}${datos.anuladas > 0 ? ` (+${datos.anuladas} anuladas)` : ''}`} />
                  {datos.creditos && datos.creditos.cantidad > 0 && <Fila label="Ventas a crédito" value={`${datos.creditos.cantidad} · ${dinero(datos.creditos.total)}`} />}
                </div>
              </section>

              <section className={seccion}>
                <h4 className={tituloSeccion}>Cobros por método</h4>
                <div className="flex flex-col gap-1">
                  <Fila label="Efectivo" value={dinero(datos.pagos.efectivo)} />
                  <Fila label="Tarjeta" value={dinero(datos.pagos.tarjeta)} />
                  <Fila label="Transferencia" value={dinero(datos.pagos.transferencia)} />
                  {datos.pagos.otros > 0 && <Fila label="Otros" value={dinero(datos.pagos.otros)} />}
                </div>
              </section>

              {datos.porOrigen.some(o => o.total > 0) && (
                <section className={seccion}>
                  <h4 className={tituloSeccion}>Cobros por origen</h4>
                  <div className="flex flex-col divide-y divide-border">
                    {datos.porOrigen.filter(o => o.total > 0).map(o => (
                      <div key={o.titulo} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="t-cuerpo-fuerte text-secondary-foreground">{o.titulo}</span>
                          <span className="t-cuerpo-fuerte tabular-nums text-foreground">{dinero(o.total)}</span>
                        </div>
                        {o.lineas.map((l, i) => <Fila key={i} label={l.label} value={dinero(l.monto)} sub={l.sub} />)}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {d?.creditos && d.creditos.length > 0 && (
                <section className={seccion}>
                  <h4 className={tituloSeccion}>Ventas a crédito ({d.creditos.length})</h4>
                  <div className="flex flex-col gap-1">
                    {d.creditos.map((v, i) => <Fila key={i} label={`${v.cliente}${v.referencia ? ` · ${v.referencia}` : ''}`} value={dinero(v.monto)} />)}
                  </div>
                </section>
              )}

              {d && d.sinComprobante.length > 0 && (
                <section className={seccion}>
                  <h4 className={tituloSeccion}>Cobros sin comprobante ({d.sinComprobante.length})</h4>
                  <div className="flex flex-col gap-1">
                    {d.sinComprobante.map((p, i) => <Fila key={i} label={`${p.cliente} · ${p.metodo}`} value={dinero(p.monto)} />)}
                  </div>
                </section>
              )}

              {d && d.sinFactura.length > 0 && (
                <section className={seccion}>
                  <h4 className={tituloSeccion}>Ventas sin factura ({d.sinFactura.length})</h4>
                  <div className="flex flex-col gap-1">
                    {d.sinFactura.map((v, i) => <Fila key={i} label={`${v.cliente}${v.referencia ? ` · ${v.referencia}` : ''}`} value={dinero(v.monto)} />)}
                  </div>
                </section>
              )}

              {d && d.pendientes.length > 0 && (
                <section className={seccion}>
                  <h4 className={tituloSeccion}>Saldos pendientes ({d.pendientes.length})</h4>
                  <div className="flex flex-col gap-1">
                    {d.pendientes.map((v, i) => <Fila key={i} label={`${v.cliente}${v.referencia ? ` · ${v.referencia}` : ''}`} value={dinero(v.saldo)} />)}
                  </div>
                </section>
              )}

              <section className={seccion}>
                <h4 className={tituloSeccion}>Novedades de caja</h4>
                <p className="t-cuerpo text-secondary-foreground whitespace-pre-wrap">{datos.novedades.trim() || 'Sin novedades.'}</p>
              </section>
            </>
          )}
        </div>
      </div>

      {datos && createPortal(
        <div id="a4-print-root">
          <ReporteDocumento datos={datos} />
        </div>,
        document.body,
      )}

      <style>{`
        #a4-print-root { display: none; }
        .cierre-preview-scale { background: white; color: black; width: 210mm; min-height: 297mm; margin: 0 auto; box-shadow: 0 0 12px rgba(0,0,0,0.15); }
        .cierre-page { width: 210mm; min-height: 297mm; padding: 14mm; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #111; background: white; }
        .cierre-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
        .cierre-header h1 { font-size: 18px; font-weight: 900; margin: 0; }
        .cierre-header span { font-size: 11px; color: #444; }
        .cierre-origenes { font-size: 11px; margin: 0 0 4mm; color: #333; }
        .cierre-totales { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 6mm; }
        .cierre-totales div { border: 1px solid #999; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
        .cierre-totales span { font-size: 9px; text-transform: uppercase; color: #444; font-weight: 700; }
        .cierre-totales strong { font-size: 14px; font-weight: 900; }
        .cierre-page h2 { font-size: 12px; font-weight: 900; border-bottom: 1px solid #999; padding-bottom: 3px; margin: 6mm 0 3mm; text-transform: uppercase; }
        .cierre-page table { width: 100%; border-collapse: collapse; }
        .cierre-page td { font-size: 11px; padding: 3px 0; border-bottom: 1px solid #eee; }
        .cierre-page td.num { text-align: right; font-weight: 700; white-space: nowrap; }
        .cierre-page tr.sub td { padding-left: 12px; font-size: 10px; color: #444; }
        .cierre-origen { break-inside: avoid; margin-bottom: 3mm; }
        .cierre-origen-titulo { display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; padding: 2px 0; }
        .cierre-novedades { font-size: 11px; white-space: pre-wrap; margin: 0; min-height: 20mm; border: 1px solid #ccc; padding: 6px 8px; }

        @media print {
          html, body { overflow: visible !important; height: auto !important; width: auto !important; }
          body * { visibility: hidden; }
          #a4-print-root, #a4-print-root * { visibility: visible; }
          #a4-print-root { display: block !important; position: fixed; left: 0; top: 0; width: 210mm; z-index: 999999; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
}
