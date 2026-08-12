import { useEffect, useState } from'react';
import {
 Phone, Envelope, IdentificationCard, MapPin,
 Buildings, Receipt, CopySimple, User, X
} from'@phosphor-icons/react';
import { type Cliente } from'../../db/database';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb, createRxCliente, updateRxCliente } from'../../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';
import { Textarea } from'@/components/ui/textarea';
import { Button } from'@/components/ui/button';
import { Label } from'@/components/ui/label';

const NOTAS_MAX = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_RE = /^[0-9+\-\s()]{7,20}$/;

interface ClienteFormModalProps {
 opened: boolean;
 onClose: () => void;
 editingCliente?: Cliente | null;
 initialNombre?: string;
 onCreatedGoToCuenta?: (clienteId: string) => void;
}

const TIPO_DOC_OPTIONS = [
 { value:'cedula', label:'Cédula'},
 { value:'ruc', label:'RUC'},
 { value:'pasaporte', label:'Pasaporte'},
 { value:'otro', label:'Otro'},
];

export function ClienteFormModal({ opened, onClose, editingCliente, initialNombre, onCreatedGoToCuenta }: ClienteFormModalProps) {
 const [activeTab, setActiveTab] = useState<'datos'|'facturacion'>('datos');
 const [saving, setSaving] = useState(false);

 const [form, setForm] = useState({
 nombre:'',
 tipo_cliente:'persona_natural'as'persona_natural'|'juridico'|'extranjero'|'agencia',
 telefono:'',
 email:'',
 dni:'',
 direccion:'',
 notas:'',
 nombre_factura:'',
 tipo_doc:'cedula'as'cedula'|'ruc'|'pasaporte'|'otro',
 numero_doc:'',
 direccion_fiscal:'',
 email_factura:'',
 });

 const [errors, setErrors] = useState<Record<string, string>>({});

 useEffect(() => {
 if (opened) {
 setActiveTab('datos');
 setErrors({});
 if (editingCliente) {
 const c = editingCliente as Cliente & {
 tipo_cliente?:'persona_natural'|'juridico'|'extranjero'|'agencia';
 nombre_factura?: string;
 tipo_doc?:'cedula'|'ruc'|'pasaporte'|'otro';
 numero_doc?: string;
 direccion_fiscal?: string;
 email_factura?: string;
 };
 setForm({
 nombre: c.nombre ||'',
 tipo_cliente: c.tipo_cliente ||'persona_natural',
 telefono: c.telefono ||'',
 email: c.email ||'',
 dni: c.dni ||'',
 direccion: c.direccion ||'',
 notas: c.notas ||'',
 nombre_factura: c.nombre_factura ||'',
 tipo_doc: c.tipo_doc ||'cedula',
 numero_doc: c.numero_doc ||'',
 direccion_fiscal: c.direccion_fiscal ||'',
 email_factura: c.email_factura ||'',
 });
 } else {
 setForm({
 nombre: initialNombre ||'',
 tipo_cliente:'persona_natural',
 telefono:'',
 email:'',
 dni:'',
 direccion:'',
 notas:'',
 nombre_factura:'',
 tipo_doc:'cedula',
 numero_doc:'',
 direccion_fiscal:'',
 email_factura:'',
 });
 }
 }
 }, [opened, editingCliente, initialNombre]);

 if (!opened) return null;

 const copiarDatosCliente = () => {
 setForm(prev => ({
 ...prev,
 nombre_factura: prev.nombre,
 numero_doc: prev.dni,
 direccion_fiscal: prev.direccion,
 email_factura: prev.email,
 tipo_doc: prev.tipo_cliente ==='juridico'?'ruc':'cedula',
 }));
 };

 const validate = () => {
 const errs: Record<string, string> = {};
 if (!form.nombre.trim() || form.nombre.trim().length < 2) {
 errs.nombre ='El nombre es demasiado corto';
 }
 if (form.email && !EMAIL_RE.test(form.email)) {
 errs.email ='Correo inválido';
 }
 if (form.telefono && !TELEFONO_RE.test(form.telefono)) {
 errs.telefono ='Teléfono inválido';
 }
 if (form.email_factura && !EMAIL_RE.test(form.email_factura)) {
 errs.email_factura ='Correo inválido';
 }
 setErrors(errs);
 return Object.keys(errs).length === 0;
 };

 const handleSubmit = async (e?: React.FormEvent) => {
 if (e) e.preventDefault();
 if (!validate()) {
 if (errors.nombre || errors.telefono || errors.email) {
 setActiveTab('datos');
 } else if (errors.email_factura) {
 setActiveTab('facturacion');
 }
 return;
 }

 if (editingCliente?.id ==='99999999999'|| editingCliente?.nombre ==='Consumidor Final') {
 showToast.error('Acción no permitida','El cliente Consumidor Final no puede ser modificado.');
 onClose();
 return;
 }

 setSaving(true);
 try {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const payload = { ...form, organization_id: orgId };
 let clienteId: string;

 if (editingCliente) {
 clienteId = editingCliente.id;
 await updateRxCliente(editingCliente.id, payload);
 showToast.success('Cliente actualizado');
 } else {
 const rxDb = await initVerticalRxDb();
 const exists = await rxDb.clientes.findOne({ selector: { nombre: form.nombre } }).exec();
 if (exists) {
 clienteId = (exists as { id: string }).id;
 await updateRxCliente(clienteId, payload);
 showToast.success('Cliente actualizado');
 } else {
 clienteId = crypto.randomUUID();
 await createRxCliente({ id: clienteId, ...payload, created_at: new Date().toISOString() });
 showToast.success('Cliente registrado');
 }
 }

 onClose();
 if (!editingCliente && onCreatedGoToCuenta) {
 onCreatedGoToCuenta(clienteId);
 }
 } catch (err) {
 showToast.error('Error al guardar', err instanceof Error ? err.message :'Intenta nuevamente.');
 } finally {
 setSaving(false);
 }
 };

 // z-[60]: por encima del Dialog (z-50) de RegistrarTransaccionModal — este
 // formulario puede abrirse anidado sobre ese wizard (paso "Crear cliente
 // nuevo") y debe quedar claramente por encima del overlay del Dialog.
 return (
 <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col p-6 gap-5">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <h3 className="font-extrabold text-base text-foreground">
 {editingCliente ?'Editar Cliente':'Nuevo Cliente'}
 </h3>
 <Button variant="ghost"size="icon"disabled={saving} onClick={onClose} className="h-7 w-7">
 <X size={16} />
 </Button>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-border">
 <button
 type="button"onClick={() => setActiveTab('datos')}
 className={cn("flex-1 py-2 font-bold text-xs flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer",
 activeTab ==='datos'?"border-primary text-primary":"border-transparent text-muted-foreground")}
 >
 <User size={15} /> Datos del Cliente
 </button>
 <button
 type="button"onClick={() => setActiveTab('facturacion')}
 className={cn("flex-1 py-2 font-bold text-xs flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer",
 activeTab ==='facturacion'?"border-primary text-primary":"border-transparent text-muted-foreground")}
 >
 <Receipt size={15} /> Facturación
 </button>
 </div>

 <form onSubmit={handleSubmit} className="flex flex-col gap-4">
 {activeTab ==='datos'? (
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Tipo de Cliente</Label>
 <div className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-xl text-xs font-bold">
 {(['persona_natural','juridico','extranjero','agencia'] as const).map((t) => (
 <button
 key={t}
 type="button"onClick={() => setForm(prev => ({ ...prev, tipo_cliente: t }))}
 className={cn("py-1.5 rounded-lg capitalize transition-all cursor-pointer",
 form.tipo_cliente === t ?"bg-card text-foreground shadow-xs":"text-muted-foreground")}
 >
 {t.replace('_','')}
 </button>
 ))}
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Nombre Completo *</Label>
 <div className="relative">
 <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"required
 placeholder={form.tipo_cliente ==='juridico'?'Ej: Empresa S.A.':'Ej: Juan Pérez'}
 value={form.nombre}
 onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 {errors.nombre && <span className="text-[11px] font-semibold text-destructive">{errors.nombre}</span>}
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Teléfono</Label>
 <div className="relative">
 <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="0991234567"value={form.telefono}
 onChange={(e) => setForm(prev => ({ ...prev, telefono: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 {errors.telefono && <span className="text-[11px] font-semibold text-destructive">{errors.telefono}</span>}
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">
 {form.tipo_cliente ==='extranjero'?'Pasaporte':'Cédula'}
 </Label>
 <div className="relative">
 <IdentificationCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Documento"value={form.dni}
 onChange={(e) => setForm(prev => ({ ...prev, dni: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Correo Electrónico</Label>
 <div className="relative">
 <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="email"placeholder="correo@ejemplo.com"value={form.email}
 onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 {errors.email && <span className="text-[11px] font-semibold text-destructive">{errors.email}</span>}
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Dirección</Label>
 <div className="relative">
 <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Calle principal, sector..."value={form.direccion}
 onChange={(e) => setForm(prev => ({ ...prev, direccion: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-bold">Notas internas</Label>
 <span className="text-[10px] text-muted-foreground">{form.notas.length}/{NOTAS_MAX}</span>
 </div>
 <Textarea
 rows={2}
 maxLength={NOTAS_MAX}
 placeholder="Preferencias, alergias, observaciones..."value={form.notas}
 onChange={(e) => setForm(prev => ({ ...prev, notas: e.target.value }))}
 className="text-xs resize-none"/>
 </div>
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Nombre / Razón Social</Label>
 <div className="relative">
 <Buildings size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Nombre o empresa a facturar"value={form.nombre_factura}
 onChange={(e) => setForm(prev => ({ ...prev, nombre_factura: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Tipo de documento</Label>
 <select
 value={form.tipo_doc}
 onChange={(e) => setForm(prev => ({ ...prev, tipo_doc: e.target.value as any }))}
 className="h-9 px-3 text-xs bg-input/50 border border-transparent rounded-2xl focus:outline-none focus:border-ring font-semibold">
 {TIPO_DOC_OPTIONS.map(opt => (
 <option key={opt.value} value={opt.value}>{opt.label}</option>
 ))}
 </select>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Número de documento</Label>
 <div className="relative">
 <IdentificationCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Número"value={form.numero_doc}
 onChange={(e) => setForm(prev => ({ ...prev, numero_doc: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Dirección fiscal</Label>
 <div className="relative">
 <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Dirección legal / fiscal"value={form.direccion_fiscal}
 onChange={(e) => setForm(prev => ({ ...prev, direccion_fiscal: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Email para facturas</Label>
 <div className="relative">
 <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="email"placeholder="facturacion@empresa.com"value={form.email_factura}
 onChange={(e) => setForm(prev => ({ ...prev, email_factura: e.target.value }))}
 className="pl-9 h-9 text-xs"/>
 </div>
 {errors.email_factura && <span className="text-[11px] font-semibold text-destructive">{errors.email_factura}</span>}
 </div>
 </div>
 )}

 <div className="flex items-center justify-between pt-3 border-t border-border">
 {activeTab ==='facturacion'? (
 <Button
 type="button"variant="ghost"size="sm"disabled={saving}
 onClick={copiarDatosCliente}
 className="text-xs gap-1 text-primary">
 <CopySimple size={14} /> Copiar datos del cliente
 </Button>
 ) : <div />}

 <div className="flex items-center gap-2">
 <Button type="submit"size="sm"disabled={saving} className="text-xs">
 {saving ?'Guardando...': editingCliente ?'Guardar Cambios':'Registrar'}
 </Button>
 </div>
 </div>
 </form>
 </div>
 </div>
 );
}
