import { useState, useMemo, useEffect, useRef, useCallback, memo } from'react';
import { ArrowLeft, MagnifyingGlass, X, Star, Plus } from'@phosphor-icons/react';
import { type Comanda, type ComandaItem, type MenuItem } from'../../db/database';
import { showToast } from'@/lib/toast';
import { ProductModifiersModal } from'../Products/ProductModifiersModal';
import { initVerticalRxDb } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { useIvaActivo } from '../../hooks/useIvaActivo';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ProductSelectorProps {
  activeComanda?: Comanda | null;
  onBack: () => void;
  hideBackButton?: boolean;
}

export function ProductSelector({ activeComanda, onBack, hideBackButton = false }: ProductSelectorProps) {
  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const [searchQueryInput, setSearchQueryInput] = useState('');
 const [searchQueryDebounced, setSearchQueryDebounced] = useState('');

 useEffect(() => {
 const handler = setTimeout(() => {
 setSearchQueryDebounced(searchQueryInput);
 }, 150);
 return () => clearTimeout(handler);
 }, [searchQueryInput]);

 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

 const touchStartX = useRef(0);
 const touchEndX = useRef(0);

 const handleTouchStart = (e: React.TouchEvent) => {
 touchStartX.current = e.targetTouches[0].clientX;
 touchEndX.current = e.targetTouches[0].clientX;
 };

 const handleTouchMove = (e: React.TouchEvent) => {
 touchEndX.current = e.targetTouches[0].clientX;
 };

 const handleTouchEnd = () => {
 const diffX = touchStartX.current - touchEndX.current;
 if (Math.abs(diffX) > 80) {
 const allCats = ['Todos','Favoritos', ...categories];
 const currentVal = selectedCategory ??'Todos';
 const currentIndex = allCats.indexOf(currentVal);
 if (currentIndex !== -1) {
 if (diffX > 0) {
 const nextIndex = Math.min(allCats.length - 1, currentIndex + 1);
 if (nextIndex !== currentIndex) {
 const nextVal = allCats[nextIndex];
 setSelectedCategory(nextVal ==='Todos'? null : nextVal);
 }
 } else {
 const prevIndex = Math.max(0, currentIndex - 1);
 if (prevIndex !== currentIndex) {
 const prevVal = allCats[prevIndex];
 setSelectedCategory(prevVal ==='Todos'? null : prevVal);
 }
 }
 }
 }
 };

 const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
 const [modifyingItem, setModifyingItem] = useState<MenuItem | null>(null);
 const [rxComandaItems, setRxComandaItems] = useState<ComandaItem[]>([]);

 const { menuItems, categorias: safeDbCategorias } = useRxMenuCatalog();

 useEffect(() => {
 let alive = true;
 let sub: { unsubscribe: () => void } | null = null;

 (async () => {
 if (!activeComanda?.id) {
 if (alive) setRxComandaItems([]);
 return;
 }

 const rxDb = await initVerticalRxDb();
 if (!alive) return;

 const query = rxDb.comanda_items.find({
 selector: { comanda_id: activeComanda.id }
 });

 sub = query.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setRxComandaItems(docs.map((doc: any) => doc.toJSON()));
 });
 })().catch(err => console.warn('Error cargando items RxDB del selector:', err));

 return () => {
 alive = false;
 sub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 const isLoading = menuItems === undefined || (activeComanda ? rxComandaItems === undefined : false);

 const safeMenuItems = useMemo(() => menuItems ?? [], [menuItems]);
 const safeComandaItems = useMemo(() => rxComandaItems ?? ([] as ComandaItem[]), [rxComandaItems]);

 const itemQuantities = useMemo(() => {
 const map: Record<string, number> = {};
 safeComandaItems.forEach(ci => {
 map[ci.item_id] = (map[ci.item_id] || 0) + ci.cantidad;
 });
 return map;
 }, [safeComandaItems]);

 const categories = useMemo(() => {
 const cats = new Set(safeMenuItems.map(i => i.categoria_nombre || 'Sin Categoría'));
 const orderMap = new Map(safeDbCategorias.map((c, idx) => [c.nombre, idx]));
 
 return Array.from(cats).sort((a, b) => {
 const orderA = orderMap.has(a) ? orderMap.get(a)! : 999999;
 const orderB = orderMap.has(b) ? orderMap.get(b)! : 999999;
 if (orderA !== orderB) return orderA - orderB;
 return a.localeCompare(b);
 });
 }, [safeMenuItems, safeDbCategorias]);

 const filteredItems = useMemo(() => {
 const items = safeMenuItems.filter(item => {
 const matchesSearch = !searchQueryDebounced ||
 item.nombre.toLowerCase().includes(searchQueryDebounced.toLowerCase());

 if (selectedCategory === 'Favoritos') {
 return matchesSearch && item.favorito;
 }

 const matchesCategory = !selectedCategory ||
 (item.categoria_nombre || 'Sin Categoría') === selectedCategory;
 return matchesSearch && matchesCategory;
 });

 const orderMap = new Map(safeDbCategorias.map((c, idx) => [c.nombre, idx]));

 return [...items].sort((a, b) => {
 const catA = a.categoria_nombre || 'Sin Categoría';
 const catB = b.categoria_nombre || 'Sin Categoría';
 
 const orderA = orderMap.has(catA) ? orderMap.get(catA)! : 999999;
 const orderB = orderMap.has(catB) ? orderMap.get(catB)! : 999999;
 
 if (orderA !== orderB) return orderA - orderB;
 if (catA !== catB) return catA.localeCompare(catB);
 
 return a.nombre.localeCompare(b.nombre);
 });
 }, [safeMenuItems, searchQueryDebounced, selectedCategory, safeDbCategorias]);

 const groupedItems = useMemo(() => {
 const groups: { category: string; items: typeof filteredItems }[] = [];
 for (const item of filteredItems) {
 const cat = item.categoria_nombre ||'Sin Categoría';
 const last = groups[groups.length - 1];
 if (last && last.category === cat) {
 last.items.push(item);
 } else {
 groups.push({ category: cat, items: [item] });
 }
 }
 return groups;
 }, [filteredItems]);

 const performAddToCart = useCallback(async (item: MenuItem, selectedModifiers: string[] = []) => {
 if (!activeComanda) return;
 const rxDb = await initVerticalRxDb();
 const orgId = localStorage.getItem('pos_active_org_id') || activeComanda.organization_id ||'';
 if (!orgId) return;

 const existing = rxComandaItems.find(ci => {
 if (ci.item_id !== item.id) return false;
 if (ci.pagado_cantidad && ci.pagado_cantidad > 0) return false;
 const ciMods = [...(ci.modificadores || [])].sort();
 const itemMods = [...selectedModifiers].sort();
 return JSON.stringify(ciMods) === JSON.stringify(itemMods);
 });

 if (existing) {
 const now = new Date().toISOString();
 const doc = await rxDb.comanda_items.findOne(existing.id).exec(true);
 if (doc) {
 const currentCantidad = (doc as any).cantidad ?? existing.cantidad ?? 0;
 await doc.update({
 $set: {
 cantidad: currentCantidad + 1,
 updated_at: now,
 _modified: now
 }
 } as any);
 }
 } else {
 await rxDb.comanda_items.insert({
 id: crypto.randomUUID(),
 comanda_id: activeComanda.id,
 item_id: item.id,
 nombre: item.nombre,
 precio: item.precio,
 cantidad: 1,
 modificadores: selectedModifiers,
 es_bebida: item.es_bebida ?? null,
 estado:'pendiente',
 pagado_cantidad: 0,
 created_at: new Date().toISOString(),
 updated_at: new Date().toISOString(),
 organization_id: orgId,
 _deleted: false,
 _modified: new Date().toISOString()
 });
 }
 }, [activeComanda, rxComandaItems]);

 const handleAddProduct = useCallback(async (item: MenuItem) => {
 if (!activeComanda) {
 showToast.error('Vista de solo lectura','Debes seleccionar o abrir una mesa para añadir productos.');
 return;
 }

 if (item.modificadores && item.modificadores.length > 0 && !detailItem) {
 setModifyingItem(item);
 return;
 }

 await performAddToCart(item);
 }, [activeComanda, detailItem, performAddToCart]);

 if (isLoading) {
 return (
 <div className="h-full w-full flex items-center justify-center bg-background text-muted-foreground text-xs font-semibold">
 Cargando catálogo...
 </div>
 );
 }

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
 {/* HEADER PRINCIPAL */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center shrink-0 shadow-xs z-10 gap-3">
 {!hideBackButton && (
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-lg bg-muted text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0">
 <ArrowLeft size={20} weight="bold"/>
 </button>
 )}

 <div className="relative flex-1">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
 <Input
 type="text"placeholder="Buscar productos..."value={searchQueryInput}
 onChange={(e) => setSearchQueryInput(e.target.value)}
 className="w-full h-9 pl-9 pr-8"/>
 {searchQueryInput && (
 <button
 type="button"onClick={() => { setSearchQueryInput(''); setSearchQueryDebounced(''); }}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
 <X size={14} weight="bold"/>
 </button>
 )}
 </div>
 </header>

 {/* BARRA DE CATEGORÍAS */}
 <div className="h-12 px-6 bg-card border-b border-border flex items-center shrink-0 overflow-x-auto hide-scrollbar gap-2">
 {['Todos','Favoritos', ...categories].map((cat) => {
 const active = (selectedCategory ??'Todos') === cat;
 return (
 <button
 key={cat}
 type="button"onClick={() => setSelectedCategory(cat ==='Todos'? null : cat)}
 className={cn("px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border",
 active
 ?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 {cat}
 </button>
 );
 })}
 </div>

 {/* GRID DE PRODUCTOS */}
 <main
 onTouchStart={handleTouchStart}
 onTouchMove={handleTouchMove}
 onTouchEnd={handleTouchEnd}
 className="flex-1 overflow-y-auto p-5 pb-24">
 {filteredItems.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
 <div className="w-20 h-20 flex items-center justify-center">
 <img src="/no_resultado.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h3 className="font-extrabold text-foreground text-base">Sin resultados</h3>
 <p className="text-muted-foreground text-xs">No hay productos que coincidan con la búsqueda</p>
 </div>
 ) : (
 <div className="flex flex-col gap-6">
 {groupedItems.map(group => (
 <div key={group.category} className="flex flex-col gap-2">
 <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
 {group.category}
 </span>
 <div className="pos-menu-grid">
 {group.items.map(item => (
 <ProductCardV2
 key={item.id}
 item={item}
 onAdd={handleAddProduct}
 currentQty={itemQuantities[item.id] || 0}
 ivaPorcentaje={ivaPorcentaje}
 preciosConIva={preciosConIva}
 />
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </main>

 {/* MODAL DETALLES PRODUCTO */}
 <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
 <DialogContent className="max-w-md overflow-hidden flex flex-col p-0 gap-0">
 {detailItem && (
 <>
 <DialogTitle className="sr-only">{detailItem.nombre}</DialogTitle>
 <DialogDescription className="sr-only">Detalle del producto</DialogDescription>
 <img
 src={detailItem.imagen_url ||'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop'}
 alt={detailItem.nombre}
 className="w-full h-48 object-cover"/>
 <div className="p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-lg text-foreground">{detailItem.nombre}</h3>
            <span className="text-xs font-semibold text-muted-foreground">{detailItem.categoria_nombre}</span>
          </div>
          <span className="text-xl font-black text-primary">
            ${(!preciosConIva && detailItem.iva_modalidad === 'sistema'
              ? detailItem.precio * (1 + ivaPorcentaje / 100)
              : detailItem.precio
            ).toFixed(2)}
          </span>
        </div>

 <div className="w-full h-[1px] bg-border"/>

 <div>
 <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider block mb-1">Descripción</span>
 <p className="text-xs text-muted-foreground leading-relaxed">
 {detailItem.descripcion ||'No hay una descripción disponible para este producto todavía.'}
 </p>
 </div>

 <div className="flex items-center gap-2 pt-2">
 <Button
 type="button"variant="outline"onClick={() => setDetailItem(null)}
 className="flex-1 font-bold text-xs">
 Cerrar
 </Button>
 <Button
 type="button"onClick={() => {
 handleAddProduct(detailItem);
 setDetailItem(null);
 }}
 className="flex-1 font-extrabold text-xs gap-1.5">
 <Plus size={16} weight="bold"/> Añadir al Pedido
 </Button>
 </div>
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>

 <ProductModifiersModal
 key={modifyingItem?.id}
 opened={!!modifyingItem}
 onClose={() => setModifyingItem(null)}
 product={modifyingItem}
 onConfirm={(selected) => {
 const item = modifyingItem;
 if (item) {
 performAddToCart(item, selected).catch(err => {
 console.error('[ProductSelector] error añadiendo item con modificadores:', err);
 showToast.error('Error al añadir', err?.message ?? String(err));
 });
 }
 }}
 />
 </div>
 );
}

interface ProductCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  currentQty: number;
  ivaPorcentaje: number;
  preciosConIva: boolean;
}

const ProductCardV2 = memo(function ProductCardV2({ item, onAdd, currentQty, ivaPorcentaje, preciosConIva }: ProductCardProps) {
  const isSelected = currentQty > 0;
  
  const finalPrice = !preciosConIva && item.iva_modalidad === 'sistema'
    ? item.precio * (1 + ivaPorcentaje / 100)
    : item.precio;

  return (
    <div
      onClick={() => onAdd(item)}
      className={cn("p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none active:scale-98 min-h-[90px]",
        isSelected
          ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-card text-foreground border-border")}
    >
      <span className={cn("font-bold text-sm line-clamp-2", isSelected ? "text-primary-foreground" : "text-foreground")}>
        {item.nombre}
      </span>

      <div className="flex items-center justify-between mt-3">
        {isSelected ? (
          <span className="px-2.5 py-1 rounded-md bg-primary-foreground/20 text-primary-foreground font-black text-sm">
            {currentQty}
          </span>
        ) : (
          <button
            type="button" onClick={async (e) => {
              e.stopPropagation();
              const rxDb = await initVerticalRxDb();
              await rxDb.menu_items.findOne(item.id).exec(true).then(doc => doc.update({ $set: { favorito: !item.favorito, _modified: new Date().toISOString() } } as any));
            }}
            className="text-muted-foreground/50 transition-colors cursor-pointer">
            <Star size={16} weight={item.favorito ? 'fill' : 'bold'} className={item.favorito ? 'text-amber-400' : ''} />
          </button>
        )}

        <span className={cn("font-black text-base", isSelected ? "text-primary-foreground" : "text-primary")}>
          ${finalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
});
