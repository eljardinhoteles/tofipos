import { useEffect, useState } from'react';
import {
 Phone, Envelope, IdentificationCard, MapPin,
 Buildings, CopySimple, User, UserPlus
} from'@phosphor-icons/react';
import { type Cliente } from'../../db/database';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb, createRxCliente, updateRxCliente } from'../../db/rxdb';
import { ReservaHeader } from'../Mesas/Sidebar/ReservaHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from'@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from'@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from'@/components/ui/select';
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

 // Nunca se pisa a otro cliente: un documento ya registrado, o un nombre repetido sin
 // documento para distinguirlos, se rechazan antes de guardar. Dos personas con el
 // mismo nombre sí pueden existir si tienen documentos distintos.
 const rxDb = await initVerticalRxDb();
 const existentes = (await rxDb.clientes.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).exec())
 .map((d: any) => d.toJSON())
 .filter((c: any) => c.id !== editingCliente?.id);
 const norm = (t?: string | null) => (t ?? '').replace(/\s+/g, '').toLowerCase();
 const docsNuevos = [norm(form.dni), norm(form.numero_doc)].filter(Boolean);
 const duplicadoDoc = existentes.find((c: any) =>
 docsNuevos.some(d => d === norm(c.dni) || d === norm(c.numero_doc)));
 if (duplicadoDoc) {
 showToast.error('Documento ya registrado', `Ese documento ya pertenece a ${duplicadoDoc.nombre}.`);
 return;
 }
 const mismoNombre = existentes.find((c: any) => (c.nombre ?? '').trim().toLowerCase() === form.nombre.trim().toLowerCase());
 const cambioNombre = !editingCliente || (editingCliente.nombre ?? '').trim().toLowerCase() !== form.nombre.trim().toLowerCase();
 if (mismoNombre && docsNuevos.length === 0 && cambioNombre) {
 showToast.error('Ya existe un cliente con ese nombre', 'Agrega su cédula o pasaporte para distinguirlos.');
 return;
 }

 if (editingCliente) {
 clienteId = editingCliente.id;
 await updateRxCliente(editingCliente.id, payload);
 showToast.success('Cliente actualizado');
 } else {
 clienteId = crypto.randomUUID();
 await createRxCliente({ id: clienteId, ...payload, created_at: new Date().toISOString() });
 showToast.success('Cliente registrado');
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

 const campoIcono = 'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground';
 const etiqueta = 'text-xs font-bold';
 const campo = 'pl-9 h-11 text-base md:h-10 md:text-sm font-semibold';
 const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));
 const error = (k: string) => errors[k] && <span className="text-[11px] font-semibold text-destructive">{errors[k]}</span>;

 const cabecera = (
 <ReservaHeader tono="primary" badge={editingCliente ? <User size={22} weight="bold" /> : <UserPlus size={22} weight="bold" />}
 titulo={editingCliente ?'Editar cliente':'Nuevo cliente'}
 subtitulo={form.nombre.trim() || (editingCliente ?'Sin nombre':'Datos del cliente')}
 onClose={onClose} />
 );
 const formulario = (
 <>

 <form id="cliente-form" onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
 <div className="px-4 pt-4 shrink-0">
 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as'datos'|'facturacion')}>
 <TabsList aria-label="Sección del cliente">
 <TabsTrigger value="datos">Datos</TabsTrigger>
 <TabsTrigger value="facturacion">Facturación</TabsTrigger>
 </TabsList>
 </Tabs>
 </div>

 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
 {activeTab ==='datos'? (
 <>
 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cliente</h4>
 <Tabs value={form.tipo_cliente} onValueChange={(v) => set('tipo_cliente', v)}>
 <TabsList aria-label="Tipo de cliente">
 <TabsTrigger value="persona_natural">Persona</TabsTrigger>
 <TabsTrigger value="juridico">Empresa</TabsTrigger>
 <TabsTrigger value="extranjero">Extranjero</TabsTrigger>
 <TabsTrigger value="agencia">Agencia</TabsTrigger>
 </TabsList>
 </Tabs>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-nombre" className={etiqueta}>Nombre completo *</Label>
 <div className="relative">
 <User size={16} className={campoIcono} />
 <Input id="cli-nombre" type="text" required
 placeholder={form.tipo_cliente ==='juridico'?'Ej: Empresa S.A.':'Ej: Juan Pérez'}
 value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className={campo} />
 </div>
 {error('nombre')}
 </div>
 </section>

 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Contacto</h4>
 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-tel" className={etiqueta}>Teléfono</Label>
 <div className="relative">
 <Phone size={16} className={campoIcono} />
 <Input id="cli-tel" type="text" placeholder="0991234567" value={form.telefono}
 onChange={(e) => set('telefono', e.target.value)} className={campo} />
 </div>
 {error('telefono')}
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-dni" className={etiqueta}>{form.tipo_cliente ==='extranjero'?'Pasaporte':'Cédula'}</Label>
 <div className="relative">
 <IdentificationCard size={16} className={campoIcono} />
 <Input id="cli-dni" type="text" placeholder="Documento" value={form.dni}
 onChange={(e) => set('dni', e.target.value)} className={campo} />
 </div>
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-email" className={etiqueta}>Correo electrónico</Label>
 <div className="relative">
 <Envelope size={16} className={campoIcono} />
 <Input id="cli-email" type="email" placeholder="correo@ejemplo.com" value={form.email}
 onChange={(e) => set('email', e.target.value)} className={campo} />
 </div>
 {error('email')}
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-dir" className={etiqueta}>Dirección</Label>
 <div className="relative">
 <MapPin size={16} className={campoIcono} />
 <Input id="cli-dir" type="text" placeholder="Calle principal, sector..." value={form.direccion}
 onChange={(e) => set('direccion', e.target.value)} className={campo} />
 </div>
 </div>
 </section>

 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Notas</h4>
 <div className="flex flex-col gap-1.5">
 <div className="flex items-center justify-between">
 <Label htmlFor="cli-notas" className={etiqueta}>Notas internas</Label>
 <span className="text-[10px] text-muted-foreground">{form.notas.length}/{NOTAS_MAX}</span>
 </div>
 <Textarea id="cli-notas" rows={3} maxLength={NOTAS_MAX}
 placeholder="Preferencias, alergias, observaciones..." value={form.notas}
 onChange={(e) => set('notas', e.target.value)} className="min-h-24 text-base md:text-sm font-medium resize-none" />
 </div>
 </section>
 </>
 ) : (
 <section className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Datos de factura</h4>
 <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={copiarDatosCliente} className="gap-1 text-xs">
 <CopySimple size={14} /> Copiar del cliente
 </Button>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-nf" className={etiqueta}>Nombre / razón social</Label>
 <div className="relative">
 <Buildings size={16} className={campoIcono} />
 <Input id="cli-nf" type="text" placeholder="Nombre o empresa a facturar" value={form.nombre_factura}
 onChange={(e) => set('nombre_factura', e.target.value)} className={campo} />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1.5">
 <Label className={etiqueta}>Tipo de documento</Label>
 <Select value={form.tipo_doc} onValueChange={(v) => set('tipo_doc', v)}>
 <SelectTrigger className="h-11 md:h-10 w-full px-3 text-base md:text-sm font-semibold rounded-2xl bg-card border-border shadow-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {TIPO_DOC_OPTIONS.map(opt => (
 <SelectItem key={opt.value} value={opt.value} className="text-sm">{opt.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-nd" className={etiqueta}>Número</Label>
 <div className="relative">
 <IdentificationCard size={16} className={campoIcono} />
 <Input id="cli-nd" type="text" placeholder="Número" value={form.numero_doc}
 onChange={(e) => set('numero_doc', e.target.value)} className={campo} />
 </div>
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-df" className={etiqueta}>Dirección fiscal</Label>
 <div className="relative">
 <MapPin size={16} className={campoIcono} />
 <Input id="cli-df" type="text" placeholder="Dirección legal / fiscal" value={form.direccion_fiscal}
 onChange={(e) => set('direccion_fiscal', e.target.value)} className={campo} />
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cli-ef" className={etiqueta}>Email para facturas</Label>
 <div className="relative">
 <Envelope size={16} className={campoIcono} />
 <Input id="cli-ef" type="email" placeholder="facturacion@empresa.com" value={form.email_factura}
 onChange={(e) => set('email_factura', e.target.value)} className={campo} />
 </div>
 {error('email_factura')}
 </div>
 </section>
 )}
 </div>

 <footer className="p-4 border-t border-border bg-card flex items-center gap-2 shrink-0">
 <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-12 px-5 font-bold">
 Cancelar
 </Button>
 <Button type="submit" disabled={saving} className="h-12 flex-1 font-bold">
 {saving ?'Guardando…': editingCliente ?'Guardar cambios':'Registrar cliente'}
 </Button>
 </footer>
 </form>

 </>
 );

 return (
 <Sheet open={opened} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
 <SheetContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()} className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
 <SheetHeader className="p-0 gap-0 space-y-0">
 <SheetTitle className="sr-only">{editingCliente ?'Editar cliente':'Nuevo cliente'}</SheetTitle>
 <SheetDescription className="sr-only">Datos de contacto y facturación del cliente</SheetDescription>
 {cabecera}
 </SheetHeader>
 {formulario}
 </SheetContent>
 </Sheet>
 );
}
