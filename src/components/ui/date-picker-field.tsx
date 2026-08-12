import { CalendarBlank } from "@phosphor-icons/react"
import dayjs from "dayjs"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Reemplazo de <Input type="date"> nativo: en modo oscuro el ícono del
 * selector de fecha del navegador se dibuja oscuro sobre fondo oscuro y
 * queda invisible (falta color-scheme). Este componente usa el Calendar
 * del ui kit dentro de un Popover para que siempre sea visible y
 * consistente con el resto de la app.
 */
export function DatePickerField({ value, onChange, placeholder = "Seleccionar fecha", className, disabled }: DatePickerFieldProps) {
  const selected = value ? dayjs(value).toDate() : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm flex items-center gap-2 outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarBlank size={16} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{value ? dayjs(value).format("DD/MM/YYYY") : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => date && onChange(dayjs(date).format("YYYY-MM-DD"))}
        />
      </PopoverContent>
    </Popover>
  )
}
