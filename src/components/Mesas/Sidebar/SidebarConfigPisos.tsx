import { Box, Stack, Text, Group, ActionIcon, TextInput, Button, ScrollArea, UnstyledButton, Tooltip } from '@mantine/core';
import { ArrowLeft, Plus, PencilSimple, Trash, CaretUp, CaretDown, BedIcon } from '@phosphor-icons/react';
import { useUI } from '../../../context/UIContext';
import type { Mesa, Piso } from '../../../db/database';

interface SidebarConfigPisosProps {
  dbPisos: Piso[];
  allMesas: Mesa[];
  onBack: () => void;
  onAddPiso: (name: string) => void;
  onUpdatePiso: (id: string, name: string) => void;
  onDeletePiso: (id: string, name: string) => void;
  onReorderPiso: (id: string, direction: 'up' | 'down') => void;
  onSelectPiso: (name: string) => void;
  newPisoName: string;
  setNewPisoName: (val: string) => void;
  editingPisoId: string | null;
  setEditingPisoId: (id: string | null) => void;
  editingPisoName: string;
  setEditingPisoName: (name: string) => void;
}

export function SidebarConfigPisos({
  dbPisos,
  allMesas,
  onBack,
  onAddPiso,
  onUpdatePiso,
  onDeletePiso,
  onReorderPiso,
  onSelectPiso,
  newPisoName,
  setNewPisoName,
  editingPisoId,
  setEditingPisoId,
  editingPisoName,
  setEditingPisoName,
}: SidebarConfigPisosProps) {
  const { openConfirm } = useUI();
  const habitacionesPiso = dbPisos.find(p => p.nombre.toLowerCase() === 'habitaciones');

  return (
    <Box h="100%" p="lg" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="lg" justify="space-between" align="flex-start">
        <Group gap="md">
          <ActionIcon variant="subtle" color="gray" onClick={onBack}>
            <ArrowLeft size={20} />
          </ActionIcon>
          <Stack gap={0}>
            <Text fw={900} size="xl" c="var(--pos-text)">Zonas y Pisos</Text>
            <Text size="sm" c="dimmed">Gestiona las áreas del local</Text>
          </Stack>
        </Group>
        <Tooltip label="Gestionar Habitaciones" withArrow position="bottom">
          <ActionIcon
            variant={habitacionesPiso ? 'light' : 'subtle'}
            color="myColor"
            size="md"
            radius="md"
            onClick={() => {
              if (habitacionesPiso) {
                onSelectPiso(habitacionesPiso.nombre);
              } else {
                onAddPiso('Habitaciones');
              }
            }}
          >
            <BedIcon size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Box mb="lg">
        <Text size="xs" fw={700} c="dimmed" mb={8} style={{ textTransform: 'uppercase' }}>Nueva Zona</Text>
        <Group gap="xs">
          <TextInput
            placeholder="Ej: Terraza, VIP..."
            style={{ flex: 1 }}
            value={newPisoName}
            onChange={(e) => setNewPisoName(e.target.value)}
          />
          <ActionIcon size="lg" color="myColor" variant="light" onClick={() => onAddPiso(newPisoName)}>
            <Plus size={18} />
          </ActionIcon>
        </Group>
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="xs">
          {dbPisos
            .filter(p => p.nombre.toLowerCase() !== 'habitaciones')
            .map(piso => {
              const mesasCount = allMesas.filter(m => m.piso === piso.nombre).length;

              return (
            <Box
              key={piso.id}
              p="sm"
              style={{
                borderRadius: '12px',
                backgroundColor: 'var(--pos-bg)',
                border: '1px solid var(--pos-border)'
              }}
            >
              {editingPisoId === piso.id ? (
                <Group gap="xs">
                  <TextInput
                    value={editingPisoName}
                    onChange={(e) => setEditingPisoName(e.target.value)}
                    style={{ flex: 1 }}
                    size="sm"
                  />
                  <Button size="compact-sm" onClick={() => onUpdatePiso(piso.id, editingPisoName)}>Guardar</Button>
                  <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setEditingPisoId(null)}>X</Button>
                </Group>
              ) : (
                <Group justify="space-between">
                  <Group gap="xs" style={{ flex: 1 }}>
                    <Stack gap={2}>
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={(e) => { e.stopPropagation(); onReorderPiso(piso.id, 'up'); }}
                      >
                        <CaretUp size={14} weight="bold" />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={(e) => { e.stopPropagation(); onReorderPiso(piso.id, 'down'); }}
                      >
                        <CaretDown size={14} weight="bold" />
                      </ActionIcon>
                    </Stack>

                    <UnstyledButton
                      style={{ flex: 1 }}
                      onClick={() => {
                        onSelectPiso(piso.nombre);
                      }}
                    >
                      <Stack gap={0}>
                        <Text fw={700} c="var(--pos-text)">{piso.nombre}</Text>
                        <Text size="xs" c="dimmed">
                          {mesasCount} mesas
                        </Text>
                      </Stack>
                    </UnstyledButton>
                  </Group>

                  <Group gap={4}>
                    <ActionIcon
                      variant="subtle"
                      color="myColor"
                      onClick={() => {
                        setEditingPisoId(piso.id);
                        setEditingPisoName(piso.nombre);
                      }}
                    >
                      <PencilSimple size={16} />
                    </ActionIcon>

                    <Tooltip
                      label={mesasCount > 0 ? 'No puedes eliminar una zona con mesas' : 'Eliminar zona'}
                      position="left"
                    >
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        disabled={mesasCount > 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          openConfirm(
                            'Eliminar zona',
                            `¿Seguro que deseas eliminar "${piso.nombre}"? Esta acción no se puede deshacer.`,
                            () => onDeletePiso(piso.id, piso.nombre)
                          );
                        }}
                      >
                        <Trash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              )}
            </Box>
              );
            })}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
