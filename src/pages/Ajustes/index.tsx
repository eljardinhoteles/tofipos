import { Container, ScrollArea, Stack, Box, Paper, Text } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { PageHeader } from '../../components/Common/PageHeader';
import { FilterChips } from '../../components/Common/FilterChips';
import AjustesOrganizacion from './AjustesOrganizacion';
import AjustesImpresion from './AjustesImpresion';
import AjustesAuditoria from './AjustesAuditoria';
import AjustesMantenimiento from './AjustesMantenimiento';

const SECTION_KEYS = ['organizacion', 'impresion', 'auditoria', 'iva', 'mantenimiento'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export default function Ajustes() {
  const navigate = useNavigate();
  const location = useLocation();
  const sectionFromPath = (() => {
    const match = location.pathname.match(/^\/ajustes\/(organizacion|impresion|auditoria|iva|mantenimiento)$/);
    return (match?.[1] || 'organizacion') as SectionKey;
  })();
  const activeSection = sectionFromPath;
  const goToSection = (section: SectionKey) => {
    navigate(`/ajustes/${section}`);
  };

  useEffect(() => {
    if (location.pathname === '/ajustes') {
      navigate('/ajustes/organizacion', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <PageHeader px="lg" height={56} style={{ position: 'sticky', top: 0 }}>
        <Box className="header-scroll-x hide-scrollbar" style={{ width: '100%', minWidth: 0 }}>
          <FilterChips
            value={activeSection}
            onChange={(val) => goToSection(val as any)}
            options={[
              { value: 'organizacion', label: 'Organización' },
              { value: 'impresion', label: 'Impresión' },
              { value: 'auditoria', label: 'Auditoría' },
              { value: 'iva', label: 'IVA' },
              { value: 'mantenimiento', label: 'Mantenimiento' },
            ]}
            scrollable
          />
        </Box>
      </PageHeader>

      <Container size="md" py="xl">
        <Stack gap="xl">
          {activeSection === 'organizacion' && <AjustesOrganizacion />}
          {activeSection === 'impresion' && <AjustesImpresion />}
          {activeSection === 'auditoria' && <AjustesAuditoria />}
          {activeSection === 'iva' && (
            <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
              <Text fw={800}>IVA</Text>
              <Text size="sm" c="dimmed">Esta sección la podemos separar después si quieres dejarla como página propia.</Text>
            </Paper>
          )}
          {activeSection === 'mantenimiento' && <AjustesMantenimiento />}
        </Stack>
      </Container>
    </ScrollArea>
  );
}
