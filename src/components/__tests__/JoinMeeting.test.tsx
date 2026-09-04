import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'
import { dataLayer } from '../../lib/data'
import { rememberParticipant } from '../../lib/utils'

async function createMeetingFixture() {
  const meeting = await dataLayer.createMeeting({
    slug: 'abcde1',
    title: 'Retro quincenal',
    timezone: 'UTC',
    granularityMin: 30,
    durationHintMin: 60,
    agendaType: 'hybrid',
    creatorName: 'Ana',
  })
  await dataLayer.registerParticipant({ meetingId: meeting.id, name: 'Ana' })
  await dataLayer.registerParticipant({ meetingId: meeting.id, name: 'Ben' })
  return meeting
}

describe('flujo unirse a una reunión', () => {
  it('pide nombre si no hay uno guardado y luego muestra la grilla', async () => {
    const user = userEvent.setup()
    const meeting = await createMeetingFixture()
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/Sumate a «Retro quincenal»/i),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre'), 'Cris')
    await user.click(screen.getByRole('button', { name: 'Participar' }))

    // Después de registrarse aparece su grid de aportes
    expect(await screen.findByText(/Tu disponibilidad \(Cris\)/i)).toBeInTheDocument()

    // El título de la reunión se ve en el header
    expect(screen.getByTestId('meeting-title')).toHaveTextContent('Retro quincenal')
  })

  it('usa el nombre recordado en sessionStorage sin volver a preguntar', async () => {
    const meeting = await createMeetingFixture()
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    rememberParticipant(meeting.id, ana.id)

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/Tu disponibilidad \(Ana\)/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Sumate a/)).not.toBeInTheDocument()
  })

  it('marcar franja → guarda slots y la grilla resalta allFree con el recuento', async () => {
    const user = userEvent.setup()
    const meeting = await createMeetingFixture()
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    const ben = participants.find((p) => p.name === 'Ben')!

    // Ana y Ben ya aportaron: lunes 09:00-10:00
    await dataLayer.saveSlots(ana.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])
    await dataLayer.saveSlots(ben.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // Entra un tercero: Dani
    await user.type(await screen.findByLabelText('Nombre'), 'Dani')
    await user.click(screen.getByRole('button', { name: 'Participar' }))

    // Antes de que Dani marque nada, no puede haber celdas allFree (3 participantes)
    expect(screen.queryByTestId('cell-allfree')).not.toBeInTheDocument()

    // Dani marca el mismo lunes 09:00-10:00 en su grid
    await user.click(
      screen.getByRole('button', { name: 'Lun 09:00–09:30 ocupado' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Lun 09:30–10:00 ocupado' }),
    )
    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    // La grilla agregada resalta allFree con el recuento: 3 de 3
    await waitFor(async () => {
      const freeCells = await screen.findAllByTestId('cell-allfree')
      expect(freeCells.length).toBeGreaterThanOrEqual(2)
      for (const cell of freeCells) {
        expect(cell).toHaveTextContent('3')
      }
    })

    // Y los "huecos donde todos pueden" se resumen arriba
    expect(screen.getByTestId('allfree-ranges')).toBeInTheDocument()
    expect(screen.getByText(/Todos libres/i)).toBeInTheDocument()
  })
})