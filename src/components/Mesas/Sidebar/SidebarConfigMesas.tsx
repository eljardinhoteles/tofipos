import { Box, Stack, Text, Group, ActionIcon, Button, ScrollArea, Tooltip } from '@mantine/core';
import { ArrowLeft, Plus, Trash, Users, PencilLine, BedIcon } from '@phosphor-icons/react';

interface SidebarConfigMesasProps {
  selectedConfigPiso: string;
  mesasDelPiso: any[];
  activeMesaIds?: Set<string>;
  onBack: () => void;
  onOpenAddTable: () => void;
  onEditMesa: (mesa: any) => void;
  onDeleteMesa: (id: string) => void;
  isHabitacion?: boolean;
}

export function SidebarConfigMesas({
  selectedConfigPiso,
  mesasDelPiso,
  activeMesaIds = new Set(),
  onBack,
  onOpenAddTable,
  onEditMesa,
  onDeleteMesa,
  isHabitacion = false,
}: SidebarConfigMesasProps) {
  return (
    <Box h="100%" p="lg" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="lg">
        <ActionIcon variant="subtle" color="gray" onClick={onBack}>
          <ArrowLeft size={20} />
        </ActionIcon>
        <Stack gap={0}>
          <Text fw={900} size="xl" c="var(--pos-text)">
            {isHabitacion ? 'Habitaciones' : `Mesas: ${selectedConfigPiso}`}
          </Text>
          <Text size="sm" c="dimmed">
            {isHabitacion ? 'Añadir o eliminar habitaciones' : 'Añadir o eliminar mesas de esta zona'}
          </Text>
        </Stack>
      </Group>

      <Button
        variant="light"
        color={isHabitacion ? 'blue' : 'blue'}
        mb="lg"
        leftSection={isHabitacion ? <BedIcon size={18} /> : <Plus size={18} />}
        onClick={onOpenAddTable}
      >
        {isHabitacion ? 'Añadir Habitación' : 'Añadir Mesa'}
      </Button>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="xs">
          {mesasDelPiso.map(mesa => {
            const badgeLabel = isHabitacion
              ? mesa.nombre.replace(/^Hab\.\s*/, '')
              : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre.split(' ').pop() : mesa.nombre);

            const displayName = isHabitacion
              ? mesa.nombre.replace(/\s*\([^)]*\)\s*$/, '')
              : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre : `Mesa ${mesa.nombre}`).replace(/\s*\([^)]*\)\s*$/, '');

            return (
              <Group
                key={mesa.id}
                p="sm"
                justify="space-between"
                style={{
                  borderRadius: '12px',
                  backgroundColor: 'var(--pos-bg)',
                  border: '1px solid var(--pos-border)'
                }}
              >
                <Group gap="md">
                  <Box
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '8px',
                      backgroundColor: 'var(--pos-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: isHabitacion ? '11px' : '14px',
                      color: 'var(--pos-text)'
                    }}
                  >
                    {isHabitacion ? <BedIcon size={18} color="var(--pos-text-muted)" /> : badgeLabel}
                  </Box>
                  <Stack gap={0}>
                    <Text fw={700} c="var(--pos-text)">{displayName}</Text>
                    {!isHabitacion && (
                      <Group gap={4}>
                        <Users size={12} color="var(--pos-text-muted)" />
                        <Text size="xs" c="dimmed">{mesa.capacidad || 2} personas</Text>
                      </Group>
                    )}
                  </Stack>
                </Group>

                <Group gap={4}>
                  <Tooltip
                    label={isHabitacion ? 'No puedes editar una habitación activa' : 'No puedes editar una mesa activa'}
                    disabled={!activeMesaIds.has(mesa.id)}
                    position="left"
                  >
                    <ActionIcon
                      variant="subtle"
                      color={!activeMesaIds.has(mesa.id) ? 'blue' : 'gray'}
                      onClick={() => { if (!activeMesaIds.has(mesa.id)) onEditMesa(mesa); }}
                      opacity={!activeMesaIds.has(mesa.id) ? 1 : 0.4}
                      style={{ cursor: !activeMesaIds.has(mesa.id) ? 'pointer' : 'not-allowed' }}
                    >
                      <PencilLine size={16} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip
                    label={isHabitacion ? 'No puedes eliminar una habitación activa' : 'No puedes eliminar una mesa activa'}
                    disabled={!activeMesaIds.has(mesa.id)}
                    position="left"
                  >
                    <ActionIcon
                      variant="subtle"
                      color={!activeMesaIds.has(mesa.id) ? 'red' : 'gray'}
                      onClick={() => { if (!activeMesaIds.has(mesa.id)) onDeleteMesa(mesa.id); }}
                      opacity={!activeMesaIds.has(mesa.id) ? 1 : 0.4}
                      style={{ cursor: !activeMesaIds.has(mesa.id) ? 'pointer' : 'not-allowed' }}
                    >
                      <Trash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            );
          })}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
