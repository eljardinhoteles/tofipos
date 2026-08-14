import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { UploadSimple, Spinner } from '@phosphor-icons/react';
import { showToast } from '@/lib/toast';
import { initVerticalRxDb, createRxCategoria, createRxMenuItem } from '@/db/rxdb';

interface CsvRow {
  nombre: string;
  precio: string;
  categoria: string;
}

export function CsvUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
          showToast.success('Importación exitosa', `Se importaron ${results.data.length} productos.`);
        } catch (error) {
          console.error('Error importing CSV:', error);
          showToast.error('Error en importación', 'Ocurrió un error procesando el archivo.');
        } finally {
          setIsProcessing(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      error: (error) => {
        console.error('CSV Parse Error:', error);
        showToast.error('Error al leer CSV');
        setIsProcessing(false);
      }
    });
  };

  const processCsvData = async (data: CsvRow[]) => {
    const rxDb = await initVerticalRxDb();
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    if (!orgId) throw new Error('No organization ID found');

    // Extraer categorías únicas del CSV
    const csvCategorias = Array.from(new Set(data.map(row => row.categoria?.trim() || 'General')));

    // Buscar categorías existentes en RxDB para esta org
    const existingCatsDocs = await rxDb.categorias.find({
      selector: { organization_id: orgId, _deleted: { $ne: true } }
    }).exec();
    
    const existingCats = new Map<string, string>(); // Map de nombre_minusculas -> id
    existingCatsDocs.forEach(doc => {
      existingCats.set(doc.toJSON().nombre.toLowerCase(), doc.toJSON().id);
    });

    // Crear categorías faltantes
    const catNameToId = new Map<string, string>(); // Para usar al insertar items
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

    // Insertar productos
    for (const row of data) {
      const nombre = row.nombre?.trim();
      const catNombre = row.categoria?.trim() || 'General';
      let precio = 0;
      
      if (row.precio) {
        // Manejar comas o símbolos de moneda si vienen
        const cleanPrecio = row.precio.replace(/[^0-9.-]+/g, '');
        precio = parseFloat(cleanPrecio);
        if (isNaN(precio)) precio = 0;
      }

      if (!nombre) continue; // Ignorar filas sin nombre

      await createRxMenuItem({
        id: crypto.randomUUID(),
        nombre,
        precio,
        categoria_id: catNameToId.get(catNombre)!,
        categoria_nombre: catNombre,
        organization_id: orgId,
        activo: true,
        es_bebida: false, // Default false, luego se puede editar
        modificadores: [],
        iva_modalidad: 'sistema'
      });
    }
  };

  return (
    <>
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
        className="h-9 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? <Spinner className="animate-spin" size={18} /> : <UploadSimple size={18} />}
        Importar CSV
      </button>
    </>
  );
}
