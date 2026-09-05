import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ResultGrid from '../ResultGrid'
import { computeIntersections, type ParticipantSlot } from '../../lib/intersect'
import type { Participant } from '../../lib/data/types'
import { formatShortDate } from '../../lib/utils'

const participants: Participant[] = [
  { id: 'a', meetingId: 'm1', name: 'Ana', createdAt: '' },
  { id: 'b', meetingId: 'm1', name: 'Ben', createdAt: '' },
  { id: 'c', meetingId: 'm1', name: 'Cris', createdAt: '' },
]

function resultGridFor(slots: ParticipantSlot[] = [
  {
    participantId: 'a',
    name: 'Ana',
    rules: [{ kind: 'weekly', dayOfWeek: 0, ranges: [[540, 600]] }],
  },
  {
    participantId: 'b',
    name: 'Ben',
    rules: [{ kind: 'weekly', dayOfWeek: 0, ranges: [[540, 600]] }],
  },
  {
    participantId: 'c',
    name: 'Cris',
    rules: [{ kind: 'weekly', dayOfWeek: 1, ranges: [[600, 660]] }],
  },
]) {
  const { cells, allFreeRanges } = computeIntersections(slots, 30)
  return { cells, allFreeRanges }
}

describe('ResultGrid (grilla agregada)', () => {
  it('muestra celdas allFree (verde) solo donde coinciden TODOS', () => {
    const { cells, allFreeRanges } = resultGridFor()
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
      />,
    )

    // El lunes 09:00-10:00 lo marcan Ana y Ben (2 de 3) → parcial, no allFree.
    // Cris aporta el martes sola (1 de 3) → parcial también.
    const partial = screen.getAllByTestId('cell-partial')
    expect(partial.length).toBeGreaterThanOrEqual(2)
    expect(partial.some((cell) => cell.textContent === '2')).toBe(true)
    expect(partial.some((cell) => cell.textContent === '1')).toBe(true)
    expect(screen.queryByTestId('cell-allfree')).not.toBeInTheDocument()
    expect(screen.getByText(/Nadie libre/)).toBeInTheDocument()
  })

  it('resalta allFree cuando los 3 coinciden y resume los huecos', () => {
    const slots: ParticipantSlot[] = [
      { participantId: 'a', name: 'Ana', rules: [{ kind: 'weekly', dayOfWeek: 3, ranges: [[540, 660]] }] },
      { participantId: 'b', name: 'Ben', rules: [{ kind: 'weekly', dayOfWeek: 3, ranges: [[540, 660]] }] },
      { participantId: 'c', name: 'Cris', rules: [{ kind: 'weekly', dayOfWeek: 3, ranges: [[540, 660]] }] },
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
      />,
    )

    const free = screen.getAllByTestId('cell-allfree')
    expect(free.length).toBe(4)
    for (const cell of free) {
      expect(cell).toHaveTextContent('3')
    }
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('Jue')
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('09:00–11:00')
  })

  it('muestra el detalle al hacer clic en una celda', async () => {
    const user = userEvent.setup()
    const { cells, allFreeRanges } = resultGridFor()
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
      />,
    )

    await user.click(screen.getAllByTestId('cell-partial')[0]!)

    const detail = await screen.findByTestId('cell-detail')
    expect(detail).toHaveTextContent(/Libres: 2 de 3/i)
    expect(detail).toHaveTextContent('Ana')
    expect(detail).toHaveTextContent('Ben')
  })

  it('muestra fallback amigable cuando no hay aportes', () => {
    render(
      <ResultGrid
        granularityMin={30}
        cells={[]}
        allFreeRanges={[]}
        participants={participants}
      />,
    )
    expect(screen.getByTestId('result-empty')).toHaveTextContent(
      /Todavía no hay aportes de disponibilidad/,
    )
  })

  it('lista todos los huecos "todos libres" sin filtro de duración', () => {
    const slots: ParticipantSlot[] = [
      {
        participantId: 'a',
        name: 'Ana',
        rules: [
          { kind: 'weekly', dayOfWeek: 4, ranges: [[540, 570]] },
          { kind: 'weekly', dayOfWeek: 2, ranges: [[540, 630]] },
        ],
      },
      {
        participantId: 'b',
        name: 'Ben',
        rules: [
          { kind: 'weekly', dayOfWeek: 4, ranges: [[540, 570]] },
          { kind: 'weekly', dayOfWeek: 2, ranges: [[540, 630]] },
        ],
      },
      {
        participantId: 'c',
        name: 'Cris',
        rules: [
          { kind: 'weekly', dayOfWeek: 4, ranges: [[540, 570]] },
          { kind: 'weekly', dayOfWeek: 2, ranges: [[540, 630]] },
        ],
      },
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
      />,
    )

    // Se listan el hueco corto (30') y el largo (90') sin filtrar por duración.
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('Vie')
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('09:00–09:30')
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('Mié')
    expect(screen.getByTestId('allfree-ranges')).toHaveTextContent('09:00–10:30')
    expect(
      screen.queryByText(/Mostrando huecos de al menos/i),
    ).not.toBeInTheDocument()
  })

  it('recorta las filas al rango horario (solo display)', () => {
    const { cells, allFreeRanges } = resultGridFor()
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
        timeStartMin={600}
        timeEndMin={1440}
      />,
    )

    // Los aportes de las 09:00 dejan de renderizarse…
    expect(
      screen.queryByRole('button', { name: /Lun 09:00–09:30/ }),
    ).not.toBeInTheDocument()
    // …y los del rango siguen apareciendo (10:00 de Cris, martes).
    expect(
      screen.getByRole('button', { name: /Mar 10:00–10:30: 1 de 3 libres/ }),
    ).toBeInTheDocument()
  })

  it('fuerza las columnas semanales Lun–Dom en vista semana', () => {
    const slots: ParticipantSlot[] = [
      {
        participantId: 'a',
        name: 'Ana',
        rules: [{ kind: 'weekly', dayOfWeek: 0, ranges: [[540, 600]] }],
      },
      {
        participantId: 'b',
        name: 'Ben',
        rules: [{ kind: 'weekly', dayOfWeek: 2, ranges: [[600, 660]] }],
      },
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
        forceWeeklyDays
      />,
    )

    // Las 7 columnas recurrentes están aunque Lun y Mié sean las únicas con aportes.
    for (const label of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('forceWeekDates muestra las 7 columnas de la semana con fechas', () => {
    const dates = [
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
      '2026-09-25', '2026-09-26', '2026-09-27',
    ]
    const slots: ParticipantSlot[] = [
      {
        participantId: 'a',
        name: 'Ana',
        rules: [{ kind: 'one_off', date: '2026-09-21', ranges: [[540, 570]] }],
      },
      {
        participantId: 'b',
        name: 'Ben',
        rules: [{ kind: 'one_off', date: '2026-09-21', ranges: [[540, 570]] }],
      },
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    render(
      <ResultGrid
        granularityMin={30}
        cells={cells}
        allFreeRanges={allFreeRanges}
        participants={participants}
        forceWeekDates={dates}
      />,
    )

    // Las 7 fechas (DD/MM) aparecen como cabeceras, aunque 5 días no tengan aportes.
    for (const date of dates) {
      expect(screen.getByText(formatShortDate(date))).toBeInTheDocument()
    }
    // La celda de aporte del lunes se ve con su fecha y su recuento.
    expect(
      screen.getByRole('button', { name: '21/09 09:00–09:30: 2 de 3 libres' }),
    ).toBeInTheDocument()
  })
})