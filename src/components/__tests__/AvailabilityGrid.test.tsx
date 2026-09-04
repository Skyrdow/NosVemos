import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityGrid from '../AvailabilityGrid'
import type { Rule } from '../../lib/intersect'

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

  it('en modo one_off marca un día puntual y produce una regla one_off', async () => {
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

    // Fecha por defecto: hoy. Marcar 10:00–11:00 de hoy.
    await user.click(
      screen.getByRole('button', {
        name: /10:00–11:00 ocupado/,
      }),
    )

    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const rules = onSave.mock.calls[0]![0]
    expect(rules[0]).toMatchObject({ kind: 'one_off' })
    expect(rules[0]!.ranges).toEqual([[600, 660]])
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
})