import { useState, useEffect } from'react';
import { ArrowLeft, Check } from'@phosphor-icons/react';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogTitle,
 DialogDescription,
} from'@/components/ui/dialog';

interface ProductModifiersModalProps {
 opened: boolean;
 onClose: () => void;
 product: any;
 onConfirm: (selectedOptions: string[]) => void;
}

export function ProductModifiersModal({
 opened,
 onClose,
 product,
 onConfirm
}: ProductModifiersModalProps) {
 const [selections, setSelections] = useState<{ [groupId: string]: string[] }>({});
 const [currentStep, setCurrentStep] = useState(0);

 useEffect(() => {
 if (opened && product) {
 const initial: { [groupId: string]: string[] } = {};
 product.modificadores?.forEach((group: any) => {
 initial[group.nombre] = [];
 });
 setSelections(initial);
 setCurrentStep(0);
 }
 }, [opened, product]);

 if (!opened || !product) return null;

 const modificadores = product.modificadores || [];
 if (modificadores.length === 0) return null;

 return (
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <ProductModifiersDialogContent
 product={product}
 modificadores={modificadores}
 currentStep={currentStep}
 setCurrentStep={setCurrentStep}
 selections={selections}
 setSelections={setSelections}
 onConfirm={onConfirm}
 onClose={onClose}
 />
 </Dialog>
 );
}

interface ProductModifiersDialogContentProps {
 product: any;
 modificadores: any[];
 currentStep: number;
 setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
 selections: { [groupId: string]: string[] };
 setSelections: React.Dispatch<React.SetStateAction<{ [groupId: string]: string[] }>>;
 onConfirm: (selectedOptions: string[]) => void;
 onClose: () => void;
}

function ProductModifiersDialogContent({
 product,
 modificadores,
 currentStep,
 setCurrentStep,
 selections,
 setSelections,
 onConfirm,
 onClose,
}: ProductModifiersDialogContentProps) {

 const currentGroup = modificadores[currentStep];
 const selectedOpts = selections[currentGroup.nombre] || [];
 const isLastStep = currentStep === modificadores.length - 1;
 const canProceed = !currentGroup.obligatorio || selectedOpts.length > 0;

 const toggle = (option: string) => {
 setSelections(prev => {
 const current = prev[currentGroup.nombre] || [];
 if (currentGroup.multi) {
 return {
 ...prev,
 [currentGroup.nombre]: current.includes(option)
 ? current.filter(o => o !== option)
 : [...current, option]
 };
 }
 return { ...prev, [currentGroup.nombre]: [option] };
 });
 };

 const handleNext = () => {
 if (!canProceed) return;
 if (!isLastStep) {
 setCurrentStep(s => s + 1);
 } else {
 const all: string[] = [];
 Object.values(selections).forEach(opts => all.push(...opts));
 onConfirm(all);
 onClose();
 }
 };

 return (
 <DialogContent className="max-w-sm overflow-hidden flex flex-col p-5 gap-4">
 {/* Header */}
 <div className="flex items-center justify-between border-b border-border pb-3">
 <DialogTitle asChild>
 <div className="flex items-center gap-2 truncate">
 <h3 className="font-extrabold text-sm text-foreground truncate">{product.nombre}</h3>
 {modificadores.length > 1 && (
 <span className="text-xs font-semibold text-muted-foreground shrink-0">
 {currentStep + 1}/{modificadores.length}
 </span>
 )}
 </div>
 </DialogTitle>
 </div>
 <DialogDescription className="sr-only">Selecciona los modificadores del producto</DialogDescription>

 {/* Group Label */}
 <div className="flex items-center justify-between">
 <h4 className="font-extrabold text-base text-foreground">{currentGroup.nombre}</h4>
 <span className={cn("px-2 py-0.5 rounded-md font-bold text-[10px]",
 currentGroup.obligatorio ?"bg-destructive/10 text-destructive":"bg-muted text-muted-foreground")}>
 {currentGroup.obligatorio ?'Requerido':'Opcional'}
 </span>
 </div>

 {/* Options List */}
 <div className="max-h-64 overflow-y-auto flex flex-col gap-2">
 {currentGroup.opciones.map((option: string) => {
 const selected = selectedOpts.includes(option);
 return (
 <button
 key={option}
 type="button"onClick={() => toggle(option)}
 className={cn("w-full px-4 py-3 rounded-xl border-2 font-semibold text-sm flex items-center justify-between transition-all cursor-pointer select-none active:scale-98 text-left",
 selected
 ?"bg-primary/10 border-primary text-primary":"bg-card border-border text-foreground")}
 >
 <span>{option}</span>
 {selected && <Check size={18} weight="bold"className="text-primary"/>}
 </button>
 );
 })}
 </div>

 {/* Footer Buttons */}
 <div className="flex items-center justify-between pt-3 border-t border-border">
 <Button
 type="button"variant="ghost"disabled={currentStep === 0}
 onClick={() => setCurrentStep(s => s - 1)}
 className="text-muted-foreground text-xs font-bold gap-1">
 <ArrowLeft size={16} weight="bold"/> Atrás
 </Button>

 <Button
 type="button"disabled={!canProceed}
 onClick={handleNext}
 className={cn("font-bold text-xs gap-1.5",
 isLastStep ?"bg-emerald-600 text-white":"")}
 >
 <span>{isLastStep ?'Agregar':'Siguiente'}</span>
 {isLastStep && <Check size={16} weight="bold"/>}
 </Button>
 </div>
 </DialogContent>
 );
}
