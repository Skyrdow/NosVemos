import { useMemo, useState } from 'react'
import { addDaysISO, formatFullDate, formatShortDate, mondayOf } from '../lib/utils'

interface MonthCalendarProps {
  /** Lunes de la semana seleccionada (YYYY-MM-DD). Solo fija el mes inicial. */
  mondayISO: string
  /** Cuando está definido, los botones de semana son clickeables. */
  onSelectWeek?: (mondayISO: string) => void
  /** Cuando está definido, las celdas de día son botones seleccionables. */
  onSelectDay?: (dateISO: string) => void
  /** Día seleccionado (YYYY-MM-DD) a resaltar en la fila de días. */
  selectedDate?: string | null
  /** Fechas (YYYY-MM-DD) que ya tienen disponibilidad guardada. */
  filledDates?: string[]
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const MONTHS_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const

/**
 * Calendario mensual (semanas que empiezan en lunes). El mes visualizado solo
 * cambia con las flechas superiores o el popup de la etiqueta: seleccionar una
 * semana o un día (onSelectWeek/onSelectDay) nunca cambia el mes. Componente
 * puro: no toca datos.
 */
export default function MonthCalendar({
  mondayISO,
  onSelectWeek,
  onSelectDay,
  selectedDate = null,
  filledDates = [],
}: MonthCalendarProps) {
  const initialYear = Number(mondayISO.slice(0, 4))
  const initialMonth = Number(mondayISO.slice(5, 7))
  const [viewYear, setViewYear] = useState(initialYear)
  const [viewMonth, setViewMonth] = useState(initialMonth)
  const [pickerOpen, setPickerOpen] = useState(false)

  const monthKey = `${viewYear}-${String(viewMonth).padStart(2, '0')}`

  const weeks = useMemo(() => {
    // Siempre 6 semanas (42 días) desde el lunes de la semana del primer día.
    const firstOfMonth = `${monthKey}-01`
    const monthMonday = mondayOf(firstOfMonth)
    const rows: { monday: string; days: string[] }[] = []
    for (let w = 0; w < 6; w++) {
      const monday = addDaysISO(monthMonday, w * 7)
      rows.push({
        monday,
        days: Array.from({ length: 7 }, (_, d) => addDaysISO(monday, d)),
      })
    }
    return rows
  }, [monthKey])

  const monthLabel = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).toLocaleDateString(
    'es-ES',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  )

  function shiftMonth(delta: number) {
    const total = viewYear * 12 + (viewMonth - 1) + delta
    setViewYear(Math.floor(total / 12))
    setViewMonth(((total % 12) + 12) % 12 + 1)
  }

  function shiftYear(delta: number) {
    setViewYear((year) => year + delta)
  }

  return (
    <div className="month" data-testid="month-calendar">
      <div className="month__head">
        <button
          type="button"
          className="btn"
          aria-label="Mes anterior"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="month__label"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          onClick={() => setPickerOpen((open) => !open)}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Mes siguiente"
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>

      {pickerOpen && (
        <div
          className="month__picker-backdrop"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="month__picker"
            role="dialog"
            aria-modal="true"
            aria-label="Elegir mes"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="month__picker-head">
              <button
                type="button"
                className="btn"
                aria-label="Año anterior"
                onClick={() => shiftYear(-1)}
              >
                ‹
              </button>
              <strong>{viewYear}</strong>
              <button
                type="button"
                className="btn"
                aria-label="Año siguiente"
                onClick={() => shiftYear(1)}
              >
                ›
              </button>
            </div>
            <div className="month__picker-grid">
              {MONTHS_SHORT.map((label, index) => {
                const isCurrent = viewMonth === index + 1
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isCurrent}
                    className={
                      isCurrent
                        ? 'month__picker-month month__picker-month--current'
                        : 'month__picker-month'
                    }
                    onClick={() => {
                      setViewMonth(index + 1)
                      setPickerOpen(false)
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="month__body">
        {/* La fila de cabeceras usa la misma grilla que las filas-semana:
            columna inicial vacía (esquina) + 7 celdas alineadas con los días. */}
        <div className="month__dow" aria-hidden="true">
          <span className="month__dow-corner" />
          <div className="month__dow-days">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className="month__dow-cell">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="month__weeks">
          {weeks.map(({ monday, days }) => {
            const isCurrentWeek = monday === mondayISO
            return (
              <div
                key={monday}
                className={
                  isCurrentWeek
                    ? 'month__week month__week--current'
                    : 'month__week'
                }
              >
                {onSelectWeek !== undefined ? (
                  <button
                    type="button"
                    className="month__week-btn"
                    aria-current={isCurrentWeek ? 'date' : undefined}
                    onClick={() => onSelectWeek(monday)}
                  >
                    Semana del {formatShortDate(monday)} al{' '}
                    {formatShortDate(addDaysISO(monday, 6))}
                  </button>
                ) : (
                  <span className="month__week-btn">
                    Semana del {formatShortDate(monday)} al{' '}
                    {formatShortDate(addDaysISO(monday, 6))}
                  </span>
                )}
                <div className="month__days">
                  {days.map((day) => {
                    const inMonth = day.slice(0, 7) === monthKey
                    const isSelected = day === selectedDate
                    const isFilled = filledDates.includes(day)
                    const dayClass = [
                      inMonth ? 'month__day' : 'month__day month__day--muted',
                      isSelected ? ' month__day--selected' : '',
                      isFilled ? ' month__day--filled' : '',
                    ].join('')
                    const dayAriaLabel = formatFullDate(day) +
                      (isFilled ? ', con disponibilidad' : '')
                    if (onSelectDay !== undefined) {
                      return (
                        <button
                          key={day}
                          type="button"
                          className={dayClass}
                          aria-label={dayAriaLabel}
                          aria-pressed={isSelected}
                          aria-current={isSelected ? 'date' : undefined}
                          onClick={() => onSelectDay(day)}
                        >
                          {Number(day.slice(8, 10))}
                        </button>
                      )
                    }
                    return (
                      <span key={day} className={dayClass}>
                        {Number(day.slice(8, 10))}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}