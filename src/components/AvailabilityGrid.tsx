import { useMemo, useRef, useState } from 'react'
import type { AgendaType } from '../lib/data/types'
import type { Rule } from '../lib/intersect'
import { isValidRule } from '../lib/intersect'
import { DAY_LABELS } from '../lib/intersect'
import { formatMinutes, formatShortDate, todayISO } from '../lib/utils'
import {
  bucketsToRanges,
  rulesToSelection,
  selectionToRules,
  type DayKey,
} from '../lib/rules'

interface AvailabilityGridProps {
  granularityMin: number
  agendaType: AgendaType
  initialRules: Rule[]
  onSave: (rules: Rule[]) => Promise<void> | void
  saving?: boolean
}

interface DragState {
  /** Solo permite arrastrar dentro de una misma columna de día. */
  day: DayKey
  bucket: number
  mode: 'select' | 'deselect'
}

const TOTAL_BUCKETS = 1440

export default function AvailabilityGrid({
  granularityMin,
  agendaType,
  initialRules,
  onSave,
  saving = false,
}: AvailabilityGridProps) {
  const canWeekly = agendaType === 'weekly' || agendaType === 'hybrid'
  const canOneOff = agendaType === 'one_off' || agendaType === 'hybrid'

  const [mode, setMode] = useState<'weekly' | 'one_off'>(() =>
    canOneOff && !canWeekly ? 'one_off' : 'weekly',
  )
  const [selection, setSelection] = useState<Map<DayKey, Set<number>>>(() =>
    rulesToSelection(initialRules, granularityMin),
  )
  const [activeDate, setActiveDate] = useState(todayISO)
  const [dateError, setDateError] = useState<string | null>(null)
  const [columnKey, setColumnKey] = useState(0)
  const dragState = useRef<DragState | null>(null)

  const rowCount = useMemo(() => TOTAL_BUCKETS / granularityMin, [granularityMin])

  const days: DayKey[] =
    mode === 'weekly'
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

  function handleAddDate(event: React.FormEvent) {
    event.preventDefault()
    if (!activeDate) return
    setDateError(null)
    // Cambia el día activo: la selección de ese día se sigue guardando por clave.
    setColumnKey((k) => k + 1)
  }

  async function handleSave() {
    const rules = selectionToRules(selection, granularityMin)
    if (!rules.every(isValidRule)) {
      setDateError('Las franjas seleccionadas no son válidas (verificá los horarios).')
      return
    }
    setDateError(null)
    await onSave(rules)
  }

  const hasSelection = selection.size > 0

  return (
    <div className="av-grid" onMouseUp={endDrag} onMouseLeave={endDrag}>
      <div className="av-grid__toolbar">
        <div className="av-grid__modes" role="tablist" aria-label="Tipo de aporte">
          {canWeekly && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'weekly'}
              className={mode === 'weekly' ? 'is-active' : ''}
              onClick={() => setMode('weekly')}
            >
              Semana recurrente
            </button>
          )}
          {canOneOff && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'one_off'}
              className={mode === 'one_off' ? 'is-active' : ''}
              onClick={() => {
                setMode('one_off')
                setColumnKey((k) => k + 1)
              }}
            >
              Día puntual
            </button>
          )}
        </div>

        {mode === 'one_off' && (
          <form className="av-grid__date" onSubmit={handleAddDate}>
            <label htmlFor="av-date">Fecha</label>
            <input
              id="av-date"
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
            />
            <button type="submit">Ir</button>
          </form>
        )}
      </div>

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

          {Array.from({ length: rowCount }, (_, i) => i).map((bucket) => (
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

      {dateError !== null && (
        <p className="av-grid__error" role="alert">
          {dateError}
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