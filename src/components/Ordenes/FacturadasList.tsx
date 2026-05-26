import { Table, Box, Badge, Text, Stack, Group } from '@mantine/core';
import { BedIcon, ForkKnifeIcon, User } from '@phosphor-icons/react';
import { type Comanda, type Mesa, type ComandaItem } from '../../db/database';

interface FacturadasListProps {
  comandas: Comanda[];
  mesas: Mesa[];
  comandaItems: ComandaItem[];
  onViewInvoice: (comanda: Comanda) => void;
}

export function FacturadasList({ comandas, mesas, comandaItems, onViewInvoice }: FacturadasListProps) {
  return (
    <Box
      style={{
        backgroundColor: 'white',
        borderBottom: '1px solid var(--pos-border)',
      }}
    >
      <Table verticalSpacing="sm" horizontalSpacing="xl" withTableBorder={false} highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Mesa / Folio</Table.Th>
            <Table.Th visibleFrom="xs">Factura Nro</Table.Th>
            <Table.Th>Total</Table.Th>
            <Table.Th visibleFrom="xs">Fecha</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {comandas.map(comanda => {
            const mesa = mesas.find(m => m.id === comanda.mesa_id);
            const items = comandaItems.filter(i => i.comanda_id === comanda.id);
            const total = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);

            return (
              <Table.Tr key={comanda.id} style={{ cursor: 'pointer' }} onClick={() => onViewInvoice(comanda)}>
                <Table.Td>
                  <Stack gap={2}>
                    {/* Nivel 1: Cliente */}
                    <Group gap={4} wrap="nowrap">
                      <User size={14} color="var(--ui-primary)" style={{ flexShrink: 0 }} />
                      <Text fw={800} size="sm" style={{ whiteSpace: 'nowrap' }}>
                        {comanda.cliente || 'Sin cliente'}
                      </Text>
                    </Group>
                    
                    {/* Nivel 2: Comanda Folio */}
                    <Text fw={500} c="dimmed" size="xs" style={{ paddingLeft: 18 }}>
                      Comanda #{comanda.folio}
                    </Text>

                    {/* Nivel 3: Mesa/Habitación */}
                    <Group gap={4} wrap="nowrap" style={{ paddingLeft: 18 }}>
                      {comanda.habitacion_cuenta_id
                        ? <BedIcon size={14} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
                        : <ForkKnifeIcon size={14} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
                      }
                      <Text size="sm" fw={800} c="var(--pos-text-sub)">
                        {(() => {
                          const name = mesa?.nombre || comanda.mesa_nombre || 'Desconocida';
                          const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ? '' : 'Mesa ';
                          return `${prefix}${name}`;
                        })()}
                      </Text>
                    </Group>
                    
                    {/* Factura en móvil muy pequeño */}
                    {comanda.factura_nro && (
                      <Text size="xs" fw={700} c="myColor" hiddenFrom="xs" lineClamp={1} style={{ paddingLeft: 18 }}>
                        Factura: {comanda.factura_nro}
                      </Text>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td visibleFrom="xs">
                  <Badge variant="light" color={comanda.factura_nro ? 'blue' : 'gray'} size="sm">
                    {comanda.factura_nro || 'Sin factura'}
                  </Badge>
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Text fw={800}>${total.toFixed(2)}</Text>
                </Table.Td>
                <Table.Td visibleFrom="xs">
                  <Stack gap={2}>
                    <Text size="sm" fw={600}>{new Date(comanda.updated_at).toLocaleDateString()}</Text>
                    <Text size="xs" c="dimmed">{new Date(comanda.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </Stack>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
