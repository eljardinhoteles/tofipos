import { createPortal } from 'react-dom';
import { Chip, Group, Button } from '@mantine/core';
import { Plus } from '@phosphor-icons/react';

type DateFilter = 'todas' | 'hoy' | 'manana' | 'semana';

interface ReservasControlsProps {
  filter: DateFilter;
  onFilterChange: (f: DateFilter) => void;
  onNewReserva: () => void;
}

export function ReservasControls({ filter, onFilterChange, onNewReserva }: ReservasControlsProps) {
  return (
    <>
      {createPortal(
        <Chip.Group value={filter} onChange={v => onFilterChange(v as DateFilter)}>
          <Group gap="xs">
            <Chip value="todas"  variant="filled" radius="xl" size="md">Todas</Chip>
            <Chip value="hoy"    variant="filled" radius="xl" size="md">Hoy</Chip>
            <Chip value="manana" variant="filled" radius="xl" size="md">Mañana</Chip>
            <Chip value="semana" variant="filled" radius="xl" size="md">Próximos 7 días</Chip>
          </Group>
        </Chip.Group>,
        document.getElementById('subheader-portal') || document.body
      )}

      {createPortal(
        <Button
          variant="filled"
          color="dark"
          radius="xl"
          size="md"
          leftSection={<Plus size={18} weight="bold" />}
          onClick={onNewReserva}
          styles={{ root: { backgroundColor: 'var(--sidebar-bg)', boxShadow: '0 8px 16px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.1)' } }}
        >
          Nueva Reserva
        </Button>,
        document.getElementById('floating-actions-left') || document.body
      )}
    </>
  );
}
