import { createPortal } from 'react-dom';
import { Button } from '@mantine/core';
import { Plus } from '@phosphor-icons/react';
import { FilterChips } from '../Common/FilterChips';

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
        <FilterChips
          value={filter}
          onChange={v => onFilterChange(v as DateFilter)}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'hoy', label: 'Hoy' },
            { value: 'manana', label: 'Mañana' },
            { value: 'semana', label: 'Próximos 7 días' },
          ]}
          scrollable
        />,
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
