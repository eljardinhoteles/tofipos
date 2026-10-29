import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useRxClientes } from '../../../hooks/useRxClientes';
import type { RxCliente } from '../../../db/rxdb';
import { documentoCliente } from '../../../lib/documentoCliente';
import { Dato } from './comunes';

const TIPO: Record<string, string> = { persona_natural: 'Persona', juridico: 'Empresa', extranjero: 'Extranjero', agencia: 'Agencia' };

/** Datos completos de la ficha de Clientes enlazada a la reserva (documento, dirección, facturación…), en un bloque que se despliega. */
export function FichaCliente({ clienteId, ocultarDireccion = false }: { clienteId: string | null; ocultarDireccion?: boolean }) {
  const { clientes } = useRxClientes() as { clientes: RxCliente[] };
  const [abierta, setAbierta] = useState(false);
  const c = clienteId ? clientes.find((x) => x.id === clienteId) : undefined;
  if (!clienteId) return <p className="t-meta text-muted-foreground">Sin ficha de Clientes enlazada. Edita al cliente para enlazarla y ver sus datos completos.</p>;
  if (!c) return <p className="t-meta text-muted-foreground">La ficha enlazada no está en este dispositivo.</p>;

  const documento = documentoCliente(c);
  const filas: Array<[string, string | undefined]> = [
    ['Documento', documento ?? undefined],
    ['Tipo de cliente', c.tipo_cliente ? TIPO[c.tipo_cliente] ?? c.tipo_cliente : undefined],
    // Si la reserva ya trae su propia dirección (se muestra arriba), la de la ficha no se repite.
    ['Dirección', ocultarDireccion ? undefined : c.direccion],
    ['Nombre de facturación', c.nombre_factura],
    ['Dirección fiscal', c.direccion_fiscal],
    ['Correo de facturación', c.email_factura],
    ['Notas del cliente', c.notas],
  ];
  const conDato = filas.filter(([, v]) => !!v?.trim());

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}
        className="self-start min-h-9 -ml-1 px-2 rounded-xl flex items-center gap-1.5 t-cuerpo-fuerte text-primary hover:bg-primary-soft cursor-pointer transition-colors">
        {abierta ? 'Ocultar datos completos' : 'Ver datos completos'}
        <CaretDown size={14} weight="bold" className={cn('transition-transform', abierta && 'rotate-180')} />
      </button>
      {abierta && (
        conDato.length === 0 ? <p className="t-meta text-muted-foreground">La ficha de {c.nombre} no tiene más datos.</p> : (
          <div className="grid grid-cols-2 gap-3">
            {conDato.map(([t, v]) => (
              <div key={t} className={['Dirección', 'Dirección fiscal', 'Notas del cliente'].includes(t) ? 'col-span-2' : undefined}><Dato t={t} v={v} /></div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
