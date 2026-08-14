import { useUI } from '../../context/UIContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from 'react';

export function GlobalModals() {
  const { confirmModal, closeConfirm, promptModal, closePrompt } = useUI();
  const [promptValue, setPromptValue] = useState(promptModal.defaultValue || '');

  useEffect(() => {
    if (promptModal.opened) {
      setPromptValue(promptModal.defaultValue || '');
    }
  }, [promptModal.opened, promptModal.defaultValue]);

  return (
    <>
      {/* Confirm Modal */}
      <Dialog open={confirmModal.opened} onOpenChange={(open) => !open && closeConfirm()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{confirmModal.title}</DialogTitle>
            <DialogDescription>
              {confirmModal.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeConfirm}>
              Cancelar
            </Button>
            <Button variant="default" onClick={() => {
              confirmModal.onConfirm();
              closeConfirm();
            }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt Modal */}
      <Dialog open={promptModal.opened} onOpenChange={(open) => !open && closePrompt()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{promptModal.title}</DialogTitle>
            <DialogDescription>
              {promptModal.label}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              id="prompt-input"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptModal.placeholder}
              className="col-span-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (promptModal.required && !promptValue.trim()) return;
                  promptModal.onConfirm(promptValue);
                  closePrompt();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePrompt}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={promptModal.required && !promptValue.trim()} onClick={() => {
              promptModal.onConfirm(promptValue);
              closePrompt();
            }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
