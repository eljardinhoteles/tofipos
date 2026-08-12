import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
  const [name, setName] = useState(initialValues?.name || '');
  const [price, setPrice] = useState(initialValues?.price || 0);
  const [category, setCategory] = useState(initialValues?.category || 'General');
  const [stock, setStock] = useState(initialValues?.stock || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, price, category, stock });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-bold">Nombre del Producto *</Label>
        <Input
          type="text"
          required
          placeholder="Ej. Pizza Margarita"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 text-xs font-semibold"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-bold">Precio ($)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={price || ''}
            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
            className="h-9 text-xs font-bold"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-bold">Stock</Label>
          <Input
            type="number"
            min={0}
            value={stock || ''}
            onChange={(e) => setStock(parseInt(e.target.value) || 0)}
            className="h-9 text-xs font-semibold"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-bold">Categoría</Label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 px-3 text-xs bg-input/50 border border-transparent rounded-2xl focus:outline-none focus:border-ring font-semibold"
        >
          <option value="General">General</option>
          <option value="Bebidas">Bebidas</option>
          <option value="Entradas">Entradas</option>
          <option value="Platos">Platos</option>
          <option value="Postres">Postres</option>
        </select>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm">Guardar</Button>
      </div>
    </form>
  );
}
