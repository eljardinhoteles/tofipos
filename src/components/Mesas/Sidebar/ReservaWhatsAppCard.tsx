import { forwardRef } from 'react';
import { Box, Paper, Text, Group, Stack, ThemeIcon, Divider } from '@mantine/core';
import { CalendarBlank, Clock, Users, MapPin, Receipt } from '@phosphor-icons/react';
import { type Reserva } from '../../../db/database';

interface ReservaWhatsAppCardProps {
  reserva: Reserva;
  zonaNombre: string;
  comandaItems: any[];
  totalMonto: number;
  totalAbonado?: number;
  codigoReserva?: string;
}

export const ReservaWhatsAppCard = forwardRef<HTMLDivElement, ReservaWhatsAppCardProps>(
  ({ reserva, zonaNombre, comandaItems, totalMonto, totalAbonado = 0, codigoReserva = '' }, ref) => {
    const showBilling = comandaItems.length > 0 || totalAbonado > 0;

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
        <Paper ref={ref} radius="lg" p="md" style={{ backgroundColor: 'white', border: '1px solid #e9ecef', overflow: 'hidden' }}>
          {/* Header */}
          <Group justify="space-between" align="center" mb="xs">
            <Stack gap={0}>
              <Text fw={900} size="sm" style={{ letterSpacing: '0.5px' }} c="var(--ui-primary, blue.7)">
                RESERVA CONFIRMADA {codigoReserva ? ` - ${codigoReserva}` : ''}
              </Text>
              <Text size="10px" fw={700} c="dimmed">
                {localStorage.getItem('pos_org_name_cached') || 'Restaurante El Jardín'}
              </Text>
            </Stack>
            <ThemeIcon size={32} radius="md" color="dark">
              <CalendarBlank size={16} weight="bold" />
            </ThemeIcon>
          </Group>

          <Divider variant="dashed" mb="xs" />

          {/* Datos del Cliente */}
          <Box mb="md">
            <Text fw={800} size="md" mb={2}>{reserva.nombre || 'Sin nombre'}</Text>
            {reserva.telefono && (
              <Text size="xs" c="dimmed" mb={4}>Tel: {reserva.telefono}</Text>
            )}

            <Group gap="sm" mt="xs">
              <Group gap={6}>
                <CalendarBlank size={14} weight="bold" color="var(--mantine-color-blue-6)" />
                <Text size="xs" fw={600}>{reserva.fecha}</Text>
              </Group>
              <Text c="dimmed" size="xs">·</Text>
              <Group gap={6}>
                <Clock size={14} weight="bold" color="var(--mantine-color-orange-6)" />
                <Text size="xs" fw={600}>{reserva.hora}</Text>
              </Group>
            </Group>

            <Group gap="sm" mt={4}>
              <Group gap={6}>
                <Users size={14} weight="bold" color="var(--mantine-color-green-6)" />
                <Text size="xs" fw={600}>{reserva.personas} personas</Text>
              </Group>
              <Text c="dimmed" size="xs">·</Text>
              <Group gap={6}>
                <MapPin size={14} weight="bold" color="var(--mantine-color-red-6)" />
                <Text size="xs" fw={600}>{zonaNombre || 'Sin zona asignada'}</Text>
              </Group>
            </Group>
          </Box>

          {/* Pedido / Cuenta */}
          {showBilling && (
            <>
              <Divider variant="dashed" mb="sm" />
              <Box>
                {comandaItems.length > 0 && (
                  <>
                    <Group gap="xs" mb="md">
                      <Receipt size={18} weight="bold" color="gray" />
                      <Text size="sm" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>Pedido Anticipado</Text>
                    </Group>
                    
                    <Stack gap="xs" mb="md">
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
                  </>
                )}
                
                <Group justify="space-between" mt="lg" pt="sm" style={{ borderTop: '2px solid #f1f3f5' }}>
                  <Text fw={700} size="sm">TOTAL</Text>
                  <Text fw={900} size={totalAbonado > 0 ? 'md' : 'xl'} c={totalAbonado > 0 ? 'dark' : 'green.8'}>
                    ${totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Group>

                {totalAbonado > 0 && (
                  <>
                    <Group justify="space-between" mt="xs">
                      <Text fw={700} size="sm" c="green.7">ABONADO</Text>
                      <Text fw={900} size="md" c="green.7">
                        -${totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                    </Group>
                    <Group justify="space-between" mt="xs" pt="xs" style={{ borderTop: '1px solid #f1f3f5' }}>
                      <Text fw={800} size="sm" c="orange.9">PENDIENTE</Text>
                      <Text fw={900} size="xl" c="orange.9">
                        ${Math.max(0, totalMonto - totalAbonado).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                    </Group>
                  </>
                )}
              </Box>
            </>
          )}

          {/* Footer */}
          <Box mt={32}>
            <Text size="xs" c="dimmed" ta="center" style={{ fontStyle: 'italic' }}>
              ¡Te esperamos! Agradecemos tu puntualidad (espera máxima de 15 minutos).
            </Text>
          </Box>
        </Paper>
      </Box>
    );
  }
);
ReservaWhatsAppCard.displayName = 'ReservaWhatsAppCard';
