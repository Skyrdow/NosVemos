import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityGrid from '../AvailabilityGrid'
import type { Rule } from '../../lib/intersect'
import { addDaysISO, formatFullDate, formatShortDate, mondayOf, todayISO } from '../../lib/utils'

// Días siempre dentro de la ventana de 6 semanas que renderiza el calendario
// (vista = mes del lunes de la semana de hoy): el lunes de esta semana y el
// martes siguiente pertenecen a esa ventana por construcción.
const firstInWindow = () => mondayOf(todayISO())
const secondInWindow = () => addDaysISO(mondayOf(todayISO()), 1)

describe('AvailabilityGrid (input de disponibilidad)', () => {
  it('permite marcar una franja con clic y guarda la regla semanal', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        initialRules={[]}
        onSave={onSave}
      />,
    )

    // Lunes 09:00–09:30 y 09:30–10:00
    await user.click(
      screen.getByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Lun 09:30–10:00 ocupado' }),
    )

    expect(screen.getByRole('button', { name: 'Lun 09:00–09:30 libre' }))
      .toHaveAttribute('aria-pressed', 'true')

    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const rules = onSave.mock.calls[0]![0]
    expect(rules).toEqual([
      { kind: 'weekly', dayOfWeek: 0, ranges: [[540, 600]] },
    ])
  })

  it('en modo Calendario elige un día puntual y produce una regla one_off', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        initialRules={[]}
        onSave={onSave}
      />,
    )

    // Sin toggle: agenda one_off entra directo en Calendario.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('month-calendar')).toBeInTheDocument()

    // Elegir en el calendario un día de la ventana visible.
    const targetDate = firstInWindow()
    await user.click(screen.getByRole('button', { name: formatFullDate(targetDate) }))

    // El título refleja el día a marcar.
    expect(screen.getByTestId('av-day-title')).toHaveTextContent(
      formatFullDate(targetDate),
    )

    // Marcar 10:00–11:00 de ese día y guardar.
    await user.click(
      screen.getByRole('button', {
        name: `${formatShortDate(targetDate)} 10:00–11:00 ocupado`,
      }),
    )
    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const rules = onSave.mock.calls[0]![0]
    expect(rules).toEqual([
      { kind: 'one_off', date: targetDate, ranges: [[600, 660]] },
    ])
  })

  it('en modo Calendario suma reglas one_off de fechas distintas', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        initialRules={[]}
        onSave={onSave}
      />,
    )

    // Marcar 10:00–11:00 del primer día de la ventana.
    const dayA = firstInWindow()
    await user.click(screen.getByRole('button', { name: formatFullDate(dayA) }))
    await user.click(
      screen.getByRole('button', {
        name: `${formatShortDate(dayA)} 10:00–11:00 ocupado`,
      }),
    )

    // Cambiar de día (al siguiente) y marcar otra franja: se acumula.
    const dayB = secondInWindow()
    await user.click(screen.getByRole('button', { name: formatFullDate(dayB) }))
    await user.click(
      screen.getByRole('button', {
        name: `${formatShortDate(dayB)} 14:00–15:00 ocupado`,
      }),
    )

    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const rules = onSave.mock.calls[0]![0]
    expect(rules).toEqual([
      { kind: 'one_off', date: dayA, ranges: [[600, 660]] },
      { kind: 'one_off', date: dayB, ranges: [[840, 900]] },
    ])
  })

  it('inicia el modo Calendario en la primera fecha one_off ya guardada', () => {
    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        initialRules={[
          { kind: 'one_off', date: '2026-09-21', ranges: [[540, 600]] },
        ]}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByTestId('av-day-title')).toHaveTextContent(
      formatFullDate('2026-09-21'),
    )
    // La franja guardada llega seleccionada al día elegido.
    expect(
      screen.getByRole('button', { name: '21/09 09:00–10:00 libre' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('carga reglas iniciales como seleccionadas', () => {
    const onSave = vi.fn()
    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        initialRules={[{ kind: 'weekly', dayOfWeek: 2, ranges: [[540, 600]] }]}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('button', { name: 'Mié 09:00–09:30 libre' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mié 09:30–10:00 libre' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('agenda semanal muestra la grilla de 7 días sin calendario ni pestañas', () => {
    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        initialRules={[]}
        onSave={vi.fn()}
      />,
    )

    // Sin toggle de modos: modo Semana directo, sin calendario.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('month-calendar')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    ).toBeInTheDocument()
  })

  it('agenda híbrida (legacy) se comporta como semana recurrente', () => {
    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="hybrid"
        initialRules={[]}
        onSave={vi.fn()}
      />,
    )

    // Sin pestañas: el modo viene solo del tipo de agenda, y hybrid → Semana.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('month-calendar')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    ).toBeInTheDocument()
  })

  it('marca en el calendario los días puntuales ya guardados (filledDates)', () => {
    const dayA = firstInWindow()
    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        initialRules={[{ kind: 'one_off', date: dayA, ranges: [[600, 660]] }]}
        onSave={vi.fn()}
      />,
    )

    const filledDay = screen.getByRole('button', {
      name: `${formatFullDate(dayA)}, con disponibilidad`,
    })
    expect(filledDay).toHaveClass('month__day--filled')

    // Un día sin disponibilidad guardada no lleva el indicador.
    const emptyDay = secondInWindow()
    expect(
      screen.queryByRole('button', {
        name: `${formatFullDate(emptyDay)}, con disponibilidad`,
      }),
    ).not.toBeInTheDocument()
  })

  it('respeta el rango horario (solo display) manteniendo buckets absolutos', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        initialRules={[]}
        onSave={onSave}
        timeStartMin={600}
        timeEndMin={1440}
      />,
    )

    // El rango empieza a las 10:00: la franja de 09:00 no se renderiza…
    expect(
      screen.queryByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    ).not.toBeInTheDocument()

    // …y las de 10:00 sí (bucket absoluto 20 → 600-630 min).
    await user.click(
      screen.getByRole('button', { name: 'Lun 10:00–10:30 ocupado' }),
    )
    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const rules = onSave.mock.calls[0]![0]
    expect(rules).toEqual([
      { kind: 'weekly', dayOfWeek: 0, ranges: [[600, 630]] },
    ])
  })
})