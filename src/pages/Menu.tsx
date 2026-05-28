import {
  Box,
  Flex,
  Stack,
  Text,
  Modal,
  TextInput,
  Button,
  Group,
  ActionIcon,
  ScrollArea,
  Tooltip,
  Badge,
} from '@mantine/core';
import { useRxMenuCatalog } from '../hooks/useRxMenuCatalog';
import { Trash, Plus, Check, X, MagnifyingGlass, List, PencilLine, SquaresFour } from '@phosphor-icons/react';
import { useDisclosure } from '@mantine/hooks';
import { useUI } from '../context/UIContext';
import { sileo } from 'sileo';
import { useMemo, useState } from 'react';
import { POSCard } from '../components/Common/POSCard';
import { useIvaActivo } from '../hooks/useIvaActivo';
import { PageHeader } from '../components/Common/PageHeader';
import { FilterChips } from '../components/Common/FilterChips';
import { createRxCategoria, updateRxCategoria } from '../db/rxdb';

export default function Menu() {
  const [searchQuery, setSearchQuery] = useState('');
  const [status] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<{id: string, nombre: string} | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isManageCategoriesOpen, { open: openManageCategories, close: closeManageCategories }] = useDisclosure(false);
  const { openConfirm, setMenuView, setSelectedMenuProductId, selectedMenuProductId } = useUI();
  
  const { menuItems: safeMenuItems, categorias: safeDbCategorias } = useRxMenuCatalog();


  const filteredItems = useMemo(() => {
    return safeMenuItems.filter(item => {
      const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.categoria_nombre || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' ? true : item.categoria_nombre === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [safeMenuItems, searchQuery, status, selectedCategory]);


  const products = useMemo(() => filteredItems.map(item => ({
    id: item.id,
    name: item.nombre,
    price: item.precio,
    category: item.categoria_nombre || 'Sin categoría',
    categoria_nombre: item.categoria_nombre,
    modificadores: item.modificadores || [],
    activo: item.activo,
    iva_modalidad: item.iva_modalidad || 'sistema',
    iva_porcentaje: item.iva_porcentaje
  })), [filteredItems]);

  const handleEditClick = (product: any) => {
    setSelectedMenuProductId(product.id);
    setMenuView('producto');
  };

  return (
    <Flex h="100%" w="100%" direction="column" bg="var(--pos-bg)">
      {/* ── HEADER PRINCIPAL (56px) ─────────────────────────────── */}
      <PageHeader>
        <Group justify="flex-start" align="center" wrap="nowrap" w="100%" gap="md" style={{ minWidth: 'max-content' }}>
          {/* Botón Nuevo al inicio para consistencia */}
          <Tooltip label="Nuevo Producto" withArrow radius="md">
            <ActionIcon
              variant="filled"
              color="myColor"
              radius="md"
              size={36}
              onClick={() => {
                setSelectedMenuProductId(null);
                setMenuView('producto');
              }}
              style={{
                flexShrink: 0
              }}
            >
              <Plus size={18} weight="bold" />
            </ActionIcon>
          </Tooltip>

          <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

          <Button 
            variant="subtle" 
            color="gray" 
            h={36}
            radius="md" 
            leftSection={<SquaresFour size={20} />}
            onClick={openManageCategories}
            style={{ flexShrink: 0 }}
          >
            Categorías
          </Button>

          <TextInput
            placeholder="Buscar productos..."
            leftSection={<MagnifyingGlass size={16} color="var(--ui-primary)" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            radius="md"
            style={{ width: 260, flexShrink: 0 }}
            styles={{ 
              input: { 
                backgroundColor: 'var(--pos-bg)',
                border: '1px solid var(--pos-border)',
                height: 36,
                minHeight: 36
              } 
            }}
          />

          <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

          <Box style={{ flex: 1, minWidth: 0 }}>
            <FilterChips
              value={selectedCategory}
              onChange={(value) => setSelectedCategory(value as string)}
              options={[
                { value: 'all', label: 'Todos' },
                ...safeDbCategorias.map(cat => ({ value: cat.nombre, label: cat.nombre })),
              ]}
              scrollable
            />
          </Box>

          <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />
        </Group>
      </PageHeader>

      {/* Content */}
      <ScrollArea flex={1} p="xl" offsetScrollbars className="pos-grid-bg">
        {products.length === 0 ? (
          <Stack align="center" justify="center" h={300} opacity={1}>
            <Box style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/menu.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </Box>
            <Text fw={700} size="xl">No se encontraron productos</Text>
            <Text size="sm">Crea un nuevo producto para comenzar a vender.</Text>
          </Stack>
        ) : (
          <Box className="pos-menu-grid">
            {products.map(product => (
              <MenuProductCard
                key={product.id}
                product={product}
                isSelected={selectedMenuProductId === product.id}
                onEdit={() => handleEditClick(product)}
              />
            ))}
          </Box>
        )}
      </ScrollArea>

      {/* Modal: Gestionar Categorías */}
      <Modal
        opened={isManageCategoriesOpen}
        onClose={closeManageCategories}
        title={
          <Group gap="xs" align="flex-start">
            <SquaresFour size={28} weight="duotone" color="var(--ui-primary)" style={{ marginTop: 1, flexShrink: 0 }} />
            <Stack gap={1}>
              <Text fw={800} size="md" lh={1.2}>Categorías</Text>
              <Text size="xs" c="dimmed" fw={500}>Agrupa tu menú igual que en tu carta física</Text>
            </Stack>
          </Group>
        }
        centered
        radius="xl"
        size="sm"
        styles={{
          header: { borderBottom: '1px solid var(--pos-border)', paddingBottom: 'var(--mantine-spacing-sm)' },
          body: { padding: 'var(--mantine-spacing-md)' }
        }}
      >
        <Stack gap="md">
          {/* Input nueva categoría */}
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!newCategoryName.trim()) return;
            await createRxCategoria({
              id: crypto.randomUUID(),
              nombre: newCategoryName.trim(),
              organization_id: localStorage.getItem('pos_active_org_id') || ''
            });
            sileo.success({ title: 'Categoría creada' });
            setNewCategoryName('');
          }}>
            <Group gap="xs" align="flex-end">
              <TextInput
                placeholder="Nueva categoría..."
                radius="md"
                size="sm"
                style={{ flex: 1 }}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                styles={{ input: { backgroundColor: 'var(--pos-bg)', border: '1px solid var(--pos-border)' } }}
              />
              <Button
                type="submit"
                radius="md"
                size="sm"
                variant="default"
                disabled={!newCategoryName.trim()}
                leftSection={<Plus size={14} weight="bold" />}
              >
                Añadir
              </Button>
            </Group>
          </form>

          {/* Lista */}
          {safeDbCategorias.length === 0 ? (
            <Stack align="center" py="xl" gap="xs" opacity={1}>
              <Box style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/menu.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </Box>
              <Text size="sm" c="dimmed">Sin categorías aún</Text>
            </Stack>
          ) : (
            <ScrollArea h={260} offsetScrollbars>
              <Stack gap={4}>
                {safeDbCategorias.map((cat) => (
                  <Group
                    key={cat.id}
                    justify="space-between"
                    wrap="nowrap"
                    px="sm"
                    py={6}
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      backgroundColor: editingCategory?.id === cat.id ? 'var(--pos-bg)' : 'transparent',
                      border: `1px solid ${editingCategory?.id === cat.id ? 'var(--pos-border-dark)' : 'transparent'}`,
                      transition: 'background 0.1s ease'
                    }}
                  >
                    {editingCategory?.id === cat.id ? (
                      <TextInput
                        size="xs"
                        variant="unstyled"
                        value={editingCategory?.nombre || ''}
                        style={{ flex: 1 }}
                        styles={{ input: { fontWeight: 700, paddingLeft: 8, paddingRight: 8 } }}
                        onChange={(e) => setEditingCategory(editingCategory ? { ...editingCategory, nombre: e.target.value } : { id: cat.id, nombre: e.target.value })}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            if (editingCategory?.nombre.trim()) {
                              await updateRxCategoria(cat.id, { nombre: editingCategory.nombre.trim() });
                              sileo.success({ title: 'Categoría actualizada' });
                            }
                            setEditingCategory(null);
                          }
                          if (e.key === 'Escape') setEditingCategory(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <Group gap="xs" style={{ flex: 1 }} align="center">
                        <Text fw={600} size="sm">{cat.nombre}</Text>
                        {cat.es_comida_incluida && (
                          <Badge size="xs" color="green" variant="light">Plan</Badge>
                        )}
                      </Group>
                    )}

                    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                      {editingCategory?.id === cat.id ? (
                        <>
                          <ActionIcon
                            variant="subtle"
                            color="dark"
                            radius="md"
                            size={26}
                            onClick={async () => {
                              if (editingCategory?.nombre.trim()) {
                                await updateRxCategoria(cat.id, { nombre: editingCategory.nombre.trim() });
                                sileo.success({ title: 'Categoría actualizada' });
                              }
                              setEditingCategory(null);
                            }}
                          >
                            <Check size={13} weight="bold" />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="gray" radius="md" size={26} onClick={() => setEditingCategory(null)}>
                            <X size={13} />
                          </ActionIcon>
                        </>
                      ) : (
                        <>
                          <Tooltip label={cat.es_comida_incluida ? 'Quitar del plan' : 'Marcar como comida incluida en plan'} withArrow>
                            <ActionIcon
                              variant={cat.es_comida_incluida ? 'filled' : 'subtle'}
                              color={cat.es_comida_incluida ? 'green' : 'gray'}
                              radius="md"
                              size={26}
                              onClick={async () => {
                                await updateRxCategoria(cat.id, { es_comida_incluida: !cat.es_comida_incluida });
                              }}
                            >
                              <Check size={13} weight="bold" />
                            </ActionIcon>
                          </Tooltip>
                          <ActionIcon variant="subtle" color="gray" radius="md" size={26} onClick={() => setEditingCategory(cat)}>
                            <PencilLine size={13} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            radius="md"
                            size={26}
                            onClick={() => {
                              openConfirm(
                                '¿Eliminar Categoría?',
                                `Los productos de "${cat.nombre}" se quedarán sin categoría.`,
                                async () => {
                                  await updateRxCategoria(cat.id, { _deleted: true });
                                  sileo.success({ title: 'Categoría eliminada' });
                                }
                              );
                            }}
                          >
                            <Trash size={13} />
                          </ActionIcon>
                        </>
                      )}
                    </Group>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
          )}
        </Stack>
      </Modal>
    </Flex>
  );
}

// ── COMPONENTES INTERNOS ─────────────────────────────────────────

function MenuProductCard({ product, onEdit, isSelected }: any) {
  const { porcentaje: ivaSistema } = useIvaActivo();

  // Determinar la etiqueta de IVA
  let ivaLabel = '';
  if (product.iva_modalidad === 'exento') {
    ivaLabel = 'Exento';
  } else if (product.iva_modalidad === 'especifico') {
    ivaLabel = `IVA ${product.iva_porcentaje}%`;
  } else {
    ivaLabel = `IVA ${ivaSistema}%`;
  }

  return (
    <POSCard
      title={product.name}
      subtitle={product.category}
      amount={`$${product.price.toFixed(2)}`}
      ivaLabel={ivaLabel}
      active={product.activo}
      isSelected={isSelected}
      onClick={onEdit}
    >
      {product.modificadores.length > 0 && (
        <Group gap={4} mt="xs">
          <List size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed" fw={600}>
            {product.modificadores.length} modificadores
          </Text>
        </Group>
      )}
    </POSCard>
  );
}
