import { useLocation, useNavigate } from'react-router-dom';
import { useEffect, useState } from'react';
import { FilterChips } from'../../components/Common/FilterChips';
import { Percent, Plus, X } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { createRxAjusteIva, updateRxAjusteIva } from'../../db/rxdb';
import { useRxAjustesIva } from'../../hooks/useRxAjustesIva';
import AjustesOrganizacion from'./AjustesOrganizacion';
import AjustesImpresion from'./AjustesImpresion';
import AjustesAuditoria from'./AjustesAuditoria';
import AjustesMantenimiento from'./AjustesMantenimiento';
import AjustesMetodosPago from'./AjustesMetodosPago';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { Label } from'@/components/ui/label';

const SECTION_KEYS = ['organizacion','impresion','auditoria','iva','metodos-pago','mantenimiento'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export default function Ajustes() {
 const navigate = useNavigate();
 const location = useLocation();
 const sectionFromPath = (() => {
 const match = location.pathname.match(/^\/ajustes\/(organizacion|impresion|auditoria|iva|metodos-pago|mantenimiento)$/);
 return (match?.[1] ||'organizacion') as SectionKey;
 })();
 const activeSection = sectionFromPath;
 const goToSection = (section: SectionKey) => {
 navigate(`/ajustes/${section}`);
 };

 const { ajustesIva } = useRxAjustesIva();

 const [modalOpen, setModalOpen] = useState(false);
 const [nuevoPorcentaje, setNuevoPorcentaje] = useState<number>(15);
 const [nuevoPreciosConIva, setNuevoPreciosConIva] = useState<boolean>(false);
 const [creating, setCreating] = useState(false);

 useEffect(() => {
 if (location.pathname ==='/ajustes') {
 navigate('/ajustes/organizacion', { replace: true });
 }
 }, [location.pathname, navigate]);

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

 showToast.success('Tasa de IVA creada');
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
 showToast.success('Tasa de IVA activada');
 } catch (err) {
 console.error(err);
 showToast.error('Error al activar IVA');
 }
 };

 return (
 <div className="h-full w-full overflow-y-auto bg-background flex flex-col">
 <header className="p-4 border-b border-border bg-card sticky top-0 z-10">
 <FilterChips
 value={activeSection}
 onChange={(val) => goToSection(val as any)}
 options={[
 { value:'organizacion', label:'Organización'},
 { value:'impresion', label:'Impresión'},
 { value:'auditoria', label:'Auditoría'},
 { value:'iva', label:'IVA'},
 { value:'metodos-pago', label:'Métodos de pago'},
 { value:'mantenimiento', label:'Mantenimiento'},
 ]}
 scrollable
 />
 </header>

 <main className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
 {activeSection ==='organizacion'&& <AjustesOrganizacion />}
 {activeSection ==='impresion'&& <AjustesImpresion />}
 {activeSection ==='auditoria'&& <AjustesAuditoria />}
 {activeSection ==='iva'&& (
 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
 <Percent size={20} weight="bold"/>
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">Configuración de IVA</h3>
 <p className="text-xs text-muted-foreground">Administra las tasas de IVA de tu negocio.</p>
 </div>
 </div>
 <button
 type="button"onClick={() => setModalOpen(true)}
 className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs">
 <Plus size={16} weight="bold"/> Nueva Tasa
 </button>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
 {ajustesIva.map((item) => (
 <div
 key={item.id}
 className={`p-4 rounded-xl border flex items-center justify-between ${
 item.activo ?'bg-primary/10 border-primary':'bg-card border-border'}`}
 >
 <div className="flex flex-col">
 <span className="font-black text-xl text-foreground">{item.porcentaje}%</span>
 <span className="text-[10px] text-muted-foreground font-semibold">
 {item.precios_con_iva ?'Incluido en precios':'Suma al subtotal'}
 </span>
 </div>
 {!item.activo && (
 <button
 type="button"onClick={() => handleActivarIva(item.id)}
 className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs">
 Activar
 </button>
 )}
 </div>
 ))}
 </div>
 </div>
 )}
 {activeSection ==='metodos-pago'&& <AjustesMetodosPago />}
 {activeSection ==='mantenimiento'&& <AjustesMantenimiento />}
 </main>

 {modalOpen && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <h3 className="font-extrabold text-base text-foreground">Nueva Tasa de IVA</h3>
 <button type="button"onClick={() => setModalOpen(false)} className="text-muted-foreground">
 <X size={16} />
 </button>
 </div>

 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Porcentaje (%)</Label>
 <Input
 type="number"value={nuevoPorcentaje}
 onChange={(e) => setNuevoPorcentaje(parseFloat(e.target.value) || 0)}
 className="h-9 text-xs font-bold"/>
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
 <Button variant="outline"size="sm"onClick={() => setModalOpen(false)}>Cancelar</Button>
 <Button size="sm"onClick={handleCrearIva} disabled={creating}>
 Crear Tasa
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
