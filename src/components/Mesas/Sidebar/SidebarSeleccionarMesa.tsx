// @ts-nocheck
import { useEffect, useState } from 'react';
import { Box, Stack, Group, Text, ActionIcon, ScrollArea, Paper, Badge, ThemeIcon, Center } from '@mantine/core';
import { ArrowLeft, TableIcon } from '@phosphor-icons/react';
import type { Mesa } from '../../../db/database';
import { initVerticalRxDb } from '../../../db/rxdb';

interface SidebarSeleccionarMesaProps {
  onSelectMesa: (mesa: Mesa) => void;
  onClose: () => void;
}

export function SidebarSeleccionarMesa({ onSelectMesa, onClose }: SidebarSeleccionarMesaProps) {
  const [mesasLibres, setMesasLibres] = useState<Mesa[]>([]);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | null = null;
    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.mesas.find({
        selector: { estado: 'libre', _deleted: { $ne: true } }
      });
      const docs = await query.exec();
      if (!alive) return;
      setMesasLibres(docs.map((doc: any) => doc.toJSON()).filter((mesa: Mesa) => mesa.piso?.toLowerCase() !== 'habitaciones'));
      unsub = query.$.subscribe((docs: any[]) => {
        setMesasLibres(docs.map((doc: any) => doc.toJSON()).filter((mesa: Mesa) => mesa.piso?.toLowerCase() !== 'habitaciones'));
      }) as any;
    };
    run().catch(console.error);
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Box p="lg" style={{ borderBottom: '1px solid var(--pos-border)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" color="gray" onClick={onClose}>
            <ArrowLeft size={20} />
          </ActionIcon>
          <Stack gap={0}>
            <Text size="lg" fw={800}>Seleccionar Mesa</Text>
            <Text size="xs" c="dimmed">Elige la mesa donde tomarás el pedido</Text>
          </Stack>
        </Group>
      </Box>

      <ScrollArea style={{ flex: 1 }} p="lg">
        {mesasLibres.length === 0 ? (
          <Center py={48}>
            <Stack align="center" gap="md">
              <ThemeIcon size={56} radius="xl" variant="light" color="gray">
                <TableIcon size={24} />
              </ThemeIcon>
              <Stack align="center" gap={4}>
                <Text fw={700}>No hay mesas disponibles</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Todas las mesas del restaurante están ocupadas.
                </Text>
              </Stack>
            </Stack>
          </Center>
        ) : (
          <Stack gap="lg">
            {Object.entries(
              mesasLibres.reduce<Record<string, Mesa[]>>((acc, m) => {
                const piso = m.piso || 'Sin zona';
                if (!acc[piso]) acc[piso] = [];
                acc[piso].push(m);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([piso, mesas]) => (
                <Box key={piso}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs" style={{ letterSpacing: '0.05em' }}>
                    {piso}
                  </Text>
                  <Stack gap="xs">
                    {mesas
                      .sort((a, b) => {
                        const numA = parseInt(a.nombre.match(/\d+/)?.[0] || '0');
                        const numB = parseInt(b.nombre.match(/\d+/)?.[0] || '0');
                        return numA - numB;
                      })
                      .map(mesa => (
                        <Paper
                          key={mesa.id}
                          p="sm"
                          radius="md"
                          withBorder
                          className="tap"
                          onClick={() => onSelectMesa(mesa)}
                          style={{
                            cursor: 'pointer',
                            borderColor: 'var(--pos-border)',
                            transition: 'transform var(--ease-fast), opacity var(--ease-fast)',
                            boxShadow: 'none',
                          }}
                        >
                          <Group justify="space-between">
                            <Text fw={700}>{mesa.nombre}</Text>
                            <Badge color="green" variant="light" size="sm">Libre</Badge>
                          </Group>
                        </Paper>
                      ))}
                  </Stack>
                </Box>
              ))}
          </Stack>
        )}
      </ScrollArea>
    </Box>
  );
}
