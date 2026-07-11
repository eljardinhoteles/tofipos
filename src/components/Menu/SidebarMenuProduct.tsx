// @ts-nocheck
import { Box, Stack, Group, Text, ActionIcon, Button, TextInput, NumberInput, Divider, Switch, Badge, Flex, ScrollArea, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Trash, Plus, X, Check, Tag, CurrencyDollar, Sliders, Drop, UploadSimple } from '@phosphor-icons/react';
import { useForm } from '@mantine/form';
import { type ModifierGroup } from '../../db/database';
import { useUI } from '../../context/UIContext';
import { sileo } from 'sileo';
import { useEffect, useState } from 'react';
import { initVerticalRxDb, createRxCategoria, createRxMenuItem, updateRxMenuItem } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { ImportarMenuCsvModal } from './ImportarMenuCsvModal';

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <Group gap={6} mb={10}>
      <Icon size={14} weight="bold" color="var(--mantine-color-myColor-6)" />
      <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Text>
    </Group>
  );
}


export function SidebarMenuProduct() {
  const { selectedMenuProductId, setMenuView, setSelectedMenuProductId, openConfirm } = useUI();

  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isImportCsvOpen, { open: openImportCsv, close: closeImportCsv }] = useDisclosure(false);
  const { categorias: dbCategorias } = useRxMenuCatalog();
  const categoryOptions = dbCategorias.map(c => ({ value: c.nombre, label: c.nombre }));

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
    })().catch(() => { });

    return () => {
      alive = false;
      productSub?.unsubscribe();
    };
  }, [selectedMenuProductId]);

  const form = useForm({
    initialValues: {
      nombre: '',
      precio: 0,
      categoria: '',
      modificadores: [] as ModifierGroup[],
      activo: true,
      es_bebida: false,
      iva_modalidad: 'sistema' as 'sistema' | 'especifico' | 'exento',
      iva_porcentaje: 15,
    },
    validate: {
      nombre: (v) => (v.trim().length < 2 ? 'Nombre muy corto' : null),
      precio: (v) => (v < 0 ? 'El precio no puede ser negativo' : null),
    },
  });

  useEffect(() => {
    if (editingProduct) {
      form.setValues({
        nombre: editingProduct.nombre,
        precio: editingProduct.precio,
        categoria: editingProduct.categoria_nombre || '',
        modificadores: editingProduct.modificadores || [],
        activo: editingProduct.activo,
        es_bebida: editingProduct.es_bebida || false,
        iva_modalidad: editingProduct.iva_modalidad || 'sistema',
        iva_porcentaje: editingProduct.iva_porcentaje !== undefined ? editingProduct.iva_porcentaje : 15,
      });
    } else {
      form.reset();
    }
  }, [editingProduct?.id]);

  const handleSubmit = async (values: typeof form.values) => {
    let catId = '';
    let catNombre = values.categoria || 'General';

    if (values.categoria) {
      const category = dbCategorias.find(c => c.nombre.toLowerCase() === values.categoria.toLowerCase());
      if (!category) {
        catId = crypto.randomUUID();
        await createRxCategoria({ id: catId, nombre: values.categoria, organization_id: localStorage.getItem('pos_active_org_id') || '' });
        catNombre = values.categoria;
      } else {
        catId = category.id;
        catNombre = category.nombre;
      }
    } else {
      const generalCat = dbCategorias.find(c => c.nombre === 'General');
      if (!generalCat) {
        catId = crypto.randomUUID();
        await createRxCategoria({ id: catId, nombre: 'General', organization_id: localStorage.getItem('pos_active_org_id') || '' });
      } else {
        catId = generalCat.id;
      }
      catNombre = 'General';
    }

    if (editingProduct) {
      await updateRxMenuItem(editingProduct.id, {
        nombre: values.nombre,
        precio: values.precio,
        categoria_id: catId,
        categoria_nombre: catNombre,
        modificadores: values.modificadores,
        activo: values.activo,
        es_bebida: values.es_bebida,
        iva_modalidad: values.iva_modalidad,
        iva_porcentaje: values.iva_modalidad === 'especifico' ? values.iva_porcentaje : undefined,
        organization_id: localStorage.getItem('pos_active_org_id') || '',
      });
      sileo.success({ title: 'Producto actualizado' });
    } else {
      await createRxMenuItem({
        id: crypto.randomUUID(),
        nombre: values.nombre,
        precio: values.precio,
        categoria_id: catId,
        categoria_nombre: catNombre,
        activo: values.activo,
        es_bebida: values.es_bebida,
        modificadores: values.modificadores,
        iva_modalidad: values.iva_modalidad,
        iva_porcentaje: values.iva_modalidad === 'especifico' ? values.iva_porcentaje : undefined,
        organization_id: localStorage.getItem('pos_active_org_id') || '',
      });
      sileo.success({ title: 'Producto creado' });
    }
    handleClose();
  };

  const handleClose = () => {
    setMenuView('none');
    setSelectedMenuProductId(null);
  };

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <ImportarMenuCsvModal
        opened={isImportCsvOpen}
        onClose={() => {
          closeImportCsv();
          handleClose();
        }}
      />

      {/* HEADER — diseño unificado */}
      <Box px="md" pt="md" style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="center" mb="md">
          <Group gap={12} align="center">
            <ActionIcon
              variant="light"
              color="gray"
              onClick={handleClose}
              size="lg"
              radius="xl"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                color: 'var(--pos-text-sub)'
              }}
            >
              <X size={18} weight="bold" />
            </ActionIcon>
            <Text fw={900} size="lg" c="var(--pos-text)" style={{ lineHeight: 1 }}>
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </Text>
          </Group>
          <Switch
            size="md"
            color="green"
            label={form.values.activo ? 'Activo' : 'Inactivo'}
            labelPosition="left"
            styles={{ label: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' } }}
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        </Group>
        <Divider color="var(--pos-border)" style={{ margin: '0 -16px' }} />
      </Box>

      {/* BODY */}
      <ScrollArea flex={1} type="never" px="md" pt="md" pb="md">
        <Stack gap="xl">

          {/* Info básica */}
          <Box>
            <SectionLabel icon={Tag} label="Nombre del producto" />
            <TextInput
              placeholder="Ej: Lomo Saltado"
              required
              radius="md"
              size="lg"
              {...form.getInputProps('nombre')}

            />
          </Box>

          <Box>
            <SectionLabel icon={CurrencyDollar} label="Categoría y precio" />
            <Group grow gap="sm" mb="md">
              <Select
                placeholder="Sin categoría"
                data={categoryOptions}
                searchable
                clearable
                radius="md"
                size="lg"
                value={form.values.categoria || null}
                onChange={(v) => form.setFieldValue('categoria', v || '')}

              />
              <NumberInput
                placeholder="0.00"
                radius="md"
                size="lg"
                prefix="$"
                decimalScale={2}
                min={0}
                {...form.getInputProps('precio')}

              />
            </Group>
            <Text size="xs" c="dimmed" mt={6}>
              Usa $0.00 para productos incluidos en la tarifa o sin cobro directo.
            </Text>

            <SectionLabel icon={Drop} label="Zona de producción" />
            <Switch
              label="Es Bebida"
              description="Se imprime al final de la comanda de cocina (zona de bar)"
              size="md"
              color="blue"
              {...form.getInputProps('es_bebida', { type: 'checkbox' })}
            />

            <SectionLabel icon={Sliders} label="Impuestos (IVA)" />
            <Stack gap="sm">
              <Select
                placeholder="IVA del producto"
                data={[
                  { value: 'sistema', label: 'IVA General del Sistema' },
                  { value: 'especifico', label: 'Tasa de IVA Específica' },
                  { value: 'exento', label: 'Exento de IVA (0%)' },
                ]}
                radius="md"
                size="md"
                {...form.getInputProps('iva_modalidad')}
              />
              {form.values.iva_modalidad === 'especifico' && (
                <NumberInput
                  label="Porcentaje de IVA del Producto"
                  placeholder="Ej: 10"
                  suffix="%"
                  radius="md"
                  size="md"
                  min={0}
                  max={100}
                  {...form.getInputProps('iva_porcentaje')}
                />
              )}
            </Stack>
          </Box>


          {/* Modificadores */}
          <Box>
            <Group justify="space-between" align="center" mb={10}>
              <SectionLabel icon={Sliders} label="Grupos de modificadores" />
              <ActionIcon
                variant="light"
                color="myColor"
                radius="md"
                size="md"
                mb={10}
                onClick={() => {
                  const newGroup: ModifierGroup = {
                    id: crypto.randomUUID(),
                    nombre: '',
                    obligatorio: false,
                    multi: false,
                    opciones: [],
                  };
                  form.setFieldValue('modificadores', [...form.values.modificadores, newGroup]);
                }}
              >
                <Plus size={16} weight="bold" />
              </ActionIcon>
            </Group>

            {form.values.modificadores.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="lg">
                Sin modificadores — toca + para añadir
              </Text>
            ) : (
              <Stack gap="xl">
                {form.values.modificadores.map((group, gIndex) => (
                  <Box key={group.id}>
                    {gIndex > 0 && <Divider mb="xl" color="var(--pos-border-dark)" style={{ opacity: 0.5 }} />}

                    <Stack gap="md">
                      <Group gap="sm" align="flex-start">
                        <TextInput
                          placeholder="Nombre del grupo (ej: Término carne)"
                          style={{ flex: 1 }}
                          size="md"
                          radius="md"
                          {...form.getInputProps(`modificadores.${gIndex}.nombre`)}
                          styles={{ input: { fontWeight: 700, backgroundColor: 'transparent', border: 'none', paddingLeft: 0, fontSize: 16 } }}
                        />
                        <ActionIcon color="red" variant="subtle" radius="md" onClick={() => {
                          const updated = [...form.values.modificadores];
                          updated.splice(gIndex, 1);
                          form.setFieldValue('modificadores', updated);
                        }}>
                          <Trash size={18} />
                        </ActionIcon>
                      </Group>

                      <Group gap="lg">
                        <Switch
                          label="Obligatorio"
                          size="xs"
                          color="orange"
                          checked={form.values.modificadores[gIndex].obligatorio}
                          onChange={(e) => form.setFieldValue(`modificadores.${gIndex}.obligatorio`, e.currentTarget.checked)}
                        />
                        <Switch
                          label="Múltiple"
                          size="xs"
                          color="myColor"
                          checked={form.values.modificadores[gIndex].multi}
                          onChange={(e) => form.setFieldValue(`modificadores.${gIndex}.multi`, e.currentTarget.checked)}
                        />
                      </Group>

                      <Box>
                        <Text size="10px" fw={700} c="dimmed" mb={8} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Opciones — Enter para añadir
                        </Text>
                        <Flex gap={8} wrap="wrap" align="center">
                          {group.opciones.map((opt, oIndex) => (
                            <Badge
                              key={oIndex}
                              variant="light"
                              color="myColor"
                              size="lg"
                              radius="md"
                              rightSection={
                                <ActionIcon size="xs" color="myColor" variant="transparent" onClick={() => {
                                  const updated = [...group.opciones];
                                  updated.splice(oIndex, 1);
                                  form.setFieldValue(`modificadores.${gIndex}.opciones`, updated);
                                }}>
                                  <X size={10} />
                                </ActionIcon>
                              }
                            >
                              {opt}
                            </Badge>
                          ))}
                          <TextInput
                            placeholder="Añadir opción..."
                            variant="unstyled"
                            size="sm"
                            style={{ width: 140 }}
                            styles={{ input: { fontSize: 14, fontWeight: 600, color: 'var(--ui-primary)' } }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = e.currentTarget.value.trim();
                                if (val && !group.opciones.includes(val)) {
                                  form.setFieldValue(`modificadores.${gIndex}.opciones`, [...group.opciones, val]);
                                  e.currentTarget.value = '';
                                }
                              }
                            }}
                          />
                        </Flex>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

        </Stack>
      </ScrollArea>

      {/* FOOTER — diseño unificado */}
      <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'var(--pos-bg)', flexShrink: 0 }}>
        <Group grow gap="sm">
          {editingProduct ? (
            <Button
              size="lg" radius="md" variant="subtle" color="red"
              leftSection={<Trash size={20} />}
              onClick={() => {
                openConfirm(
                  'Eliminar producto',
                  '¿Estás seguro de eliminar este producto del menú?',
                  async () => {
                    await updateRxMenuItem(editingProduct.id, { _deleted: true });
                    sileo.success({ title: 'Producto eliminado' });
                    handleClose();
                  }
                );
              }}
              fw={800}
            >
              Eliminar
            </Button>
          ) : null}
          {!editingProduct && (
            <Button
              size="lg" radius="md" variant="light" color="gray" fw={800}
              leftSection={<UploadSimple size={20} />}
              onClick={openImportCsv}
            >
              Importar CSV
            </Button>
          )}
          <Button
            size="lg" radius="md" fw={900}
            leftSection={<Check size={20} weight="bold" />}
            onClick={() => form.onSubmit(handleSubmit)()}
            color="myColor"
          >
            {editingProduct ? 'Guardar' : 'Crear producto'}
          </Button>
        </Group>
      </Box>

    </Box>
  );
}
