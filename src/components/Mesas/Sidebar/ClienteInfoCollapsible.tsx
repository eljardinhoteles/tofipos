import { Bed, Buildings, CaretDown, EnvelopeSimple, IdentificationCard, MapPin, NotePencil, PencilSimple, Phone, User } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

const TIPO_CLIENTE_LABEL: Record<string, string> = {
 persona_natural:'Persona natural',
 juridico:'Jurídico',
 extranjero:'Extranjero',
 agencia:'Agencia',
};

interface ClienteInfoCollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditar: () => void;
  /** Mesa de la habitación a la que está vinculada la comanda, si hay. */
  linkedMesa?: { nombre: string } | null;
  /** Ficha del cliente registrado que coincide con el nombre de la comanda. */
  clienteVinculado: any | null;
  /** Nombre escrito en la comanda (puede no estar registrado). */
  clienteNombre?: string | null;
}

// Datos del cliente de la comanda, colapsable: siempre visible para poder
// cambiar el cliente aunque el panel esté cerrado.
export function ClienteInfoCollapsible({ open, onOpenChange, onEditar, linkedMesa, clienteVinculado, clienteNombre }: ClienteInfoCollapsibleProps) {
  return (
 <Collapsible open={open} onOpenChange={onOpenChange} className="shrink-0 border-b border-border bg-muted/50">
 <div className="w-full flex items-center justify-between px-4 py-2.5 transition-colors">
 <CollapsibleTrigger className="flex-1 flex items-center gap-2 cursor-pointer">
 <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 <IdentificationCard size={14} />
 Datos del Cliente
 </span>
 <CaretDown
 size={14}
 className={cn("text-muted-foreground transition-transform", open &&"rotate-180")}
 />
 </CollapsibleTrigger>
 <Button
 variant="ghost"size="icon-sm"onClick={onEditar}
 title="Cambiar cliente"className="text-muted-foreground shrink-0">
 <PencilSimple size={14} />
 </Button>
 </div>
 <CollapsibleContent>
 <div className="px-4 pb-3 flex flex-col gap-2 text-xs">
 {linkedMesa && (
 <div className="flex items-center gap-2 text-foreground">
 <Bed size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 Habitación {linkedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || linkedMesa.nombre}
 </span>
 </div>
 )}
 {clienteVinculado ? (
 <>
 {clienteVinculado.tipo_cliente && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 {TIPO_CLIENTE_LABEL[clienteVinculado.tipo_cliente] ?? clienteVinculado.tipo_cliente}
 </span>
 </div>
 )}
 {clienteVinculado.telefono && (
 <div className="flex items-center gap-2 text-foreground">
 <Phone size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.telefono}</span>
 </div>
 )}
 {clienteVinculado.email && (
 <div className="flex items-center gap-2 text-foreground">
 <EnvelopeSimple size={14} className="text-primary shrink-0"/>
 <span className="font-semibold truncate select-text cursor-text">{clienteVinculado.email}</span>
 </div>
 )}
 {clienteVinculado.direccion && (
 <div className="flex items-center gap-2 text-foreground">
 <MapPin size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.direccion}</span>
 </div>
 )}
 {clienteVinculado.dni && (
 <div className="flex items-center gap-2 text-foreground">
 <IdentificationCard size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.dni}</span>
 </div>
 )}
 {clienteVinculado.notas && (
 <div className="flex items-start gap-2 text-muted-foreground">
 <NotePencil size={14} className="text-primary shrink-0 mt-0.5"/>
 <span className="italic select-text cursor-text">{clienteVinculado.notas}</span>
 </div>
 )}
 {!clienteVinculado.telefono && !clienteVinculado.email && !clienteVinculado.direccion && !clienteVinculado.dni && !clienteVinculado.notas && (
 <span className="text-muted-foreground">Sin datos adicionales registrados.</span>
 )}

 {(clienteVinculado.nombre_factura || clienteVinculado.numero_doc || clienteVinculado.direccion_fiscal || clienteVinculado.email_factura) && (
 <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-border/60">
 <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
 <Buildings size={12} /> Facturación
 </span>
 {clienteVinculado.nombre_factura && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.nombre_factura}</span>
 </div>
 )}
 {clienteVinculado.numero_doc && (
 <div className="flex items-center gap-2 text-foreground">
 <IdentificationCard size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 {clienteVinculado.tipo_doc ?`${clienteVinculado.tipo_doc.toUpperCase()}: ${clienteVinculado.numero_doc}`: clienteVinculado.numero_doc}
 </span>
 </div>
 )}
 {clienteVinculado.direccion_fiscal && (
 <div className="flex items-center gap-2 text-foreground">
 <MapPin size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.direccion_fiscal}</span>
 </div>
 )}
 {clienteVinculado.email_factura && (
 <div className="flex items-center gap-2 text-foreground">
 <EnvelopeSimple size={14} className="text-primary shrink-0"/>
 <span className="font-semibold truncate select-text cursor-text">{clienteVinculado.email_factura}</span>
 </div>
 )}
 </div>
 )}
 </>
 ) : (
 <span className="text-muted-foreground">
 {clienteNombre ?'Cliente no registrado en la base de datos.':'Sin cliente asignado — Público General.'}
 </span>
 )}
 </div>
 </CollapsibleContent>
 </Collapsible>
  );
}
