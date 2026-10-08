import { useState } from'react';
import dayjs from'dayjs';
import { Percent, Plus, Trash, Check, PencilSimple, CalendarBlank } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { createRxAjusteIva, updateRxAjusteIva } from'../../db/rxdb';
import { useRxAjustesIva } from'../../hooks/useRxAjustesIva';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { Switch } from'@/components/ui/switch';
import { DatePickerField } from'@/components/ui/date-picker-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from'@/components/ui/dialog';

// Ajustes → IVA: tasas de la organización, cuál está activa y las temporales (feriados).
export default function AjustesIva() {
 const { ajustesIva } = useRxAjustesIva();

 const [modalOpen, setModalOpen] = useState(false);
 const [nuevoPorcentaje, setNuevoPorcentaje] = useState<number>(15);
 const [nuevoPreciosConIva, setNuevoPreciosConIva] = useState<boolean>(false);
 const [creating, setCreating] = useState(false);
 // Edición de una tasa existente + vigencia temporal (feriados): solo genera avisos.
 const [editingId, setEditingId] = useState<string | null>(null);
 const [esTemporal, setEsTemporal] = useState(false);
 const [vigenteDesde, setVigenteDesde] = useState('');
 const [vigenteHasta, setVigenteHasta] = useState('');

 const resetModal = () => {
 setModalOpen(false);
 setEditingId(null);
 setNuevoPorcentaje(15);
 setNuevoPreciosConIva(false);
 setEsTemporal(false);
 setVigenteDesde('');
 setVigenteHasta('');
 };

 const abrirEdicion = (item: any) => {
 setEditingId(item.id);
 setNuevoPorcentaje(item.porcentaje);
 setNuevoPreciosConIva(!!item.precios_con_iva);
 const temporal = !!(item.vigente_desde && item.vigente_hasta);
 setEsTemporal(temporal);
 setVigenteDesde(item.vigente_desde ||'');
 setVigenteHasta(item.vigente_hasta ||'');
 setModalOpen(true);
 };

 const handleGuardarIva = async () => {
 if (esTemporal) {
 if (!vigenteDesde || !vigenteHasta) {
 showToast.error('Faltan fechas','Indica desde y hasta cuándo rige la tasa temporal.');
 return;
 }
 if (vigenteHasta < vigenteDesde) {
 showToast.error('Fechas inválidas','La fecha final no puede ser anterior a la inicial.');
 return;
 }
 }
 setCreating(true);
 try {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 if (!orgId) {
 showToast.error('Sin organización','Por favor vincula una organización primero.');
 return;
 }

 if (editingId) {
 await updateRxAjusteIva(editingId, {
 porcentaje: Number(nuevoPorcentaje),
 precios_con_iva: nuevoPreciosConIva,
 vigente_desde: esTemporal ? vigenteDesde : null,
 vigente_hasta: esTemporal ? vigenteHasta : null,
 });
 showToast.success('Tasa de IVA actualizada');
 } else {
 const existentes = ajustesIva.length === 0;
 await createRxAjusteIva({
 id: crypto.randomUUID(),
 organization_id: orgId,
 porcentaje: Number(nuevoPorcentaje),
 precios_con_iva: nuevoPreciosConIva,
 activo: existentes,
 // Solo se envían si es temporal: una tasa normal no depende de las columnas nuevas.
 ...(esTemporal ? { vigente_desde: vigenteDesde, vigente_hasta: vigenteHasta } : {}),
 });
 showToast.success('Tasa de IVA creada','Se añadió a la lista de opciones.');
 }
 resetModal();
 } catch (err) {
 console.error(err);
 showToast.error(editingId ?'Error al actualizar IVA':'Error al crear IVA');
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
 <>
 <div className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col gap-6">
 <div className="flex items-center justify-between gap-4">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center font-bold">
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
 type="button"onClick={() => { resetModal(); setModalOpen(true); }}
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
 <span className="px-2 py-0.5 rounded-md bg-primary text-white font-bold text-[10px] flex items-center gap-1">
 <Check size={10} weight="bold"/> Activo
 </span>
 )}
 </div>
 <span className="text-xs font-medium text-muted-foreground">
 {item.precios_con_iva ?'Precios incluyen IVA':'IVA se suma al total'}
 </span>
 {item.vigente_desde && item.vigente_hasta && (
 <span className="flex items-center gap-1 text-[11px] font-bold text-warning-foreground">
 <CalendarBlank size={12} weight="bold"/>
 Temporal: {dayjs(item.vigente_desde).format('D MMM')} – {dayjs(item.vigente_hasta).format('D MMM YYYY')}
 </span>
 )}
 </div>

 <div className="flex items-center gap-1">
 <button
 type="button"title="Editar"onClick={() => abrirEdicion(item)}
 className="w-8 h-8 rounded-lg text-muted-foreground flex items-center justify-center cursor-pointer transition-colors hover:text-foreground">
 <PencilSimple size={16} />
 </button>
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
 <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) resetModal(); }}>
 <DialogContent className="max-w-sm gap-5">
 <DialogHeader>
 <DialogTitle>{editingId ?'Editar tasa de IVA':'Nueva tasa de IVA'}</DialogTitle>
 <DialogDescription className="sr-only">Porcentaje de IVA y vigencia de la tasa</DialogDescription>
 </DialogHeader>

 <div className="flex flex-col gap-4">
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs font-bold">Porcentaje de IVA</Label>
 <Input
 type="number"placeholder="Ej. 15"value={nuevoPorcentaje}
 onChange={(e) => setNuevoPorcentaje(Number(e.target.value))}
 className="h-10 text-sm font-semibold"/>
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
 <div className="flex flex-col gap-3 pt-3 border-t border-border">
 <div className="flex items-center gap-3">
 <Switch id="esTemporal"checked={esTemporal} onCheckedChange={setEsTemporal} />
 <div className="flex flex-col">
 <Label htmlFor="esTemporal"className="text-xs font-bold cursor-pointer">Tasa temporal (feriados)</Label>
 <span className="text-[11px] text-muted-foreground">Avisa al personal cuándo cambiar el IVA. No se activa sola.</span>
 </div>
 </div>
 {esTemporal && (
 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs font-bold">Desde</Label>
 <DatePickerField value={vigenteDesde} onChange={setVigenteDesde} className="h-10 bg-card border-border" />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs font-bold">Hasta</Label>
 <DatePickerField value={vigenteHasta} onChange={setVigenteHasta} className="h-10 bg-card border-border" />
 </div>
 </div>
 )}
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
 <Button variant="outline" onClick={resetModal} className="font-bold">Cancelar</Button>
 <Button disabled={creating} onClick={handleGuardarIva} className="font-bold">
 {creating ?'Guardando...': editingId ?'Guardar':'Crear tasa'}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 </>
 );
}
