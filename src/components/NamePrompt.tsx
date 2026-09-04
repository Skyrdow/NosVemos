import { useState } from 'react'
import { normalizeName } from '../lib/utils'

interface NamePromptProps {
  meetingTitle: string
  onSubmit: (name: string) => void | Promise<void>
  busy?: boolean
}

export default function NamePrompt({
  meetingTitle,
  onSubmit,
  busy = false,
}: NamePromptProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = normalizeName(name)
    if (normalized === '') {
      setError('Tu nombre es necesario para sumar tu disponibilidad.')
      return
    }
    setError(null)
    void onSubmit(normalized)
  }

  return (
    <section className="name-prompt" aria-labelledby="name-prompt-title">
      <h2 id="name-prompt-title">Sumate a «{meetingTitle}»</h2>
      <p>¿Cómo te llamás? Tu nombre se usará para identificar tus franjas.</p>
      <form className="name-prompt__form" onSubmit={handleSubmit}>
        <label htmlFor="participant-name">Nombre</label>
        <input
          id="participant-name"
          type="text"
          value={name}
          autoComplete="name"
          placeholder="Ej.: Ana"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Participar'}
        </button>
      </form>
      {error !== null && (
        <p className="name-prompt__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}