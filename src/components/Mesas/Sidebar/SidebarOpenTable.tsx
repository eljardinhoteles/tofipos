// @ts-nocheck
import { useEffect, useState } from 'react';
import { Box, Stack, Text, Group, ActionIcon, Autocomplete, Button, Chip, SegmentedControl, SimpleGrid } from '@mantine/core';
import { X, Users, UserPlus, Minus, Plus, PushPin, Bed } from '@phosphor-icons/react';
import type { Mesa } from '../../../db/database';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { initVerticalRxDb } from '../../../db/rxdb';

interface SidebarOpenTableProps {
  selectedMesa: Mesa;
  customerName: string;
  setCustomerName: (val: string) => void;
  guestCount: number;
  setGuestCount: (val: number) => void;
  openLinkMode: 'manual' | 'habitacion';
  setOpenLinkMode: (mode: 'manual' | 'habitacion') => void;
  selectedHabitacionId: string | null;
  setSelectedHabitacionId: (id: string | null) => void;
  onClose: () => void;
  onOpenTable: () => void;
}

export function SidebarOpenTable({
  selectedMesa,
  customerName,
  setCustomerName,
  guestCount,
  setGuestCount,
  openLinkMode,
  setOpenLinkMode,
  selectedHabitacionId,
  setSelectedHabitacionId,
  onClose,
  onOpenTable,
}: SidebarOpenTableProps) {
  const { clientes } = useRxClientes();
  const [activeCuentas, setActiveCuentas] = useState<any[]>([]);
  const [allMesas, setAllMesas] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    let unsubs: Array<{ unsubscribe: () => void } | null> = [];
    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const cuentasQuery = rxDb.habitacion_cuentas.find({ selector: { estado: 'activa', _deleted: { $ne: true } } });
      const mesasQuery = rxDb.mesas.find({ selector: { _deleted: { $ne: true } } });
      const cuentasDocs = await cuentasQuery.exec();
      const mesasDocs = await mesasQuery.exec();
      if (!alive) return;
      setActiveCuentas(cuentasDocs.map((doc: any) => doc.toJSON()));
      setAllMesas(mesasDocs.map((doc: any) => doc.toJSON()));
      unsubs = [
        cuentasQuery.$.subscribe((docs: any[]) => setActiveCuentas(docs.map((doc: any) => doc.toJSON()))) as any,
        mesasQuery.$.subscribe((docs: any[]) => setAllMesas(docs.map((doc: any) => doc.toJSON()))) as any,
      ];
    };
    run().catch(console.error);
    return () => {
      alive = false;
      unsubs.forEach((sub) => sub?.unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (selectedHabitacionId) {
      setOpenLinkMode('habitacion');
    } else {
      setOpenLinkMode('manual');
    }
  }, [selectedHabitacionId, setOpenLinkMode]);

  const tableDisplay = selectedMesa.nombre.toLowerCase().startsWith('mesa')
    ? selectedMesa.nombre
    : `Mesa ${selectedMesa.nombre}`;

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header Fijo */}
      <Box p="md" pb="xs" style={{ borderBottom: '1px solid var(--pos-border)' }}>
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Box
              style={{
                width: 46,
                height: 46,
                borderRadius: '12px',
                backgroundColor: 'var(--ui-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Text fw={900} size="20px" c="white">
                {selectedMesa.nombre.toLowerCase().startsWith('mesa')
                  ? selectedMesa.nombre.split(' ').pop()
                  : selectedMesa.nombre}
              </Text>
            </Box>
            <Stack gap={0}>
              <Text fw={800} size="md" c="var(--pos-text)" style={{ lineHeight: 1 }}>{tableDisplay}</Text>
              <Text size="11px" c="dimmed" fw={700} mt={2} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Apertura de Mesa
              </Text>
            </Stack>
          </Group>
          <Group gap="xs">
            {/* El botón de Cerrar siempre va en el header */}
            <ActionIcon 
              variant="light" 
              color="gray" 
              onClick={onClose} 
              size="lg" 
              radius="xl"
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.05)', 
                color: 'var(--pos-text-sub)' 
              }}
            >
              <X size={18} weight="bold" />
            </ActionIcon>
          </Group>
        </Group>
      </Box>

      {/* Cuerpo Scrollable */}
      <Box p="lg" style={{ flex: 1, overflowY: 'auto' }}>
        <Stack gap={32}>
          {/* Selector de Tipo de Apertura */}
          <Box>
            <Text size="xs" fw={700} c="dimmed" mb={12} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Vincular a
            </Text>
            <SegmentedControl
              fullWidth
              size="md"
              radius="md"
              value={openLinkMode}
              onChange={(val) => {
                if (val === 'manual') {
                  setOpenLinkMode('manual');
                  setSelectedHabitacionId(null);
                  setCustomerName('');
                } else {
                  // Si no hay habitaciones activas, avisar o no hacer nada
                  if (activeCuentas.length === 0) return;
                  setOpenLinkMode('habitacion');
                  setSelectedHabitacionId(activeCuentas[0].id);
                  setCustomerName(activeCuentas[0].huesped);
                }
              }}
              data={[
                { label: 'Cliente Manual', value: 'manual' },
                { label: 'Habitación Activa', value: 'habitacion', disabled: activeCuentas.length === 0 },
              ]}
            />
          </Box>

          {/* Nombre del Cliente o Lista de Habitaciones */}
          <Box>
            {openLinkMode === 'habitacion' ? (
              <>
                <Group gap="xs" mb={12}>
                  <Bed size={16} weight="bold" color="var(--ui-primary)" />
                  <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Seleccionar Habitación
                  </Text>
                </Group>
                <Stack gap={8}>
                  {activeCuentas.map(cuenta => {
                    const mesa = allMesas.find(m => m.id === cuenta.mesa_id);
                    const roomNum = mesa
                      ? (mesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || mesa.nombre)
                      : cuenta.mesa_id;
                    const roomType = mesa?.nombre.match(/\(([^)]+)\)/)?.[1] || '';
                    const isSelected = selectedHabitacionId === cuenta.id;
                    return (
                      <UnstyledButton
                        key={cuenta.id}
                        onClick={() => {
                          setSelectedHabitacionId(cuenta.id);
                          setCustomerName(cuenta.huesped);
                        }}
                        style={{
                          borderRadius: 10,
                          border: `2px solid ${isSelected ? 'var(--ui-primary)' : 'var(--pos-border)'}`,
                          backgroundColor: isSelected ? 'var(--ui-primary-soft)' : 'var(--pos-bg)',
                          padding: '10px 14px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap={10} wrap="nowrap">
                            <Box
                              style={{
                                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                backgroundColor: isSelected ? 'var(--ui-primary)' : 'var(--pos-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <Text fw={900} size="13px" c={isSelected ? 'white' : 'var(--pos-text-sub)'}>
                                {roomNum}
                              </Text>
                            </Box>
                            <Stack gap={0}>
                              <Text fw={700} size="sm" c="var(--pos-text)" style={{ lineHeight: 1.2 }}>
                                {cuenta.huesped}
                              </Text>
                              {roomType && (
                                <Text size="11px" c="dimmed" fw={500}>
                                  {roomType}
                                </Text>
                              )}
                            </Stack>
                          </Group>
                          {isSelected && (
                            <Box
                              style={{
                                width: 20, height: 20, borderRadius: '50%',
                                backgroundColor: 'var(--ui-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}
                            >
                              <Text size="11px" c="white" fw={900}>✓</Text>
                            </Box>
                          )}
                        </Group>
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              </>
            ) : (
              <>
                <Group gap="xs" mb={12}>
                  <UserPlus size={16} weight="bold" color="var(--ui-primary)" />
                  <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Nombre del Cliente
                  </Text>
                </Group>
                <Autocomplete
                  placeholder="Consumidor Final (Defecto)"
                  size="lg"
                  radius="md"
                  data={Array.from(new Set(clientes.map(c => c.nombre).filter(Boolean)))}
                  value={customerName}
                  onChange={setCustomerName}
                  leftSection={<UserPlus size={18} />}
                  maxDropdownHeight={300}
                  comboboxProps={{ withinPortal: true, zIndex: 10000 }}
                />
              </>
            )}
          </Box>

          {/* Número de Personas (Selector de Estilo Reservas) */}
          <Box>
            <Group justify="space-between" align="center" mb={12}>
              <Group gap="xs">
                <Users size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Comensales
                </Text>
              </Group>
              <Group gap="xs" align="center">
                <ActionIcon
                  size={36}
                  variant="light"
                  color="gray"
                  radius="xl"
                  onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                  className="tap"
                >
                  <Minus size={16} weight="bold" />
                </ActionIcon>
                <Text size="lg" fw={900} w={36} ta="center" c="var(--pos-text)">
                  {guestCount}
                </Text>
                <ActionIcon
                  size={36}
                  variant="light"
                  color="gray"
                  radius="xl"
                  onClick={() => setGuestCount(Math.min(50, guestCount + 1))}
                  className="tap"
                >
                  <Plus size={16} weight="bold" />
                </ActionIcon>
              </Group>
            </Group>

            <Chip.Group value={String(guestCount)} onChange={(val) => setGuestCount(Number(val))}>
              <SimpleGrid cols={6} spacing={6}>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <Chip key={n} value={String(n)} variant="filled" radius="xl" size="md">
                    {n}
                  </Chip>
                ))}
              </SimpleGrid>
            </Chip.Group>
          </Box>
        </Stack>
      </Box>

      {/* Footer Fijo */}
      <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'var(--pos-bg)' }}>
        <Group grow gap="sm">
          <Button
            color="myColor"
            size="lg"
            radius="md"
            leftSection={<Users size={18} weight="bold" />}
            onClick={onOpenTable}
            disabled={guestCount === 0}
            fw={900}
          >
            Abrir Mesa
          </Button>
          <Button
            variant="light"
            color="red"
            size="lg"
            radius="md"
            onClick={onClose}
            fw={800}
          >
            Cancelar
          </Button>
        </Group>
      </Box>
    </Box>
  );
}
