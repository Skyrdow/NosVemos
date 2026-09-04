import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataLayer } from '../lib/data'
import type { AgendaType } from '../lib/data/types'
import { generateSlug, normalizeName, rememberParticipant, browserTimezone } from '../lib/utils'

const GRANULARITIES = [15, 30, 60] as const

export default function CreateMeeting() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [granularityMin, setGranularityMin] = useState(30)
  const [durationHintMin, setDurationHintMin] = useState('60')
  const [agendaType, setAgendaType] = useState<AgendaType>('hybrid')
  const [timezone, setTimezone] = useState(browserTimezone)
  const [creatorName, setCreatorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateMeeting() {
    const name = normalizeName(creatorName)
    if (normalizeName(title) === '') {
      setError('Poné un título a la reunión.')
      return
    }
    if (name === '') {
      setError('Contanos tu nombre: serás el primer participante.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // Slug único: reintentar con otro slug si colisiona.
      for (let attempt = 0; attempt < 10; attempt++) {
        const slug = generateSlug()
        const existing = await dataLayer.getMeetingBySlug(slug)
        if (existing !== null) continue
        const meeting = await dataLayer.createMeeting({
          slug,
          title: normalizeName(title),
          timezone: timezone.trim() || 'UTC',
          granularityMin,
          durationHintMin: Number(durationHintMin) > 0 ? Number(durationHintMin) : null,
          agendaType,
          creatorName: name,
        })
        const participant = await dataLayer.registerParticipant({
          meetingId: meeting.id,
          name,
        })
        rememberParticipant(meeting.id, participant.id)
        navigate(`/m/${meeting.slug}`)
        return
      }
      setError('No se pudo generar un enlace único. Intentá de nuevo.')
    } catch {
      setError('Ocurrió un error al crear la reunión. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="create" aria-labelledby="create-title">
      <h2 id="create-title">Crear una reunión</h2>
      <p className="create__lead">
        Generá un link único, compartilo y la app calcula en qué franjas TODOS
        están libres.
      </p>

      <form
        className="create__form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreateMeeting()
        }}
      >
        <div className="field">
          <label htmlFor="meeting-title">Título de la reunión</label>
          <input
            id="meeting-title"
            type="text"
            value={title}
            placeholder="Ej.: Retro del equipo"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="meeting-granularity">Granularidad de la grilla</label>
          <select
            id="meeting-granularity"
            value={granularityMin}
            onChange={(e) => setGranularityMin(Number(e.target.value))}
          >
            {GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {g} minutos
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="meeting-duration">Duración mínima sugerida (min)</label>
          <input
            id="meeting-duration"
            type="number"
            min={15}
            step={5}
            value={durationHintMin}
            onChange={(e) => setDurationHintMin(e.target.value)}
            inputMode="numeric"
          />
        </div>

        <div className="field">
          <label htmlFor="meeting-agenda">Tipo de agenda</label>
          <select
            id="meeting-agenda"
            value={agendaType}
            onChange={(e) => setAgendaType(e.target.value as AgendaType)}
          >
            <option value="weekly">Semana recurrente</option>
            <option value="one_off">Día puntual</option>
            <option value="hybrid">Híbrido (semana o día puntual)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="meeting-timezone">Zona horaria</label>
          <input
            id="meeting-timezone"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="creator-name">Tu nombre</label>
          <input
            id="creator-name"
            type="text"
            value={creatorName}
            placeholder="Ej.: Ana"
            autoComplete="name"
            onChange={(e) => setCreatorName(e.target.value)}
          />
          <p className="field__hint">Serás el primer participante de la reunión.</p>
        </div>

        {error !== null && (
          <p className="create__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear reunión'}
        </button>
      </form>
    </section>
  )
}