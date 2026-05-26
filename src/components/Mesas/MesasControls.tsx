import { createPortal } from 'react-dom';
import { 
  Group, 
  Button, 
  Chip 
} from '@mantine/core';
import { 
  Gear, 
  Plus, 
} from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useMediaQuery } from '@mantine/hooks';

interface MesasControlsProps {
  availablePisos: string[];
  selectedPiso: string;
  onPisoChange: (piso: string) => void;
  onOpenManage: () => void;
  onOpenAddTable: () => void;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  hideChips?: boolean;
}

export function MesasControls({ 
  availablePisos, 
  selectedPiso, 
  onPisoChange, 
  onOpenManage, 
  onOpenAddTable,
  isEditMode,
  onToggleEditMode,
  hideChips
}: MesasControlsProps) {
  const { currentMesero } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const esAdmin = currentMesero?.rol === 'admin';
  const mostrarEdicion = esAdmin && !isMobile;

  const leftPortal = document.getElementById('floating-actions-left');
  const rightPortal = document.getElementById('floating-actions-right');
  const subheaderPortal = document.getElementById('subheader-portal');
  
  return (
    <>
      {/* ── HEADER: Selector de Pisos como Chips ────────────────── */}
      {!hideChips && createPortal(
        <Chip.Group value={selectedPiso} onChange={(val) => onPisoChange(val as string)}>
          <Group gap="xs">
            {availablePisos.map((piso) => (
              <Chip key={piso} value={piso} variant="filled" radius="xl" size="md">
                {piso}
              </Chip>
            ))}
          </Group>
        </Chip.Group>,
        subheaderPortal || document.body
      )}

      {/* ── FLOATING: Acciones Izquierda ──────────────────────── */}
      {mostrarEdicion && isEditMode && leftPortal && createPortal(
        <Group gap="sm">
          <Button 
            variant="filled" 
            radius="xl" 
            size="md"
            leftSection={<Plus size={18} weight="bold" />}
            onClick={onOpenAddTable}
            className="mesas-controls__floating-button"
          >
            Mesa
          </Button>
          <Button 
            variant="filled" 
            radius="xl" 
            size="md"
            leftSection={<Plus size={18} weight="bold" />}
            onClick={onOpenManage}
            className="mesas-controls__floating-button"
          >
            Piso
          </Button>
        </Group>,
        leftPortal
      )}

      {/* ── FLOATING: Acciones Derecha ───────────────────────── */}
      {mostrarEdicion && rightPortal && createPortal(
        <Group gap="sm">
          <Button
            variant={isEditMode ? "filled" : "default"}
            radius="xl"
            size="md"
            onClick={onToggleEditMode}
            leftSection={<Gear size={18} weight={isEditMode ? "bold" : "regular"} />}
            className={isEditMode ? 'mesas-controls__floating-button mesas-controls__floating-button--active' : 'mesas-controls__floating-button'}
          >
            {isEditMode ? "Listo" : "Editar Mesas"}
          </Button>
        </Group>,
        rightPortal
      )}
    </>
  );
}
