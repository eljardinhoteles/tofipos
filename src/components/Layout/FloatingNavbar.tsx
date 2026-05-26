import { 
  Group, 
  Box,
  rem 
} from '@mantine/core';
import { useWindowScroll } from '@mantine/hooks';

export function FloatingNavbar() {
  useWindowScroll();

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: rem(40),
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}
    >
      {/* Acciones dinámicas flotando como chips sueltos */}
      <Group id="floating-actions-left" gap="sm" style={{ pointerEvents: 'all' }} />
      <Group id="floating-actions-right" gap="sm" style={{ pointerEvents: 'all' }} />
    </Box>
  );
}
