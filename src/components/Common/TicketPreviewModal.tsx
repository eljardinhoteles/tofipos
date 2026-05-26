import { Modal, Button, Group, Stack, Text, Box, ScrollArea, ThemeIcon } from '@mantine/core';
import { Printer, X, FileText } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { useMediaQuery } from '@mantine/hooks';

interface TicketPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  content?: string; // Texto monospace formateado
  onPrint?: () => void; // Acción opcional al imprimir de verdad
}

export function TicketPreviewModal({
  opened,
  onClose,
  title,
  content,
  onPrint,
}: TicketPreviewModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');

  const handlePrintSubmit = () => {
    sileo.success({
      title: 'Enviado a Impresora',
      description: 'El documento se envió a la cola de impresión local (80mm).',
      styles: {
        badge: { backgroundColor: '#0f172a' },
        title: { color: 'white' },
        description: { color: 'rgba(255,255,255,0.7)' }
      } as any
    });
    if (onPrint) onPrint();
    onClose();
  };

  const renderFormattedContent = (text?: string) => {
    const safeText = text ?? '';
    const lines = safeText.split('\n');
    return (
      <Stack gap={3} style={{ textAlign: 'left', width: '100%' }}>
        {lines.map((line, idx) => {
          const trimmed = line.trim();

          // 1. Detectar títulos destacados (MESA #X, PRECUENTA #X)
          if (
            trimmed.startsWith('MESA #') ||
            trimmed.startsWith('MESA ') ||
            trimmed.startsWith('PRECUENTA #') ||
            trimmed.startsWith('HAB: ') ||
            trimmed.startsWith('***')
          ) {
            return (
              <Box key={idx} mt="xs" mb="sm">
                <Text
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '22px',
                    fontWeight: 900,
                    letterSpacing: '0.5px',
                    color: '#0f172a',
                    lineHeight: 1.2,
                  }}
                >
                  {trimmed}
                </Text>
              </Box>
            );
          }

          // 2. Detectar separadores largos (---- o =====)
          if (/^[-_=]{3,}$/.test(trimmed)) {
            return (
              <Box
                key={idx}
                style={{
                  borderBottom: trimmed.includes('=') ? '2.5px solid #0f172a' : '1.5px dashed #cbd5e1',
                  margin: '10px 0',
                  width: '100%',
                }}
              />
            );
          }

          // 3. Detectar ítems con formato "Cant - Detalle - Total"
          const itemParts = line.split(' - ');
          if (itemParts.length === 3) {
            const [cant, detalle, total] = itemParts;
            const isHeader = detalle.toLowerCase().includes('detalle');
            return (
              <Group key={idx} justify="space-between" align="baseline" wrap="nowrap" w="100%" py={isHeader ? 4 : 2}>
                <Group gap="md" style={{ flex: 1 }} align="baseline" wrap="nowrap">
                  <Text
                    style={{
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      fontWeight: isHeader ? 800 : 900,
                      fontSize: isHeader ? '13px' : '14.5px',
                      color: isHeader ? '#64748b' : '#0f172a',
                      width: '26px',
                      flexShrink: 0
                    }}
                  >
                    {cant.trim()}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      fontWeight: isHeader ? 800 : 700,
                      fontSize: isHeader ? '13px' : '14.5px',
                      color: isHeader ? '#64748b' : '#334155',
                      lineHeight: 1.3
                    }}
                  >
                    {detalle.trim()}
                  </Text>
                </Group>
                <Text
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 850,
                    fontSize: isHeader ? '13px' : '14.5px',
                    color: isHeader ? '#64748b' : '#0f172a',
                    flexShrink: 0
                  }}
                >
                  {total.trim()}
                </Text>
              </Group>
            );
          }

          // 4. Detectar desgloses de totales con formato "Etiqueta: - Valor"
          if (line.includes(': - ')) {
            const [label, val] = line.split(': - ');
            const isTotalGeneral =
              label.toLowerCase().includes('total') ||
              label.toLowerCase().includes('pendiente') ||
              label.toLowerCase().includes('pagar');
            return (
              <Group key={idx} justify="space-between" align="center" wrap="nowrap" w="100%" py={isTotalGeneral ? 6 : 2}>
                <Text
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: isTotalGeneral ? 900 : 700,
                    fontSize: isTotalGeneral ? '16px' : '14px',
                    color: isTotalGeneral ? '#0f172a' : '#475569'
                  }}
                >
                  {label.trim()}:
                </Text>
                <Text
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: isTotalGeneral ? 950 : 800,
                    fontSize: isTotalGeneral ? '18px' : '14px',
                    color: isTotalGeneral ? '#0f172a' : '#0f172a'
                  }}
                >
                  {val.trim()}
                </Text>
              </Group>
            );
          }

          // 5. Detectar cantidades de cocina [4]
          const qtyMatch = line.match(/^(\s*)\[(\d+)\](\s+)(.*)$/);
          if (qtyMatch) {
            const [, leadingSpaces, qty, , rest] = qtyMatch;
            return (
              <Group key={idx} gap={0} wrap="nowrap" align="center" style={{ minHeight: '30px', margin: '6px 0' }}>
                {leadingSpaces && <span style={{ whiteSpace: 'pre', fontFamily: 'monospace' }}>{leadingSpaces}</span>}
                <span
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    minWidth: '26px',
                    height: '26px',
                    padding: '0 6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '5px',
                    fontWeight: 900,
                    fontSize: '14px',
                    marginRight: '12px',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    flexShrink: 0
                  }}
                >
                  {qty}
                </span>
                <span
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 800,
                    fontSize: '17px',
                    color: '#0f172a',
                    letterSpacing: '0.1px',
                  }}
                >
                  {rest}
                </span>
              </Group>
            );
          }

          // 6. Modificadores y notas de comanda o precuenta (líneas que empiezan con espacio o asterisco)
          const modMatch = line.match(/^(\s+)([*-]?\s*)(.*)$/);
          if (modMatch) {
            const [, , , rest] = modMatch;
            return (
              <Group key={idx} gap={0} wrap="nowrap" align="center" style={{ minHeight: '20px', margin: '2px 0' }}>
                <span style={{ width: '42px', flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: '#64748b',
                    letterSpacing: '0.1px',
                  }}
                >
                  • {rest}
                </span>
              </Group>
            );
          }

          // 7. Líneas normales
          return (
            <Text
              key={idx}
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '13.5px',
                fontWeight: 600,
                lineHeight: 1.4,
                color: '#334155',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {line}
            </Text>
          );
        })}
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" radius="md">
            <FileText size={18} weight="bold" />
          </ThemeIcon>
          <Text fw={900} size="md" c="var(--pos-text)">
            {title}
          </Text>
        </Group>
      }
      centered
      radius="lg"
      size={isMobile ? '100%' : 'sm'}
      zIndex={2000}
      styles={{
        content: {
          backgroundColor: 'var(--pos-bg)',
          border: '1px solid var(--pos-border)',
          ...(isMobile ? {
            height: 'calc(100dvh - 32px)',
            width: 'calc(100vw - 32px)',
            margin: '16px',
            display: 'flex',
            flexDirection: 'column',
          } : {}),
        },
        body: {
          ...(isMobile ? {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            padding: 'var(--mantine-spacing-md)',
          } : {}),
        },
        header: {
          borderBottom: '1px solid var(--pos-border)',
          paddingBottom: '12px',
        }
      }}
    >
      <Stack gap="md" mt="xs" style={isMobile ? { flex: 1, minHeight: 0 } : undefined}>
        <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
          Alineación real de caracteres para impresoras térmicas estándar de 80mm (48 columnas).
        </Text>

        {/* Simulador de Papel Térmico */}
        <Box
          style={{
            backgroundColor: '#fcfcf9', // Papel marfil/crema clásico
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)',
            position: 'relative',
            overflow: 'hidden',
            ...(isMobile ? {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            } : {}),
          }}
        >
          {/* Línea rasgada superior (Simulado con guiones sutiles) */}
          <Box
            style={{
              height: '6px',
              backgroundImage: 'radial-gradient(circle, #e2e8f0 3px, transparent 4px)',
              backgroundSize: '12px 12px',
              opacity: 0.5,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 5,
            }}
          />

          <ScrollArea 
            offsetScrollbars 
            type="always" 
            p="xl" 
            pt="md"
            style={isMobile ? { flex: 1, minHeight: 0 } : { height: 400 }}
          >
            <Box style={{ textAlign: 'left' }}>
              {renderFormattedContent(content)}
            </Box>
          </ScrollArea>

          {/* Línea rasgada inferior */}
          <Box
            style={{
              height: '6px',
              backgroundImage: 'radial-gradient(circle, #e2e8f0 3px, transparent 4px)',
              backgroundSize: '12px 12px',
              opacity: 0.5,
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 5,
            }}
          />
        </Box>

        <Group gap="sm" grow style={{ flexShrink: 0 }}>
          <Button
            variant="default"
            size="md"
            radius="md"
            onClick={onClose}
            fw={800}
            leftSection={<X size={18} weight="bold" />}
          >
            Cerrar
          </Button>

          <Button
            color="green"
            size="md"
            radius="md"
            onClick={handlePrintSubmit}
            fw={800}
            leftSection={<Printer size={18} weight="bold" />}
          >
            Imprimir
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
