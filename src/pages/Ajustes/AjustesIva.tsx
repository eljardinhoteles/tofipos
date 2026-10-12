import { useState } from'react';
import dayjs from'dayjs';
import { Percent, Plus, Trash, PencilSimple, CalendarBlank } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { createRxAjusteIva, updateRxAjusteIva } from'../../db/rxdb';
import { useRxAjustesIva } from'../../hooks/useRxAjustesIva';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { CheckRedondo } from '../../components/Common/CheckRedondo';
import { DatePickerField } from'@/components/ui/date-picker-field';
import { EstadoBadge } from '../../components/Common/EstadoBadge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from'@/components/ui/sheet';
import { ReservaHeader } from'../../components/Mesas/Sidebar/ReservaHeader';
import { Fila, Grupo, Seccion, TITULO_SECCION, Vacio } from'../../components/Ajustes/AjustesUI';

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

  const titulo = TITULO_SECCION;
  const etiquetaSwitch = 't-fila text-foreground cursor-pointer';

  return (
    <>
      <Seccion
        titulo="IVA"
        descripcion="Tasas de la organización: activa la que se aplica a las ventas. Las temporales (feriados) solo generan avisos."
        accion={
          <Button type="button" onClick={() => { resetModal(); setModalOpen(true); }} className="h-12 gap-1.5 px-5">
            <Plus size={18} weight="bold" /> Nueva tasa
          </Button>
        }
      >
        <Grupo>
          {ajustesIva.length === 0 ? (
            <Vacio>No hay tasas de IVA configuradas todavía. Crea una para empezar.</Vacio>
          ) : ajustesIva.map((item) => (
            <Fila
              key={item.id}
              titulo={
                <span className="flex items-center gap-2">
                  <span className="t-valor tabular-nums">{item.porcentaje}%</span>
                  {item.activo && <EstadoBadge tono="success">Activa</EstadoBadge>}
                </span>
              }
              ayuda={
                <>
                  {item.precios_con_iva ? 'Los precios incluyen IVA' : 'El IVA se suma al total'}
                  {item.vigente_desde && item.vigente_hasta && (
                    <span className="mt-0.5 flex items-center gap-1 t-cuerpo-fuerte text-warning-foreground">
                      <CalendarBlank size={12} weight="bold" />
                      Temporal: {dayjs(item.vigente_desde).format('D MMM')} – {dayjs(item.vigente_hasta).format('D MMM YYYY')}
                    </span>
                  )}
                </>
              }
            >
              {!item.activo && <Button type="button" variant="outline" onClick={() => handleActivarIva(item.id)} className="h-11">Activar</Button>}
              <Button type="button" variant="ghost" size="icon" title="Editar" aria-label="Editar tasa" onClick={() => abrirEdicion(item)} className="size-11 text-muted-foreground touch-manipulation">
                <PencilSimple size={18} />
              </Button>
              {!item.activo && (
                <Button type="button" variant="ghost" size="icon" title="Eliminar" aria-label="Eliminar tasa" onClick={() => handleEliminarIva(item.id, item.activo)}
                  className="size-11 text-muted-foreground hover:text-destructive touch-manipulation">
                  <Trash size={18} />
                </Button>
              )}
            </Fila>
          ))}
        </Grupo>
      </Seccion>

      <Sheet open={modalOpen} onOpenChange={(open) => { if (!open) resetModal(); }}>
        <SheetContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
          <SheetHeader className="p-0 gap-0 space-y-0">
            <SheetTitle className="sr-only">{editingId ? 'Editar tasa de IVA' : 'Nueva tasa de IVA'}</SheetTitle>
            <SheetDescription className="sr-only">Porcentaje de IVA y vigencia de la tasa</SheetDescription>
            <ReservaHeader tono="neutro" badge={<Percent size={20} weight="bold" />} titulo={editingId ? 'Editar tasa' : 'Nueva tasa'} subtitulo="IVA" onClose={resetModal} />
          </SheetHeader>

          <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="iva-porcentaje" className={titulo}>Porcentaje de IVA</Label>
              <Input id="iva-porcentaje" type="number" placeholder="Ej. 15" value={nuevoPorcentaje} onChange={(e) => setNuevoPorcentaje(Number(e.target.value))} className="h-12 t-fila" />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <Label htmlFor="preciosConIva" className={etiquetaSwitch}>Precios con IVA incluido</Label>
                <span className="t-meta text-muted-foreground">Activa si los precios del menú ya contienen este porcentaje.</span>
              </div>
              <CheckRedondo id="preciosConIva" aria-label="Precios con IVA incluido" checked={nuevoPreciosConIva} onCheckedChange={setNuevoPreciosConIva} />
            </div>

            <div className="flex flex-col gap-4 pt-6 border-t border-border">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <Label htmlFor="esTemporal" className={etiquetaSwitch}>Tasa temporal (feriados)</Label>
                  <span className="t-meta text-muted-foreground">Avisa al personal cuándo cambiar el IVA. No se activa sola.</span>
                </div>
                <CheckRedondo id="esTemporal" aria-label="Tasa temporal" checked={esTemporal} onCheckedChange={setEsTemporal} />
              </div>
              {esTemporal && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label className={titulo}>Desde</Label>
                    <DatePickerField value={vigenteDesde} onChange={setVigenteDesde} className="h-12 bg-card border-border" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className={titulo}>Hasta</Label>
                    <DatePickerField value={vigenteHasta} onChange={setVigenteHasta} className="h-12 bg-card border-border" />
                  </div>
                </div>
              )}
            </div>
          </main>

          <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={resetModal} className="h-12 px-5">Cancelar</Button>
            <Button disabled={creating} onClick={handleGuardarIva} className="h-12 flex-1">
              {creating ? 'Guardando...' : editingId ? 'Guardar' : 'Crear tasa'}
            </Button>
          </footer>
        </SheetContent>
      </Sheet>
    </>
  );
}
