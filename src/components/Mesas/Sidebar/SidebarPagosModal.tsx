import { Modal, Stack, Text, Paper, Group, Badge, Divider } from '@mantine/core';

interface SidebarPagosModalProps {
  opened: boolean;
  onClose: () => void;
  pagos: any[];
  totalPagado: number;
}

export function SidebarPagosModal({ opened, onClose, pagos, totalPagado }: SidebarPagosModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text size="lg" fw={800}>Historial de Pagos</Text>}
      centered
      zIndex={2000}
    >
      <Stack gap="md">
        {pagos.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No hay pagos registrados todavía.</Text>
        ) : (
          pagos.map((pago) => (
            <Paper key={pago.id} withBorder p="sm" radius="md">
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700}>
                    {pago.tipo_division 
                      ? pago.tipo_division.replace('Dividido - ', '') 
                      : 'Pago Registrado'}
                  </Text>
                  <Text size="xs" c="dimmed">{new Date(pago.fecha).toLocaleString()}</Text>
                  {pago.factura_nro && (
                    <Badge variant="light" color="myColor" size="xs" mt={4} style={{ width: 'fit-content' }}>
                      Factura: {pago.factura_nro}
                    </Badge>
                  )}
                </Stack>
                <Text fw={900} c="green.8">${pago.monto.toFixed(2)}</Text>
              </Group>
            </Paper>
          ))
        )}
        <Divider my="sm" />
        <Group justify="space-between">
          <Text fw={700}>Total Pagado</Text>
          <Text fw={900} size="xl" c="green.8">${totalPagado.toFixed(2)}</Text>
        </Group>
      </Stack>
    </Modal>
  );
}
