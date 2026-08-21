import { useMemo } from'react';
import { createPortal } from'react-dom';
import { Printer, FileText, X } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';

interface PrintableItem {
 nombre: string;
 precio: number;
 cantidad: number;
 item_id?: string;
 modificadores?: string[];
 nota?: string;
}

export interface ReportReserva {
 id: string;
 nombre: string;
 hora: string;
 personas: number;
 telefono?: string;
 nota?: string;
}

export interface A4ReportPreviewModalProps {
 opened: boolean;
 onClose: () => void;
 mesasData: Array<{ mesaNombre: string; habitacionNombre?: string; clienteNombre?: string; items: PrintableItem[] }>;
}

function buildConsolidado(mesasData: A4ReportPreviewModalProps['mesasData']) {
 const map = new Map<string, { nombre: string; cantidad: number }>();
 for (const mesa of mesasData) {
 for (const item of mesa.items) {
 const existing = map.get(item.nombre);
 if (existing) {
 existing.cantidad += item.cantidad;
 } else {
 map.set(item.nombre, { nombre: item.nombre, cantidad: item.cantidad });
 }
 }
 }
 return Array.from(map.values())
 .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
}

function ReportDocument({ mesasData, consolidado }: {
 mesasData: A4ReportPreviewModalProps['mesasData'];
 consolidado: Array<{ nombre: string; cantidad: number }>;
}) {
 const fecha = new Date().toLocaleString('es', { dateStyle:'full', timeStyle:'short'});
 return (
 <div className="a4-report-page">
 <div className="a4-report-header">
 <h1>Reporte de Cocina Consolidado</h1>
 <span>{fecha}</span>
 </div>

 {mesasData.length > 0 && (
 <div className="a4-report-mesas">
 {mesasData.map((mesa, idx) => (
 <div key={idx} className="a4-report-mesa">
 <h2>
 <span className="mesa-nombre">{mesa.mesaNombre}</span>
 {(mesa.habitacionNombre || mesa.clienteNombre) && (
 <span className="mesa-extra">
 {[
 mesa.habitacionNombre && `Hab. ${mesa.habitacionNombre.match(/\d+/)?.[0] ?? mesa.habitacionNombre}`,
 mesa.clienteNombre,
 ].filter(Boolean).join(' · ')}
 </span>
 )}
 </h2>
 <div className="a4-report-mesa-list">
 {mesa.items.map((item, i) => (
 <div key={i} className="a4-report-mesa-row">
 <span className="qty-badge">{item.cantidad}</span>
 <span className="nombre">
 {item.nombre}
 {item.modificadores && item.modificadores.length > 0 && (
 <div className="mods">{item.modificadores.join(', ')}</div>
 )}
 {item.nota && <div className="nota">{item.nota}</div>}
 </span>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}

 {consolidado.length > 0 && (
 <div className="a4-report-consolidado">
 <h2>Consolidado de Productos</h2>
 <div className="a4-report-consolidado-list">
 {consolidado.map((row, i) => (
 <div key={`${row.nombre}-${i}`} className="a4-report-consolidado-row">
 <span className="qty-badge">{row.cantidad}</span>
 <span className="nombre">{row.nombre}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}

export function A4ReportPreviewModal({
 opened,
 onClose,
 mesasData,
}: A4ReportPreviewModalProps) {
 const consolidado = useMemo(() => buildConsolidado(mesasData), [mesasData]);

 const handlePrintSubmit = () => {
 window.print();
 showToast.success('Imprimiendo','Enviado a la impresora A4.');
 };

 if (!opened) return null;

 return (
 <>
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 p-6 print:hidden">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText size={18} className="text-primary"/> Vista Previa (Formato A4)
 </DialogTitle>
 <DialogDescription className="sr-only">Vista previa del reporte de cocina consolidado en formato A4</DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto p-6 bg-muted border border-border rounded-xl">
 <div className="a4-report-preview-scale">
 <ReportDocument mesasData={mesasData} consolidado={consolidado} />
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <Button type="button"variant="outline"onClick={onClose} className="font-bold text-xs">
 <X size={16} /> Cerrar
 </Button>
 <Button
 type="button"onClick={handlePrintSubmit}
 className="bg-emerald-600 text-white font-extrabold text-xs gap-1.5">
 <Printer size={16} /> Imprimir A4
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {createPortal(
 <div id="a4-print-root">
 <ReportDocument mesasData={mesasData} consolidado={consolidado} />
 </div>,
 document.body
 )}

 <style>{`
 #a4-print-root { display: none; }

 .a4-report-preview-scale {
 background: white;
 color: black;
 width: 210mm;
 min-height: 297mm;
 margin: 0 auto;
 box-shadow: 0 0 12px rgba(0,0,0,0.15);
 }

 .a4-report-page {
 width: 210mm;
 min-height: 297mm;
 padding: 14mm;
 box-sizing: border-box;
 font-family: Arial, Helvetica, sans-serif;
 color: #111;
 background: white;
 }

 .a4-report-header {
 display: flex;
 align-items: flex-end;
 justify-content: space-between;
 gap: 12px;
 border-bottom: 2px solid #111;
 padding-bottom: 8px;
 margin-bottom: 16px;
 }
 .a4-report-header h1 { font-size: 18px; font-weight: 900; margin: 0; }
 .a4-report-header span { font-size: 11px; color: #444; white-space: nowrap; }

 .a4-report-mesas {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 10mm 8mm;
 margin-bottom: 10mm;
 }
 .a4-report-mesa { break-inside: avoid; }
 .a4-report-mesa h2 {
 display: flex;
 flex-direction: column;
 gap: 1px;
 font-weight: 900;
 border-bottom: 1px solid #999;
 padding-bottom: 4px;
 margin: 0 0 6px 0;
 }
 .a4-report-mesa h2 .mesa-nombre { font-size: 13px; }
 .a4-report-mesa h2 .mesa-extra { font-size: 10px; font-weight: 700; color: #444; }
 .a4-report-mesa-list { display: flex; flex-direction: column; gap: 4px; }
 .a4-report-mesa-row { display: flex; align-items: flex-start; gap: 6px; }
 .a4-report-mesa-row .nombre { font-size: 11px; padding-top: 1px; }
 .a4-report-mesa-row .mods { font-size: 9px; color: #333; }
 .a4-report-mesa-row .nota { font-size: 9px; color: #555; font-style: italic; }

 .qty-badge {
 display: inline-flex;
 align-items: center;
 justify-content: center;
 min-width: 16px;
 height: 16px;
 padding: 0 4px;
 background: #111;
 color: #fff;
 font-size: 10px;
 font-weight: 900;
 border-radius: 3px;
 flex-shrink: 0;
 }

 .a4-report-consolidado { break-before: page; margin-bottom: 10mm; }
 .a4-report-consolidado h2 {
 font-size: 14px;
 font-weight: 900;
 border-bottom: 2px solid #111;
 padding-bottom: 4px;
 margin: 0 0 8px 0;
 }
 .a4-report-consolidado-list {
 column-count: 3;
 column-gap: 8mm;
 }
 .a4-report-consolidado-row {
 display: flex;
 align-items: center;
 gap: 6px;
 break-inside: avoid;
 padding: 3px 0;
 border-bottom: 1px solid #eee;
 }
 .a4-report-consolidado-row .nombre { font-size: 11px; }

 @media print {
 html, body {
 overflow: visible !important;
 height: auto !important;
 width: auto !important;
 }
 body * { visibility: hidden; }
 #a4-print-root, #a4-print-root * { visibility: visible; }
 #a4-print-root {
 display: block !important;
 position: fixed;
 left: 0;
 top: 0;
 width: 210mm;
 z-index: 999999;
 }
 @page { size: A4; margin: 0; }
 }
 `}</style>
 </>
 );
}
