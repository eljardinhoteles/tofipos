import { Modal, Button, Group, Stack, Text, Box, ScrollArea, ThemeIcon } from '@mantine/core';
import { Printer, X, FileText } from '@phosphor-icons/react';
import { sileo } from 'sileo';

interface PrintableItem {
  nombre: string;
  precio: number;
  cantidad: number;
  item_id?: string;
  modificadores?: string[];
  nota?: string;
}

export interface A4ReportPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  mesasData: Array<{ mesaNombre: string; habitacionNombre?: string; items: PrintableItem[] }>;
}

// Los nombres de producto, notas y mesas son texto libre editable por el
// usuario (Ajustes → Menú, notas de comanda) y se interpolan en HTML dentro
// de dangerouslySetInnerHTML — sin escapar, un nombre de producto como
// "<img src=x onerror=...>" ejecutaría en el reporte A4.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function A4ReportPreviewModal({
  opened,
  onClose,
  mesasData,
}: A4ReportPreviewModalProps) {

  // Procesar datos
  const globalGroups: { [key: string]: { nombre: string; totalQty: number } } = {};
  
  const processedMesas = mesasData.map((mesaData) => {
    const mesaGroups: { [key: string]: { nombre: string; totalQty: number; subItems: Array<{ cantidad: number; modifiers: string[]; nota?: string }> } } = {};
    
    mesaData.items.forEach(item => {
      const key = item.item_id || item.nombre;
      if (!mesaGroups[key]) {
        mesaGroups[key] = { nombre: item.nombre, totalQty: 0, subItems: [] };
      }
      mesaGroups[key].totalQty += item.cantidad;
      mesaGroups[key].subItems.push({
        cantidad: item.cantidad,
        modifiers: item.modificadores || [],
        nota: item.nota
      });

      if (!globalGroups[key]) {
        globalGroups[key] = { nombre: item.nombre, totalQty: 0 };
      }
      globalGroups[key].totalQty += item.cantidad;
    });

    return {
      mesaNombre: mesaData.mesaNombre,
      habitacionNombre: mesaData.habitacionNombre,
      groups: Object.values(mesaGroups)
    };
  });

  const globalList = Object.values(globalGroups).sort((a, b) => b.totalQty - a.totalQty);

  // Función para construir el HTML estéticamente idéntico al ticket, pero estructurado para soportar columnas
  const buildHtmlContent = (isPrint: boolean = false) => {
    const scale = isPrint ? 1.3 : 1;
    let html = `<div style="font-family: system-ui, -apple-system, sans-serif; text-align: left; width: 100%;">`;

    // HEADER
    html += `
      <div style="margin-top: ${10 * scale}px; margin-bottom: ${12 * scale}px;">
        <span style="font-size: ${22 * scale}px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a; line-height: 1.2;">
          REPORTE COCINA CONSOLIDADO
        </span>
      </div>
      <p style="font-size: ${14 * scale}px; font-weight: 600; line-height: 1.4; color: #334155; margin: 0;">Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
      <div style="border-bottom: ${2.5 * scale}px solid #0f172a; margin: ${10 * scale}px 0; width: 100%;"></div>
    `;

    // MESAS (2 columnas)
    html += `<div style="column-count: 2; column-gap: ${40 * scale}px; margin-top: ${20 * scale}px;">`;
    processedMesas.forEach(mesa => {
      html += `<div style="break-inside: avoid; margin-bottom: ${30 * scale}px;">`;
      
      html += `
        <div style="margin-top: ${10 * scale}px; margin-bottom: ${12 * scale}px;">
          <span style="font-size: ${22 * scale}px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a; line-height: 1.2;">
            --- ${escapeHtml(mesa.mesaNombre.toUpperCase())} ---
          </span>
        </div>
      `;

      if (mesa.habitacionNombre) {
        html += `
          <div style="margin-top: ${10 * scale}px; margin-bottom: ${12 * scale}px;">
            <span style="font-size: ${22 * scale}px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a; line-height: 1.2;">
              HAB: ${escapeHtml(mesa.habitacionNombre.toUpperCase())}
            </span>
          </div>
        `;
      }

      mesa.groups.forEach(g => {
        html += `
          <div style="display: flex; align-items: flex-start; min-height: ${30 * scale}px; margin: ${6 * scale}px 0;">
            <span style="background-color: #0f172a; color: #ffffff; min-width: ${26 * scale}px; height: ${26 * scale}px; padding: 0 ${6 * scale}px; display: inline-flex; align-items: center; justify-content: center; border-radius: ${5 * scale}px; font-weight: 900; font-size: ${14 * scale}px; margin-right: ${12 * scale}px; flex-shrink: 0; margin-top: ${2 * scale}px;">${g.totalQty}</span>
            <div style="flex: 1;">
              <span style="font-weight: 800; font-size: ${17 * scale}px; color: #0f172a; letter-spacing: 0.1px;">${escapeHtml(g.nombre.toUpperCase())}</span>
        `;
        
        g.subItems.forEach(sub => {
          if (sub.modifiers.length > 0) {
            html += `
              <div style="display: flex; align-items: center; min-height: ${20 * scale}px; margin: ${2 * scale}px 0;">
                <span style="font-weight: 700; font-size: ${13 * scale}px; color: #64748b; letter-spacing: 0.1px;">• ${escapeHtml(sub.modifiers.join(' · ').toUpperCase())}</span>
              </div>
            `;
          }
          if (sub.nota) {
            html += `
              <div style="display: flex; align-items: center; min-height: ${20 * scale}px; margin: ${2 * scale}px 0;">
                <span style="font-weight: 700; font-size: ${13 * scale}px; color: #64748b; letter-spacing: 0.1px;">• NOTA: ${escapeHtml(sub.nota.toUpperCase())}</span>
              </div>
            `;
          }
        });

        html += `</div></div>`; // Close items text block and row
      });

      html += `</div>`; // Close break-inside avoid
    });
    html += `</div>`; // Close 2 columns

    // TOTALES GLOBALES (3 columnas)
    html += `
      <div style="border-bottom: ${2.5 * scale}px solid #0f172a; margin: ${20 * scale}px 0 ${10 * scale}px 0; width: 100%;"></div>
      <div style="margin-top: ${10 * scale}px; margin-bottom: ${12 * scale}px; text-align: center;">
        <span style="font-size: ${22 * scale}px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a; line-height: 1.2;">
          TOTALES GLOBALES
        </span>
      </div>
      <div style="border-bottom: ${2.5 * scale}px solid #0f172a; margin: ${10 * scale}px 0 ${20 * scale}px 0; width: 100%;"></div>
    `;

    html += `<div style="column-count: 3; column-gap: ${30 * scale}px;">`;
    globalList.forEach(g => {
      html += `
        <div style="break-inside: avoid; display: flex; align-items: center; min-height: ${30 * scale}px; margin: ${6 * scale}px 0;">
          <span style="background-color: #0f172a; color: #ffffff; min-width: ${26 * scale}px; height: ${26 * scale}px; padding: 0 ${6 * scale}px; display: inline-flex; align-items: center; justify-content: center; border-radius: ${5 * scale}px; font-weight: 900; font-size: ${14 * scale}px; margin-right: ${12 * scale}px; flex-shrink: 0;">${g.totalQty}</span>
          <span style="font-weight: 800; font-size: ${17 * scale}px; color: #0f172a; letter-spacing: 0.1px;">${escapeHtml(g.nombre.toUpperCase())}</span>
        </div>
      `;
    });
    html += `</div>`;

    html += '</div>';
    return html;
  };

  const handlePrintSubmit = () => {
    const windowPrint = window.open('', '', 'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0');
    if (!windowPrint) {
      sileo.error({ title: 'Ventana bloqueada', description: 'Permite las ventanas emergentes para imprimir.' });
      return;
    }

    const printHtml = buildHtmlContent(true);

    const htmlContent = `
      <html>
        <head>
          <title>Reporte Cocina A4</title>
          <style>
            body { 
              margin: 0; 
              padding: 1.5cm; 
              background: white;
            }
            @media print {
              @page { margin: 1cm; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${printHtml}
        </body>
      </html>
    `;

    windowPrint.document.write(htmlContent);
    windowPrint.document.close();
    windowPrint.focus();
    
    setTimeout(() => {
      windowPrint.print();
    }, 250);

    sileo.success({
      title: 'Ventana de impresión abierta',
      description: 'El documento A4 está listo para imprimirse.',
    });
    onClose();
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
            Vista Previa (Formato A4)
          </Text>
        </Group>
      }
      centered
      radius="lg"
      size="xl"
    >
      <Stack gap="md" mt="xs">
        <Text size="sm" c="dimmed" fw={600}>
          Este documento usa el diseño exacto del ticket de cocina, escalado y formateado a lo ancho de la hoja A4 para máxima legibilidad.
        </Text>

        <Box
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <ScrollArea h={500} offsetScrollbars p="xl">
            {/* Visualización interna exacta usando el parser HTML */}
            <div dangerouslySetInnerHTML={{ __html: buildHtmlContent(false) }} />
          </ScrollArea>
        </Box>

        <Group gap="sm" grow>
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
            Imprimir A4
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
