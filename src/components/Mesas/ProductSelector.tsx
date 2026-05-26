import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box, Stack, Group, Text, TextInput, ScrollArea,
  ActionIcon, Badge, Modal, Image, Chip,
  Divider, Button, Center, Loader
} from '@mantine/core';
import { ArrowLeft, MagnifyingGlass, X, Star, Plus } from '@phosphor-icons/react';
import { type Comanda, type ComandaItem, type MenuItem } from '../../db/database';

import { sileo } from 'sileo';
import { ProductModifiersModal } from '../Products/ProductModifiersModal';
import { initVerticalRxDb } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';

interface ProductSelectorProps {
  activeComanda?: Comanda | null;
  onBack: () => void;
  hideBackButton?: boolean;
}

export function ProductSelector({ activeComanda, onBack, hideBackButton = false }: ProductSelectorProps) {
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const [searchQueryDebounced, setSearchQueryDebounced] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQueryDebounced(searchQueryInput);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQueryInput]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Gesto swipe horizontal nativo y de alto rendimiento para categorías
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
    if (Math.abs(diffX) > 80) { // Umbral de 80px para evitar falsos positivos
      const allCats = ['Todos', 'Favoritos', ...categories];
      const currentVal = selectedCategory ?? 'Todos';
      const currentIndex = allCats.indexOf(currentVal);
      if (currentIndex !== -1) {
        if (diffX > 0) {
          // Swipe izquierdo -> Siguiente categoría (derecha)
          const nextIndex = Math.min(allCats.length - 1, currentIndex + 1);
          if (nextIndex !== currentIndex) {
            const nextVal = allCats[nextIndex];
            setSelectedCategory(nextVal === 'Todos' ? null : nextVal);
          }
        } else {
          // Swipe derecho -> Anterior categoría (izquierda)
          const prevIndex = Math.max(0, currentIndex - 1);
          if (prevIndex !== currentIndex) {
            const prevVal = allCats[prevIndex];
            setSelectedCategory(prevVal === 'Todos' ? null : prevVal);
          }
        }
      }
    }
  };
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [modifyingItem, setModifyingItem] = useState<MenuItem | null>(null);
  const [rxComandaItems, setRxComandaItems] = useState<ComandaItem[]>([]);

  const { menuItems } = useRxMenuCatalog();

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

  // Mapa de cantidades por item_id
  const itemQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    safeComandaItems.forEach(ci => {
      map[ci.item_id] = (map[ci.item_id] || 0) + ci.cantidad;
    });
    return map;
  }, [safeComandaItems]);

  // Categorías únicas ordenadas alfabéticamente
  const categories = useMemo(() => {
    const cats = new Set(safeMenuItems.map(i => i.categoria_nombre || 'Sin Categoría'));
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [safeMenuItems]);

  // Filtrar y ordenar productos
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

    // Siempre: categoría alfabética → nombre alfabético
    // En "Favoritos": favoritos ya están todos, mismo orden
    return [...items].sort((a, b) => {
      const catA = a.categoria_nombre || '';
      const catB = b.categoria_nombre || '';
      const catComp = catA.localeCompare(catB);
      if (catComp !== 0) return catComp;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [safeMenuItems, searchQueryDebounced, selectedCategory]);

  const handleAddProduct = async (item: MenuItem) => {
    if (!activeComanda) {
      sileo.error({ 
        title: 'Vista de solo lectura',
        description: 'Debes seleccionar o abrir una mesa para añadir productos.'
      });
      return;
    }

    // Si la comanda todavía no se ha sincronizado, permitimos seguir editándola
    // aunque ya tenga una cuenta/habitación asociada localmente.

    // Si tiene modificadores, abrir el modal primero
    if (item.modificadores && item.modificadores.length > 0 && !detailItem) {
      setModifyingItem(item);
      return;
    }

    await performAddToCart(item);
  };

  const performAddToCart = async (item: MenuItem, selectedModifiers: string[] = []) => {
    if (!activeComanda) return;
    const rxDb = await initVerticalRxDb();
    const orgId = localStorage.getItem('pos_active_org_id') || activeComanda.organization_id || '';
    if (!orgId) return;

    // Con la nueva lógica de confirmada_at, la comanda mantiene su estado
    // confirmada:true y los ítems añadidos después de confirmada_at se detectan
    // automáticamente como "adicionales" en SidebarDetails.

    // Verificar si ya existe en la comanda con los MISMOS modificadores
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
      // Añadir nuevo item
      await rxDb.comanda_items.insert({
        id: crypto.randomUUID(),
        comanda_id: activeComanda.id,
        item_id: item.id,
        nombre: item.nombre,
        precio: item.precio,
        cantidad: 1,
        modificadores: selectedModifiers,
        estado: 'pendiente',
        pagado_cantidad: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: orgId,
        _deleted: false,
        _modified: new Date().toISOString()
      });
    }
  };

  if (isLoading) {
    return (
      <Center h="100%" w="100%" bg="var(--pos-bg)">
        <Loader color="myColor" size="lg" type="dots" />
      </Center>
    );
  }

  return (
    <Box h="100%" className="product-selector">
      
      {/* ── HEADER PRINCIPAL ─────────────────────────────────────── */}
      <Box
        px="lg"
        className="product-selector__header"
        style={{
          height: 56,
          borderBottom: '1px solid var(--pos-border)',
          backgroundColor: 'var(--pos-surface)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <Group justify="flex-start" align="center" wrap="nowrap" w="100%" gap="md">
          {!hideBackButton && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              radius="md"
              onClick={onBack}
              className="product-selector__shrink"
            >
              <ArrowLeft size={22} weight="bold" />
            </ActionIcon>
          )}

          <TextInput
            placeholder="Buscar productos..."
            leftSection={<MagnifyingGlass size={18} color="var(--ui-primary)" />}
            rightSection={
              searchQueryInput ? (
                <ActionIcon radius="xl" variant="subtle" color="gray" onClick={() => { setSearchQueryInput(''); setSearchQueryDebounced(''); }}>
                  <X size={16} weight="bold" />
                </ActionIcon>
              ) : null
            }
            value={searchQueryInput}
            onChange={(e) => setSearchQueryInput(e.target.value)}
            radius="md"
            size="sm"
            style={{ flex: 1 }}
            className="product-selector__search"
            styles={{ 
              input: { 
                backgroundColor: 'var(--pos-bg)',
                border: '1px solid var(--pos-border)',
                height: 38
              } 
            }}
          />
        </Group>
      </Box>

      {/* ── BARRA DE CATEGORÍAS ──────────────────────────────────── */}
      <Box 
        px="lg" 
        py={10} 
        className="product-selector__categories"
      >
        <ScrollArea type="never">
          <Chip.Group
            value={selectedCategory ?? 'Todos'}
            onChange={(value) => setSelectedCategory(value === 'Todos' ? null : value as string)}
          >
            <Group gap="xs" wrap="nowrap">
              <Chip value="Todos" variant="filled" radius="xl" size="md">
                Todos
              </Chip>
              <Chip value="Favoritos" variant="filled" radius="xl" size="md">
                <Group gap={4} wrap="nowrap">
                  <Star size={13} weight={selectedCategory === 'Favoritos' ? 'fill' : 'bold'} />
                  <span>Favoritos</span>
                </Group>
              </Chip>
              {categories.map(cat => (
                <Chip key={cat} value={cat} variant="filled" radius="xl" size="md">
                  {cat}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </ScrollArea>
      </Box>

      {/* ── GRID DE PRODUCTOS ──────────────────────────────────── */}
      <Box
        flex={1}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'pan-y',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <ScrollArea style={{ flex: 1 }} p="md" offsetScrollbars>
        {filteredItems.length === 0 ? (
          <Center py={64}>
            <Stack align="center" gap="md">
              <Box style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                <img src="/no_resultado.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </Box>
              <Stack align="center" gap={4}>
                <Text fw={700} size="md" c="var(--pos-text)">Sin resultados</Text>
                <Text size="sm" c="dimmed">No hay productos que coincidan con la búsqueda</Text>
              </Stack>
            </Stack>
          </Center>
        ) : (
          <Stack gap="lg" pb={80}>
            {(() => {
              // Agrupar items por categoría manteniendo el orden ya establecido
              const groups: { category: string; items: typeof filteredItems }[] = [];
              for (const item of filteredItems) {
                const cat = item.categoria_nombre || 'Sin Categoría';
                const last = groups[groups.length - 1];
                if (last && last.category === cat) {
                  last.items.push(item);
                } else {
                  groups.push({ category: cat, items: [item] });
                }
              }
              return groups.map(group => (
                <Box key={group.category}>
                  <Text
                    fw={800}
                    size="xs"
                    tt="uppercase"
                    c="dimmed"
                    mb="xs"
                    px={4}
                    className="product-selector__category-title"
                  >
                    {group.category}
                  </Text>
                  <Box
                    className="product-selector__grid"
                  >
                    {group.items.map(item => (
                      <ProductCard
                        key={item.id}
                        item={item}
                        onAdd={() => handleAddProduct(item)}
                        currentQty={itemQuantities[item.id] || 0}
                      />
                    ))}
                  </Box>
                </Box>
              ));
            })()}
          </Stack>
        )}
        </ScrollArea>
      </Box>

      {/* ── MODAL DE DETALLES DEL PRODUCTO ─────────────────────────── */}
      <Modal
        opened={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={<Text fw={800} size="lg">Detalles del Producto</Text>}
        centered
        radius="xl"
        size="lg"
        padding={0}
        styles={{
          header: { padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)', borderBottom: '1px solid var(--pos-border)' },
          content: { overflow: 'hidden' }
        }}
      >
        {detailItem && (
          <Box>
            <Image
              src={detailItem.imagen_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop'}
              h={300}
              fallbackSrc="https://placehold.co/600x400?text=Sin+Imagen"
            />
            <Stack p="xl" gap="md">
              <Group justify="space-between" align="flex-start">
                <Box flex={1}>
                  <Text size="xl" fw={800} lh={1.1}>{detailItem.nombre}</Text>
                  <Text size="sm" c="dimmed" fw={600} mt={4}>{detailItem.categoria_nombre}</Text>
                </Box>
                <Text size="24px" fw={900} c="myColor">${detailItem.precio.toFixed(2)}</Text>
              </Group>

              <Divider />

              <Box>
                <Text fw={700} size="sm" mb={8} c="dimmed" tt="uppercase" className="product-selector__detail-label">
                  Descripción
                </Text>
                <Text size="md" lh={1.6}>
                  {detailItem.descripcion || 'No hay una descripción disponible para este producto todavía. Pregunta a cocina por los ingredientes principales y posibles alérgenos.'}
                </Text>
              </Box>

              <Group grow mt="lg">
                <Button variant="light" color="gray" radius="md" size="lg" onClick={() => setDetailItem(null)}>
                  Cerrar
                </Button>
                <Button 
                  color="myColor" 
                  radius="md" 
                  size="lg" 
                  leftSection={<Plus size={20} weight="bold" />}
                  onClick={() => {
                    handleAddProduct(detailItem);
                    setDetailItem(null);
                  }}
                >
                  Añadir al Pedido
                </Button>
              </Group>
            </Stack>
          </Box>
        )}
      </Modal>

      <ProductModifiersModal 
        opened={!!modifyingItem}
        onClose={() => setModifyingItem(null)}
        product={modifyingItem}
        onConfirm={(selected) => {
          if (modifyingItem) {
            performAddToCart(modifyingItem, selected);
          }
        }}
      />
    </Box>
  );
}

// ── CARD DE PRODUCTO ─────────────────────────────────────────────
interface ProductCardProps {
  item: MenuItem;
  onAdd: () => void;
  currentQty: number;
}

function ProductCard({ item, onAdd, currentQty }: ProductCardProps) {
  const isSelected = currentQty > 0;

  return (
    <Box
      component="div"
      className={`tap product-selector__card${isSelected ? ' product-selector__card--selected' : ''}`}
      onClick={onAdd}
    >
      {/* Nombre — ocupa el espacio superior, clamped a 2 líneas */}
      <Text
        fw={700}
        size="sm"
        c={isSelected ? 'white' : 'var(--pos-text)'}
        className="product-selector__card-name"
      >
        {item.nombre}
      </Text>

      {/* Footer: estrella / cantidad  +  precio */}
      <Group justify="space-between" align="center" mt={8} wrap="nowrap">
        {isSelected ? (
          <Badge
            variant="white"
            color="myColor"
            radius="md"
            px={8}
            styles={{ root: { fontWeight: 900, fontSize: 13, height: 24 } }}
          >
            {currentQty}
          </Badge>
        ) : (
          <ActionIcon
            variant="subtle"
            color={item.favorito ? 'yellow' : 'gray'}
            size={24}
            radius="xl"
            onClick={async (e) => {
              e.stopPropagation();
              // favorito aún vive en el catálogo nuevo
              const rxDb = await initVerticalRxDb();
              await rxDb.menu_items.findOne(item.id).exec(true).then(doc => doc.update({ $set: { favorito: !item.favorito, _modified: new Date().toISOString() } } as any));
            }}
            className={`product-selector__favorite${item.favorito ? ' product-selector__favorite--active' : ''}`}
          >
            <Star size={14} weight={item.favorito ? 'fill' : 'bold'} />
          </ActionIcon>
        )}

        <Text
          fw={900}
          size="lg"
          c={isSelected ? 'white' : 'myColor'}
          className="product-selector__price"
        >
          ${item.precio.toFixed(2)}
        </Text>
      </Group>
    </Box>
  );
}
