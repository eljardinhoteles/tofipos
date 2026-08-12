import { useState } from'react';
import { CaretDown, PencilSimple, Users, Copy as CopyIcon, Check, X } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { useRxClientes } from'../../../hooks/useRxClientes';
import { Button } from'@/components/ui/button';
import { ClienteSelector } from'@/components/Common/ClienteSelector';

const TIPO_CLIENTE_LABEL: Record<string, string> = {
 persona_natural:'Persona natural',
 juridico:'Jurídico',
 extranjero:'Extranjero',
 agencia:'Agencia',
};

interface ClienteExpandableHeaderProps {
 clienteNombre: string | undefined;
 showEditButton?: boolean;
 onEdit?: () => void;
 onChangeCliente?: (nombre: string, id: string) => void;
}

export function ClienteExpandableHeader({
 clienteNombre,
 showEditButton = false,
 onEdit,
 onChangeCliente,
}: ClienteExpandableHeaderProps) {
 const [expanded, setExpanded] = useState(false);
 const [isChanging, setIsChanging] = useState(false);
 const [tempValue, setTempValue] = useState('');
 const { clientes } = useRxClientes();

 const cd = clientes.find(c => c.nombre === clienteNombre);
 const isSystemCliente = cd?.id ==='99999999999'|| clienteNombre ==='Consumidor Final';

 const datosRows = [
 { label:'Nombre', value: clienteNombre ||'Público General'},
 { label:'Tipo', value: cd?.tipo_cliente ? (TIPO_CLIENTE_LABEL[cd.tipo_cliente] ?? cd.tipo_cliente) :'—'},
 { label:'Identificación', value: cd?.dni ||'—'},
 { label:'Teléfono', value: cd?.telefono ||'—'},
 { label:'Email', value: cd?.email ||'—'},
 { label:'Dirección', value: cd?.direccion ||'—'},
 ];

 const facturacionRows = [
 { label:'Nombre facturación', value: cd?.nombre_factura ||'—'},
 { label:'Documento', value: cd?.numero_doc ? (cd.tipo_doc ?`${cd.tipo_doc.toUpperCase()}: ${cd.numero_doc}`: cd.numero_doc) :'—'},
 { label:'Dirección fiscal', value: cd?.direccion_fiscal ||'—'},
 { label:'Email facturación', value: cd?.email_factura ||'—'},
 ];

 const tieneFacturacion = cd && (cd.nombre_factura || cd.numero_doc || cd.direccion_fiscal || cd.email_factura);

 const handleCopy = () => {
 const lines = [
 ...datosRows.map(r =>`${r.label}: ${r.value}`),
 ...(tieneFacturacion ? ['','Facturación:', ...facturacionRows.map(r =>`${r.label}: ${r.value}`)] : []),
 ];
 navigator.clipboard.writeText(lines.join('\n'));
 showToast.success('Datos copiados','Los datos del cliente se copiaron al portapapeles.');
 };

 return (
 <div className="flex flex-col w-full">
 {expanded && (
 <div className="p-3 bg-muted rounded-xl border border-border my-2 flex flex-col gap-2">
 {isChanging ? (
 <div className="flex flex-col gap-2">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 Cambiar Cliente de la Cuenta
 </span>
 <div className="flex items-start gap-2">
 <ClienteSelector
 value={tempValue}
 onChange={setTempValue}
 placeholder="Buscar cliente o escribir nombre..."
 className="flex-1"
 />
 <Button
 type="button"size="icon"disabled={!tempValue.trim()}
 onClick={() => {
 if (tempValue.trim() && onChangeCliente) {
 const matched = clientes.find(c => c.nombre.trim().toLowerCase() === tempValue.trim().toLowerCase());
 onChangeCliente(matched ? matched.nombre : tempValue.trim(), matched ? matched.id :'');
 setIsChanging(false);
 }
 }}
 className="w-9 h-9 rounded-lg shrink-0">
 <Check size={16} weight="bold"/>
 </Button>
 <Button
 type="button"size="icon"variant="secondary"onClick={() => setIsChanging(false)}
 className="w-9 h-9 rounded-lg shrink-0">
 <X size={16} weight="bold"/>
 </Button>
 </div>
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1 text-xs text-muted-foreground font-medium">
 {datosRows.map(r => (
 <div key={r.label} className="flex justify-between gap-2">
 <span className="text-muted-foreground font-bold shrink-0">{r.label}:</span>
 <span className="font-semibold text-foreground text-right truncate">{r.value}</span>
 </div>
 ))}
 </div>

 {tieneFacturacion && (
 <div className="flex flex-col gap-1 text-xs text-muted-foreground font-medium pt-2 border-t border-border/60">
 <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mb-0.5">Facturación</span>
 {facturacionRows.map(r => (
 <div key={r.label} className="flex justify-between gap-2">
 <span className="text-muted-foreground font-bold shrink-0">{r.label}:</span>
 <span className="font-semibold text-foreground text-right truncate">{r.value}</span>
 </div>
 ))}
 </div>
 )}

 <div className="flex items-center gap-2 pt-2 border-t border-border/60">
 {!isSystemCliente && showEditButton && onEdit && (
 <button
 type="button"onClick={onEdit}
 className="flex-1 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center gap-1 cursor-pointer">
 <PencilSimple size={14} /> Editar
 </button>
 )}
 {onChangeCliente && (
 <button
 type="button"onClick={() => {
 setTempValue(clienteNombre ||'');
 setIsChanging(true);
 }}
 className="flex-1 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer">
 <Users size={14} /> Cambiar
 </button>
 )}
 <button
 type="button"onClick={handleCopy}
 className="flex-1 py-1.5 rounded-lg bg-border text-foreground font-bold text-xs flex items-center justify-center gap-1 cursor-pointer">
 <CopyIcon size={14} /> Copiar
 </button>
 </div>
 </div>
 )}
 </div>
 )}

 <div className="relative flex items-center justify-center my-1">
 <div className="w-full h-[1px] bg-border"/>
 <button
 type="button"onClick={() => setExpanded(v => !v)}
 className="absolute w-5 h-5 rounded-full bg-card border border-primary text-primary flex items-center justify-center cursor-pointer shadow-2xs">
 <CaretDown size={10} weight="bold"className={expanded ?'rotate-180 transition-transform':'transition-transform'} />
 </button>
 </div>
 </div>
 );
}
