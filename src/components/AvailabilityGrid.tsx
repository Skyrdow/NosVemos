import { useMemo, useRef, useState } from 'react'
import type { AgendaType } from '../lib/data/types'
import { DAY_LABELS, isValidRule, type Rule } from '../lib/intersect'
import {
  bucketsToRanges,
  rulesToSelection,
  selectionToRules,
  type DayKey,
} from '../lib/rules'
import { formatFullDate, formatMinutes, formatShortDate, addDaysISO, mondayOf } from '../lib/utils'

interface AvailabilityGridProps {
  granularityMin: number
  agendaType: AgendaType
  /** Día controlado por el calendario compartido (modo one_off). */
  activeDate: string
  initialRules: Rule[]
  onSave: (rules: Rule[]) => Promise<void> | void
  saving?: boolean
  /** Rango horario visible (solo display): minutos desde medianoche. */
  timeStartMin?: number
  timeEndMin?: number
}

type Mode = 'week' | 'day'

interface DragState {
  /** Solo permite arrastrar dentro de una misma columna de día. */
  day: DayKey
  bucket: number
  mode: 'select' | 'deselect'
}

function sameSelection(a: Map<DayKey, Set<number>>, b: Map<DayKey, Set<number>>): boolean {
  if (a.size !== b.size) return false
  for (const [key, buckets] of a) {
    const other = b.get(key)
    if (other === undefined || other.size !== buckets.size) return false
    for (const bucket of buckets) {
      if (!other.has(bucket)) return false
    }
  }
  return true
}

export default function AvailabilityGrid({
  granularityMin,
  agendaType,
  activeDate,
  initialRules,
  onSave,
  saving = false,
  timeStartMin = 0,
  timeEndMin = 1440,
}: AvailabilityGridProps) {
  // Sin toggle ni calendario interno: el modo viene solo del tipo de agenda.
  // `weekly` (o `hybrid` legacy) → grilla semanal recurrente; `one_off` → las
  // 7 columnas de la semana que contiene el día controlado por el calendario
  // compartido (JoinMeeting), cada una etiquetada con su fecha (DD/MM).
  const mode: Mode = agendaType === 'one_off' ? 'day' : 'week'

  const [selection, setSelection] = useState<Map<DayKey, Set<number>>>(() =>
    rulesToSelection(initialRules, granularityMin),
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const dragState = useRef<DragState | null>(null)

  // "Sucio" = hay franjas marcadas que difieren de lo último guardado
  // (lo que trae `initialRules`; tras guardar, JoinMeeting remonta con el
  // nuevo estado y el aviso desaparece).
  const savedSelection = useMemo(
    () => rulesToSelection(initialRules, granularityMin),
    [initialRules, granularityMin],
  )
  const dirty = useMemo(
    () => !sameSelection(selection, savedSelection),
    [selection, savedSelection],
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
      : Array.from({ length: 7 }, (_, i) =>
          `d:${addDaysISO(mondayOf(activeDate), i)}` as DayKey,
        )

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

  async function handleSave() {
    const rules = selectionToRules(selection, granularityMin)
    if (!rules.every(isValidRule)) {
      setSaveError('Las franjas seleccionadas no son válidas (verifica los horarios).')
      return
    }
    setSaveError(null)
    await onSave(rules)
  }

  const hasSelection = selection.size > 0

  return (
    <div className="av-grid" onMouseUp={endDrag} onMouseLeave={endDrag}>
      {mode === 'day' && (
        <p className="av-grid__day-title" data-testid="av-day-title">
          {formatFullDate(activeDate)}
        </p>
      )}

      {/* El canvas se remonta al cambiar de día (key=activeDate) para
          reconstruir las 7 columnas `d:` de esa semana. La selección acumulada
          vive en el mapa y se conserva entre días: al guardar se persiste TODO. */}
      <div className="av-grid__canvas" key={activeDate}>
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
                return (
                  <button
                    key={`${day}:${bucket}`}
                    type="button"
                    className={selected ? 'grid__cell is-selected' : 'grid__cell'}
                    aria-pressed={selected}
                    aria-label={`${dayLabelOf(day)} ${formatMinutes(bucket * granularityMin)}–${formatMinutes((bucket + 1) * granularityMin)} ${selected ? 'libre' : 'ocupado'}`}
                    onMouseDown={() => handleMouseDown(day, bucket)}
                    onMouseEnter={() => handleMouseEnter(day, bucket)}
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
          className={`btn btn--primary${dirty && !saving ? ' btn--attention' : ''}`}
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : hasSelection ? 'Guardar disponibilidad' : 'Guardar (sin franjas)'}
        </button>
        {dirty && !saving && (
          <span className="av-grid__dirty" role="status">
            Cambios sin guardar
          </span>
        )}
      </div>
    </div>
  )
}