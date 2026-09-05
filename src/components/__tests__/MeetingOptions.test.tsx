import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MeetingOptions from '../MeetingOptions'
import type { Meeting } from '../../lib/data/types'
import { addDaysISO, formatShortDate, mondayOf, todayISO } from '../../lib/utils'

function meetingFixture(): Meeting {
  return {
    id: 'm1',
    slug: 'abcde1',
    title: 'Retro quincenal',
    timezone: 'UTC',
    granularityMin: 60,
    timeStartMin: 480,
    timeEndMin: 1200,
    agendaType: 'hybrid',
    creatorName: 'Ana',
    createdAt: '2026-09-04T00:00:00.000Z',
  }
}

const previewRows = () =>
  document.querySelectorAll('.grid--preview .grid__row').length

const previewHeaders = () =>
  Array.from(document.querySelectorAll('.grid--preview .grid__day-header')).map(
    (el) => el.textContent,
  )

describe('MeetingOptions (panel del creador en el popup)', () => {
  it('la preview muestra fechas en modo Calendario y nombres de día en modo Semana', async () => {
    const user = userEvent.setup()
    render(<MeetingOptions meeting={meetingFixture()} onSave={vi.fn()} />)

    // Agenda por defecto (hybrid → Semana): nombres de día.
    expect(previewHeaders()).toEqual([
      'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom',
    ])

    // En modo Calendario, la columna muestra las fechas de la semana actual.
    await user.selectOptions(screen.getByLabelText('Tipo de agenda'), 'one_off')
    const weekStart = mondayOf(todayISO())
    const headers = previewHeaders()
    expect(headers).toHaveLength(7)
    expect(headers[0]).toBe(formatShortDate(weekStart))
    expect(headers[6]).toBe(formatShortDate(addDaysISO(weekStart, 6)))
  })
  it('ofrece granularidades de 15 a 120 minutos', () => {
    render(<MeetingOptions meeting={meetingFixture()} onSave={vi.fn()} />)

    const select = screen.getByLabelText('Granularidad de la grilla')
    expect(select).toHaveValue('60')
    for (const g of [15, 30, 60, 90, 120]) {
      expect(screen.getByRole('option', { name: `${g} minutos` })).toHaveValue(
        String(g),
      )
    }
  })

  it('el tipo de agenda solo ofrece "Semana" y "Calendario" (sin Híbrido)', () => {
    render(<MeetingOptions meeting={meetingFixture()} onSave={vi.fn()} />)

    const select = screen.getByLabelText('Tipo de agenda')
    expect(screen.getByRole('option', { name: 'Semana' })).toHaveValue('weekly')
    expect(screen.getByRole('option', { name: 'Calendario' })).toHaveValue('one_off')
    expect(
      screen.queryByRole('option', { name: /Híbrido/i }),
    ).not.toBeInTheDocument()
    // La agenda legacy "hybrid" se normaliza a "Semana".
    expect(select).toHaveValue('weekly')
  })

it('el rango horario usa dos sliders y muestra su valor en HH:MM', () => {
  const { container } = render(
    <MeetingOptions meeting={meetingFixture()} onSave={vi.fn()} />,
  )

  const desde = screen.getByLabelText('Rango horario (desde)') as HTMLInputElement
  const hasta = screen.getByLabelText('Rango horario (hasta)') as HTMLInputElement
  expect(desde).toHaveAttribute('type', 'range')
  expect(hasta).toHaveAttribute('type', 'range')
  expect(desde).toHaveValue('480')
  expect(hasta).toHaveValue('1200')
  expect(
    container.querySelector('output[for="options-time-start"]'),
  ).toHaveTextContent('08:00')
  expect(
    container.querySelector('output[for="options-time-end"]'),
  ).toHaveTextContent('20:00')
})

it('muestra la vista previa siguiendo granularidad, agenda y rango', async () => {
  const user = userEvent.setup()
  render(<MeetingOptions meeting={meetingFixture()} onSave={vi.fn()} />)

  const preview = screen.getByTestId('calendar-preview')
  expect(preview).toHaveAttribute('aria-label', 'Vista previa del calendario')
  expect(
    screen.getByText('Vista previa · 60 min · Semana recurrente'),
  ).toBeInTheDocument()

  // 08:00–20:00 con 60 min = 12 filas; con 90 min = 8 filas.
  expect(previewRows()).toBe(12)

  await user.selectOptions(
    screen.getByLabelText('Granularidad de la grilla'),
    '90',
  )
  expect(
    screen.getByText('Vista previa · 90 min · Semana recurrente'),
  ).toBeInTheDocument()
  expect(previewRows()).toBe(8)

  // Cambiar el tipo de agenda actualiza la etiqueta de la preview.
  await user.selectOptions(screen.getByLabelText('Tipo de agenda'), 'one_off')
  expect(
    screen.getByText('Vista previa · 90 min · Día puntual'),
  ).toBeInTheDocument()

  // El rango elegido se refleja en la preview (10:00–20:00 con 90' = 7 filas).
  fireEvent.change(screen.getByLabelText('Rango horario (desde)'), {
    target: { value: '600' },
  })
  expect(previewRows()).toBe(7)
})

it('cambiar solo el rango horario guarda con confirmación genérica (sin borrado)', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn<(patch: unknown) => Promise<void>>(() => Promise.resolve())
  render(<MeetingOptions meeting={meetingFixture()} onSave={onSave} />)

  fireEvent.change(screen.getByLabelText('Rango horario (hasta)'), {
    target: { value: '1380' },
  })
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(
    screen.getByText(/¿Guardar los cambios de la reunión\?/),
  ).toBeInTheDocument()
  expect(
    screen.queryByText(/borrará la disponibilidad guardada/i),
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Confirmar' }))
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave.mock.calls[0]![0]).toEqual({ timeEndMin: 1380 })
})

  it('cambiar la granularidad pide confirmación de borrado', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<MeetingOptions meeting={meetingFixture()} onSave={onSave} />)

    await user.selectOptions(
      screen.getByLabelText('Granularidad de la grilla'),
      '30',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      screen.getByText(
        /Esto borrará la disponibilidad guardada de todos los participantes/i,
      ),
    ).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('llama a onSaved tras guardar con éxito', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(
      <MeetingOptions
        meeting={meetingFixture()}
        onSave={vi.fn(() => Promise.resolve())}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Rango horario (desde)'), {
      target: { value: '540' },
    })
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})