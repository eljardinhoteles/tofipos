import { createPortal } from 'react-dom';
import { FilterChips } from '../Common/FilterChips';

interface OrdenesControlsProps {
  status: string;
  onStatusChange: (status: string) => void;
}

export function OrdenesControls({ status, onStatusChange }: OrdenesControlsProps) {
  return (
    <>
      {/* ── HEADER: Filtros de Estado como Chips ────────────────── */}
      {createPortal(
        <FilterChips
          value={status}
          onChange={onStatusChange}
          options={[
            { value: 'activas', label: 'todas' },
            { value: 'en_cocina', label: 'en cocina' },
            { value: 'listo', label: 'listas' },
            { value: 'facturadas', label: 'facturadas' },
          ]}
        />,
        document.getElementById('subheader-portal') || document.body
      )}
    </>
  );
}
