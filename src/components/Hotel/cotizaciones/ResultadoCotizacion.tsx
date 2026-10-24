import { useEffect, useRef, useState, type RefObject } from 'react';
import { ANCHO_DOCUMENTO } from '../../../lib/exportarCotizacion';
import type { Cotizacion } from '../../../lib/hotelCotizacionesApi';
import { DocumentoCotizacion } from './DocumentoCotizacion';

/** La vista previa se ajusta al ancho disponible sin pasar del tamaño real; lo que se exporta es siempre el documento a su tamaño completo. */
const ESCALA_MAXIMA = 1;

/** Vista previa del documento, centrada y ajustada al ancho disponible. Las salidas (PDF, imagen) van en el encabezado: ver `useExportarCotizacion`. */
export function ResultadoCotizacion({ cotizacion, docRef }: { cotizacion: Cotizacion; docRef: RefObject<HTMLDivElement | null> }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(ESCALA_MAXIMA);
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const ajustar = () => {
      const ancho = contenedor.current?.clientWidth ?? ANCHO_DOCUMENTO;
      setEscala(Math.min(ESCALA_MAXIMA, (ancho - 32) / ANCHO_DOCUMENTO)); // 32 = relleno del contenedor
      setAlto(docRef.current?.offsetHeight ?? 0);
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    if (contenedor.current) obs.observe(contenedor.current);
    if (docRef.current) obs.observe(docRef.current);
    return () => obs.disconnect();
  }, [docRef]);

  return (
    <div ref={contenedor} className="w-full flex justify-center rounded-2xl bg-muted/50 p-3 sm:p-4">
      <div className="overflow-hidden rounded-xl border border-border shadow-md" style={{ width: ANCHO_DOCUMENTO * escala, height: alto * escala || undefined }}>
        <div style={{ width: ANCHO_DOCUMENTO, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
          <DocumentoCotizacion ref={docRef} cotizacion={cotizacion} />
        </div>
      </div>
    </div>
  );
}
