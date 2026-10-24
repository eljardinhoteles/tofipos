import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Copy, DownloadSimple, Printer } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { numeroCotizacion, type Cotizacion } from '../../../lib/hotelCotizacionesApi';
import { copiarPng, cotizacionAPng, descargarPng, imprimirPng } from '../../../lib/exportarCotizacion';

/**
 * Salidas del documento de una cotización (PDF, descargar y copiar imagen) como botones listos para el encabezado, y la referencia al
 * documento que se exporta (`docRef`, para la vista previa). Con `null` no hay botones.
 */
export function useExportarCotizacion(cotizacion: Cotizacion | null): { docRef: RefObject<HTMLDivElement | null>; botones: ReactNode } {
  const docRef = useRef<HTMLDivElement>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const hacer = async (que: string, fn: (png: string) => Promise<void> | void, exito?: string) => {
    if (!docRef.current || trabajando) return;
    setTrabajando(que);
    try {
      await fn(await cotizacionAPng(docRef.current));
      if (exito) showToast.success(exito);
    } catch (e) {
      showToast.fallo('preparar la cotización', e);
    } finally {
      setTrabajando(null);
    }
  };

  if (!cotizacion) return { docRef, botones: null };
  const nombre = numeroCotizacion(cotizacion.numero);
  const boton = (id: string, etiqueta: string, Icono: typeof Copy, fn: (png: string) => Promise<void> | void, exito?: string, principal = false) => (
    <Button key={id} type="button" variant={principal ? 'default' : 'outline'} className="h-10 gap-1.5 px-3" title={etiqueta} aria-label={etiqueta} disabled={!!trabajando} onClick={() => void hacer(id, fn, exito)}>
      {trabajando === id ? <Girando /> : <Icono size={16} weight="bold" />}<span className="hidden md:inline">{etiqueta}</span>
    </Button>
  );
  return {
    docRef,
    botones: (
      <div className="flex items-center gap-1.5" role="group" aria-label="Salidas de la cotización">
        {boton('pdf', 'PDF', Printer, (png) => imprimirPng(png, nombre), undefined, true)}
        {boton('descargar', 'Descargar', DownloadSimple, (png) => descargarPng(png, nombre))}
        {boton('copiar', 'Copiar', Copy, (png) => copiarPng(png), 'Imagen copiada')}
      </div>
    ),
  };
}
