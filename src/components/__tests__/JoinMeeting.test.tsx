import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'
import { dataLayer } from '../../lib/data'
import { formatShortDate, rememberCreator, rememberParticipant, todayISO, addDaysISO, mondayOf } from '../../lib/utils'

async function createMeetingFixture() {
  const meeting = await dataLayer.createMeeting({
    slug: 'abcde1',
    title: 'Retro quincenal',
    timezone: 'UTC',
    granularityMin: 30,
    timeStartMin: 480,
    timeEndMin: 1200,
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
      await screen.findByText(/Súmate a «Retro quincenal»/i),
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
    expect(screen.queryByText(/Súmate a/)).not.toBeInTheDocument()
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

  it('avisa si el nombre ya está en uso pero no bloquea la participación', async () => {
    const user = userEvent.setup()
    const meeting = await createMeetingFixture()
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // Ana ya está registrada en la reunión; otro dispositivo entra con "Ana".
    await user.type(await screen.findByLabelText('Nombre'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Participar' }))

    // El aviso aparece…
    expect(
      await screen.findByText(/ya está en uso en esta reunión/i),
    ).toBeInTheDocument()
    // …pero la participación no se bloquea: la grilla se muestra igual.
    expect(screen.getByText(/Tu disponibilidad \(Ana\)/i)).toBeInTheDocument()

    // El aviso se puede descartar.
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(
      screen.queryByText(/ya está en uso en esta reunión/i),
    ).not.toBeInTheDocument()
  })

  it('quien no es anfitrión no ve el botón de Opciones', async () => {
    const meeting = await createMeetingFixture()
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // Sin registro de creador en este dispositivo no aparece el botón.
    expect(await screen.findByText(/Súmate a/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Opciones/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('options-popup')).not.toBeInTheDocument()
  })

  it('el anfitrión abre el popup de opciones y al confirmar borra la disponibilidad', async () => {
    const user = userEvent.setup()
    const meeting = await createMeetingFixture()
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    const ben = participants.find((p) => p.name === 'Ben')!

    // Ana y Ben ya aportaron el lunes 09:00-10:00.
    await dataLayer.saveSlots(ana.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])
    await dataLayer.saveSlots(ben.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])

    sessionStorage.clear()
    rememberParticipant(meeting.id, ana.id)
    rememberCreator(meeting.id)

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // El botón existe solo en el dispositivo del creador; abre el popup.
    const optionsButton = await screen.findByRole('button', { name: /Opciones/ })
    expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(optionsButton)
    expect(optionsButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('dialog', { name: 'Opciones de la reunión' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('options-popup')).toBeInTheDocument()
    expect(
      await screen.findByText(/Tu disponibilidad \(Ana\)/i),
    ).toBeInTheDocument()

    // Cambiar un valor habilita "Guardar cambios".
    await user.selectOptions(
      screen.getByLabelText('Granularidad de la grilla'),
      '60',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Aviso inline de borrado antes de aplicar.
    expect(
      screen.getByText(
        /Esto borrará la disponibilidad guardada de todos los participantes/i,
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    // La reunión quedó con la nueva granularidad…
    await waitFor(async () => {
      const reloaded = await dataLayer.getMeetingBySlug(meeting.slug)
      expect(reloaded!.granularityMin).toBe(60)
    })

    // …y los slots de TODOS los participantes quedaron borrados.
    await waitFor(async () => {
      expect(await dataLayer.getSlots(ana.id)).toHaveLength(0)
    })
    expect(await dataLayer.getSlots(ben.id)).toHaveLength(0)

    // El popup se cierra tras guardar; sin aportes la grilla muestra vacío.
    await waitFor(() => {
      expect(screen.queryByTestId('options-popup')).not.toBeInTheDocument()
    })
    expect(await screen.findByTestId('result-empty')).toBeInTheDocument()
  })

  it('cambiar solo la zona horaria no borra la disponibilidad guardada', async () => {
    const user = userEvent.setup()
    const meeting = await createMeetingFixture()
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    const ben = participants.find((p) => p.name === 'Ben')!

    await dataLayer.saveSlots(ana.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])
    await dataLayer.saveSlots(ben.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])

    sessionStorage.clear()
    rememberParticipant(meeting.id, ana.id)
    rememberCreator(meeting.id)

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /Opciones/ }))
    await user.selectOptions(
      screen.getByLabelText('Zona horaria'),
      'America/Buenos_Aires',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Solo zona/rango → confirmación genérica (no avisa borrado).
    expect(
      screen.getByText(/¿Guardar los cambios de la reunión\?/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    // La zona cambió…
    await waitFor(async () => {
      const reloaded = await dataLayer.getMeetingBySlug(meeting.slug)
      expect(reloaded!.timezone).toBe('America/Buenos_Aires')
    })

    // …pero la disponibilidad sigue intacta.
    await waitFor(async () => {
      expect(await dataLayer.getSlots(ana.id)).toHaveLength(1)
      expect(await dataLayer.getSlots(ben.id)).toHaveLength(1)
    })
  })

  it('reunión semanal: resultado e input a la vez, sin calendario ni toggle', async () => {
    const meeting = await createMeetingFixture()
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    sessionStorage.clear()
    rememberParticipant(meeting.id, ana.id)

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // El fixture es hybrid → el modo es semana recurrente.
    expect(await screen.findByText(/Tu disponibilidad \(Ana\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('month-calendar')).not.toBeInTheDocument()
    // Resultados (todavía sin aportes) e input visibles a la vez.
    expect(screen.getByTestId('result-empty')).toBeInTheDocument()
    expect(screen.getByText(/Disponibilidad agregada/i)).toBeInTheDocument()
  })

  it('reunión one_off: un solo calendario muestra resultados y edición a la vez', async () => {
    const user = userEvent.setup()
    const meeting = await dataLayer.createMeeting({
      slug: 'cine01',
      title: 'Salida al cine',
      timezone: 'UTC',
      granularityMin: 60,
      timeStartMin: 480,
      timeEndMin: 1200,
      agendaType: 'one_off',
      creatorName: 'Ana',
    })
    await dataLayer.registerParticipant({ meetingId: meeting.id, name: 'Ana' })
    await dataLayer.registerParticipant({ meetingId: meeting.id, name: 'Ben' })
    const participants = await dataLayer.getParticipants(meeting.id)
    const ana = participants.find((p) => p.name === 'Ana')!
    sessionStorage.clear()
    rememberParticipant(meeting.id, ana.id)
    rememberCreator(meeting.id)

    render(
      <MemoryRouter initialEntries={[`/m/${meeting.slug}`]}>
        <App />
      </MemoryRouter>,
    )

    // Calendario compartido + resultados vacíos + input, todo en pantalla.
    expect(await screen.findByTestId('month-calendar')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('result-empty')).toBeInTheDocument()
    expect(screen.getByText(/Tu disponibilidad \(Ana\)/i)).toBeInTheDocument()

    // Marcar hoy 09:00–10:00 en el input (columna del día controlado).
    const today = todayISO()
    await user.click(
      screen.getByRole('button', {
        name: `${formatShortDate(today)} 09:00–10:00 ocupado`,
      }),
    )
    await user.click(
      screen.getByRole('button', { name: /Guardar disponibilidad/ }),
    )

    // El día queda marcado en el calendario compartido…
    expect(
      await screen.findByRole('button', { name: /con disponibilidad/ }),
    ).toBeInTheDocument()
    // …y los resultados de la semana muestran la celda de hoy a la vez.
    expect(await screen.findByTestId('result-grid')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: `${formatShortDate(today)} 09:00–10:00: 1 de 2 libres`,
      }),
    ).toBeInTheDocument()

    // La semana elegida (la actual) se ve con sus 7 fechas tanto en el input
    // como en los resultados (fechas, no nombres de día).
    const weekStart = mondayOf(todayISO())
    for (let i = 0; i < 7; i++) {
      const label = formatShortDate(addDaysISO(weekStart, i))
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1)
    }
  })
})