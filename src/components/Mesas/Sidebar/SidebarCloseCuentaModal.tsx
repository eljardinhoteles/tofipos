import { Modal, Stack, Box, Text, TextInput, Button } from '@mantine/core';
import { Printer } from '@phosphor-icons/react';

interface SidebarCloseCuentaModalProps {
  opened: boolean;
  onClose: () => void;
  saldoPendiente: number;
  closePayerName: string;
  setClosePayerName: (val: string) => void;
  onConfirm: () => void;
}

export function SidebarCloseCuentaModal({
  opened,
  onClose,
  saldoPendiente,
  closePayerName,
  setClosePayerName,
  onConfirm
}: SidebarCloseCuentaModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={900} size="lg">Confirmar Cierre de Cuenta</Text>}
      centered
      radius="lg"
      padding="xl"
    >
      <Stack gap="md">
        <Box p="md" style={{ borderRadius: '12px', border: '1px solid var(--pos-border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">Total a Cobrar</Text>
          <Text fw={900} size="28px" c="green.9" mt={4}>
            ${saldoPendiente.toFixed(2)}
          </Text>
        </Box>

        <TextInput
          label="Nombre de quien paga"
          placeholder="Ej: Juan Pérez"
          value={closePayerName}
          onChange={(e) => setClosePayerName(e.currentTarget.value)}
          radius="md"
          size="md"
        />

        <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
          Se registrará el pago total de la cuenta en el sistema local y se liberará la mesa.
        </Text>

        <Stack gap="sm" mt="md">
          <Button
            size="lg"
            color="green"
            leftSection={<Printer size={20} />}
            onClick={onConfirm}
          >
            Cerrar e Imprimir
          </Button>
          <Button
            variant="light"
            color="gray"
            size="lg"
            onClick={onClose}
          >
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
