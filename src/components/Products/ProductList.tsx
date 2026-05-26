import { ActionIcon, Badge, Group, Table, Text, Card, ScrollArea, Box } from '@mantine/core';
import { PencilLine, Trash } from '@phosphor-icons/react';

interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    stock: number;
}

interface ProductListProps {
    products: Product[];
    onEdit: (product: Product) => void;
    onDelete: (id: string) => void;
}

export function ProductList({ products = [], onEdit, onDelete }: Partial<ProductListProps>) {
    const rows = products?.map((product) => (
        <Table.Tr key={product.id} className="tap-feedback">
            <Table.Td>
                <Text fw={700} size="md">{product.name}</Text>
            </Table.Td>
            <Table.Td>
                <Badge color="myColor" variant="light">{product.category}</Badge>
            </Table.Td>
            <Table.Td>
                <Text fw={800} size="lg" c="myColor">${product.price.toFixed(2)}</Text>
            </Table.Td>
            <Table.Td>
                <Text size="sm" fw={600} c={product.stock < 10 ? 'red' : 'dimmed'}>
                    Stock: {product.stock}
                </Text>
            </Table.Td>
            <Table.Td>
                <Group gap="xs" justify="flex-end">
                    <ActionIcon variant="subtle" color="gray" onClick={() => onEdit?.(product)}>
                        <PencilLine size={20} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => onDelete?.(product.id)}>
                        <Trash size={20} />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <Card withBorder p={0} radius="xl" shadow="none" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <ScrollArea h="100%" offsetScrollbars scrollbarSize={6}>
                <Table 
                    verticalSpacing="sm" 
                    horizontalSpacing="xl" 
                    stickyHeader 
                    stickyHeaderOffset={0}
                >
                    <Table.Thead style={{ backgroundColor: 'white', zIndex: 10 }}>
                        <Table.Tr>
                            <Table.Th style={{ color: 'var(--pos-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Producto</Table.Th>
                            <Table.Th style={{ color: 'var(--pos-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Categoría</Table.Th>
                            <Table.Th style={{ color: 'var(--pos-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Precio</Table.Th>
                            <Table.Th style={{ color: 'var(--pos-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Stock</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.length > 0 ? rows : (
                            <Table.Tr>
                                <Table.Td colSpan={5}>
                                    <Text c="dimmed" ta="center" py="xl" fw={500}>
                                        No hay productos registrados
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
                <Box h={100} /> {/* Espacio para que el botón flotante no tape la última fila */}
            </ScrollArea>
        </Card>
    );
}
