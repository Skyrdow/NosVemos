import { useMemo, useState } from 'react'
import { dayLabel, formatMinutes, formatShortDate } from '../lib/utils'
import type { AllFreeRange, Cell } from '../lib/intersect'
import type { Participant } from '../lib/data/types'

interface ResultGridProps {
  granularityMin: number
  cells: Cell[]
  allFreeRanges: AllFreeRange[]
  participants: Participant[]
  /** Rango horario visible (solo display): minutos desde medianoche. */
  timeStartMin?: number
  timeEndMin?: number
  /** Siempre muestra las columnas recurrentes Lun–Dom (vista "Semana"). */
  forceWeeklyDays?: boolean
}

interface DayGroup {
  key: string
  gridLabel: string
  dayOfWeek?: number
  date?: string
  byBucket: Map<number, Cell>
}

function formatRange(range: AllFreeRange): string {
  return `${formatMinutes(range.startMin)}–${formatMinutes(range.endMin)}`
}

export default function ResultGrid({
  granularityMin,
  cells,
  allFreeRanges,
  participants,
  timeStartMin = 0,
  timeEndMin = 1440,
  forceWeeklyDays = false,
}: ResultGridProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<Cell | null>(null)

  const nameOf = (id: string): string =>
    participants.find((p) => p.id === id)?.name ?? id

  const days = useMemo<DayGroup[]>(() => {
    const weekly = new Map<number, DayGroup>()
    const dates = new Map<string, DayGroup>()
    if (forceWeeklyDays) {
      // Vista "Semana": las columnas Lun–Dom se muestran siempre, aunque una
      // columna no tenga ningún aporte (queda entera en gris).
      for (let d = 0; d < 7; d++) {
        weekly.set(d, {
          key: `w:${d}`,
          gridLabel: dayLabel(d),
          dayOfWeek: d,
          byBucket: new Map(),
        })
      }
    }
    for (const cell of cells) {
      if (cell.dayOfWeek !== undefined) {
        let group = weekly.get(cell.dayOfWeek)
        if (group === undefined) {
          group = {
            key: `w:${cell.dayOfWeek}`,
            gridLabel: dayLabel(cell.dayOfWeek),
            dayOfWeek: cell.dayOfWeek,
            byBucket: new Map(),
          }
          weekly.set(cell.dayOfWeek, group)
        }
        group.byBucket.set(cell.startMin / granularityMin, cell)
      } else if (cell.date !== undefined) {
        let group = dates.get(cell.date)
        if (group === undefined) {
          group = {
            key: `d:${cell.date}`,
            gridLabel: formatShortDate(cell.date),
            date: cell.date,
            byBucket: new Map(),
          }
          dates.set(cell.date, group)
        }
        group.byBucket.set(cell.startMin / granularityMin, cell)
      }
    }
    const orderedWeekly = [...weekly.values()].sort(
      (a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0),
    )
    const orderedDates = [...dates.values()].sort((a, b) =>
      (a.date ?? '').localeCompare(b.date ?? ''),
    )
    return [...orderedWeekly, ...orderedDates]
  }, [cells, granularityMin, forceWeeklyDays])

  const { minBucket, maxBucket } = useMemo(() => {
    if (cells.length === 0) return { minBucket: 0, maxBucket: -1 }
    let min = Infinity
    let max = -Infinity
    for (const cell of cells) {
      const b0 = Math.floor(cell.startMin / granularityMin)
      const b1 = Math.ceil(cell.endMin / granularityMin) - 1
      if (b0 < min) min = b0
      if (b1 > max) max = b1
    }
    return { minBucket: min, maxBucket: max }
  }, [cells, granularityMin])

  // Recorre el rango horario del usuario (display): los índices de bucket son
  // absolutos, solo se recorta qué filas se renderizan.
  const { rowFromBucket, rowToBucket } = useMemo(() => {
    const first = Math.max(minBucket, Math.ceil(timeStartMin / granularityMin))
    const last = Math.min(
      maxBucket,
      Math.floor((timeEndMin - 1) / granularityMin),
    )
    return { rowFromBucket: first, rowToBucket: last }
  }, [minBucket, maxBucket, timeStartMin, timeEndMin, granularityMin])

  const filteredAllFree = useMemo(() => {
    // La lista respeta el rango horario visible.
    return allFreeRanges.filter(
      (r) => r.endMin > timeStartMin && r.startMin < timeEndMin,
    )
  }, [allFreeRanges, timeStartMin, timeEndMin])

  const visibleDays = days.filter((day) => {
    if (day.dayOfWeek !== undefined) return true
    return !collapsed.has(day.key)
  })

  if (cells.length === 0) {
    return (
      <div className="result" data-testid="result-empty">
        <p className="result__empty">
          Todavía no hay aportes de disponibilidad. Compartí el link para que los
          participantes marquen sus franjas libres.
        </p>
      </div>
    )
  }

  function toggleDay(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="result" data-testid="result-grid">
      {allFreeRanges.length > 0 && (
        <div className="result__holes" data-testid="allfree-ranges">
          <h3>🎯 Todos libres</h3>
          {filteredAllFree.length > 0 ? (
            <ul>
              {filteredAllFree.map((range, i) => (
                <li key={`${range.dayOfWeek ?? range.date}:${range.startMin}:${i}`}>
                  <strong>
                    {range.dayOfWeek !== undefined
                      ? dayLabel(range.dayOfWeek)
                      : range.date}
                  </strong>{' '}
                  · {formatRange(range)} ({Math.round((range.endMin - range.startMin) / 60 * 10) / 10} h)
                </li>
              ))}
            </ul>
          ) : (
            <p className="result__holes-empty">
              No hay huecos de disponibilidad en el rango horario seleccionado.
            </p>
          )}
        </div>
      )}

      <div className="result__scroll">
        <div
          className="grid grid--result"
          style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(52px, 1fr))` }}
        >
          <div className="grid__corner" />
          {visibleDays.map((day) => (
            <div key={day.key} className="grid__day-header">
              {day.gridLabel}
              {day.date !== undefined && (
                <button
                  type="button"
                  className="grid__collapse"
                  aria-label={collapsed.has(day.key) ? 'Expandir día' : 'Colapsar día'}
                  onClick={() => toggleDay(day.key)}
                >
                  {collapsed.has(day.key) ? '▼' : '▲'}
                </button>
              )}
            </div>
          ))}

          {rowFromBucket <= rowToBucket &&
            Array.from(
              { length: rowToBucket - rowFromBucket + 1 },
              (_, i) => rowFromBucket + i,
            ).map((bucket) => (
            <div key={bucket} className="grid__row">
              <div className="grid__time" aria-hidden="true">
                {formatMinutes(bucket * granularityMin)}
              </div>
              {visibleDays.map((day) => {
                const cell = day.byBucket.get(bucket)
                const buttonClass =
                  cell === undefined
                    ? 'grid__cell grid__cell--none'
                    : cell.allFree
                      ? 'grid__cell grid__cell--free'
                      : 'grid__cell grid__cell--partial'
                const labelBase = `${day.gridLabel} ${formatMinutes(bucket * granularityMin)}–${formatMinutes((bucket + 1) * granularityMin)}`
                if (cell === undefined) {
                  return (
                    <div
                      key={`${day.key}:${bucket}`}
                      className={buttonClass}
                      data-testid="cell-none"
                    />
                  )
                }
                return (
                  <button
                    key={`${day.key}:${bucket}`}
                    type="button"
                    className={buttonClass}
                    data-testid={cell.allFree ? 'cell-allfree' : 'cell-partial'}
                    aria-label={`${labelBase}: ${cell.freeCount} de ${participants.length} libres`}
                    onClick={() => setFocus(cell)}
                  >
                    <span className="grid__count">{cell.freeCount}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="result__legend">
        <span className="legend legend--free">Libres todos</span>
        <span className="legend legend--partial">Algunos libres</span>
        <span className="legend legend--none">Nadie libre</span>
      </div>

      {focus !== null && (
        <div className="result__detail" data-testid="cell-detail" role="status">
          <button
            type="button"
            className="result__detail-close"
            aria-label="Cerrar detalle"
            onClick={() => setFocus(null)}
          >
            ×
          </button>
          <h4>
            {focus.dayOfWeek !== undefined
              ? dayLabel(focus.dayOfWeek)
              : focus.date}
            , {formatMinutes(focus.startMin)}–{formatMinutes(focus.endMin)}
          </h4>
          <p>
            Libres: <strong>{focus.freeCount}</strong> de {participants.length}
          </p>
          {focus.freeParticipantIds.length > 0 ? (
            <ul className="result__detail-list">
              {focus.freeParticipantIds.map((id) => (
                <li key={id}>{nameOf(id)}</li>
              ))}
            </ul>
          ) : (
            <p>Nadie disponible en esta franja.</p>
          )}
        </div>
      )}
    </div>
  )
}