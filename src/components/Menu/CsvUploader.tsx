import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { UploadSimple, Spinner, FileCsv, DownloadSimple } from '@phosphor-icons/react';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { initVerticalRxDb, createRxCategoria, createRxMenuItem } from '@/db/rxdb';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface CsvRow {
  nombre: string;
  precio: string;
  categoria: string;
}

export function CsvUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [open, setOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          await processCsvData(results.data);
          showToast.success('Importación completada', `Se importaron ${results.data.length} productos.`);
          setOpen(false); // Cerrar modal al terminar exitosamente
        } catch (error) {
          console.error('Error importing CSV:', error);
          showToast.error('No se pudo importar el archivo', 'Ocurrió un error procesando el archivo.');
        } finally {
          setIsProcessing(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      error: (error) => {
        console.error('CSV Parse Error:', error);
        showToast.error('No se pudo leer el CSV');
        setIsProcessing(false);
      }
    });
  };

  const processCsvData = async (data: CsvRow[]) => {
    const rxDb = await initVerticalRxDb();
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    if (!orgId) throw new Error('No organization ID found');

    const csvCategorias = Array.from(new Set(data.map(row => row.categoria?.trim() || 'General')));

    const existingCatsDocs = await rxDb.categorias.find({
      selector: { organization_id: orgId, _deleted: { $ne: true } }
    }).exec();
    
    const existingCats = new Map<string, string>();
    existingCatsDocs.forEach(doc => {
      existingCats.set(doc.toJSON().nombre.toLowerCase(), doc.toJSON().id);
    });

    const catNameToId = new Map<string, string>();
    for (const catName of csvCategorias) {
      const lowerName = catName.toLowerCase();
      if (existingCats.has(lowerName)) {
        catNameToId.set(catName, existingCats.get(lowerName)!);
      } else {
        const newId = crypto.randomUUID();
        await createRxCategoria({
          id: newId,
          nombre: catName,
          organization_id: orgId
        });
        catNameToId.set(catName, newId);
        existingCats.set(lowerName, newId);
      }
    }

    for (const row of data) {
      const nombre = row.nombre?.trim();
      const catNombre = row.categoria?.trim() || 'General';
      let precio = 0;
      
      if (row.precio) {
        const cleanPrecio = row.precio.replace(/[^0-9.-]+/g, '');
        precio = parseFloat(cleanPrecio);
        if (isNaN(precio)) precio = 0;
      }

      if (!nombre) continue;

      await createRxMenuItem({
        id: crypto.randomUUID(),
        nombre,
        precio,
        categoria_id: catNameToId.get(catNombre)!,
        categoria_nombre: catNombre,
        organization_id: orgId,
        activo: true,
        es_bebida: false,
        modificadores: [],
        iva_modalidad: 'sistema'
      });
    }
  };

  const exportarMenu = async () => {
    try {
      const rxDb = await initVerticalRxDb();
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const docs = await rxDb.menu_items.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      }).exec();
      if (docs.length === 0) {
        showToast.warning('No hay productos para exportar');
        return;
      }
      const filas = docs
        .map(d => d.toJSON())
        .sort((a, b) => (a.categoria_nombre || '').localeCompare(b.categoria_nombre || '') || a.nombre.localeCompare(b.nombre))
        .map(i => ({ nombre: i.nombre, precio: Number(i.precio ?? 0).toFixed(2), categoria: i.categoria_nombre || 'General' }));
      const csv = '\uFEFF' + Papa.unparse(filas, { columns: ['nombre', 'precio', 'categoria'] });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `menu_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast.success('Menú exportado', `${filas.length} productos.`);
    } catch (error) {
      console.error('Error exportando menú:', error);
      showToast.error('No se pudo exportar el menú');
    }
  };

  const downloadTemplate = () => {
    const csvContent = "nombre,precio,categoria\nHamburguesa Clásica,12.50,Comida\nCoca Cola,2.50,Bebidas";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_menu.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="h-10 gap-1.5 font-bold">
          <FileCsv size={18} /> Importar CSV
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importación Masiva de Menú</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <div className="space-y-3">
            <h3 className="t-cuerpo">1. Descarga la plantilla</h3>
            <p className="t-meta text-muted-foreground leading-relaxed">
              Descarga el archivo CSV base. Rellénalo con los datos de tus productos usando Excel o Google Sheets. No modifiques los nombres de las columnas.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="h-9 px-4 rounded-2xl bg-secondary text-secondary-foreground t-dato flex items-center gap-2 transition-all cursor-pointer w-full justify-center hover:opacity-80 border border-border"
            >
              <DownloadSimple size={16} />
              Descargar Plantilla CSV
            </button>
            <button
              type="button"
              onClick={exportarMenu}
              className="h-9 px-4 rounded-2xl bg-secondary text-secondary-foreground t-dato flex items-center gap-2 transition-all cursor-pointer w-full justify-center hover:opacity-80 border border-border"
            >
              <DownloadSimple size={16} />
              Exportar menú actual (CSV)
            </button>
          </div>

          <div className="w-full h-[1px] bg-border" />

          <div className="space-y-3">
            <h3 className="t-cuerpo">2. Sube tu archivo</h3>
            <p className="t-meta text-muted-foreground leading-relaxed">
              Sube el archivo CSV rellenado. Las categorías que no existan se crearán automáticamente.
            </p>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-4 rounded-2xl bg-primary text-primary-foreground t-dato flex items-center gap-2 transition-all cursor-pointer w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 shadow-xs"
            >
              {isProcessing ? (
                <>
                  <Spinner className="animate-spin" size={16} />
                  Procesando productos...
                </>
              ) : (
                <>
                  <UploadSimple size={16} />
                  Subir Archivo CSV
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
