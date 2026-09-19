import { useState, useMemo, useEffect, useCallback, memo } from'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MagnifyingGlass, X, Star, Plus, ForkKnife } from'@phosphor-icons/react';
import { type Comanda, type ComandaItem, type MenuItem } from'../../db/database';
import { showToast } from'@/lib/toast';
import { ProductModifiersModal } from'../Products/ProductModifiersModal';
import { initVerticalRxDb } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { useComandaIva } from '../../hooks/useComandaIva';
import { getRecentProductIds, registerRecentProduct } from '@/lib/recentProducts';
import { getCategoryIcon } from '@/lib/categoryIcons';
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
  const { porcentaje: ivaPorcentaje, preciosConIva } = useComandaIva(activeComanda);
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const [searchQueryDebounced, setSearchQueryDebounced] = useState('');
  const [navbarSlot, setNavbarSlot] = useState<HTMLElement | null>(null);
  const [navbarSearchSlot, setNavbarSearchSlot] = useState<HTMLElement | null>(null);

  // La navbar movil puede montar en cualquier momento sin relacion con el
  // ciclo de vida de este selector - un timeout fijo de una sola vez dejaba
  // los botones Volver/Categorias/Buscar perdidos para siempre si el slot
  // no existia todavia en ese instante. En vez de observar todo el body
  // (dispara con cualquier mutacion de DOM en toda la app - costoso, esta
  // es la pantalla mas usada), se observa el body SOLO hasta encontrar el
  // contenedor raiz estable de la navbar, y desde ahi se limita a observar
  // adentro de ese nodo, que cambia con mucha menos frecuencia.
  useEffect(() => {
    const syncSlots = () => {
      setNavbarSlot(document.getElementById('mobile-navbar-cart-action-slot'));
      setNavbarSearchSlot(document.getElementById('mobile-navbar-cart-search-slot'));
    };
    syncSlots();

    let innerObserver: MutationObserver | null = null;
    const outerObserver = new MutationObserver(() => {
      const root = document.getElementById('mobile-navbar-root');
      if (root && !innerObserver) {
        outerObserver.disconnect();
        syncSlots();
        innerObserver = new MutationObserver(syncSlots);
        innerObserver.observe(root, { childList: true, subtree: true });
      }
    });

    const existingRoot = document.getElementById('mobile-navbar-root');
    if (existingRoot) {
      innerObserver = new MutationObserver(syncSlots);
      innerObserver.observe(existingRoot, { childList: true, subtree: true });
    } else {
      outerObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      outerObserver.disconnect();
      innerObserver?.disconnect();
    };
  }, []);

 useEffect(() => {
 const handler = setTimeout(() => {
 setSearchQueryDebounced(searchQueryInput);
 }, 150);
 return () => clearTimeout(handler);
 }, [searchQueryInput]);

 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
 const [modifyingItem, setModifyingItem] = useState<MenuItem | null>(null);
 const [rxComandaItems, setRxComandaItems] = useState<ComandaItem[]>([]);
 const [recentProductIds, setRecentProductIds] = useState<string[]>(() => getRecentProductIds());

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

 // Nombre de categoría -> es comida incluida en el plan del hotel (ej.
 // menú de huésped), para distinguir visualmente ese grupo en el grid.
 const planCategoryNames = useMemo(
 () => new Set(safeDbCategorias.filter(c => c.es_comida_incluida).map(c => c.nombre)),
 [safeDbCategorias]
 );

 // Nombre de categoría -> ícono elegido por el admin (ver categoryIcons.ts),
 // para reemplazar el texto plano por algo reconocible de un vistazo.
 const categoryIconByName = useMemo(
 () => new Map(safeDbCategorias.filter(c => c.icono).map(c => [c.nombre, c.icono as string])),
 [safeDbCategorias]
 );

 // "Usados recientemente" en ESTE dispositivo — clientes suelen repetir lo
 // mismo, así que esto ahorra navegar categorías en pedidos largos. Solo
 // productos que siguen existiendo y activos (uno inactivo, ej. plato del
 // menú de huésped de ayer, no debe seguir apareciendo acá).
 const recentItems = useMemo(() => {
 const byId = new Map(safeMenuItems.map(i => [i.id, i]));
 return recentProductIds
 .map(id => byId.get(id))
 .filter((i): i is MenuItem => !!i && i.activo !== false);
 }, [recentProductIds, safeMenuItems]);

 const categories = useMemo(() => {
 // Igual que filteredItems: si ningún producto de una categoría está
 // activo hoy (ej. menú de huésped sin platos habilitados), el chip no
 // debe aparecer vacío en la lista.
 const cats = new Set(safeMenuItems.filter(i => i.activo !== false).map(i => i.categoria_nombre || 'Sin Categoría'));
 const orderMap = new Map(safeDbCategorias.map((c, idx) => [c.nombre, idx]));
 
 return Array.from(cats).sort((a, b) => {
 const orderA = orderMap.has(a) ? orderMap.get(a)! : 999999;
 const orderB = orderMap.has(b) ? orderMap.get(b)! : 999999;
 if (orderA !== orderB) return orderA - orderB;
 return a.localeCompare(b);
 });
 }, [safeMenuItems, safeDbCategorias]);

 const filteredItems = useMemo(() => {
 // Un producto inactivo (ej. plato del menú de huésped que hoy no está
 // disponible) nunca debe poder pedirse — activo es el flag que ya existía
 // en el catálogo, pero hasta ahora no bloqueaba nada acá.
 const items = safeMenuItems.filter(item => {
 if (item.activo === false) return false;

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

 registerRecentProduct(item.id);
 setRecentProductIds(getRecentProductIds());
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
  <header className="h-16 px-4 bg-card border-b border-border flex items-center shrink-0 shadow-xs z-10 gap-2">
    {!hideBackButton && (
      <button
        type="button" onClick={onBack}
        className="w-10 h-10 rounded-lg bg-muted text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0">
        <ArrowLeft size={18} weight="bold"/>
      </button>
    )}
    {(selectedCategory || searchQueryDebounced) && (
      <button
        type="button"
        onClick={() => {
          setSelectedCategory(null);
          setSearchQueryInput('');
          setSearchQueryDebounced('');
        }}
        title="Volver a categorías"
        className="w-10 h-10 rounded-lg bg-orange-500 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 hover:bg-orange-600">
        <ForkKnife size={18} weight="fill"/>
      </button>
    )}
    <div className="relative flex-1">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
      <Input
        id="product-search-input"
        type="text" placeholder="Buscar productos..." value={searchQueryInput}
        onChange={(e) => setSearchQueryInput(e.target.value)}
        className="w-full h-10 pl-9 pr-8 text-sm"/>
      {searchQueryInput && (
        <button
          type="button" onClick={() => { setSearchQueryInput(''); setSearchQueryDebounced(''); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <X size={14} weight="bold"/>
        </button>
      )}
    </div>
  </header>

  {/* CONTENIDO PRINCIPAL */}
  <div className="flex-1 relative flex flex-col min-h-0">
    <main className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+112px)] relative">
      {(!selectedCategory && !searchQueryDebounced) ? (
        /* HOME DE CATEGORÍAS */
        <div className="flex flex-col gap-5">
          {recentItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
                Usados recientemente
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {recentItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddProduct(item)}
                    className="flex items-center px-4 py-2.5 rounded-full bg-card border border-border shadow-sm hover:bg-muted transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-sm text-foreground whitespace-nowrap">{item.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setSelectedCategory('Favoritos')}
              className="h-20 flex items-center justify-center px-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all active:scale-95 cursor-pointer"
            >
              <span className="flex flex-col items-center gap-1 max-w-full">
                <Star size={22} weight="fill" className="shrink-0" />
                <span className="font-semibold text-base text-center line-clamp-2">Favoritos</span>
              </span>
            </button>
            {categories.map((cat) => {
              const CategoryIcon = getCategoryIcon(categoryIconByName.get(cat));
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn("h-20 flex items-center justify-center px-2 rounded-2xl border transition-all active:scale-95 shadow-sm cursor-pointer",
                    planCategoryNames.has(cat)
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                      : "bg-card border-border text-foreground hover:bg-muted")}
                >
                  <span className="flex flex-col items-center gap-1 max-w-full">
                    <span className="shrink-0 w-[22px] h-[22px] flex items-center justify-center">
                      {CategoryIcon && <CategoryIcon size={22} weight="bold" />}
                    </span>
                    <span className="font-semibold text-base text-center leading-tight line-clamp-2">{cat}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* GRID DE PRODUCTOS */
        filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-20 h-20 flex items-center justify-center">
              <img src="/no_resultado.webp" alt="" aria-hidden="true" className="w-full h-full object-contain" />
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
        )
      )}
    </main>

    {/* BOTÓN IZQUIERDO EN EL NAVBAR (Vía Portal) */}
    {navbarSlot && (!hideBackButton || selectedCategory || searchQueryDebounced) && createPortal(
      <button
        type="button"
        onClick={() => {
          if (selectedCategory || searchQueryDebounced) {
            setSelectedCategory(null);
            setSearchQueryInput('');
            setSearchQueryDebounced('');
          } else {
            onBack();
          }
        }}
        className={cn(
          "flex items-center justify-center w-14 h-14 rounded-full shadow-lg cursor-pointer active:scale-95 transition-all",
          (selectedCategory || searchQueryDebounced)
            ? "bg-orange-500 text-white shadow-orange-500/30"
            : "bg-nav text-nav-foreground shadow-black/20"
        )}
      >
        {(selectedCategory || searchQueryDebounced) ? (
          <ForkKnife size={22} weight="fill" />
        ) : (
          <ArrowLeft size={22} weight="bold" />
        )}
      </button>,
      navbarSlot
    )}

    {/* BOTÓN DERECHO EN EL NAVBAR (Vía Portal) */}
    {navbarSearchSlot && createPortal(
      <button
        type="button"
        onClick={() => {
          const input = document.getElementById('product-search-input');
          if (input) input.focus();
        }}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-nav text-nav-foreground shadow-lg shadow-black/20 cursor-pointer active:scale-95 transition-transform"
      >
        <MagnifyingGlass size={22} weight="bold" />
      </button>,
      navbarSearchSlot
    )}
  </div>

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
      className={cn("p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none active:scale-98 min-h-[104px]",
        isSelected
          ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-card text-foreground border-border")}
    >
      <span className={cn("font-bold text-base line-clamp-2", isSelected ? "text-primary-foreground" : "text-foreground")}>
        {item.nombre}
      </span>

      <div className="flex items-center justify-between mt-3">
        {isSelected ? (
          <span className="px-2.5 py-1 rounded-md bg-primary-foreground/20 text-primary-foreground font-black text-base">
            {currentQty}
          </span>
        ) : (
          <button
            type="button" onClick={async (e) => {
              e.stopPropagation();
              const rxDb = await initVerticalRxDb();
              await rxDb.menu_items.findOne(item.id).exec(true).then(doc => doc.update({ $set: { favorito: !item.favorito, _modified: new Date().toISOString() } } as any));
            }}
            className="text-muted-foreground/50 transition-colors cursor-pointer p-1 -m-1">
            <Star size={18} weight={item.favorito ? 'fill' : 'bold'} className={item.favorito ? 'text-amber-400' : ''} />
          </button>
        )}

        <span className={cn("font-black text-base", isSelected ? "text-primary-foreground" : "text-primary")}>
          ${finalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
});
