import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MonthCalendar from '../MonthCalendar'
import { formatFullDate } from '../../lib/utils'

describe('MonthCalendar (elegir semana)', () => {
  it('muestra los botones de semana y cada click informa el lunes correcto', async () => {
    const user = userEvent.setup()
    const onSelectWeek = vi.fn()
    // 2026-09-07 es lunes (mes de septiembre de 2026).
    render(<MonthCalendar mondayISO="2026-09-07" onSelectWeek={onSelectWeek} />)

    expect(screen.getByTestId('month-calendar')).toBeInTheDocument()

    const weekBtn = screen.getByRole('button', {
      name: /Semana del 07\/09 al 13\/09/,
    })
    expect(weekBtn).toHaveAttribute('aria-current', 'date')
    await user.click(weekBtn)
    expect(onSelectWeek).toHaveBeenCalledWith('2026-09-07')

    // Otra semana del mismo mes: el lunes se deriva de los días mostrados.
    const nextWeek = screen.getByRole('button', {
      name: /Semana del 14\/09 al 20\/09/,
    })
    await user.click(nextWeek)
    expect(onSelectWeek).toHaveBeenCalledWith('2026-09-14')
  })

  it('navega entre meses con los botones anterior/siguiente', async () => {
    const user = userEvent.setup()
    render(
      <MonthCalendar mondayISO="2026-09-07" onSelectWeek={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.getByText(/octubre/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(screen.getByText(/agosto/i)).toBeInTheDocument()
  })
})

describe('MonthCalendar (selección de día)', () => {
  it('con onSelectDay las celdas de día son botones seleccionables', async () => {
    const user = userEvent.setup()
    const onSelectDay = vi.fn()
    const onSelectWeek = vi.fn()
    // mondayISO en septiembre → la grilla muestra la ventana 31/08..11/10.
    render(
      <MonthCalendar
        mondayISO="2026-09-07"
        selectedDate="2026-09-10"
        onSelectWeek={onSelectWeek}
        onSelectDay={onSelectDay}
      />,
    )

    // El día seleccionado queda marcado (aria-pressed).
    const selectedDay = screen.getByRole('button', {
      name: formatFullDate('2026-09-10'),
    })
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true')
    expect(selectedDay).toHaveAttribute('aria-current', 'date')

    // Clic en otro día del mismo mes informa su fecha.
    const otherDay = screen.getByRole('button', {
      name: formatFullDate('2026-09-14'),
    })
    await user.click(otherDay)
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-14')

    // Un día de otro mes incluido en la grilla también es seleccionable.
    expect(
      screen.getByRole('button', { name: formatFullDate('2026-10-02') }),
    ).toBeInTheDocument()
  })

  it('sin onSelectDay las celdas de día no son botones', () => {
    render(<MonthCalendar mondayISO="2026-09-07" />)
    expect(
      screen.queryByRole('button', { name: formatFullDate('2026-09-10') }),
    ).not.toBeInTheDocument()
    // El botón de semana tampoco es clickeable sin handler.
    expect(
      screen.queryByRole('button', { name: /Semana del 07\/09 al 13\/09/ }),
    ).not.toBeInTheDocument()
  })
})

describe('MonthCalendar (cabeceras, popup de mes y fechas rellenadas)', () => {
  it('la fila de cabeceras usa esquina vacía + 7 celdas (misma grilla que la semana)', () => {
    render(<MonthCalendar mondayISO="2026-09-07" />)
    expect(
      document.querySelector('.month__dow .month__dow-corner'),
    ).not.toBeNull()
    expect(
      document.querySelectorAll('.month__dow .month__dow-cell'),
    ).toHaveLength(7)
    expect(
      document.querySelectorAll('.month__week .month__day'),
    ).toHaveLength(42)
  })

  it('marca con un indicador las fechas con disponibilidad (filledDates)', () => {
    const onSelectDay = vi.fn()
    render(
      <MonthCalendar
        mondayISO="2026-09-07"
        onSelectDay={onSelectDay}
        filledDates={['2026-09-10']}
      />,
    )

    const filled = screen.getByRole('button', {
      name: `${formatFullDate('2026-09-10')}, con disponibilidad`,
    })
    expect(filled).toHaveClass('month__day--filled')

    // Un día sin disponibilidad no lleva el sufijo ni la clase.
    expect(
      screen.queryByRole('button', {
        name: `${formatFullDate('2026-09-11')}, con disponibilidad`,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: formatFullDate('2026-09-11') }),
    ).not.toHaveClass('month__day--filled')
  })

  it('la etiqueta del mes abre un popup para navegar por año y elegir mes', async () => {
    const user = userEvent.setup()
    render(<MonthCalendar mondayISO="2026-09-07" />)

    await user.click(screen.getByRole('button', { name: /septiembre de 2026/i }))
    expect(
      screen.getByRole('dialog', { name: 'Elegir mes' }),
    ).toBeInTheDocument()

    // Navegación de año dentro del popup.
    await user.click(screen.getByRole('button', { name: 'Año siguiente' }))
    expect(screen.getByText('2027')).toBeInTheDocument()

    // Elegir un mes cierra el popup y fija la vista.
    await user.click(screen.getByRole('button', { name: 'Oct' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/octubre de 2027/i)).toBeInTheDocument()
  })
})