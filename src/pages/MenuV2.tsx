import { useMemo, useState } from'react';
import { useRxMenuCatalog } from'../hooks/useRxMenuCatalog';
import { Trash, Plus, List, SquaresFour, CaretUp, CaretDown, CaretRight, Gear } from'@phosphor-icons/react';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';
import { createRxCategoria, updateRxCategoria, updateRxMenuItem } from'../db/rxdb';
import { Button } from '@/components/ui/button';
import { ReservaHeader } from '@/components/Mesas/Sidebar/ReservaHeader';
import { PageFrame, PageHeader, PageContent, PageToolbar, HeaderSearch, headerPrimaryButtonClass, toolbarChipClass } from '../components/Common/PageHeader';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from'@/lib/utils';
import { Input } from '@/components/ui/input';
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
 SheetDescription,
} from '@/components/ui/sheet';
import { CATEGORY_ICONS, getCategoryIcon } from '@/lib/categoryIcons';

export default function MenuV2() {
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategory, setSelectedCategory] = useState<string>('all');
 const [editingCategory, setEditingCategory] = useState<{ id: string; nombre: string; icono: string | null; es_comida_incluida: boolean; imprimir_primero: boolean } | null>(null);
 const [newCategoryName, setNewCategoryName] = useState('');
 const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
 const { openConfirm, menuView, setMenuView, setSelectedMenuProductId, selectedMenuProductId } = useUI();
 // Con el formulario de producto nuevo abierto en el sidebar, el botón de crear sobra.
 const creandoProducto = menuView === 'producto' && !selectedMenuProductId;

 const { menuItems: safeMenuItems, categorias: safeDbCategorias } = useRxMenuCatalog();

 const filteredItems = useMemo(() => {
 return safeMenuItems.filter(item => {
 const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (item.categoria_nombre ||'').toLowerCase().includes(searchQuery.toLowerCase());
 const matchesCategory = selectedCategory ==='all'? true : item.categoria_nombre === selectedCategory;
 return matchesSearch && matchesCategory;
 });
 }, [safeMenuItems, searchQuery, selectedCategory]);

 const conteoPorCategoria = useMemo(() => {
 const map = new Map<string, number>();
 for (const it of safeMenuItems) {
 const cat = it.categoria_nombre || '';
 map.set(cat, (map.get(cat) ?? 0) + 1);
 }
 return map;
 }, [safeMenuItems]);

 const iconoPorCategoria = useMemo(
 () => new Map(safeDbCategorias.map(c => [c.nombre, getCategoryIcon(c.icono)])),
 [safeDbCategorias]
 );

 const products = useMemo(() => filteredItems.map(item => ({
 id: item.id,
 name: item.nombre,
 price: item.precio,
 category: item.categoria_nombre ||'Sin categoría',
 categoria_nombre: item.categoria_nombre,
 modificadores: item.modificadores || [],
 activo: item.activo,
 precio_variable: !!item.precio_variable,
 iva_modalidad: item.iva_modalidad ||'sistema',
 iva_porcentaje: item.iva_porcentaje
 })), [filteredItems]);

 const handleEditClick = (product: any) => {
 setSelectedMenuProductId(product.id);
 setMenuView('producto');
 };

 const handleMoveCategory = async (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === safeDbCategorias.length - 1) return;

    const newOrder = [...safeDbCategorias];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    // Intercambiar
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;

    // Guardar el nuevo orden secuencial para todas
    await Promise.all(newOrder.map((c, i) => updateRxCategoria(c.id, { orden: i })));
  };

 return (
 <PageFrame>
 <PageHeader
 title={`${safeMenuItems.length} ${safeMenuItems.length === 1 ? 'Producto' : 'Productos'}`}
 subtitle={`${safeDbCategorias.length} ${safeDbCategorias.length === 1 ? 'categoría' : 'categorías'}`}
 search={<HeaderSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar productos..." />}
 actions={
 <>
 <button type="button" onClick={() => { setSelectedMenuProductId(null); setMenuView('producto'); }} title="Nuevo producto" aria-label="Nuevo producto" tabIndex={creandoProducto ? -1 : 0} className={cn(headerPrimaryButtonClass, creandoProducto ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-300 delay-300')}>
 <Plus size={18} weight="bold" />
   <span className="hidden 2xl:inline">Nuevo producto</span>
 </button>
 </>
 }
 />

 <PageContent>
 {/* Chips de Categorías — solo móvil; en escritorio van en la columna lateral */}
 <div className="md:hidden shrink-0">
 <PageToolbar>
 <button type="button" onClick={() => setSelectedCategory('all')} className={toolbarChipClass(selectedCategory === 'all')}>
 Todos
 </button>
 {safeDbCategorias.map(cat => (
 <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.nombre)} className={toolbarChipClass(selectedCategory === cat.nombre)}>
 {cat.nombre}
 </button>
 ))}
 <button type="button" onClick={() => setIsManageCategoriesOpen(true)} aria-label="Gestionar categorías" className="h-8 w-8 rounded-full border border-dashed border-border text-muted-foreground flex items-center justify-center shrink-0 cursor-pointer">
 <Gear size={14} weight="bold" />
 </button>
 </PageToolbar>
 </div>

 {/* Escritorio: columna de categorías + productos de la elegida */}
 <div className="flex-1 min-h-0 flex">
 <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-card flex-col overflow-y-auto py-3">
 <div className="flex items-center justify-between pl-4 pr-2 pb-1">
 <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Categorías</h2>
 <Button type="button" variant="ghost" size="icon" title="Gestionar categorías" aria-label="Gestionar categorías"
 onClick={() => setIsManageCategoriesOpen(true)} className="size-8 text-muted-foreground hover:text-foreground">
 <Gear size={16} weight="bold" />
 </Button>
 </div>
 <nav className="flex flex-col">
 {[
 { id: 'all', nombre: 'Todos', icono: null as string | null | undefined, count: safeMenuItems.length },
 ...safeDbCategorias.map(c => ({ id: c.nombre, nombre: c.nombre, icono: c.icono, count: conteoPorCategoria.get(c.nombre) ?? 0 })),
 ].map(c => {
 const Icon = c.id === 'all' ? List : getCategoryIcon(c.icono) ?? SquaresFour;
 const activa = selectedCategory === c.id;
 return (
 <button
 key={c.id}
 type="button"
 aria-current={activa ? 'true' : undefined}
 onClick={() => setSelectedCategory(c.id)}
 className={cn("flex items-center gap-3 h-11 pl-3.5 pr-4 border-l-[3px] text-left transition-colors cursor-pointer",
 activa ? "border-primary bg-muted text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
 >
 <Icon size={18} weight={activa ? "fill" : "regular"} className={cn("shrink-0", activa && "text-primary")} />
 <span className={cn("flex-1 min-w-0 truncate text-sm", activa ? "font-extrabold" : "font-semibold")}>{c.nombre}</span>
 <span className={cn("shrink-0 text-xs tabular-nums", activa ? "font-bold text-foreground" : "font-semibold text-muted-foreground/80")}>{c.count}</span>
 </button>
 );
 })}
 </nav>
 </aside>

 {/* Grid de Productos */}
 <main className="flex-1 overflow-y-auto p-6">
 {products.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
 <div className="w-24 h-24 flex items-center justify-center">
 <img src="/menu.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h2 className="text-foreground font-bold text-lg">No se encontraron productos</h2>
 <p className="text-muted-foreground text-xs">Crea un nuevo producto para comenzar a vender.</p>
 </div>
 ) : (
 <div className="pos-menu-grid">
 {products.map(product => (
 <MenuProductCardV2
 key={product.id}
 product={product}
 CategoriaIcon={iconoPorCategoria.get(product.categoria_nombre) ?? null}
 isSelected={selectedMenuProductId === product.id}
 onEdit={() => handleEditClick(product)}
 onToggleActivo={async (activo: boolean) => {
 try {
 await updateRxMenuItem(product.id, { activo });
 } catch (error) {
 console.error('Error al actualizar disponibilidad:', error);
 showToast.error('No se pudo actualizar la disponibilidad');
 }
 }}
 />
 ))}
 </div>
 )}
 </main>
 </div>

 </PageContent>

 {/* Drawer: Gestionar Categorías — pantalla 1: lista; pantalla 2: editar una categoría */}
 <Sheet open={isManageCategoriesOpen} onOpenChange={(o) => { setIsManageCategoriesOpen(o); if (!o) setEditingCategory(null); }}>
 <SheetContent showCloseButton={false} className="w-full sm:max-w-md flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
 {editingCategory ? (() => {
 const ed = editingCategory;
 const cat = safeDbCategorias.find(c => c.id === ed.id);
 const nProductos = cat ? (conteoPorCategoria.get(cat.nombre) ?? 0) : 0;
 const guardar = async () => {
 if (!ed.nombre.trim()) { showToast.error('Escribe el nombre de la categoría'); return; }
 await updateRxCategoria(ed.id, {
 nombre: ed.nombre.trim(),
 icono: ed.icono,
 es_comida_incluida: ed.es_comida_incluida,
 imprimir_primero: ed.imprimir_primero,
 });
 showToast.success('Categoría actualizada');
 setEditingCategory(null);
 };
 return (
 <>
 <SheetHeader className="p-0 gap-0 space-y-0">
 <SheetTitle className="sr-only">Editar categoría</SheetTitle>
 <SheetDescription className="sr-only">Nombre, icono y ajustes de la categoría</SheetDescription>
 <ReservaHeader tono="primary" badge={null} titulo="Editar categoría"
 subtitulo={`${nProductos} ${nProductos === 1 ? 'producto' : 'productos'}`}
 onBack={() => setEditingCategory(null)} onClose={() => setIsManageCategoriesOpen(false)} />
 </SheetHeader>

 <div className="p-4 flex flex-col gap-6 overflow-y-auto flex-1">
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="cat-nombre" className="text-xs font-bold">Nombre</Label>
 <Input id="cat-nombre" type="text" value={ed.nombre}
 onChange={(e) => setEditingCategory(prev => prev && { ...prev, nombre: e.target.value })}
 onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }}
 className="h-10 text-sm font-semibold" />
 </div>

 <div className="flex flex-col gap-2">
 <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Icono</h4>
 <div className="grid grid-cols-8 gap-1.5">
 {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
 <button key={key} type="button" title={key} aria-pressed={ed.icono === key}
 onClick={() => setEditingCategory(prev => prev && { ...prev, icono: prev.icono === key ? null : key })}
 className={cn("aspect-square rounded-xl flex items-center justify-center cursor-pointer transition-colors",
 ed.icono === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
 <Icon size={18} weight="bold"/>
 </button>
 ))}
 </div>
 </div>

 <div className="flex flex-col gap-2">
 <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ajustes</h4>
 <div className="rounded-2xl border border-border divide-y divide-border">
 <label className="flex items-center justify-between gap-4 p-3.5 cursor-pointer">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="text-sm font-bold text-foreground">Incluida en plan</span>
 <span className="text-xs font-medium text-muted-foreground leading-snug">La comida de esta categoría va incluida en el plan del huésped.</span>
 </div>
 <Switch checked={ed.es_comida_incluida} onCheckedChange={(v) => setEditingCategory(prev => prev && { ...prev, es_comida_incluida: v })} />
 </label>
 <label className="flex items-center justify-between gap-4 p-3.5 cursor-pointer">
 <div className="flex flex-col gap-0.5 min-w-0">
 <span className="text-sm font-bold text-foreground">Imprime primero</span>
 <span className="text-xs font-medium text-muted-foreground leading-snug">Sale primero en la comanda de cocina.</span>
 </div>
 <Switch checked={ed.imprimir_primero} onCheckedChange={(v) => setEditingCategory(prev => prev && { ...prev, imprimir_primero: v })} />
 </label>
 </div>
 </div>
 </div>

 <div className="p-4 border-t border-border bg-muted/40 flex items-center justify-end gap-2 shrink-0">
 <Button type="button" variant="ghost" className="mr-auto font-bold text-destructive hover:text-destructive gap-1.5"
 onClick={() => {
 openConfirm('¿Eliminar Categoría?',`Los productos de "${ed.nombre}" se quedarán sin categoría.`,
 async () => {
 await updateRxCategoria(ed.id, { _deleted: true });
 showToast.success('Categoría eliminada');
 setEditingCategory(null);
 }
 );
 }}>
 <Trash size={16} /> Eliminar
 </Button>
 <Button type="button" variant="outline" className="font-bold" onClick={() => setEditingCategory(null)}>Cancelar</Button>
 <Button type="button" className="font-bold" onClick={guardar}>Guardar</Button>
 </div>
 </>
 );
 })() : (
 <>
 <SheetHeader className="p-0 gap-0 space-y-0">
 <SheetTitle className="sr-only">Categorías</SheetTitle>
 <SheetDescription className="sr-only">Agrupa tu menú igual que en tu carta física</SheetDescription>
 <ReservaHeader tono="primary" badge={<SquaresFour size={22} weight="bold" />} titulo="Categorías"
 subtitulo={`${safeDbCategorias.length} ${safeDbCategorias.length === 1 ? 'categoría' : 'categorías'}`}
 onClose={() => setIsManageCategoriesOpen(false)} />
 </SheetHeader>

 <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
 <form
 onSubmit={async (e) => {
 e.preventDefault();
 if (!newCategoryName.trim()) return;
 await createRxCategoria({
 id: crypto.randomUUID(),
 nombre: newCategoryName.trim(),
 organization_id: localStorage.getItem('pos_active_org_id') ||''});
 showToast.success('Categoría creada');
 setNewCategoryName('');
 }}
 className="flex items-center gap-2">
 <Input
 type="text" placeholder="Nueva categoría..." value={newCategoryName}
 onChange={(e) => setNewCategoryName(e.target.value)}
 className="flex-1 h-12 text-base font-semibold"/>
 <Button type="submit" disabled={!newCategoryName.trim()} className="h-12 px-5 font-bold gap-1.5">
 <Plus size={15} weight="bold"/> Añadir
 </Button>
 </form>

 {safeDbCategorias.length === 0 ? (
 <div className="py-8 text-center text-sm text-muted-foreground">Sin categorías aún</div>
 ) : (
 <div className="flex flex-col divide-y divide-border">
 {safeDbCategorias.map((cat, idx) => {
 const CategoryIcon = getCategoryIcon(cat.icono);
 const nProductos = conteoPorCategoria.get(cat.nombre) ?? 0;
 const abrirEdicion = () => setEditingCategory({
 id: cat.id, nombre: cat.nombre, icono: cat.icono ?? null,
 es_comida_incluida: !!cat.es_comida_incluida, imprimir_primero: !!cat.imprimir_primero,
 });
 return (
 <div key={cat.id} className="flex items-center gap-1 pr-1 py-1.5">
 <div className="flex flex-col shrink-0">
 <button type="button" aria-label="Subir" onClick={() => handleMoveCategory(idx,'up')} disabled={idx === 0}
 className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-default cursor-pointer">
 <CaretUp size={14} weight="bold"/>
 </button>
 <button type="button" aria-label="Bajar" onClick={() => handleMoveCategory(idx,'down')} disabled={idx === safeDbCategorias.length - 1}
 className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-default cursor-pointer">
 <CaretDown size={14} weight="bold"/>
 </button>
 </div>
 <button type="button" onClick={abrirEdicion}
 className="flex-1 min-w-0 flex items-center gap-3 rounded-xl px-2 py-1.5 text-left cursor-pointer hover:bg-muted/60 transition-colors">
 <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
 {CategoryIcon ? <CategoryIcon size={18} weight="bold"/> : <SquaresFour size={18} />}
 </span>
 <span className="flex flex-col flex-1 min-w-0">
 <span className="flex items-center gap-1.5 min-w-0">
 <span className="font-bold text-sm text-foreground truncate">{cat.nombre}</span>
 {cat.es_comida_incluida && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-info-soft text-info-foreground text-[10px] font-bold">Plan</span>}
 {cat.imprimir_primero && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-warning-soft text-warning-foreground text-[10px] font-bold">1.º</span>}
 </span>
 <span className="text-xs font-medium text-muted-foreground">{nProductos} {nProductos === 1 ? 'producto' : 'productos'}</span>
 </span>
 <CaretRight size={14} weight="bold" className="text-muted-foreground/60 shrink-0" />
 </button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </>
 )}
 </SheetContent>
 </Sheet>
 </PageFrame>
 );
}

function MenuProductCardV2({ product, onEdit, isSelected, onToggleActivo, CategoriaIcon }: any) {
 const isInactivo = product.activo === false;
 const Icono = CategoriaIcon ?? SquaresFour;
 return (
 <div
 onClick={onEdit}
 className={cn("group rounded-2xl p-4 border flex flex-col gap-3 min-h-36 cursor-pointer transition-shadow hover:shadow-md active:scale-98",
 isInactivo ? "bg-muted/50 border-border" : "bg-card",
 isSelected ? "border-primary ring-2 ring-primary/20 shadow-md" : !isInactivo && "border-border")}
 >
 <div className="flex items-center justify-between gap-2">
 <span className="flex items-center gap-1.5 min-w-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 <Icono size={14} weight="bold" className="shrink-0" />
 <span className="truncate">{product.category}</span>
 </span>
 {onToggleActivo && (
 <Switch
 checked={!isInactivo}
 aria-label={isInactivo ? 'Activar producto' : 'Desactivar producto'}
 title={isInactivo ? 'Activar producto' : 'Desactivar producto'}
 onClick={(e) => e.stopPropagation()}
 onCheckedChange={(v) => onToggleActivo(v)}
 className="h-4 w-7 shrink-0 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
 />
 )}
 </div>

 <h3 className={cn("font-extrabold text-base leading-snug line-clamp-2 flex-1", isInactivo ? "text-muted-foreground" : "text-foreground")}>
 {product.name}
 </h3>

 <div className="flex items-end justify-between gap-2">
 {product.precio_variable ? (
 <span className="text-sm font-black text-foreground">Precio variable</span>
 ) : (
 <span className={cn("text-xl font-black tabular-nums leading-none", isInactivo ? "text-muted-foreground" : "text-foreground")}>
 ${product.price.toFixed(2)}
 </span>
 )}
 <span className="flex items-center gap-2 shrink-0 text-xs font-bold text-muted-foreground">
 {isInactivo && <span className="px-1.5 py-0.5 rounded-md bg-muted">Inactivo</span>}
 {product.modificadores.length > 0 && (
 <span className="flex items-center gap-1" title="Modificadores">
 <List size={14} weight="bold" />
 {product.modificadores.length}
 </span>
 )}
 </span>
 </div>
 </div>
 );
}
