import { useState, useMemo, useEffect, useCallback, memo } from'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MagnifyingGlass, X, Star, Plus, ForkKnife, ClockCounterClockwise } from'@phosphor-icons/react';
import { type Comanda, type ComandaItem, type MenuItem } from'../../db/database';
import { showToast } from'@/lib/toast';
import { ProductModifiersModal } from'../Products/ProductModifiersModal';
import { initVerticalRxDb } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { useComandaIva } from '../../hooks/useComandaIva';
import { getRecentProductIds, registerRecentProduct } from '@/lib/recentProducts';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { useIsMobile } from '../../hooks/useIsMobile';
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
 const isMobile = useIsMobile();

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

 // En PC la búsqueda es global: la categoría elegida en la columna izquierda
 // no debe limitar los resultados (antes buscar dentro de una categoría
 // parecía que el buscador no encontraba nada).
 if (!isMobile && searchQueryDebounced) return matchesSearch;

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
 }, [safeMenuItems, searchQueryDebounced, selectedCategory, safeDbCategorias, isMobile]);

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

 // ── Escritorio: columna de categorías + columna con todos sus productos ──
 // Sin búsqueda activa, en PC se ven siempre las categorías a la izquierda y los
 // productos de la elegida a la derecha, para pedir sin ir y volver al home.
 const pcSplit = !isMobile && !searchQueryDebounced;
 const categoriaPC = selectedCategory ?? categories[0] ?? 'Favoritos';
 const conteoPorCategoria = useMemo(() => {
 const map = new Map<string, number>();
 for (const it of safeMenuItems) {
 if (it.activo === false) continue;
 const cat = it.categoria_nombre || 'Sin Categoría';
 map.set(cat, (map.get(cat) ?? 0) + 1);
 }
 return map;
 }, [safeMenuItems]);
 const itemsPC = useMemo(() => {
 if (categoriaPC === 'Recientes') return recentItems;
 return safeMenuItems
 .filter(it => it.activo !== false && (categoriaPC === 'Favoritos'
 ? it.favorito
 : (it.categoria_nombre || 'Sin Categoría') === categoriaPC))
 .sort((a, b) => a.nombre.localeCompare(b.nombre));
 }, [safeMenuItems, categoriaPC, recentItems]);
 const favoritosCount = useMemo(() => safeMenuItems.filter(it => it.activo !== false && it.favorito).length, [safeMenuItems]);

 const performAddToCart = useCallback(async (item: MenuItem, selectedModifiers: string[] = []) => {
 if (!activeComanda) return;
 const rxDb = await initVerticalRxDb();
 const orgId = localStorage.getItem('pos_active_org_id') || activeComanda.organization_id ||'';
 if (!orgId) return;

 const existing = rxComandaItems.find(ci => {
 if (ci.item_id !== item.id) return false;
 // Precio variable: cada toque es una línea propia (su precio se ajusta
 // por separado); sumar cantidad aplicaría un precio ya cambiado a todo.
 if ((item as any).precio_variable) return false;
 // Un ítem anulado es un estado terminal — nunca se reutiliza para sumar
 // cantidad, siempre debe crear una fila nueva independiente.
 if (ci.anulado) return false;
 if (ci.pagado_cantidad && ci.pagado_cantidad > 0) return false;
 const ciMods = [...(ci.modificadores || [])].sort();
 const itemMods = [...selectedModifiers].sort();
 return JSON.stringify(ciMods) === JSON.stringify(itemMods);
 });

 if (existing) {
 const now = new Date().toISOString();
 const doc = await rxDb.comanda_items.findOne(existing.id).exec(true);
 if (doc) {
 // Atómico: dos toques seguidos se encadenan en vez de leer el mismo valor
 // y escribir ambos "+1" sobre él (se perdía una unidad).
 await doc.incrementalModify((d: any) => ({
 ...d,
 cantidad: (d.cantidad ?? existing.cantidad ?? 0) + 1,
 updated_at: now,
 _modified: now,
 }));
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
 <div className="flex flex-col h-full w-full bg-nav text-foreground overflow-hidden">
  {/* HEADER PRINCIPAL: mismo marco oscuro que el resto de páginas */}
  <header className="h-16 md:h-[72px] px-4 md:px-6 bg-nav text-nav-foreground flex items-center shrink-0 z-10 gap-2">
    {!hideBackButton && (
      <button
        type="button" onClick={onBack}
        className="w-10 h-10 rounded-xl bg-nav-foreground/10 hover:bg-nav-foreground/15 text-nav-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0">
        <ArrowLeft size={18} weight="bold"/>
      </button>
    )}
    <div className="relative flex-1">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nav-foreground/60 z-10 pointer-events-none"/>
      <Input
        id="product-search-input"
        type="text" placeholder="Buscar productos..." value={searchQueryInput}
        onChange={(e) => setSearchQueryInput(e.target.value)}
        className="w-full h-10 pl-9 pr-8 text-sm font-semibold rounded-xl bg-nav-foreground/10 border-transparent shadow-none text-nav-foreground placeholder:text-nav-foreground/55 focus-visible:ring-nav-foreground/30"/>
      {searchQueryInput && (
        <button
          type="button" onClick={() => { setSearchQueryInput(''); setSearchQueryDebounced(''); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nav-foreground/60 hover:text-nav-foreground">
          <X size={14} weight="bold"/>
        </button>
      )}
    </div>
    {(isMobile ? (selectedCategory || searchQueryDebounced) : searchQueryDebounced) && (
      <button
        type="button"
        onClick={() => {
          setSelectedCategory(null);
          setSearchQueryInput('');
          setSearchQueryDebounced('');
        }}
        title="Volver a categorías"
        className="w-10 h-10 rounded-xl bg-nav-foreground text-nav flex items-center justify-center transition-colors cursor-pointer shrink-0 hover:bg-nav-foreground/90">
        <ForkKnife size={18} weight="fill"/>
      </button>
    )}
  </header>

  {/* CONTENIDO PRINCIPAL */}
  <div className="flex-1 relative flex flex-col min-h-0 bg-background rounded-t-2xl md:rounded-t-none md:rounded-tl-2xl overflow-hidden">
    {pcSplit && (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Categorías arriba, en filas que se acomodan solas (2–3 en pantallas típicas).
            La barra crece con sus filas (sin scroll propio); solo se limita al 45% de la altura
            de la ventana como tope de seguridad para dejar siempre espacio a los productos. */}
        <nav
          aria-label="Categorías"
          className="@container shrink-0 bg-background px-3 py-2 @6xl:px-4 @6xl:py-3 flex flex-wrap gap-1.5 @6xl:gap-2 max-h-[45dvh] overflow-y-auto"
        >
          {[
            { id: 'Favoritos', icon: Star, count: favoritosCount, plan: false, fav: true },
            ...(recentItems.length > 0 ? [{ id: 'Recientes', icon: ClockCounterClockwise, count: recentItems.length, plan: false, fav: false }] : []),
            ...categories.map(cat => ({ id: cat, icon: getCategoryIcon(categoryIconByName.get(cat)) ?? ForkKnife, count: conteoPorCategoria.get(cat) ?? 0, plan: planCategoryNames.has(cat), fav: false })),
          ].map(c => {
            const Icon = c.icon;
            const activa = categoriaPC === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                aria-pressed={activa}
                className={cn("h-8 pl-2.5 pr-3 @6xl:h-10 @6xl:pl-3 @6xl:pr-3.5 rounded-full flex items-center gap-1.5 @6xl:gap-2 text-xs @6xl:text-sm whitespace-nowrap transition-colors cursor-pointer",
                  c.fav
                    ? (activa ? "bg-warning-foreground text-white font-extrabold shadow-xs" : "bg-warning-soft text-warning-foreground font-bold hover:bg-warning/20")
                    : c.id === 'Recientes'
                    ? (activa ? "bg-foreground text-background font-extrabold shadow-xs" : "bg-card text-foreground font-bold shadow-xs hover:bg-muted")
                    : c.plan
                    ? (activa ? "bg-info text-white font-extrabold shadow-xs" : "bg-info/10 text-info-foreground font-bold hover:bg-info/15")
                    : (activa ? "bg-primary text-primary-foreground font-extrabold shadow-xs" : "bg-card text-foreground font-bold shadow-xs hover:bg-muted"))}
              >
                <Icon size={16} weight={c.fav || activa ? 'fill' : 'bold'} className="@6xl:size-[18px]" />
                {c.id}
              </button>
            );
          })}
        </nav>

        {/* Columna de productos de la categoría elegida */}
        <section className="@container flex-1 min-w-0 overflow-y-auto p-4">
          {itemsPC.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="w-20 h-20 flex items-center justify-center">
                <img src="/no_resultado.webp" alt="" aria-hidden="true" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-extrabold text-foreground text-base">Sin productos</h3>
              <p className="text-muted-foreground text-xs">
                {categoriaPC === 'Favoritos' ? 'Marca productos con la estrella para verlos aquí.' : 'No hay productos disponibles en esta categoría.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">{categoriaPC}</span>
              <div className="flex flex-col gap-2 @md:grid @md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] @md:gap-3">
                {itemsPC.map(item => (
                  <ProductCardV2
                    key={item.id}
                    item={item}
                    onAdd={handleAddProduct}
                    currentQty={itemQuantities[item.id] || 0}
                    ivaPorcentaje={ivaPorcentaje}
                    preciosConIva={preciosConIva}
                    categoryIcon={getCategoryIcon(categoryIconByName.get(item.categoria_nombre || ''))}
                    isPlanItem={planCategoryNames.has(item.categoria_nombre || 'Sin Categoría')}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    )}

    {!pcSplit && (
    <main className="@container flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+112px)] relative">
      {(!selectedCategory && !searchQueryDebounced) ? (
        /* HOME DE CATEGORÍAS */
        <div className="flex flex-col gap-5">
          {recentItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
                Usados recientemente
              </span>
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 py-1 @md:flex-wrap @md:overflow-visible @md:mx-0 @md:px-0 @md:py-0">
                {recentItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddProduct(item)}
                    className="flex items-center shrink-0 px-4 py-2.5 rounded-full bg-card shadow-xs hover:bg-muted transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-sm text-foreground whitespace-nowrap">{item.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Mismo lenguaje que PC: categorías como pills (icono + nombre), aquí en grid. */}
          <div className="grid grid-cols-2 gap-2 @md:gap-3 @lg:grid-cols-3 @xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setSelectedCategory('Favoritos')}
              className="h-12 flex items-center gap-2 pl-3.5 pr-4 rounded-full bg-warning-soft text-warning-foreground font-bold text-sm transition-all active:scale-95 transform-gpu cursor-pointer"
            >
              <Star size={20} weight="fill" className="shrink-0" />
              <span className="truncate">Favoritos</span>
            </button>
            {categories.map((cat) => {
              const CategoryIcon = getCategoryIcon(categoryIconByName.get(cat)) ?? ForkKnife;
              const plan = planCategoryNames.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn("h-12 flex items-center gap-2 pl-3.5 pr-4 rounded-full font-bold text-sm transition-all active:scale-95 transform-gpu cursor-pointer",
                    plan
                      ? "bg-info/10 text-info-foreground"
                      : "bg-card text-foreground shadow-xs")}
                >
                  <CategoryIcon size={20} weight="bold" className="shrink-0" />
                  <span className="truncate">{cat}</span>
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
                {/* Lista (icono + texto + precio) en paneles angostos, grid de cards
                    cuando el panel es ancho — según el ancho real del contenedor
                    (@container), no del viewport, porque este selector puede vivir
                    embebido en layouts más anchos que el propio panel. */}
                <div className="flex flex-col gap-2 @md:grid @md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] @md:gap-3">
                  {group.items.map(item => (
                    <ProductCardV2
                      key={item.id}
                      item={item}
                      onAdd={handleAddProduct}
                      currentQty={itemQuantities[item.id] || 0}
                      ivaPorcentaje={ivaPorcentaje}
                      preciosConIva={preciosConIva}
                      categoryIcon={getCategoryIcon(categoryIconByName.get(item.categoria_nombre || ''))}
                      isPlanItem={planCategoryNames.has(item.categoria_nombre || 'Sin Categoría')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </main>
    )}

    {/* BOTÓN IZQUIERDO EN EL NAVBAR (Vía Portal) */}
    {navbarSlot && (!hideBackButton || selectedCategory || searchQueryDebounced) && createPortal(
      <Button
        type="button"
        variant="warning"
        onClick={() => {
          if (selectedCategory || searchQueryDebounced) {
            setSelectedCategory(null);
            setSearchQueryInput('');
            setSearchQueryDebounced('');
          } else {
            onBack();
          }
        }}
        aria-label={(selectedCategory || searchQueryDebounced) ? 'Volver a categorías' : 'Volver'}
        className="size-14 rounded-full drop-shadow-lg active:scale-95"
      >
        {(selectedCategory || searchQueryDebounced) ? (
          <ForkKnife size={22} weight="fill" />
        ) : (
          <ArrowLeft size={22} weight="bold" />
        )}
      </Button>,
      navbarSlot
    )}

    {/* BOTÓN DERECHO EN EL NAVBAR (Vía Portal) */}
    {navbarSearchSlot && createPortal(
      <Button
        type="button" variant="warning" aria-label="Buscar productos"
        onClick={() => {
          const input = document.getElementById('product-search-input');
          if (input) input.focus();
        }}
        className="size-14 rounded-full drop-shadow-lg active:scale-95"
      >
        <MagnifyingGlass size={22} weight="bold" />
      </Button>,
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
          <span className="text-xl font-black text-foreground">
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
  categoryIcon: ReturnType<typeof getCategoryIcon>;
  isPlanItem: boolean;
}

// Un único componente cuyo propio layout cambia según el ancho del panel
// (@container en <main>, no el viewport global): fila compacta con ícono
// cuando el panel es angosto, card cuando hay espacio. Así nunca se
// duplica el render entre "mobile" y "desktop" — solo existe una versión
// del producto en el DOM en todo momento.
const ProductCardV2 = memo(function ProductCardV2({ item, onAdd, currentQty, ivaPorcentaje, preciosConIva, categoryIcon: CategoryIcon, isPlanItem }: ProductCardProps) {
  const isSelected = currentQty > 0;

  const finalPrice = !preciosConIva && item.iva_modalidad === 'sistema'
    ? item.precio * (1 + ivaPorcentaje / 100)
    : item.precio;

  const alternarFavorito = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const rxDb = await initVerticalRxDb();
    await rxDb.menu_items.findOne(item.id).exec(true).then(doc => doc.update({ $set: { favorito: !item.favorito, _modified: new Date().toISOString() } } as any));
  };

  const precio = `$${finalPrice.toFixed(2)}`;

  return (
    <div
      onClick={() => onAdd(item)}
      className={cn(
        "border cursor-pointer select-none active:scale-98 transform-gpu",
        "flex items-center gap-3 px-3 py-3 rounded-xl",
        "@md:flex-col @md:items-stretch @md:gap-3 @md:p-4 @md:rounded-2xl @md:min-h-36",
        isSelected
          ? "bg-primary text-primary-foreground border-primary shadow-md"
          : isPlanItem
            ? "bg-primary/10 border-primary/25"
            : "bg-card border-border")}
    >
      {/* Panel angosto: círculo con cantidad / favorito / icono de la categoría */}
      <button
        type="button"
        onClick={alternarFavorito}
        aria-label={item.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
        className={cn("shrink-0 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer @md:hidden",
          isSelected ? "bg-primary-foreground/20 text-primary-foreground" : isPlanItem ? "bg-primary/15" : "bg-muted")}>
        {isSelected ? (
          <span className="font-black text-sm">{currentQty}</span>
        ) : item.favorito ? (
          <Star size={18} weight="fill" className="text-warning-foreground" />
        ) : (
          CategoryIcon && <CategoryIcon size={18} weight="bold" />
        )}
      </button>

      {/* Panel ancho: categoría a la izquierda, favorito a la derecha */}
      <div className="hidden @md:flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1.5 min-w-0 text-[11px] font-bold uppercase tracking-wider", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {CategoryIcon && <CategoryIcon size={14} weight="bold" className="shrink-0" />}
          <span className="truncate">{item.categoria_nombre || 'Sin categoría'}</span>
        </span>
        <button
          type="button"
          onClick={alternarFavorito}
          aria-label={item.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
          className={cn("shrink-0 -m-1 p-1 rounded-full cursor-pointer", isSelected ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground/50 hover:text-warning-foreground")}>
          <Star size={16} weight={item.favorito ? 'fill' : 'bold'} className={item.favorito && !isSelected ? 'text-warning-foreground' : undefined} />
        </button>
      </div>

      <span className={cn("flex-1 font-extrabold text-base leading-snug line-clamp-2", isSelected ? "text-primary-foreground" : "text-foreground")}>
        {item.nombre}
      </span>

      <span className={cn("shrink-0 font-black text-sm tabular-nums @md:hidden", isSelected ? "text-primary-foreground" : "text-foreground")}>{precio}</span>

      <div className="hidden @md:flex items-end justify-between gap-2">
        <span className={cn("text-xl font-black leading-none tabular-nums", isSelected ? "text-primary-foreground" : "text-foreground")}>{precio}</span>
        {isSelected && (
          <span className="min-w-7 h-7 px-2 rounded-full bg-primary-foreground text-primary text-sm font-black flex items-center justify-center tabular-nums">
            {currentQty}
          </span>
        )}
      </div>
    </div>
  );
});
