import { Paperclip, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComprobanteAdjuntoProps {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  title?: string;
  placeholder?: string;
}

/** Adjuntar foto o PDF: recuadro punteado; con archivo, una fila con el nombre y una X para quitarlo. */
export function ComprobanteAdjunto({ file, onChange, disabled = false, title, placeholder = 'Adjuntar foto o PDF' }: ComprobanteAdjuntoProps) {
  if (file) {
    return (
      <div className="flex items-center gap-2 h-12 pl-3 pr-1 rounded-2xl border border-border bg-muted/40 t-cuerpo text-secondary-foreground">
        <Paperclip size={16} className="shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{file.name}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Quitar comprobante" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
          <X size={16} weight="bold" />
        </Button>
      </div>
    );
  }
  return (
    <label title={title}
      className={cn('flex items-center gap-2 h-12 px-3 rounded-2xl border border-dashed border-border t-cuerpo text-muted-foreground transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/60 hover:text-foreground')}>
      <Paperclip size={16} className="shrink-0" />
      <span className="truncate">{placeholder}</span>
      <input type="file" accept="image/*,application/pdf" className="hidden" disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}
