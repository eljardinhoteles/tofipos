/**
 * ComandaItemRow
 * Fila de producto de comanda reutilizable.
 * SidebarDetails: modo editable (onClick abre modal de edición)
 * SidebarReservaDetail: modo solo lectura (sin onClick, sin badge de pagado)
 */
import { memo } from 'react';
import { Box, Stack, Text, Group, Badge, Divider, UnstyledButton } from '@mantine/core';

export interface ComandaItemData {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  modificadores?: string[];
  pagado_cantidad?: number;
}

interface ComandaItemRowProps {
  item: ComandaItemData;
  index: number;
  total: number;
  /** Si se omite, la fila es solo lectura */
  onClick?: () => void;
  showDivider?: boolean;
}

export const ComandaItemRow = memo(function ComandaItemRow({ item, index, total, onClick, showDivider = true }: ComandaItemRowProps) {
  const pagado = item.pagado_cantidad || 0;
  const isFullyPaid = item.cantidad > 0 && pagado >= item.cantidad;
  const isReadOnly = !onClick;

  const content = (
    <Group align="flex-start" py={6} wrap="nowrap">
      {/* Badge de cantidad */}
      <Box
        style={{
          width: 36,
          height: 36,
          borderRadius: '8px',
          backgroundColor: isFullyPaid ? 'var(--mantine-color-green-0)' : 'var(--pos-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${isFullyPaid ? 'var(--mantine-color-green-3)' : 'var(--pos-border)'}`,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Text size="md" fw={900} c={isFullyPaid ? 'green.8' : 'var(--pos-text)'}>{item.cantidad}</Text>
      </Box>

      {/* Contenido */}
      <Stack gap={2} style={{ flex: 1 }}>
        {/* Nombre y precio total */}
        <Group justify="space-between" align="baseline" wrap="nowrap" gap="md">
          <Text fw={700} size="md" c="var(--pos-text)" style={{ flex: 1 }}>{item.nombre}</Text>
          <Text
            fw={800}
            size="lg"
            c="var(--pos-text)"
            style={{
              flexShrink: 0,
              textDecoration: isFullyPaid ? 'line-through' : 'none',
            }}
          >
            ${(item.precio * item.cantidad).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </Group>

        {/* Badges y precio unitario */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap={4} style={{ flex: 1 }}>
            {item.modificadores && item.modificadores.length > 0 &&
              item.modificadores.map((mod, i) => (
                <Badge key={`${mod}-${i}`} size="xs" variant="light" color="gray" radius="sm" style={{ textTransform: 'none' }}>
                  {mod}
                </Badge>
              ))
            }
            {pagado > 0 && (
              <Badge size="xs" variant="filled" color={isFullyPaid ? 'green' : 'orange'} radius="sm">
                {isFullyPaid ? 'Pagado' : `${pagado} pagados`}
              </Badge>
            )}
          </Group>
          {item.cantidad > 1 && (
            <Text size="10px" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              ${item.precio.toLocaleString('en-US', { minimumFractionDigits: 2 })} c/u
            </Text>
          )}
        </Group>
      </Stack>
    </Group>
  );

  return (
    <Box style={{ opacity: isFullyPaid ? 0.6 : 1 }}>
      {isReadOnly ? (
        content
      ) : (
        <UnstyledButton
          w="100%"
          onClick={onClick}
          style={{ borderRadius: '8px', cursor: 'pointer' }}
        >
          {content}
        </UnstyledButton>
      )}
      {showDivider && index < total - 1 && <Divider variant="dashed" opacity={0.6} my={3} />}
    </Box>
  );
});
