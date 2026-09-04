import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'

describe('flujo crear reunión', () => {
  it('crea la reunión, registra al creador y redirige a /m/<slug>', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Título de la reunión'), 'Retro mensual')
    await user.type(screen.getByLabelText('Tu nombre'), 'Ana')
    const durationInput = screen.getByLabelText('Duración mínima sugerida (min)')
    // El campo ya trae "60" por defecto: limpiar antes de escribir el valor real
    await user.clear(durationInput)
    await user.type(durationInput, '45')
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))

    // El creador queda como participante y ve su grilla de aportes
    expect(
      await screen.findByText(/Tu disponibilidad \(Ana\)/i),
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