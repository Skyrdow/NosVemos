import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'

describe('flujo crear reunión', () => {
  it('crea la reunión con título+nombre+zona y redirige a /m/<slug>', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    // El formulario es mínimo: título, nombre y select de zona horaria.
    await user.type(screen.getByLabelText('Título de la reunión'), 'Retro mensual')
    await user.type(screen.getByLabelText('Tu nombre'), 'Ana')
    const timezoneSelect = screen.getByLabelText('Zona horaria')
    expect(timezoneSelect).toBeInTheDocument()
    // No hay más campos de configuración en el formulario de creación.
    expect(
      screen.queryByLabelText('Granularidad de la grilla'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))

    // El creador queda como participante, ve su grilla y el botón de opciones
    // (el panel vive en un popup que solo abre el anfitrión).
    expect(
      await screen.findByText(/Tu disponibilidad \(Ana\)/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Opciones/ }))
    expect(
      screen.getByRole('dialog', { name: 'Opciones de la reunión' }),
    ).toBeInTheDocument()
  })

  it('valida el formulario: exige título y nombre', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))
    expect(
      await screen.findByText(/Poné un título a la reunión/),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Título de la reunión'), 'Demo')
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /serás el primer participante/i,
    )
  })
})