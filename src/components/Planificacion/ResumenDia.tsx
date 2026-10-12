import { Tag } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { TONOS_ETIQUETA, type CeldaPlan, type EtiquetaPlan } from '../../lib/planificacion';

interface Props {
  etiquetas: EtiquetaPlan[];
  /** Todas las celdas del plan; se filtra por `fecha`. */
  celdas: CeldaPlan[];
  fecha: string;
  nombreProducto: (id: string) => string;
}

// Resumen de lo planificado en un día, agrupado por etiqueta. Lo usan el modal de firma y el
// sidebar de un día ya confirmado.
export function ResumenDia({ etiquetas, celdas, fecha, nombreProducto }: Props) {
  const delDia = celdas.filter((c) => c.fecha === fecha);
  return (
    <div className="flex flex-col gap-4">
      {etiquetas.map((et) => {
        const items = delDia.filter((c) => c.etiqueta_id === et.id);
        const tono = TONOS_ETIQUETA[et.tono];
        return (
          <section key={et.id} className="flex flex-col gap-1">
            <div className={cn('flex items-center gap-2 px-3 h-8 t-cuerpo-fuerte', tono.fila)}>
              <Tag size={16} weight="fill" className="shrink-0" />
              {et.nombre}
              <span className="ml-auto tabular-nums opacity-70">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-1 t-cuerpo text-muted-foreground">Sin productos</p>
            ) : (
              <ul className="flex flex-col">
                {items.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 px-3 h-9">
                    <span aria-hidden="true" className={cn('size-1.5 rounded-full shrink-0', tono.punto)} />
                    <span className="min-w-0 truncate t-cuerpo text-foreground">{nombreProducto(c.producto_id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
