import { Container, ScrollArea, Stack, Box, Paper, Text, NumberInput, Switch, Button, Group, Divider, Modal, Badge, ActionIcon, SimpleGrid, Card } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/Common/PageHeader';
import { FilterChips } from '../../components/Common/FilterChips';
import { Percent, Plus, Trash, Check } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { createRxAjusteIva, updateRxAjusteIva } from '../../db/rxdb';
import { useRxAjustesIva } from '../../hooks/useRxAjustesIva';
import AjustesOrganizacion from './AjustesOrganizacion';
import AjustesImpresion from './AjustesImpresion';
import AjustesAuditoria from './AjustesAuditoria';
import AjustesMantenimiento from './AjustesMantenimiento';

const SECTION_KEYS = ['organizacion', 'impresion', 'auditoria', 'iva', 'mantenimiento'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export default function Ajustes() {
  const navigate = useNavigate();
  const location = useLocation();
  const sectionFromPath = (() => {
    const match = location.pathname.match(/^\/ajustes\/(organizacion|impresion|auditoria|iva|mantenimiento)$/);
    return (match?.[1] || 'organizacion') as SectionKey;
  })();
  const activeSection = sectionFromPath;
  const goToSection = (section: SectionKey) => {
    navigate(`/ajustes/${section}`);
  };

  // Listado de IVAs usando el hook reactivo
  const { ajustesIva } = useRxAjustesIva();

  // Estados para creación de IVA
  const [modalOpen, setModalOpen] = useState(false);
  const [nuevoPorcentaje, setNuevoPorcentaje] = useState<number>(15);
  const [nuevoPreciosConIva, setNuevoPreciosConIva] = useState<boolean>(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (location.pathname === '/ajustes') {
      navigate('/ajustes/organizacion', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleCrearIva = async () => {
    setCreating(true);
    try {
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      if (!orgId) {
        sileo.error({ title: 'Sin organización', description: 'Por favor vincula una organización primero.' });
        return;
      }

      // Si no hay ninguno, el primero se marca activo por defecto
      const existentes = ajustesIva.length === 0;

      await createRxAjusteIva({
        id: crypto.randomUUID(),
        organization_id: orgId,
        porcentaje: Number(nuevoPorcentaje),
        precios_con_iva: nuevoPreciosConIva,
        activo: existentes,
      });

      sileo.success({ title: 'Tasa de IVA creada', description: 'Se añadió a la lista de opciones.' });
      setModalOpen(false);
      // Reset
      setNuevoPorcentaje(15);
      setNuevoPreciosConIva(false);
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error al crear IVA' });
    } finally {
      setCreating(false);
    }
  };

  const handleActivarIva = async (ivaId: string) => {
    try {
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      if (!orgId) return;

      // Desactivar todos los demás activos
      const activos = ajustesIva.filter(item => item.activo);
      for (const item of activos) {
        await updateRxAjusteIva(item.id, { activo: false });
      }

      // Activar el seleccionado
      await updateRxAjusteIva(ivaId, { activo: true });
      sileo.success({ title: 'Tasa de IVA activada', description: 'La tasa seleccionada ya se aplica en las comandas.' });
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error al activar IVA' });
    }
  };

  const handleEliminarIva = async (ivaId: string, isActive: boolean) => {
    if (isActive) {
      sileo.error({ title: 'No permitido', description: 'No puedes eliminar la tasa de IVA que está activa actualmente.' });
      return;
    }
    try {
      await updateRxAjusteIva(ivaId, { _deleted: true });
      sileo.success({ title: 'Tasa de IVA eliminada' });
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error al eliminar IVA' });
    }
  };

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <PageHeader px="lg" height={56} style={{ position: 'sticky', top: 0 }}>
        <Box className="header-scroll-x hide-scrollbar" style={{ width: '100%', minWidth: 0 }}>
          <FilterChips
            value={activeSection}
            onChange={(val) => goToSection(val as any)}
            options={[
              { value: 'organizacion', label: 'Organización' },
              { value: 'impresion', label: 'Impresión' },
              { value: 'auditoria', label: 'Auditoría' },
              { value: 'iva', label: 'IVA' },
              { value: 'mantenimiento', label: 'Mantenimiento' },
            ]}
            scrollable
          />
        </Box>
      </PageHeader>

      <Container size="md" py="xl">
        <Stack gap="xl">
          {activeSection === 'organizacion' && <AjustesOrganizacion />}
          {activeSection === 'impresion' && <AjustesImpresion />}
          {activeSection === 'auditoria' && <AjustesAuditoria />}
          {activeSection === 'iva' && (
            <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
              <Group justify="space-between" align="center" mb="md">
                <Group gap="md">
                  <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
                    <Percent size={22} color="var(--ui-primary)" weight="bold" />
                  </Box>
                  <Box>
                    <Text fw={900} size="lg">Configuración de IVA</Text>
                    <Text size="sm" c="dimmed">
                      Administra las diferentes tasas de IVA y activa la correspondiente para tus ventas.
                    </Text>
                  </Box>
                </Group>
                <Button
                  leftSection={<Plus size={18} weight="bold" />}
                  color="myColor"
                  radius="md"
                  onClick={() => setModalOpen(true)}
                >
                  Nueva Tasa
                </Button>
              </Group>

              <Divider my="md" />

              {ajustesIva.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No hay tasas de IVA configuradas todavía. Crea una para empezar.
                </Text>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {ajustesIva.map((item) => (
                    <Card
                      key={item.id}
                      withBorder
                      radius="lg"
                      p="md"
                      style={{
                        borderColor: item.activo ? 'var(--ui-primary)' : 'var(--pos-border)',
                        backgroundColor: item.activo ? 'var(--ui-primary-soft)' : 'white',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Group justify="space-between" align="flex-start" mb="xs">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Text fw={900} size="24px" style={{ lineHeight: 1.1 }}>
                              {item.porcentaje}%
                            </Text>
                            {item.activo && (
                              <Badge color="green" radius="sm" variant="filled" size="xs" leftSection={<Check size={10} weight="bold" />}>
                                Activo
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed" fw={600}>
                            {item.precios_con_iva ? 'Precios incluyen IVA' : 'IVA se suma al total'}
                          </Text>
                        </Stack>

                        <Group gap="xs">
                          {!item.activo && (
                            <Button
                              size="xs"
                              variant="light"
                              color="blue"
                              radius="md"
                              onClick={() => handleActivarIva(item.id)}
                            >
                              Activar
                            </Button>
                          )}
                          {!item.activo && (
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => handleEliminarIva(item.id, item.activo)}
                              radius="md"
                            >
                              <Trash size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Group>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Paper>
          )}
          {activeSection === 'mantenimiento' && <AjustesMantenimiento />}
        </Stack>
      </Container>

      {/* Modal para Crear IVA */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={<Text fw={900} size="lg">Nueva Tasa de IVA</Text>}
        centered
        radius="lg"
        padding="xl"
      >
        <Stack gap="md">
          <NumberInput
            label="Porcentaje de IVA"
            description="Impuesto a aplicar sobre los consumos."
            placeholder="Ej. 8"
            suffix="%"
            radius="md"
            size="md"
            min={0}
            max={100}
            decimalScale={2}
            value={nuevoPorcentaje}
            onChange={(val) => setNuevoPorcentaje(val === '' ? 0 : Number(val))}
            required
          />

          <Switch
            label="Precios con IVA incluido"
            description="Activa si los precios del menú ya contienen este porcentaje."
            checked={nuevoPreciosConIva}
            onChange={(e) => setNuevoPreciosConIva(e.currentTarget.checked)}
            size="md"
            mt="xs"
          />

          <Group justify="flex-end" gap="sm" mt="lg">
            <Button variant="light" color="gray" radius="md" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="myColor"
              radius="md"
              onClick={handleCrearIva}
              loading={creating}
            >
              Crear Tasa
            </Button>
          </Group>
        </Stack>
      </Modal>
    </ScrollArea>
  );
}
