import { useState } from'react';
import { Percent, Plus, Trash, Check, X } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { createRxAjusteIva, updateRxAjusteIva } from'../db/rxdb';
import { useRxAjustesIva } from'../hooks/useRxAjustesIva';
import AjustesOrganizacion from './Ajustes/AjustesOrganizacion';
import AjustesImpresion from './Ajustes/AjustesImpresion';
import AjustesAuditoria from './Ajustes/AjustesAuditoria';
import AjustesMantenimiento from './Ajustes/AjustesMantenimiento';
import AjustesMetodosPago from './Ajustes/AjustesMetodosPago';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const SECTION_KEYS = ['organizacion', 'metodos-pago', 'impresion', 'auditoria', 'iva', 'mantenimiento'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTIONS = [
  { value: 'organizacion', label: 'Organización' },
  { value: 'metodos-pago', label: 'Métodos de Pago' },
  { value: 'impresion', label: 'Impresión' },
  { value: 'auditoria', label: 'Auditoría' },
  { value: 'iva', label: 'IVA' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
] as const;

export default function AjustesV2() {
 const [activeSection, setActiveSection] = useState<SectionKey>('organizacion');
 const { ajustesIva } = useRxAjustesIva();

 const [modalOpen, setModalOpen] = useState(false);
 const [nuevoPorcentaje, setNuevoPorcentaje] = useState<number>(15);
 const [nuevoPreciosConIva, setNuevoPreciosConIva] = useState<boolean>(false);
 const [creating, setCreating] = useState(false);

 const goToSection = (section: SectionKey) => {
 setActiveSection(section);
 if (typeof window !=='undefined'&& window.history) {
 window.history.pushState(null,'',`/v2/ajustes/${section}`);
 }
 };

 const handleCrearIva = async () => {
 setCreating(true);
 try {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 if (!orgId) {
 showToast.error('Sin organización','Por favor vincula una organización primero.');
 return;
 }

 const existentes = ajustesIva.length === 0;

 await createRxAjusteIva({
 id: crypto.randomUUID(),
 organization_id: orgId,
 porcentaje: Number(nuevoPorcentaje),
 precios_con_iva: nuevoPreciosConIva,
 activo: existentes,
 });

 showToast.success('Tasa de IVA creada','Se añadió a la lista de opciones.');
 setModalOpen(false);
 setNuevoPorcentaje(15);
 setNuevoPreciosConIva(false);
 } catch (err) {
 console.error(err);
 showToast.error('Error al crear IVA');
 } finally {
 setCreating(false);
 }
 };

 const handleActivarIva = async (ivaId: string) => {
 try {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 if (!orgId) return;

 const activos = ajustesIva.filter(item => item.activo);
 for (const item of activos) {
 await updateRxAjusteIva(item.id, { activo: false });
 }

 await updateRxAjusteIva(ivaId, { activo: true });
 showToast.success('Tasa de IVA activada','La tasa seleccionada ya se aplica en las comandas.');
 } catch (err) {
 console.error(err);
 showToast.error('Error al activar IVA');
 }
 };

 const handleEliminarIva = async (ivaId: string, isActive: boolean) => {
 if (isActive) {
 showToast.error('No permitido','No puedes eliminar la tasa de IVA que está activa actualmente.');
 return;
 }
 try {
 await updateRxAjusteIva(ivaId, { _deleted: true });
 showToast.success('Tasa de IVA eliminada');
 } catch (err) {
 console.error(err);
 showToast.error('Error al eliminar IVA');
 }
 };

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
 {/* Header Chips */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center shrink-0 shadow-xs">
 <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
 {SECTIONS.map((sec) => (
 <button
 key={sec.value}
 type="button"onClick={() => goToSection(sec.value)}
 className={cn("px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border",
 activeSection === sec.value
 ?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 {sec.label}
 </button>
 ))}
 </div>
 </header>

 {/* Main Content */}
 <main className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
 {activeSection ==='organizacion'&& <AjustesOrganizacion />}
 {activeSection === 'metodos-pago' && <AjustesMetodosPago />}
 {activeSection ==='impresion'&& <AjustesImpresion />}
 {activeSection ==='auditoria'&& <AjustesAuditoria />}
 {activeSection ==='mantenimiento'&& <AjustesMantenimiento />}
 {activeSection ==='iva'&& (
 <div className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col gap-6">
 <div className="flex items-center justify-between gap-4">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
 <Percent size={24} weight="bold"/>
 </div>
 <div>
 <h2 className="font-extrabold text-base text-foreground">Configuración de IVA</h2>
 <p className="text-xs text-muted-foreground">
 Administra las diferentes tasas de IVA y activa la correspondiente para tus ventas.
 </p>
 </div>
 </div>

 <button
 type="button"onClick={() => setModalOpen(true)}
 className="h-9 px-4 rounded-lg bg-primary active:scale-95 text-primary-foreground font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer">
 <Plus size={16} weight="bold"/> Nueva Tasa
 </button>
 </div>

 <div className="w-full h-[1px] bg-border"/>

 {ajustesIva.length === 0 ? (
 <div className="py-12 text-center text-xs text-muted-foreground">
 No hay tasas de IVA configuradas todavía. Crea una para empezar.
 </div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {ajustesIva.map((item) => (
 <div
 key={item.id}
 className={cn("p-4 rounded-xl border transition-all flex items-start justify-between",
 item.activo
 ?"border-primary bg-primary/5 shadow-xs":"border-border bg-card")}
 >
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <span className="font-black text-2xl text-foreground">{item.porcentaje}%</span>
 {item.activo && (
 <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1">
 <Check size={10} weight="bold"/> Activo
 </span>
 )}
 </div>
 <span className="text-xs font-medium text-muted-foreground">
 {item.precios_con_iva ?'Precios incluyen IVA':'IVA se suma al total'}
 </span>
 </div>

 <div className="flex items-center gap-1">
 {!item.activo && (
 <button
 type="button"onClick={() => handleActivarIva(item.id)}
 className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs transition-colors cursor-pointer">
 Activar
 </button>
 )}
 {!item.activo && (
 <button
 type="button"onClick={() => handleEliminarIva(item.id, item.activo)}
 className="w-8 h-8 rounded-lg text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <Trash size={16} />
 </button>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </main>

 {/* Modal para Crear IVA */}
 {modalOpen && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 gap-5">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <h3 className="font-extrabold text-base text-foreground">Nueva Tasa de IVA</h3>
 <button
 type="button"onClick={() => setModalOpen(false)}
 className="w-7 h-7 rounded-lg text-muted-foreground flex items-center justify-center cursor-pointer">
 <X size={16} />
 </button>
 </div>

 <div className="flex flex-col gap-4">
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs font-bold">Porcentaje de IVA</Label>
 <Input
 type="number"placeholder="Ej. 15"value={nuevoPorcentaje}
 onChange={(e) => setNuevoPorcentaje(Number(e.target.value))}
 className="h-9 text-sm"/>
 </div>

 <div className="flex items-center gap-3">
 <Switch
 id="preciosConIva"checked={nuevoPreciosConIva}
 onCheckedChange={setNuevoPreciosConIva}
 />
 <div className="flex flex-col">
 <Label htmlFor="preciosConIva"className="text-xs font-bold cursor-pointer">Precios con IVA incluido</Label>
 <span className="text-[11px] text-muted-foreground">Activa si los precios del menú ya contienen este porcentaje.</span>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
 <Button variant="outline"size="sm"onClick={() => setModalOpen(false)}>Cancelar</Button>
 <Button size="sm"disabled={creating} onClick={handleCrearIva}>
 {creating ?'Creando...':'Crear Tasa'}
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
