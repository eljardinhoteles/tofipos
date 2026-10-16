import { useEffect, useState } from'react';
import { X, Plus, Trash, Sparkle, ForkKnife } from'@phosphor-icons/react';
import { type ModifierGroup } from'../../db/database';
import { useUI } from'../../context/UIContext';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb, createRxCategoria, createRxMenuItem, updateRxMenuItem } from'../../db/rxdb';
import { useRxMenuCatalog } from'../../hooks/useRxMenuCatalog';
import { MODIFIER_TEMPLATES } from'@/lib/modifierTemplates';
import { obtenerIvaProducto, calcularPreciosItem } from'../../lib/taxUtils';
import { useIvaActivo } from'../../hooks/useIvaActivo';
import { ReservaHeader } from'../Mesas/Sidebar/ReservaHeader';
import { CheckRedondo } from'../Common/CheckRedondo';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Casilla } from'../Common/Casilla';
import { Button } from'@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CsvUploader } from '@/components/Menu/CsvUploader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function SidebarMenuProduct() {
 const { selectedMenuProductId, setMenuView, setSelectedMenuProductId, openConfirm } = useUI();
 const [editingProduct, setEditingProduct] = useState<any>(null);
 const { categorias: dbCategorias } = useRxMenuCatalog();

 const [nombre, setNombre] = useState('');
 const [precio, setPrecio] = useState<number>(0);
 const [categoria, setCategoria] = useState('');
 const [modificadores, setModificadores] = useState<ModifierGroup[]>([]);
 const [activo, setActivo] = useState(true);
 const [esBebida, setEsBebida] = useState(false);
 const [precioVariable, setPrecioVariable] = useState(false);
 const [ivaModalidad, setIvaModalidad] = useState<'sistema'|'especifico'|'exento'>('sistema');
 const [ivaPorcentaje, setIvaPorcentaje] = useState(15);
 const { porcentaje: ivaSistema, preciosConIva } = useIvaActivo();
 const [nombreError, setNombreError] = useState('');
 const [isNuevaCategoria, setIsNuevaCategoria] = useState(false);

 useEffect(() => {
 let alive = true;
 let productSub: { unsubscribe: () => void } | null = null;

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 if (selectedMenuProductId) {
 productSub = rxDb.menu_items.findOne(selectedMenuProductId).$.subscribe((doc: any) => {
 if (!alive) return;
 setEditingProduct(doc ? doc.toJSON() : null);
 });
 } else {
 setEditingProduct(null);
 }
 })().catch(() => {});

 return () => {
 alive = false;
 productSub?.unsubscribe();
 };
 }, [selectedMenuProductId]);

 useEffect(() => {
 if (editingProduct) {
 setNombre(editingProduct.nombre ||'');
 setPrecio(editingProduct.precio || 0);
 setCategoria(editingProduct.categoria_nombre ||'');
 setModificadores(editingProduct.modificadores || []);
 setActivo(editingProduct.activo ?? true);
 setEsBebida(editingProduct.es_bebida || false);
 setPrecioVariable(editingProduct.precio_variable || false);
 setIvaModalidad(editingProduct.iva_modalidad ||'sistema');
 setIvaPorcentaje(editingProduct.iva_porcentaje !== undefined ? editingProduct.iva_porcentaje : 15);
 } else {
 setNombre('');
 setPrecio(0);
 setCategoria('');
 setModificadores([]);
 setActivo(true);
 setEsBebida(false);
 setPrecioVariable(false);
 setIvaModalidad('sistema');
 setIvaPorcentaje(15);
 }
 }, [editingProduct?.id]);

 const addModifierGroup = () => {
 setModificadores(prev => [
 ...prev,
 { id: crypto.randomUUID(), nombre:'', obligatorio: false, multi: false, opciones: [] },
 ]);
 };

 // Aplica una plantilla predefinida (Papa: Frita/Dorada, etc.) como grupo
 // completo con un clic — el producto que no la necesita simplemente no la
 // agrega, no afecta a nadie más. Si el grupo ya existe (mismo nombre,
 // sin distinguir mayúsculas) se ignora en vez de duplicarlo.
 const applyModifierTemplate = (template: (typeof MODIFIER_TEMPLATES)[number]) => {
 const yaExiste = modificadores.some(g => g.nombre.trim().toLowerCase() === template.nombre.toLowerCase());
 if (yaExiste) {
 showToast.error(`"${template.nombre}"ya fue añadido a este producto`);
 return;
 }
 setModificadores(prev => [
 ...prev,
 { id: crypto.randomUUID(), nombre: template.nombre, obligatorio: template.obligatorio, multi: template.multi, opciones: [...template.opciones] },
 ]);
 };

 const removeModifierGroup = (groupId: string) => {
 setModificadores(prev => prev.filter(g => g.id !== groupId));
 };

 const updateModifierGroup = (groupId: string, patch: Partial<ModifierGroup>) => {
 setModificadores(prev => prev.map(g => g.id === groupId ? { ...g, ...patch } : g));
 };

 const addOption = (groupId: string) => {
 setModificadores(prev => prev.map(g =>
 g.id === groupId ? { ...g, opciones: [...g.opciones,''] } : g
 ));
 };

 const updateOption = (groupId: string, index: number, value: string) => {
 setModificadores(prev => prev.map(g =>
 g.id === groupId
 ? { ...g, opciones: g.opciones.map((op, i) => i === index ? value : op) }
 : g
 ));
 };

 const removeOption = (groupId: string, index: number) => {
 setModificadores(prev => prev.map(g =>
 g.id === groupId
 ? { ...g, opciones: g.opciones.filter((_, i) => i !== index) }
 : g
 ));
 };

 const handleSubmit = async () => {
 if (nombre.trim().length < 2) {
 setNombreError('Nombre muy corto');
 return;
 }
 setNombreError('');

 // Descarta grupos sin nombre o sin opciones válidas al guardar
 const modificadoresValidos = modificadores
 .map(g => ({ ...g, nombre: g.nombre.trim(), opciones: g.opciones.map(o => o.trim()).filter(Boolean) }))
 .filter(g => g.nombre.length > 0 && g.opciones.length > 0);

 let catId = '';
 let catNombre = categoria || 'General';
 const orgId = localStorage.getItem('pos_active_org_id') || '';

 if (categoria) {
 const category = dbCategorias.find(c => c.nombre.toLowerCase() === categoria.toLowerCase());
 if (!category) {
 catId = crypto.randomUUID();
 await createRxCategoria({ id: catId, nombre: categoria, organization_id: orgId });
 catNombre = categoria;
 } else {
 catId = category.id;
 catNombre = category.nombre;
 }
 } else {
 const generalCat = dbCategorias.find(c => c.nombre === 'General');
 if (!generalCat) {
 catId = crypto.randomUUID();
 await createRxCategoria({ id: catId, nombre: 'General', organization_id: orgId });
 } else {
 catId = generalCat.id;
 }
 catNombre = 'General';
 }

 if (editingProduct) {
 await updateRxMenuItem(editingProduct.id, {
 nombre,
 precio,
 categoria_id: catId,
 categoria_nombre: catNombre,
 modificadores: modificadoresValidos,
 activo,
 es_bebida: esBebida,
 precio_variable: precioVariable,
 iva_modalidad: ivaModalidad,
 iva_porcentaje: ivaModalidad === 'especifico' ? ivaPorcentaje : undefined,
 organization_id: orgId,
 });
 showToast.success('Producto actualizado');
 } else {
 await createRxMenuItem({
 id: crypto.randomUUID(),
 nombre,
 precio,
 categoria_id: catId,
 categoria_nombre: catNombre,
 activo,
 es_bebida: esBebida,
 precio_variable: precioVariable,
 modificadores: modificadoresValidos,
 iva_modalidad: ivaModalidad,
 iva_porcentaje: ivaModalidad === 'especifico' ? ivaPorcentaje : undefined,
 organization_id: orgId,
 });
 showToast.success('Producto creado');
 }
 handleClose();
 };

 const handleClose = () => {
 setMenuView('none');
 setSelectedMenuProductId(null);
 };

 // Valor final de venta con el IVA que aplicará a este producto (general, propio o exento).
 const tasaProducto = obtenerIvaProducto({ iva_modalidad: ivaModalidad, iva_porcentaje: Number.isNaN(ivaPorcentaje) ? undefined : ivaPorcentaje }, ivaSistema);
 const calculo = calcularPreciosItem(precio || 0, 1, tasaProducto, preciosConIva);
 const dinero = (n: number) => `$${n.toFixed(2)}`;

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden">
 <ReservaHeader tono="primary" cerrada={!activo} badge={<ForkKnife size={20} weight="bold" />}
 titulo={editingProduct ? 'Editar producto' : 'Nuevo producto'}
 subtitulo={editingProduct?.nombre?.trim() || 'Menú'} onClose={handleClose} />

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
 {/* Disponibilidad: lo primero, en su propio paper */}
 <div className="rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-4 p-3.5">
 <label htmlFor="producto-activo" className="flex flex-col gap-0.5 min-w-0 cursor-pointer">
 <span className="t-cuerpo-fuerte text-foreground">Producto activo</span>
 <span className="t-meta text-muted-foreground leading-snug">Si está inactivo no aparece para vender.</span>
 </label>
 <CheckRedondo id="producto-activo" checked={activo} onCheckedChange={setActivo} aria-label="Producto activo" />
 </div>

 {/* Datos básicos */}
 <section className="flex flex-col gap-4">
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="producto-nombre" className="t-etiqueta! text-muted-foreground">Nombre del producto *</Label>
 <Input
 id="producto-nombre" type="text" placeholder="Ej: Lomo Saltado" value={nombre}
 onChange={e => { setNombre(e.target.value); setNombreError(''); }}
 className="h-12 text-base"/>
 {nombreError && <span className="t-meta text-destructive">{nombreError}</span>}
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1.5">
 <Label className="t-etiqueta! text-muted-foreground">Categoría</Label>
 {!isNuevaCategoria ? (
 <Select
 value={categoria}
 onValueChange={val => {
 if (val === '__new__') {
 setIsNuevaCategoria(true);
 setCategoria('');
 } else {
 setCategoria(val);
 }
 }}>
 <SelectTrigger className="h-12 w-full px-3 text-base rounded-2xl bg-card border-border shadow-xs">
 <SelectValue placeholder="Selecciona..." />
 </SelectTrigger>
 <SelectContent>
 {dbCategorias.map(c => (
 <SelectItem key={c.id} value={c.nombre} className="t-cuerpo">{c.nombre}</SelectItem>
 ))}
 <SelectItem value="__new__" className="t-cuerpo-fuerte text-muted-foreground">+ Nueva categoría</SelectItem>
 </SelectContent>
 </Select>
 ) : (
 <div className="relative">
 <Input
 type="text" placeholder="Nueva categoría" value={categoria}
 onChange={e => setCategoria(e.target.value)}
 className="h-12 pr-11 text-base"/>
 <button type="button" aria-label="Elegir una existente" onClick={() => { setIsNuevaCategoria(false); setCategoria(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
 <X size={14} weight="bold" />
 </button>
 </div>
 )}
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="producto-precio" className="t-etiqueta! text-muted-foreground">{precioVariable ? 'Precio de referencia' : preciosConIva ? 'Precio (con IVA)' : 'Precio (sin IVA)'}</Label>
 <div className="relative">
 <span className="absolute left-3.5 top-1/2 -translate-y-1/2 t-cuerpo-fuerte text-muted-foreground pointer-events-none">$</span>
 <Input
 id="producto-precio" type="number" inputMode="decimal" step="0.01" min={0}
 placeholder="0.00" value={precio || ''}
 onChange={e => setPrecio(parseFloat(e.target.value) || 0)}
 className="h-12 pl-7 text-base"/>
 </div>
 </div>
 </div>
 {/* Qué se cobra realmente: precio final con el IVA que le toca a este producto */}
 <div className="rounded-2xl bg-muted/40 border border-border p-3.5 flex items-center justify-between gap-4">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="t-etiqueta text-muted-foreground">{precioVariable ? 'Precio final referencial' : 'Se vende a'}</span>
 <span className="t-meta text-muted-foreground tabular-nums">
 {tasaProducto > 0
 ? preciosConIva
 ? `Incluye IVA ${tasaProducto}% (${dinero(calculo.ivaUnitario)}) · base ${dinero(calculo.precioNeto)}`
 : `Base ${dinero(calculo.precioNeto)} + IVA ${tasaProducto}% (${dinero(calculo.ivaUnitario)})`
 : 'Sin IVA (0%)'}
 </span>
 </div>
 <span className="t-valor text-foreground shrink-0">{dinero(calculo.precioBruto)}</span>
 </div>
 </section>

 {/* Ajustes del producto: cada fila = casilla + qué es. Se aplican al guardar, por eso son casillas y no interruptores. */}
 <section className="flex flex-col gap-2">
 <h4 className="t-etiqueta text-muted-foreground">Ajustes</h4>
 <div className="rounded-2xl border border-border divide-y divide-border">
 <Casilla checked={precioVariable} onChange={setPrecioVariable} multilinea className="w-full p-3.5">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="t-cuerpo-fuerte text-foreground">Precio variable</span>
 <span className="t-meta text-muted-foreground leading-snug">Se puede cambiar el precio al añadirlo a una comanda.</span>
 </div>
 </Casilla>
 <Casilla checked={esBebida} onChange={setEsBebida} multilinea className="w-full p-3.5">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="t-cuerpo-fuerte text-foreground">Es bebida</span>
 <span className="t-meta text-muted-foreground leading-snug">Se imprime en barra.</span>
 </div>
 </Casilla>
 <div className="flex items-center justify-between gap-4 p-3.5">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="t-cuerpo-fuerte text-foreground">IVA</span>
 <span className="t-meta text-muted-foreground leading-snug">
 {ivaModalidad === 'sistema' ? `Usa el IVA activo en el sistema (${ivaSistema}%).` : ivaModalidad === 'exento' ? 'Sin IVA (0%).' : 'Tasa propia de este producto.'}
 </span>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {ivaModalidad === 'especifico' && (
 <div className="relative">
 <Input type="number" inputMode="decimal" min={0} max={100} step="0.01" aria-label="Tasa de IVA"
 value={Number.isNaN(ivaPorcentaje) ? '' : ivaPorcentaje}
 onChange={e => setIvaPorcentaje(parseFloat(e.target.value))}
 className="h-12 w-24 pr-7 text-base text-right"/>
 <span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-meta text-muted-foreground pointer-events-none">%</span>
 </div>
 )}
 <Select value={ivaModalidad} onValueChange={val => setIvaModalidad(val as any)}>
 <SelectTrigger className="h-12 w-full px-3 text-base rounded-2xl bg-card border-border shadow-xs !w-36">
 <SelectValue placeholder="Selecciona..." />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="sistema" className="t-cuerpo">General</SelectItem>
 <SelectItem value="especifico" className="t-cuerpo">Tasa propia</SelectItem>
 <SelectItem value="exento" className="t-cuerpo">Exento (0%)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </div>
 </section>

 {/* Grupos de modificadores (ej:"Tipo de papas"-> Fritas / Doradas) */}
 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <h4 className="t-etiqueta text-muted-foreground">Opciones adicionales</h4>
 <div className="flex items-center gap-1">
 {MODIFIER_TEMPLATES.length > 0 && (
 <Popover>
 <PopoverTrigger asChild>
 <Button
 type="button"variant="ghost"size="sm"
 className="h-7 px-2 t-dato text-primary gap-1">
 <Sparkle size={14} weight="bold"/> Sugerencias
 </Button>
 </PopoverTrigger>
 <PopoverContent align="end"className="w-56 p-1.5 flex flex-col gap-0.5">
 {MODIFIER_TEMPLATES.map(template => (
 <button
 key={template.nombre}
 type="button"
 onClick={() => applyModifierTemplate(template)}
 className="w-full text-left px-2.5 py-2 rounded-2xl hover:bg-muted transition-colors cursor-pointer flex flex-col gap-0.5">
 <span className="t-dato text-foreground">{template.nombre}</span>
 <span className="t-meta text-muted-foreground">{template.opciones.join(' · ')}</span>
 </button>
 ))}
 </PopoverContent>
 </Popover>
 )}
 <Button
 type="button"variant="ghost"size="sm"onClick={addModifierGroup}
 className="h-7 px-2 t-dato text-primary gap-1">
 <Plus size={14} weight="bold"/> Añadir grupo
 </Button>
 </div>
 </div>

 {modificadores.length === 0 ? (
 <p className="t-meta text-muted-foreground">
 Sin opciones adicionales. Añade un grupo para ofrecer variantes como"Tipo de papas"(Fritas, Doradas).
 </p>
 ) : (
 <div className="flex flex-col gap-3">
 {modificadores.map(group => (
 <div key={group.id} className="flex flex-col gap-2.5 p-3 rounded-2xl bg-muted/40">
 <div className="flex items-center gap-2">
 <Input
 type="text"placeholder="Nombre del grupo (Ej: Tipo de papas)"value={group.nombre}
 onChange={e => updateModifierGroup(group.id, { nombre: e.target.value })}
 className="h-10 text-base flex-1"/>
 <Button
 type="button"variant="ghost"size="icon"aria-label="Eliminar grupo de opciones"onClick={() => removeModifierGroup(group.id)}
 className="h-8 w-8 shrink-0 text-destructive">
 <Trash size={14} />
 </Button>
 </div>

 <div className="flex items-center gap-4">
 <Casilla compacta checked={group.obligatorio} onChange={v => updateModifierGroup(group.id, { obligatorio: v })}>Obligatorio</Casilla>
 <Casilla compacta checked={group.multi} onChange={v => updateModifierGroup(group.id, { multi: v })}>Selección múltiple</Casilla>
 </div>

 <div className="flex flex-col gap-1.5">
 {group.opciones.map((opcion, idx) => (
 <div key={idx} className="flex items-center gap-2">
 <Input
 type="text"placeholder={`Opción ${idx + 1} (Ej: Papas Fritas)`}
 value={opcion}
 onChange={e => updateOption(group.id, idx, e.target.value)}
 className="h-8 t-dato flex-1 bg-card"/>
 <Button
 type="button"variant="ghost"size="icon"aria-label="Quitar opción"onClick={() => removeOption(group.id, idx)}
 className="h-8 w-8 shrink-0 text-muted-foreground">
 <X size={14} />
 </Button>
 </div>
 ))}
 <Button
 type="button"variant="outline"size="sm"onClick={() => addOption(group.id)}
 className="h-8 t-dato gap-1 self-start">
 <Plus size={13} weight="bold"/> Añadir opción
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </main>

 <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
 {/* Importar varios productos desde un CSV: solo al crear (y solo en PC). */}
 {!editingProduct && (
 <div className="hidden md:block"><CsvUploader /></div>
 )}
 {editingProduct && (
 <Button type="button" variant="outline" className="h-12 px-5 font-bold text-destructive hover:text-destructive"
 onClick={() => {
 openConfirm('Eliminar producto','¿Estás seguro de eliminar este producto del menú?',
 async () => {
 await updateRxMenuItem(editingProduct.id, { _deleted: true });
 showToast.success('Producto eliminado');
 handleClose();
 }
 );
 }}>
 Eliminar
 </Button>
 )}
 <Button type="button" onClick={handleSubmit} className="h-12 flex-1 font-bold">
 {editingProduct ?'Guardar cambios':'Crear producto'}
 </Button>
 </footer>
 </div>
 );
}
