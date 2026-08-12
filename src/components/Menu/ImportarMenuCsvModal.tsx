import { useRef, useState } from'react';
import { UploadSimple, Download, X } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { parseMenuCsv, MENU_CSV_TEMPLATE, type MenuCsvRow } from'../../lib/menuCsvImport';
import { createRxCategoria, createRxMenuItem } from'../../db/rxdb';
import { useRxMenuCatalog } from'../../hooks/useRxMenuCatalog';
import { Button } from'@/components/ui/button';

interface Props {
 opened: boolean;
 onClose: () => void;
}

export function ImportarMenuCsvModal({ opened, onClose }: Props) {
 const { categorias: dbCategorias } = useRxMenuCatalog();
 const [rows, setRows] = useState<MenuCsvRow[]>([]);
 const [, setHeaderErrors] = useState<string[]>([]);
 const [fileName, setFileName] = useState<string | null>(null);
 const [importing, setImporting] = useState(false);
 const [, setProgress] = useState(0);
 const fileInputRef = useRef<HTMLInputElement>(null);

 if (!opened) return null;

 const validRows = rows.filter(r => r.errors.length === 0);
 const newCategoryNames = [...new Set(
 validRows
 .map(r => r.categoria)
 .filter(nombre => !dbCategorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase()))
 )];

 const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setFileName(file.name);
 const text = await file.text();
 const parsed = parseMenuCsv(text);
 setRows(parsed.rows);
 setHeaderErrors(parsed.headerErrors);
 };

 const handleDescargarPlantilla = () => {
 const blob = new Blob(['\uFEFF'+ MENU_CSV_TEMPLATE], { type:'text/csv;charset=utf-8;'});
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download ='plantilla_productos.csv';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 };

 const handleReset = () => {
 setRows([]);
 setHeaderErrors([]);
 setFileName(null);
 setProgress(0);
 if (fileInputRef.current) fileInputRef.current.value ='';
 };

 const handleImportar = async () => {
 if (validRows.length === 0) return;
 setImporting(true);
 setProgress(0);
 try {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const categoriaIdPorNombre = new Map<string, string>(
 dbCategorias.map(c => [c.nombre.toLowerCase(), c.id])
 );

 for (const nombre of newCategoryNames) {
 const creada = await createRxCategoria({ id: crypto.randomUUID(), nombre, organization_id: orgId });
 categoriaIdPorNombre.set(nombre.toLowerCase(), creada.id);
 }

 let done = 0;
 let failed = 0;
 for (const row of validRows) {
 const categoriaId = categoriaIdPorNombre.get(row.categoria.toLowerCase());
 try {
 await createRxMenuItem({
 id: crypto.randomUUID(),
 nombre: row.nombre,
 precio: row.precio,
 categoria_id: categoriaId ||'',
 categoria_nombre: row.categoria,
 activo: row.activo,
 es_bebida: row.es_bebida,
 modificadores: [],
 descripcion: row.descripcion,
 iva_modalidad: row.iva_modalidad,
 iva_porcentaje: row.iva_modalidad ==='especifico'? row.iva_porcentaje : undefined,
 organization_id: orgId,
 });
 } catch {
 failed++;
 }
 done++;
 setProgress(Math.round((done / validRows.length) * 100));
 }

 if (failed > 0) {
 showToast.error('Importación parcial',`${done - failed} productos creados, ${failed} fallaron.`);
 } else {
 showToast.success('Importación completa',`${done} productos creados.`);
 }
 handleReset();
 onClose();
 } finally {
 setImporting(false);
 }
 };

 return (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <div className="flex items-center gap-2">
 <UploadSimple size={20} className="text-primary"/>
 <h3 className="font-extrabold text-base text-foreground">Importar productos vía CSV</h3>
 </div>
 <Button variant="ghost"size="icon"className="h-7 w-7"onClick={onClose}>
 <X size={16} />
 </Button>
 </div>

 {rows.length === 0 ? (
 <div className="flex flex-col gap-3">
 <p className="text-xs text-muted-foreground">
 Sube un archivo CSV con columnas: <b>nombre, precio, categoria</b> (requeridas).
 </p>
 <input
 ref={fileInputRef}
 type="file"accept=".csv,text/csv"onChange={handleFile}
 className="hidden"id="csv-file-input"/>
 <div className="flex items-center gap-2">
 <label
 htmlFor="csv-file-input"className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 cursor-pointer">
 <UploadSimple size={16} /> Seleccionar archivo
 </label>
 <Button variant="secondary"onClick={handleDescargarPlantilla}>
 <Download size={16} /> Descargar plantilla
 </Button>
 </div>
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 <div className="flex justify-between items-center text-xs font-bold text-foreground">
 <span>{fileName}</span>
 <button type="button"onClick={handleReset} className="text-primary">Cambiar</button>
 </div>
 <div className="max-h-60 overflow-y-auto border border-border rounded-xl p-2">
 <span className="text-xs font-bold text-emerald-600">{validRows.length} filas válidas para importar</span>
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <Button variant="outline"size="sm"onClick={onClose}>Cancelar</Button>
 <Button
 size="sm"disabled={importing || validRows.length === 0}
 onClick={handleImportar}
 >
 Importar ({validRows.length})
 </Button>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}
