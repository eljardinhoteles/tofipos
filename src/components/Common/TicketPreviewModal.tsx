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
  const ESC = String.fromCharCode(27);
  const GS = String.fromCharCode(29);

  const stripEscPos = (text: string) =>
    text
      // Remove common ESC/POS control sequences so the preview shows printable text only.
      .replace(new RegExp(`${ESC}[@Eae!]\\x00?`, 'g'), '')
      .replace(new RegExp(`${GS}[Vv][ABab]\\x05?`, 'g'), '')
      .replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');

  const handlePrintSubmit = () => {
    sileo.success({
      title: 'Enviado a Impresora',
      description: 'El documento se envió a la cola de impresión local (80mm).',
    });
    if (onPrint) onPrint();
    onClose();
  };

  const renderFormattedContent = (text?: string) => {
    const safeText = stripEscPos(text ?? '');
    const lines = safeText.split('\n');
      return (
        <Box
          style={{
            margin: 0,
            width: '100%',
            maxWidth: '100%',
            color: '#111827',
            background: '#fff',
          }}
        >
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          const isBigHeader =
            trimmed.startsWith('MESA #') ||
            trimmed.startsWith('ORDEN: #') ||
            trimmed.startsWith('BEBIDAS / BAR') ||
            trimmed.startsWith('***');
          const isMenuItem =
            /^\d+\s{2,}[A-ZÁÉÍÓÚÑ0-9]/.test(trimmed) ||
            /^\d+x\s/.test(trimmed) ||
            /^\[\d+\]/.test(trimmed);
          const isNoteOrSubline =
            /^(\s+)(NOTA:|[-*]|[A-ZÁÉÍÓÚÑ])/i.test(line) && !isMenuItem;

          return (
            <Box
              key={idx}
              component="div"
              style={{
                fontFamily: '"Courier New", Courier, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: isBigHeader ? '14px' : isMenuItem ? '11.5px' : '11px',
                fontWeight: isBigHeader || isMenuItem ? 700 : 400,
                lineHeight: isBigHeader ? 1.1 : 1.15,
                whiteSpace: 'pre',
                wordBreak: 'keep-all',
                letterSpacing: 0,
                padding: '0',
                margin: 0,
                color: isBigHeader ? '#0f172a' : isMenuItem ? '#111827' : '#334155',
              }}
            >
              {isNoteOrSubline ? `  ${line.trim()}` : line}
            </Box>
          );
        })}
      </Box>
    );
  };

  const ticketParts = content ? content.split(/[\r\n]*={48}[\r\n\s]*RECORTAR AQUI[^\r\n]*[\r\n]*={48}[\r\n]*/) : [];
  const hasMultipleTickets = ticketParts.length > 1;

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
      size={isMobile ? '100%' : 'auto'}
      fullScreen={isMobile}
      zIndex={2000}
      styles={{
        content: {
          backgroundColor: 'var(--pos-bg)',
          border: '1px solid var(--pos-border)',
          width: 'min(450px, calc(100vw - 32px))',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          margin: '0 auto',
          ...(isMobile ? {
            height: 'calc(100dvh - 32px)',
            width: 'calc(100vw - 32px)',
            margin: '16px',
            display: 'flex',
            flexDirection: 'column',
          } : {}),
        },
        body: {
          display: 'block',
          overflow: 'auto',
          padding: 'var(--mantine-spacing-md)',
          width: '100%',
        },
        header: {
          borderBottom: '1px solid var(--pos-border)',
          paddingBottom: '12px',
        }
      }}
    >
      <Stack gap="md" mt="xs" style={{ width: '100%', maxWidth: '100%' }}>
        <Text
          size="xs"
          c="dimmed"
          fw={600}
          style={{
            flexShrink: 0,
            width: '100%',
            whiteSpace: 'normal',
            lineHeight: 1.25,
          }}
        >
          Alineación real de caracteres para impresoras térmicas estándar de 80mm (48 columnas).
        </Text>

        {hasMultipleTickets ? (
          <Stack gap="xl" style={{ width: '100%' }}>
            {ticketParts.map((part, index) => (
              <Box key={index}>
                <Text size="xs" fw={800} c="dimmed" mb={6} tt="uppercase" lts={0.5}>
                  Comprobante #{index + 1} - {index === 0 ? 'Cocina' : 'Bebidas'}
                </Text>
                <Box
                  style={{
                    width: '100%',
                    maxWidth: '420px',
                    margin: '0 auto',
                    backgroundColor: '#fdfdfd',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
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
                    type="hover" 
                    p="sm" 
                    pt="md"
                    style={{ width: '100%' }}
                  >
                    <Box
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'flex-start',
                        width: '100%',
                      }}
                    >
                      {renderFormattedContent(part)}
                    </Box>
                  </ScrollArea>

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
              </Box>
            ))}
          </Stack>
        ) : (
          <Box
            style={{
              width: '100%',
              maxWidth: '420px',
              margin: '0 auto',
              backgroundColor: '#fdfdfd',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
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
              type="hover" 
              p="sm" 
              pt="md"
              style={{ width: '100%' }}
            >
              <Box
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  width: '100%',
                }}
              >
                {renderFormattedContent(content)}
              </Box>
            </ScrollArea>

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
        )}

        <Group gap="sm" grow style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
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
