import { Button, Group, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';

interface ProductFormProps {
    initialValues?: {
        name: string;
        price: number;
        category: string;
        stock: number;
    };
    onSubmit: (values: any) => void;
    onCancel: () => void;
}

export function ProductForm({ initialValues, onSubmit, onCancel }: ProductFormProps) {
    const form = useForm({
        initialValues: initialValues || {
            name: '',
            price: 0,
            category: 'General',
            stock: 0,
        },
        validate: {
            name: (value) => (value.length < 2 ? 'Mínimo 2 caracteres' : null),
            price: (value) => (value < 0 ? 'Precio inválido' : null),
        },
    });

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="xl">
                <TextInput
                    label="Nombre del Producto"
                    placeholder="Ej. Pizza Margarita"
                    required
                    {...form.getInputProps('name')}
                />

                <Group grow gap="xl">
                    <NumberInput
                        label="Precio"
                        prefix="$"
                        decimalScale={2}
                        fixedDecimalScale
                        required
                        {...form.getInputProps('price')}
                    />
                    <NumberInput
                        label="Stock"
                        placeholder="0"
                        {...form.getInputProps('stock')}
                    />
                </Group>

                <Select
                    label="Categoría"
                    placeholder="Selecciona categoría"
                    data={['General', 'Comida', 'Bebidas', 'Postres']}
                    {...form.getInputProps('category')}
                />

                <Group justify="flex-end" mt="xl">
                    <Button variant="light" color="gray" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit">
                        Guardar Producto
                    </Button>
                </Group>
            </Stack>
        </form>
    );
}
