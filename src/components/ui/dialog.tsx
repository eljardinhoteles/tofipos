import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Dialog>) {
 return <DialogPrimitive.Dialog {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.DialogTrigger>) {
 return <DialogPrimitive.DialogTrigger {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.DialogPortal>) {
 return <DialogPrimitive.DialogPortal {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.DialogClose>) {
 return <DialogPrimitive.DialogClose {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.DialogOverlay>) {
 return (
 <DialogPrimitive.DialogOverlay
 className={cn("fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
 className
 )}
 {...props}
 />
 )
}

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.DialogContent>) {
 return (
 <DialogPortal>
 <DialogOverlay />
 <DialogPrimitive.DialogContent
 className={cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 bg-background p-6 shadow-xl duration-200 rounded-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
 className
 )}
 {...props}
 >
 {children}
 <DialogPrimitive.DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 focus:outline-none">
 <X size={16} />
 <span className="sr-only">Cerrar</span>
 </DialogPrimitive.DialogClose>
 </DialogPrimitive.DialogContent>
 </DialogPortal>
 )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
 return <div className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
 return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.DialogTitle>) {
 return <DialogPrimitive.DialogTitle className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.DialogDescription>) {
 return <DialogPrimitive.DialogDescription className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
