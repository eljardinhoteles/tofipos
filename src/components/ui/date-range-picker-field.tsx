import { useState } from "react"
import { CalendarBlank } from "@phosphor-icons/react"
import dayjs from "dayjs"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

interface DateRangePickerFieldProps {
  /** Llegada y salida, AAAA-MM-DD ('' si no hay). */
  desde: string
  hasta: string
  onChange: (desde: string, hasta: string) => void
  /** Primer día elegible (AAAA-MM-DD). Los anteriores se deshabilitan. */
  minimo?: string
  /** Noches máximas (se deshabilitan los días más allá del límite una vez elegido el primero). */
  maxNoches?: number
  /** Texto al final del campo (p. ej. «1 noche»). */
  sufijo?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
}

const fmt = (f: string) => dayjs(f).format("ddd D MMM")

/**
 * Selector de DOS fechas (llegada y salida) en un solo calendario de rango, para no abrir dos calendarios. Hace falta
 * al menos una noche: un clic en el mismo día dos veces no cierra el rango. El rango queda aplicado al elegir la salida.
 */
export function DateRangePickerField({ desde, hasta, onChange, minimo, maxNoches, sufijo, className, disabled, ...rest }: DateRangePickerFieldProps) {
  const [abierto, setAbierto] = useState(false)
  // Mientras se elige, solo se conoce la llegada: se guarda aparte hasta tener la salida.
  const [primera, setPrimera] = useState<Date | undefined>(undefined)

  const rango: DateRange | undefined = primera
    ? { from: primera, to: undefined }
    : desde ? { from: dayjs(desde).toDate(), to: hasta ? dayjs(hasta).toDate() : undefined } : undefined

  const alElegir = (_r: DateRange | undefined, dia: Date) => {
    const d = dayjs(dia)
    if (!primera) { setPrimera(d.toDate()); return }
    if (d.isSame(primera, "day")) return // misma fecha: falta la salida (mínimo 1 noche)
    const [a, b] = d.isBefore(primera) ? [d, dayjs(primera)] : [dayjs(primera), d]
    onChange(a.format("YYYY-MM-DD"), b.format("YYYY-MM-DD"))
    setPrimera(undefined)
    setAbierto(false)
  }

  const limiteMax = primera && maxNoches ? dayjs(primera).add(maxNoches, "day").toDate() : undefined
  const limiteMin = primera && maxNoches ? dayjs(primera).subtract(maxNoches, "day").toDate() : undefined

  return (
    <Popover open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setPrimera(undefined) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={rest["aria-label"] ?? "Elegir llegada y salida"}
          className={cn(
            "h-11 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 text-base flex items-center gap-2 outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            !desde && "text-muted-foreground",
            className,
          )}
        >
          <CalendarBlank size={18} className="shrink-0 text-muted-foreground" />
          <span className="truncate capitalize grow text-left">
            {desde && hasta ? `${fmt(desde)} → ${fmt(hasta)}` : "Elegir llegada y salida"}
          </span>
          {sufijo && desde && hasta && <span className="shrink-0 t-meta text-muted-foreground normal-case">{sufijo}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <p className="px-4 pt-3 t-meta text-muted-foreground" role="status" aria-live="polite">
          {primera ? `Llegada ${fmt(dayjs(primera).format("YYYY-MM-DD"))}. Elige la salida.` : "Elige el día de llegada."}
        </p>
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={desde ? dayjs(desde).toDate() : minimo ? dayjs(minimo).toDate() : undefined}
          selected={rango}
          onSelect={alElegir}
          disabled={[
            ...(minimo ? [{ before: dayjs(minimo).toDate() }] : []),
            ...(limiteMax ? [{ after: limiteMax }] : []),
            ...(limiteMin ? [{ before: limiteMin }] : []),
          ]}
        />
      </PopoverContent>
    </Popover>
  )
}
