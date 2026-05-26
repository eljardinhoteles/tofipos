import React, { forwardRef } from 'react';
import { Box, Paper, Text, Group, Stack, ThemeIcon, Divider } from '@mantine/core';
import { CalendarBlank, Clock, Users, MapPin, Receipt } from '@phosphor-icons/react';
import { type Reserva } from '../../../db/database';

interface ReservaWhatsAppCardProps {
  reserva: Reserva;
  zonaNombre: string;
  comandaItems: any[];
  totalMonto: number;
  ivaPercent: number;
}

export const ReservaWhatsAppCard = forwardRef<HTMLDivElement, ReservaWhatsAppCardProps>(
  ({ reserva, zonaNombre, comandaItems, totalMonto, ivaPercent }, ref) => {
    return (
      <Box
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: 400, // Anchura fija para generar una imagen constante
          backgroundColor: '#f8f9fa',
          padding: 20,
        }}
      >
        <Paper ref={ref} radius="lg" p="xl" style={{ backgroundColor: 'white', border: '1px solid #e9ecef', overflow: 'hidden' }}>
          {/* Header */}
          <Stack align="center" gap="xs" mb="lg">
            <ThemeIcon size={56} radius="md" color="dark">
              <CalendarBlank size={32} weight="bold" />
            </ThemeIcon>
            <Text fw={900} size="xl" mt="sm">RESERVA CONFIRMADA</Text>
            <Text size="sm" c="dimmed" fw={600}>Restaurante El Jardín</Text>
          </Stack>

          <Divider variant="dashed" mb="lg" />

          {/* Datos del Cliente */}
          <Box mb="xl">
            <Text fw={800} size="lg" mb="sm">{reserva.nombre || 'Sin nombre'}</Text>
            {reserva.telefono && (
              <Text size="sm" c="dimmed" mb="xs">Tel: {reserva.telefono}</Text>
            )}

            <Group gap="sm" mt="md">
              <Group gap={6}>
                <CalendarBlank size={16} weight="bold" color="var(--mantine-color-blue-6)" />
                <Text size="sm" fw={600}>{reserva.fecha}</Text>
              </Group>
              <Text c="dimmed">·</Text>
              <Group gap={6}>
                <Clock size={16} weight="bold" color="var(--mantine-color-orange-6)" />
                <Text size="sm" fw={600}>{reserva.hora}</Text>
              </Group>
            </Group>

            <Group gap="sm" mt="xs">
              <Group gap={6}>
                <Users size={16} weight="bold" color="var(--mantine-color-green-6)" />
                <Text size="sm" fw={600}>{reserva.personas} personas</Text>
              </Group>
              <Text c="dimmed">·</Text>
              <Group gap={6}>
                <MapPin size={16} weight="bold" color="var(--mantine-color-red-6)" />
                <Text size="sm" fw={600}>{zonaNombre || 'Sin zona asignada'}</Text>
              </Group>
            </Group>
          </Box>

          {/* Pedido anticipado */}
          {comandaItems.length > 0 && (
            <>
              <Divider variant="dashed" mb="lg" />
              <Box>
                <Group gap="xs" mb="md">
                  <Receipt size={18} weight="bold" color="gray" />
                  <Text size="sm" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>Pedido Anticipado</Text>
                </Group>
                
                <Stack gap="xs">
                  {comandaItems.map((item, idx) => (
                    <Group key={idx} justify="space-between" align="flex-start" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                        <Text fw={800} size="sm" c="dimmed">{item.cantidad}x</Text>
                        <Text fw={600} size="sm" style={{ flex: 1 }}>{item.nombre}</Text>
                      </Group>
                      <Text fw={700} size="sm">
                        ${(item.precio * item.cantidad).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                    </Group>
                  ))}
                </Stack>
                
                <Group justify="space-between" mt="lg" pt="sm" style={{ borderTop: '2px solid #f1f3f5' }}>
                  <Text fw={700} size="sm">TOTAL (Inc. IVA)</Text>
                  <Text fw={900} size="xl" c="green.8">
                    ${totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Group>
              </Box>
            </>
          )}

          {/* Footer */}
          <Box mt={32}>
            <Text size="xs" c="dimmed" ta="center" style={{ fontStyle: 'italic' }}>
              ¡Te esperamos! Por favor, sé puntual. La reserva se mantendrá por 15 minutos de tolerancia.
            </Text>
          </Box>
        </Paper>
      </Box>
    );
  }
);
ReservaWhatsAppCard.displayName = 'ReservaWhatsAppCard';
