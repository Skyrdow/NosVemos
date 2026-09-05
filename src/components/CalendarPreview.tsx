import type { AgendaType } from '../lib/data/types'
import { DAY_LABELS } from '../lib/intersect'
import { formatMinutes } from '../lib/utils'

interface CalendarPreviewProps {
  granularityMin: number
  agendaType: AgendaType
  /** Rango horario visible (minutos desde medianoche). */
  timeStartMin?: number
  timeEndMin?: number
}

const AGENDA_LABELS: Record<AgendaType, string> = {
  weekly: 'Semana recurrente',
  one_off: 'Día puntual',
  hybrid: 'Híbrido',
}

/**
 * Mini grilla estática para que el creador vea cómo queda el calendario con la
 * granularidad y el tipo de agenda elegidos. No es interactiva (pointer-events:
 * none) y no toca datos: es pura preview del layout.
 */
export default function CalendarPreview({
  granularityMin,
  agendaType,
  timeStartMin = 480,
  timeEndMin = 1200,
}: CalendarPreviewProps) {
  // Misma lógica de buckets visibles que la grilla real (solo display).
  const buckets: number[] = []
  const first = Math.ceil(timeStartMin / granularityMin)
  const last = Math.floor((timeEndMin - 1) / granularityMin)
  for (let b = first; b <= last; b++) buckets.push(b)

  return (
    <div
      className="cal-preview"
      data-testid="calendar-preview"
      role="img"
      aria-label="Vista previa del calendario"
    >
      <p className="cal-preview__caption">
        Vista previa · {granularityMin} min · {AGENDA_LABELS[agendaType]}
      </p>
      <div
        className="grid grid--preview"
        style={{ gridTemplateColumns: `64px repeat(7, minmax(36px, 1fr))` }}
      >
        <div className="grid__corner" />
        {DAY_LABELS.map((label) => (
          <div key={label} className="grid__day-header">
            {label}
          </div>
        ))}
        {buckets.map((bucket) => (
          <div key={bucket} className="grid__row">
            <div className="grid__time" aria-hidden="true">
              {formatMinutes(bucket * granularityMin)}
            </div>
            {DAY_LABELS.map((label) => (
              <div key={`${bucket}:${label}`} className="grid__cell grid__cell--none" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}