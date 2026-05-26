import { createPortal } from 'react-dom';
import { Group, Chip, Button } from '@mantine/core';
import { Plus } from '@phosphor-icons/react';

interface MenuControlsProps {
  status: string;
  onStatusChange: (status: string) => void;
  onAddProduct: () => void;
  onManageCategories: () => void;
}

export function MenuControls({ status, onStatusChange, onAddProduct, onManageCategories }: MenuControlsProps) {
  return (
    <>
      {/* ── HEADER: Filtros de Menú (Chips) ────────────────────── */}
      {createPortal(
        <Chip.Group value={status} onChange={(val) => onStatusChange(val as string)}>
          <Group gap="xs">
            <Chip value="activos" variant="filled" radius="xl" size="md">Activos</Chip>
            <Chip value="desactivados" variant="filled" radius="xl" size="md">Desactivados</Chip>
          </Group>
        </Chip.Group>,
        document.getElementById('subheader-portal') || document.body
      )}

      {/* ── FLOATING: Acción de Agregar (Chip suelto) ─────────── */}
      {createPortal(
        <Group gap="sm">
          <Button 
            variant="default" 
            radius="xl" 
            size="md"
            onClick={onManageCategories}
            styles={{
              root: {
                backgroundColor: 'var(--ui-surface)',
                color: 'var(--ui-text-muted)',
                border: '1px solid var(--ui-border)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }
            }}
          >
            Categorías
          </Button>
          <Button 
            variant="filled" 
            color="dark" 
            radius="xl" 
            size="md"
            leftSection={<Plus size={18} weight="bold" />}
            onClick={onAddProduct}
            styles={{
              root: {
                backgroundColor: 'var(--sidebar-bg)',
                boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                border: '1px solid rgba(255,255,255,0.1)'
              }
            }}
          >
            Producto
          </Button>
        </Group>,
        document.getElementById('floating-actions-left') || document.body
      )}
    </>
  );
}
