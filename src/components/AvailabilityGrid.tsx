import { useMemo, useRef, useState } from 'react'
import type { AgendaType } from '../lib/data/types'
import { DAY_LABELS, isValidRule, type Rule } from '../lib/intersect'
import {
  bucketsToRanges,
  rulesToSelection,
  selectionToRules,
  type DayKey,
} from '../lib/rules'
import { formatFullDate, formatMinutes, formatShortDate, mondayOf, todayISO } from '../lib/utils'
import MonthCalendar from './MonthCalendar'

interface AvailabilityGridProps {
  granularityMin: number
  agendaType: AgendaType
  initialRules: Rule[]
  onSave: (rules: Rule[]) => Promise<void> | void
  saving?: boolean
  /** Rango horario visible (solo display): minutos desde medianoche. */
  timeStartMin?: number
  timeEndMin?: number
}

type Mode = 'week' | 'calendar'

interface DragState {
  /** Solo permite arrastrar dentro de una misma columna de día. */
  day: DayKey
  bucket: number
  mode: 'select' | 'deselect'
}

export default function AvailabilityGrid({
  granularityMin,
  agendaType,
  initialRules,
  onSave,
  saving = false,
  timeStartMin = 0,
  timeEndMin = 1440,
}: AvailabilityGridProps) {
  // Sin toggle: el modo viene solo del tipo de agenda. `weekly` (o `hybrid`
  // legacy) → grilla semanal recurrente; `one_off` → calendario + día puntual.
  const mode: Mode = agendaType === 'one_off' ? 'calendar' : 'week'

  const [selection, setSelection] = useState<Map<DayKey, Set<number>>>(() =>
    rulesToSelection(initialRules, granularityMin),
  )
  const [activeDate, setActiveDate] = useState<string>(() => {
    const firstOneOff = initialRules.find((r) => r.kind === 'one_off')
    return firstOneOff?.date ?? todayISO()
  })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [columnKey, setColumnKey] = useState(0)
  const dragState = useRef<DragState | null>(null)

  // Días puntuales con disponibilidad ya guardada (reglas one_off del usuario).
  const filledDates = useMemo(
    () =>
      [...selection.keys()]
        .filter((key) => key.startsWith('d:'))
        .map((key) => key.slice(2)),
    [selection],
  )

  // Buckets visibles: solo los que empiezan dentro del rango. Los índices de
  // bucket son absolutos (minutos / granularidad), el rango es solo display.
  const visibleBuckets = useMemo(() => {
    const first = Math.ceil(timeStartMin / granularityMin)
    const last = Math.floor((timeEndMin - 1) / granularityMin)
    const list: number[] = []
    for (let b = first; b <= last; b++) list.push(b)
    return list
  }, [timeStartMin, timeEndMin, granularityMin])

  const days: DayKey[] =
    mode === 'week'
      ? ([0, 1, 2, 3, 4, 5, 6].map((d) => `w:${d}`) as DayKey[])
      : ([`d:${activeDate}`] as DayKey[])

  const dayLabelOf = (day: DayKey): string => {
    if (day.startsWith('w:')) return DAY_LABELS[Number(day.slice(2))]
    return formatShortDate(day.slice(2))
  }

  const isSelected = (day: DayKey, bucket: number): boolean =>
    selection.get(day)?.has(bucket) ?? false

  const setCell = (day: DayKey, bucket: number, selected: boolean) => {
    setSelection((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(day) ?? [])
      if (selected) set.add(bucket)
      else set.delete(bucket)
      if (set.size === 0) next.delete(day)
      else next.set(day, set)
      return next
    })
  }

  const fillColumn = (
    day: DayKey,
    fromBucket: number,
    toBucket: number,
    selected: boolean,
  ) => {
    setSelection((prev) => {
      const next = new Map(prev)
      const lo = Math.min(fromBucket, toBucket)
      const hi = Math.max(fromBucket, toBucket)
      const set = new Set(next.get(day) ?? [])
      for (let b = lo; b <= hi; b++) {
        if (selected) set.add(b)
        else set.delete(b)
      }
      if (set.size === 0) next.delete(day)
      else next.set(day, set)
      return next
    })
  }

  function handleMouseDown(day: DayKey, bucket: number) {
    const selected = isSelected(day, bucket)
    dragState.current = { day, bucket, mode: selected ? 'deselect' : 'select' }
    setCell(day, bucket, !selected)
  }

  function handleMouseEnter(day: DayKey, bucket: number) {
    const drag = dragState.current
    if (drag === null || drag.day !== day) return
    fillColumn(day, drag.bucket, bucket, drag.mode === 'select')
  }

  function endDrag() {
    dragState.current = null
  }

  /** Cambia el día a marcar (desde el calendario) y reinicia el canvas. */
  function selectDate(dateISO: string) {
    setActiveDate(dateISO)
    setColumnKey((k) => k + 1)
  }

  async function handleSave() {
    const rules = selectionToRules(selection, granularityMin)
    if (!rules.every(isValidRule)) {
      setSaveError('Las franjas seleccionadas no son válidas (verificá los horarios).')
      return
    }
    setSaveError(null)
    await onSave(rules)
  }

  const hasSelection = selection.size > 0

  return (
    <div className="av-grid" onMouseUp={endDrag} onMouseLeave={endDrag}>
      {mode === 'calendar' && (
        <div className="av-grid__calendar">
          {/* Sin remount ligado a activeDate: el mes solo cambia con las
              flechas o el popup de la etiqueta del calendario. */}
          <MonthCalendar
            mondayISO={mondayOf(activeDate)}
            onSelectWeek={(monday) => selectDate(monday)}
            onSelectDay={selectDate}
            selectedDate={activeDate}
            filledDates={filledDates}
          />
        </div>
      )}

      {mode === 'calendar' && (
        <p className="av-grid__day-title" data-testid="av-day-title">
          {formatFullDate(activeDate)}
        </p>
      )}

      <div className="av-grid__canvas" key={columnKey}>
        <div
          className="grid"
          onDragStart={(e) => e.preventDefault()}
          style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(52px, 1fr))` }}
        >
          <div className="grid__corner" />
          {days.map((day) => (
            <div key={day} className="grid__day-header">
              {dayLabelOf(day)}
            </div>
          ))}

          {visibleBuckets.map((bucket) => (
            <div key={bucket} className="grid__row">
              <div className="grid__time" aria-hidden="true">
                {formatMinutes(bucket * granularityMin)}
              </div>
              {days.map((day) => {
                const selected = isSelected(day, bucket)
                // Para arrastrar marcamos la celda sobre la que pisa el puntero
                return (
                  <button
                    key={`${day}:${bucket}`}
                    type="button"
                    className={selected ? 'grid__cell is-selected' : 'grid__cell'}
                    aria-pressed={selected}
                    aria-label={`${dayLabelOf(day)} ${formatMinutes(bucket * granularityMin)}–${formatMinutes((bucket + 1) * granularityMin)} ${selected ? 'libre' : 'ocupado'}`}
                    onMouseDown={() => handleMouseDown(day, bucket)}
                    onMouseEnter={() => handleMouseEnter(day, bucket)}
                    onFocus={() => {
                      // Reiniciar drag con teclado no aplica; solo enfoca.
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="av-grid__hint">
        Clic o arrastre para marcar horas libres. Las franjas que se tocan se unen
        automáticamente.
      </p>

      {saveError !== null && (
        <p className="av-grid__error" role="alert">
          {saveError}
        </p>
      )}

      {hasSelection && (
        <div className="av-grid__summary" data-testid="av-summary">
          {[...selection.entries()].map(([day, buckets]) => (
            <span key={day} className="av-grid__summary-item">
              {dayLabelOf(day)}:{' '}
              {bucketsToRanges(buckets, granularityMin)
                .map(([s, e]) => `${formatMinutes(s)}–${formatMinutes(e)}`)
                .join(', ')}
            </span>
          ))}
        </div>
      )}

      <div className="av-grid__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : hasSelection ? 'Guardar disponibilidad' : 'Guardar (sin franjas)'}
        </button>
      </div>
    </div>
  )
}