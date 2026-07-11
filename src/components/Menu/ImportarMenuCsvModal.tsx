import { useRef, useState } from 'react';
import { Modal, Stack, Group, Text, Button, FileButton, Table, ScrollArea, Badge, Alert, Progress } from '@mantine/core';
import { UploadSimple, Download, Warning, CheckCircle } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { parseMenuCsv, MENU_CSV_TEMPLATE, type MenuCsvRow } from '../../lib/menuCsvImport';
import { createRxCategoria, createRxMenuItem } from '../../db/rxdb';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function ImportarMenuCsvModal({ opened, onClose }: Props) {
  const { categorias: dbCategorias } = useRxMenuCatalog();
  const [rows, setRows] = useState<MenuCsvRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const resetRef = useRef<() => void>(null);

  const validRows = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length > 0);
  const newCategoryNames = [...new Set(
    validRows
      .map(r => r.categoria)
      .filter(nombre => !dbCategorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase()))
  )];

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseMenuCsv(text);
    setRows(parsed.rows);
    setHeaderErrors(parsed.headerErrors);
  };

  const handleDescargarPlantilla = () => {
    // BOM UTF-8 para que Excel detecte los acentos correctamente
    const blob = new Blob(['﻿' + MENU_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos.csv';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  const handleReset = () => {
    setRows([]);
    setHeaderErrors([]);
    setFileName(null);
    setProgress(0);
    resetRef.current?.();
  };

  const handleClose = () => {
    if (importing) return;
    handleReset();
    onClose();
  };

  const handleImportar = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setProgress(0);
    try {
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const categoriaIdPorNombre = new Map<string, string>(
        dbCategorias.map(c => [c.nombre.toLowerCase(), c.id])
      );

      // Crear categorías nuevas primero
      for (const nombre of newCategoryNames) {
        const creada = await createRxCategoria({ id: crypto.randomUUID(), nombre, organization_id: orgId });
        categoriaIdPorNombre.set(nombre.toLowerCase(), creada.id);
      }

      let done = 0;
      let failed = 0;
      for (const row of validRows) {
        const categoriaId = categoriaIdPorNombre.get(row.categoria.toLowerCase());
        try {
          await createRxMenuItem({
            id: crypto.randomUUID(),
            nombre: row.nombre,
            precio: row.precio,
            categoria_id: categoriaId || '',
            categoria_nombre: row.categoria,
            activo: row.activo,
            es_bebida: row.es_bebida,
            modificadores: [],
            descripcion: row.descripcion,
            iva_modalidad: row.iva_modalidad,
            iva_porcentaje: row.iva_modalidad === 'especifico' ? row.iva_porcentaje : undefined,
            organization_id: orgId,
          });
        } catch {
          failed++;
        }
        done++;
        setProgress(Math.round((done / validRows.length) * 100));
      }

      if (failed > 0) {
        sileo.error({ title: 'Importación parcial', description: `${done - failed} productos creados, ${failed} fallaron.` });
      } else {
        sileo.success({ title: 'Importación completa', description: `${done} productos creados.` });
      }
      handleReset();
      onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <UploadSimple size={22} weight="duotone" color="var(--ui-primary)" />
          <Text fw={800} size="md">Importar productos vía CSV</Text>
        </Group>
      }
      centered
      radius="xl"
      size="lg"
    >
      <Stack gap="md">
        {rows.length === 0 && (
          <>
            <Text size="sm" c="dimmed">
              Sube un archivo CSV con columnas: <b>nombre, precio, categoria</b> (requeridas) y opcionalmente
              descripcion, es_bebida, activo, iva_modalidad (sistema/especifico/exento), iva_porcentaje.
              Las categorías que no existan se crean automáticamente.
            </Text>
            <Group>
              <FileButton resetRef={resetRef} onChange={handleFile} accept=".csv,text/csv">
                {(props) => <Button {...props} leftSection={<UploadSimple size={16} />} radius="md">Seleccionar archivo CSV</Button>}
              </FileButton>
              <Button variant="subtle" leftSection={<Download size={16} />} radius="md" onClick={handleDescargarPlantilla}>
                Descargar plantilla
              </Button>
            </Group>
          </>
        )}

        {headerErrors.length > 0 && (
          <Alert color="red" icon={<Warning size={18} />} title="No se pudo leer el archivo">
            {headerErrors.join(' ')}
          </Alert>
        )}

        {rows.length > 0 && (
          <>
            <Group justify="space-between">
              <Text size="sm" fw={600}>{fileName}</Text>
              <Button variant="subtle" size="xs" onClick={handleReset} disabled={importing}>Elegir otro archivo</Button>
            </Group>

            <Group gap="xs">
              <Badge color="green" variant="light" leftSection={<CheckCircle size={12} />}>{validRows.length} válidos</Badge>
              {invalidRows.length > 0 && <Badge color="red" variant="light">{invalidRows.length} con errores</Badge>}
              {newCategoryNames.length > 0 && (
                <Badge color="blue" variant="light">{newCategoryNames.length} categorías nuevas</Badge>
              )}
            </Group>

            <ScrollArea h={280} offsetScrollbars>
              <Table striped highlightOnHover stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Precio</Table.Th>
                    <Table.Th>Categoría</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => (
                    <Table.Tr key={row.rowNumber} style={row.errors.length > 0 ? { backgroundColor: 'var(--mantine-color-red-0)' } : undefined}>
                      <Table.Td>{row.rowNumber}</Table.Td>
                      <Table.Td>{row.nombre || <i>—</i>}</Table.Td>
                      <Table.Td>${row.precio.toFixed(2)}</Table.Td>
                      <Table.Td>
                        {row.categoria}
                        {newCategoryNames.includes(row.categoria) && (
                          <Badge ml={6} size="xs" color="blue" variant="light">nueva</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {row.errors.length === 0
                          ? <Badge size="xs" color="green" variant="light">OK</Badge>
                          : <Text size="xs" c="red">{row.errors.join('; ')}</Text>}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            {importing && <Progress value={progress} animated size="sm" radius="xl" />}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleClose} disabled={importing} radius="md">Cancelar</Button>
              <Button
                onClick={handleImportar}
                loading={importing}
                disabled={validRows.length === 0}
                radius="md"
                color="myColor"
              >
                Importar {validRows.length} producto{validRows.length === 1 ? '' : 's'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
