import { PencilLine, Trash } from'@phosphor-icons/react';

interface Product {
 id: string;
 name: string;
 price: number;
 category: string;
 stock: number;
}

interface ProductListProps {
 products?: Product[];
 onEdit?: (product: Product) => void;
 onDelete?: (id: string) => void;
}

export function ProductList({ products = [], onEdit, onDelete }: ProductListProps) {
 return (
 <div className="w-full h-full bg-card rounded-2xl border border-border shadow-xs flex flex-col overflow-hidden">
 <div className="overflow-y-auto flex-1">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-border bg-muted text-[10px] font-black uppercase text-muted-foreground">
 <th className="p-3">Producto</th>
 <th className="p-3">Categoría</th>
 <th className="p-3">Precio</th>
 <th className="p-3">Stock</th>
 <th className="p-3 text-right">Acciones</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border text-xs">
 {products.length > 0 ? (
 products.map((product) => (
 <tr key={product.id} className="transition-colors">
 <td className="p-3 font-extrabold text-foreground">{product.name}</td>
 <td className="p-3">
 <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold text-[10px]">
 {product.category}
 </span>
 </td>
 <td className="p-3 font-black text-foreground">${product.price.toFixed(2)}</td>
 <td className="p-3 font-semibold text-muted-foreground">{product.stock}</td>
 <td className="p-3 text-right">
 <div className="flex items-center justify-end gap-1">
 <button
 type="button"onClick={() => onEdit?.(product)}
 className="p-1.5 rounded-lg text-muted-foreground cursor-pointer">
 <PencilLine size={16} />
 </button>
 <button
 type="button"onClick={() => onDelete?.(product.id)}
 className="p-1.5 rounded-lg text-destructive cursor-pointer">
 <Trash size={16} />
 </button>
 </div>
 </td>
 </tr>
 ))
 ) : (
 <tr>
 <td colSpan={5} className="p-8 text-center text-muted-foreground font-bold">
 No hay productos registrados
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 );
}
