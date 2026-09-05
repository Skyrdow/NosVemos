import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataLayer } from '../lib/data'
import {
  browserTimezone,
  generateSlug,
  getTimezoneOptions,
  normalizeName,
  rememberCreator,
  rememberParticipant,
} from '../lib/utils'

export default function CreateMeeting() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [timezone, setTimezone] = useState(browserTimezone)
  const [creatorName, setCreatorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateMeeting() {
    const name = normalizeName(creatorName)
    if (normalizeName(title) === '') {
      setError('Pon un título a la reunión.')
      return
    }
    if (name === '') {
      setError('Cuéntanos tu nombre: serás el primer participante.')
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
          timezone: timezone || 'UTC',
          // Valores por defecto del MVP: granularidad de una hora, agenda
          // "hybrid" (compatibilidad: se comporta como semana recurrente) y
          // rango horario 08:00–20:00 (configurable luego desde la reunión).
          granularityMin: 60,
          timeStartMin: 480,
          timeEndMin: 1200,
          agendaType: 'hybrid',
          creatorName: name,
        })
        const participant = await dataLayer.registerParticipant({
          meetingId: meeting.id,
          name,
        })
        rememberParticipant(meeting.id, participant.id)
        rememberCreator(meeting.id)
        navigate(`/m/${meeting.slug}`)
        return
      }
      setError('No se pudo generar un enlace único. Intenta de nuevo.')
    } catch {
      setError('Ocurrió un error al crear la reunión. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="create" aria-labelledby="create-title">
      <h2 id="create-title">Crear una reunión</h2>
      <p className="create__lead">
        Genera un link único, compártelo y la app calcula en qué franjas TODOS
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

        <div className="field">
          <label htmlFor="meeting-timezone">Zona horaria</label>
          <select
            id="meeting-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {getTimezoneOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="field__hint">
            Los horarios de la reunión se muestran en esta zona.
          </p>
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