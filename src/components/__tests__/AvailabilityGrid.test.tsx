import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityGrid from '../AvailabilityGrid'
import type { Rule } from '../../lib/intersect'
import { addDaysISO, formatFullDate, formatShortDate, mondayOf, todayISO } from '../../lib/utils'

// Días siempre dentro de la ventana visible del calendario compartido (mes del
// lunes de la semana de hoy): el lunes de esta semana y el martes siguiente.
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
        activeDate={todayISO()}
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
    const targetDate = firstInWindow()

    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        activeDate={targetDate}
        initialRules={[]}
        onSave={onSave}
      />,
    )

    // Sin toggle y sin calendario interno: el día llega controlado.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('month-calendar')).toBeNull()

    // El título refleja el día controlado.
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
    const dayA = firstInWindow()
    const dayB = secondInWindow()

    const { rerender } = render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        activeDate={dayA}
        initialRules={[]}
        onSave={onSave}
      />,
    )

    // Marcar 10:00–11:00 del primer día.
    await user.click(
      screen.getByRole('button', {
        name: `${formatShortDate(dayA)} 10:00–11:00 ocupado`,
      }),
    )

    // El mismo componente (misma key) cambia de día controlado: la selección
    // del día anterior se conserva en el mapa y se suma la nueva.
    rerender(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        activeDate={dayB}
        initialRules={[]}
        onSave={onSave}
      />,
    )
    expect(screen.getByTestId('av-day-title')).toHaveTextContent(
      formatFullDate(dayB),
    )
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

  it('inicia el modo Calendario en el día controlado con la franja cargada', () => {
    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        activeDate="2026-09-21"
        initialRules={[
          { kind: 'one_off', date: '2026-09-21', ranges: [[540, 600]] },
        ]}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByTestId('av-day-title')).toHaveTextContent(
      formatFullDate('2026-09-21'),
    )
    // La franja guardada llega seleccionada al día controlado.
    expect(
      screen.getByRole('button', { name: '21/09 09:00–10:00 libre' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('modo Calendario muestra los 7 días de la semana con fechas', () => {
    const weekStart = mondayOf(todayISO())
    render(
      <AvailabilityGrid
        granularityMin={60}
        agendaType="one_off"
        activeDate={weekStart}
        initialRules={[]}
        onSave={vi.fn()}
      />,
    )

    const headers = Array.from(
      document.querySelectorAll('.av-grid .grid__day-header'),
    ).map((el) => el.textContent)
    expect(headers).toHaveLength(7)
    expect(headers[0]).toBe(formatShortDate(weekStart))
    expect(headers[6]).toBe(formatShortDate(addDaysISO(weekStart, 6)))
    // Ninguna cabecera con nombre de día en modo Calendario.
    for (const label of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) {
      expect(headers).not.toContain(label)
    }
    // Las celdas de cualquier día de la semana están marcables por su fecha.
    expect(
      screen.getByRole('button', {
        name: `${formatShortDate(addDaysISO(weekStart, 3))} 09:00–10:00 ocupado`,
      }),
    ).toBeInTheDocument()
  })

  it('carga reglas iniciales como seleccionadas', () => {
    const onSave = vi.fn()
    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        activeDate={todayISO()}
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
        activeDate={todayISO()}
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
        activeDate={todayISO()}
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

  it('respeta el rango horario (solo display) manteniendo buckets absolutos', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    render(
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        activeDate={todayISO()}
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

  it('avisa y destaca el guardado mientras haya cambios sin guardar', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(rules: Rule[]) => Promise<void>>(() => Promise.resolve())

    const grid = (
      <AvailabilityGrid
        granularityMin={30}
        agendaType="weekly"
        activeDate={todayISO()}
        initialRules={[]}
        onSave={onSave}
      />
    )

    const view = render(grid)

    // Sin cambios: no hay aviso ni destaque.
    expect(screen.queryByText('Cambios sin guardar')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Guardar/ }).className,
    ).not.toContain('btn--attention')

    // Al marcar una franja aparece el aviso y el botón destaca.
    await user.click(
      screen.getByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    )
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }).className,
    ).toContain('btn--attention')

    // Tras guardar, JoinMeeting remonta la grilla con las reglas guardadas:
    // remontar muestra el estado limpio de nuevo.
    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    view.unmount()
    render(grid)
    expect(screen.queryByText('Cambios sin guardar')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Guardar \(sin franjas\)/ }).className,
    ).not.toContain('btn--attention')
  })
})