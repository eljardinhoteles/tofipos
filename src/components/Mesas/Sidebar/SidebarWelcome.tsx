import { Box, Stack, Text, Button } from '@mantine/core';
import { ForkKnife } from '@phosphor-icons/react';

interface SidebarWelcomeProps {
  onOpenConfig: () => void;
}

export function SidebarWelcome({ 
  onOpenConfig,
}: SidebarWelcomeProps) {
  return (
    <Box h="100%" p="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', position: 'relative' }}>
      <Stack align="center" gap="lg">
        <Box
          style={{
            width: 72,
            height: 72,
            borderRadius: '20px',
            backgroundColor: 'var(--pos-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ForkKnife size={32} color="var(--pos-text-muted)" weight="fill" />
        </Box>
        <Stack gap={4}>
          <Text fw={800} size="lg" c="var(--pos-text)">Sistema POS</Text>
          <Text size="sm" c="dimmed" style={{ maxWidth: 220 }}>
            Selecciona una mesa para gestionar la comanda o configurar el local.
          </Text>
        </Stack>
        <Button
          variant="light"
          color="gray"
          radius="md"
          onClick={onOpenConfig}
        >
          Editar Mesas
        </Button>
      </Stack>
    </Box>
  );
}
