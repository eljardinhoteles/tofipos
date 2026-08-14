import { useMemo, useState } from'react';
import { useRxMenuCatalog } from'../hooks/useRxMenuCatalog';
import { Trash, Plus, Check, X, MagnifyingGlass, List, PencilLine, SquaresFour } from'@phosphor-icons/react';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../hooks/useIvaActivo';
import { createRxCategoria, updateRxCategoria } from'../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from '@/components/ui/input';
import { CsvUploader } from '@/components/Menu/CsvUploader';

export default function MenuV2() {
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategory, setSelectedCategory] = useState<string>('all');
 const [editingCategory, setEditingCategory] = useState<{ id: string; nombre: string } | null>(null);
 const [newCategoryName, setNewCategoryName] = useState('');
 const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
 const { openConfirm, setMenuView, setSelectedMenuProductId, selectedMenuProductId } = useUI();

 const { menuItems: safeMenuItems, categorias: safeDbCategorias } = useRxMenuCatalog();

 const filteredItems = useMemo(() => {
 return safeMenuItems.filter(item => {
 const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (item.categoria_nombre ||'').toLowerCase().includes(searchQuery.toLowerCase());
 const matchesCategory = selectedCategory ==='all'? true : item.categoria_nombre === selectedCategory;
 return matchesSearch && matchesCategory;
 });
 }, [safeMenuItems, searchQuery, selectedCategory]);

 const products = useMemo(() => filteredItems.map(item => ({
 id: item.id,
 name: item.nombre,
 price: item.precio,
 category: item.categoria_nombre ||'Sin categoría',
 categoria_nombre: item.categoria_nombre,
 modificadores: item.modificadores || [],
 activo: item.activo,
 iva_modalidad: item.iva_modalidad ||'sistema',
 iva_porcentaje: item.iva_porcentaje
 })), [filteredItems]);

 const handleEditClick = (product: any) => {
 setSelectedMenuProductId(product.id);
 setMenuView('producto');
 };

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
 {/* ── HEADER PRINCIPAL ─────────────────────────────── */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs shrink-0 gap-4">
 <div className="flex items-center gap-3 shrink-0">
 <button
 type="button"title="Nuevo Producto"onClick={() => {
 setSelectedMenuProductId(null);
 setMenuView('producto');
 }}
 className="w-9 h-9 rounded-lg bg-primary active:scale-95 text-primary-foreground flex items-center justify-center transition-all shadow-xs cursor-pointer">
 <Plus size={18} weight="bold"/>
 </button>

 <div className="w-[1px] h-6 bg-border shrink-0"/>

        <button
          type="button" onClick={() => setIsManageCategoriesOpen(true)}
          className="h-9 px-3 rounded-lg bg-muted text-foreground font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer">
          <SquaresFour size={18} />
          Categorías
        </button>

        <CsvUploader />
 </div>

 {/* Buscador */}
 <div className="relative w-64 shrink-0">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"/>
 <Input
 type="text"placeholder="Buscar productos..."value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-9 h-9 text-xs"/>
 </div>

 <div className="w-[1px] h-6 bg-border shrink-0"/>

 {/* Chips de Categorías */}
 <div className="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-2">
 <button
 type="button"onClick={() => setSelectedCategory('all')}
 className={cn("px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer",
 selectedCategory ==='all'?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 Todos
 </button>
 {safeDbCategorias.map(cat => (
 <button
 key={cat.id}
 type="button"onClick={() => setSelectedCategory(cat.nombre)}
 className={cn("px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer",
 selectedCategory === cat.nombre
 ?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 {cat.nombre}
 </button>
 ))}
 </div>
 </header>

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
 isSelected={selectedMenuProductId === product.id}
 onEdit={() => handleEditClick(product)}
 />
 ))}
 </div>
 )}
 </main>

 {/* Modal: Gestionar Categorías */}
 {isManageCategoriesOpen && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
 <div className="p-4 border-b border-border flex items-center justify-between">
 <div className="flex items-center gap-3">
 <SquaresFour size={24} className="text-primary"/>
 <div>
 <h3 className="font-extrabold text-sm text-foreground">Categorías</h3>
 <p className="text-xs text-muted-foreground">Agrupa tu menú igual que en tu carta física</p>
 </div>
 </div>
 <button
 type="button"onClick={() => setIsManageCategoriesOpen(false)}
 className="w-7 h-7 rounded-lg text-muted-foreground flex items-center justify-center cursor-pointer">
 <X size={16} />
 </button>
 </div>

 <div className="p-4 flex flex-col gap-4">
 {/* Formulario Nueva Categoría */}
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
 type="text"placeholder="Nueva categoría..."value={newCategoryName}
 onChange={(e) => setNewCategoryName(e.target.value)}
 className="flex-1 h-9 text-xs"/>
 <button
 type="submit"disabled={!newCategoryName.trim()}
 className="h-9 px-3 rounded-lg bg-primary disabled:opacity-50 text-primary-foreground font-semibold text-xs flex items-center gap-1 cursor-pointer transition-all">
 <Plus size={14} weight="bold"/> Añadir
 </button>
 </form>

 {/* Lista */}
 <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
 {safeDbCategorias.length === 0 ? (
 <div className="py-8 text-center text-xs text-muted-foreground">Sin categorías aún</div>
 ) : (
 safeDbCategorias.map((cat) => (
 <div
 key={cat.id}
 className={cn("flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
 editingCategory?.id === cat.id ?"bg-muted border border-border":"")}
 >
 {editingCategory?.id === cat.id ? (
 <Input
 type="text"value={editingCategory?.nombre ||''}
 onChange={(e) => setEditingCategory(editingCategory ? { ...editingCategory, nombre: e.target.value } : { id: cat.id, nombre: e.target.value })}
 onKeyDown={async (e) => {
 if (e.key ==='Enter') {
 if (editingCategory?.nombre.trim()) {
 await updateRxCategoria(cat.id, { nombre: editingCategory.nombre.trim() });
 showToast.success('Categoría actualizada');
 }
 setEditingCategory(null);
 }
 if (e.key ==='Escape') setEditingCategory(null);
 }}
 className="flex-1 font-bold h-7 text-xs bg-transparent border-b border-primary"autoFocus
 />
 ) : (
 <div className="flex items-center gap-2">
 <span className="font-semibold text-foreground">{cat.nombre}</span>
 {cat.es_comida_incluida && (
 <span className="px-1.5 py-0.5 rounded-xs bg-emerald-100 text-emerald-700 text-[10px] font-bold">Plan</span>
 )}
 </div>
 )}

 <div className="flex items-center gap-1 shrink-0">
 {editingCategory?.id === cat.id ? (
 <>
 <button
 type="button"onClick={async () => {
 if (editingCategory?.nombre.trim()) {
 await updateRxCategoria(cat.id, { nombre: editingCategory.nombre.trim() });
 showToast.success('Categoría actualizada');
 }
 setEditingCategory(null);
 }}
 className="w-6 h-6 rounded-md text-foreground flex items-center justify-center cursor-pointer">
 <Check size={14} weight="bold"/>
 </button>
 <button
 type="button"onClick={() => setEditingCategory(null)}
 className="w-6 h-6 rounded-md text-muted-foreground flex items-center justify-center cursor-pointer">
 <X size={14} />
 </button>
 </>
 ) : (
 <>
 <button
 type="button"title={cat.es_comida_incluida ?'Quitar del plan':'Marcar como comida incluida en plan'}
 onClick={async () => {
 await updateRxCategoria(cat.id, { es_comida_incluida: !cat.es_comida_incluida });
 }}
 className={cn("w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors",
 cat.es_comida_incluida ?"bg-emerald-500 text-white":"text-muted-foreground")}
 >
 <Check size={13} weight="bold"/>
 </button>
 <button
 type="button"onClick={() => setEditingCategory(cat)}
 className="w-6 h-6 rounded-md text-muted-foreground flex items-center justify-center cursor-pointer">
 <PencilLine size={13} />
 </button>
 <button
 type="button"onClick={() => {
 openConfirm('¿Eliminar Categoría?',`Los productos de"${cat.nombre}"se quedarán sin categoría.`,
 async () => {
 await updateRxCategoria(cat.id, { _deleted: true });
 showToast.success('Categoría eliminada');
 }
 );
 }}
 className="w-6 h-6 rounded-md text-muted-foreground flex items-center justify-center cursor-pointer">
 <Trash size={13} />
 </button>
 </>
 )}
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

function MenuProductCardV2({ product, onEdit, isSelected }: any) {
 const { porcentaje: ivaSistema } = useIvaActivo();

 let ivaLabel ='';
 if (product.iva_modalidad ==='exento') {
 ivaLabel ='Exento';
 } else if (product.iva_modalidad ==='especifico') {
 ivaLabel =`IVA ${product.iva_porcentaje}%`;
 } else {
 ivaLabel =`IVA ${ivaSistema}%`;
 }

 return (
 <div
 onClick={onEdit}
 className={cn("bg-card rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between active:scale-98",
 isSelected ?"border-primary ring-2 ring-primary/20 shadow-md":"border-border")}
 >
 <div className="flex flex-col gap-1">
 <div className="flex items-center justify-between gap-2">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
 {product.category}
 </span>
 </div>
 <h3 className="font-extrabold text-sm text-foreground line-clamp-2">
 {product.name}
 </h3>
 </div>

 <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
 <span className="text-base font-black text-foreground">
 ${product.price.toFixed(2)}
 </span>
 <div className="flex items-center gap-2 shrink-0">
 {product.modificadores.length > 0 && (
 <div className="flex items-center gap-1 text-muted-foreground text-xs font-semibold">
 <List size={14} />
 <span>{product.modificadores.length}</span>
 </div>
 )}
 <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
 {ivaLabel}
 </span>
 </div>
 </div>
 </div>
 );
}
