import { useState } from 'react'
import type { AgendaType, Meeting, MeetingPatch } from '../lib/data/types'
import { formatMinutes, getTimezoneOptions } from '../lib/utils'
import CalendarPreview from './CalendarPreview'

interface MeetingOptionsProps {
  meeting: Meeting
  onSave: (patch: MeetingPatch) => Promise<void>
  /** Se llama tras guardar con éxito (p. ej. para cerrar el popup). */
  onSaved?: () => void
}

const GRANULARITIES = [15, 30, 60, 90, 120] as const

// Rango horario en pasos de 30 min. El inicio admite hasta 23:30 y el fin
// desde 00:30 para evitar rangos vacíos (inicio=24:00 o fin=00:00 dejarían la
// grilla sin filas).
const START_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30)
const END_OPTIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30)

const AGENDA_OPTIONS: { value: AgendaType; label: string }[] = [
  { value: 'weekly', label: 'Semana' },
  { value: 'one_off', label: 'Calendario' },
]

/**
 * Panel "Opciones de la reunión" (visible solo para el creador, dentro del
 * popup de JoinMeeting). Quien lo monta usa un `key` que cambia con las
 * opciones, así al guardar se remonta al nuevo estado sin sincronizar.
 *
 * Al confirmar: si cambió granularidad o tipo de agenda, avisa que se borrará
 * la disponibilidad guardada de todos; si solo cambian zona/rango, la
 * confirmación es genérica (no se borra nada).
 */
export default function MeetingOptions({ meeting, onSave, onSaved }: MeetingOptionsProps) {
  const [granularity, setGranularity] = useState(String(meeting.granularityMin))
  // Los datos viejos con agenda "hybrid" se tratan como semana recurrente;
  // el `dirty` compara contra ese valor normalizado.
  const [agendaType, setAgendaType] = useState<AgendaType>(() =>
    meeting.agendaType === 'hybrid' ? 'weekly' : meeting.agendaType,
  )
  const [timezone, setTimezone] = useState(meeting.timezone)
  const [timeStartMin, setTimeStartMin] = useState(String(meeting.timeStartMin))
  const [timeEndMin, setTimeEndMin] = useState(String(meeting.timeEndMin))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseAgenda: AgendaType =
    meeting.agendaType === 'hybrid' ? 'weekly' : meeting.agendaType

  // Misma lógica de buckets visibles que CalendarPreview/ResultGrid: un rango
  // extremo (p. ej. 23:30–24:00) con granularidad alta puede no dejar filas.
  const previewHasRows =
    Math.ceil(Math.min(Number(timeStartMin), 1439) / Number(granularity)) <=
    Math.floor((Math.max(Number(timeEndMin), 30) - 1) / Number(granularity))

  const granularityChanged = granularity !== String(meeting.granularityMin)
  const agendaChanged = agendaType !== baseAgenda
  const dirty =
    granularityChanged ||
    agendaChanged ||
    timezone !== meeting.timezone ||
    timeStartMin !== String(meeting.timeStartMin) ||
    timeEndMin !== String(meeting.timeEndMin)

  // Cambiar granularidad o agenda invalida los horarios guardados; zona o
  // rango horario no borran la disponibilidad.
  const clearsAvailability = granularityChanged || agendaChanged

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!dirty) return
    setConfirming(true)
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const patch: MeetingPatch = {}
      if (granularityChanged) patch.granularityMin = Number(granularity)
      if (agendaChanged) patch.agendaType = agendaType
      if (timezone !== meeting.timezone) patch.timezone = timezone || 'UTC'
      if (timeStartMin !== String(meeting.timeStartMin)) patch.timeStartMin = Number(timeStartMin)
      if (timeEndMin !== String(meeting.timeEndMin)) patch.timeEndMin = Number(timeEndMin)
      await onSave(patch)
      onSaved?.()
    } catch {
      setError('No se pudieron guardar las opciones. Intentá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  /** Clampa el fin para que nunca quede un rango vacío (inicio >= fin). */
  function handleStartChange(value: number) {
    setTimeStartMin(String(value))
    if (Number(timeEndMin) <= value) setTimeEndMin(String(Math.min(1440, value + 30)))
  }

  function handleEndChange(value: number) {
    setTimeEndMin(String(value))
    if (Number(timeStartMin) >= value) setTimeStartMin(String(Math.max(0, value - 30)))
  }

  return (
    <form className="options" onSubmit={handleSubmit}>
      <div className="options__grid">
        <div className="field">
          <label htmlFor="options-granularity">Granularidad de la grilla</label>
          <select
            id="options-granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
          >
            {GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {g} minutos
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="options-agenda">Tipo de agenda</label>
          <select
            id="options-agenda"
            value={agendaType}
            onChange={(e) => setAgendaType(e.target.value as AgendaType)}
          >
            {AGENDA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="options-timezone">Zona horaria</label>
          <select
            id="options-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {getTimezoneOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="options-time-start">Rango horario (desde)</label>
          <select
            id="options-time-start"
            value={timeStartMin}
            onChange={(e) => handleStartChange(Number(e.target.value))}
          >
            {START_OPTIONS.map((min) => (
              <option key={min} value={min}>
                {formatMinutes(min)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="options-time-end">Rango horario (hasta)</label>
          <select
            id="options-time-end"
            value={timeEndMin}
            onChange={(e) => handleEndChange(Number(e.target.value))}
          >
            {END_OPTIONS.map((min) => (
              <option key={min} value={min}>
                {formatMinutes(min)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CalendarPreview
        granularityMin={Number(granularity)}
        agendaType={agendaType}
        timeStartMin={Math.min(Number(timeStartMin), 1439)}
        timeEndMin={Math.max(Number(timeEndMin), 30)}
      />

      {!previewHasRows && (
        <p className="options__hint" role="status">
          El rango horario elegido no deja ninguna franja con la granularidad
          seleccionada. Ajustá el inicio, el fin o la granularidad.
        </p>
      )}

      {confirming ? (
        <div className="options__confirm" role="alert">
          <p>
            {clearsAvailability
              ? 'Esto borrará la disponibilidad guardada de todos los participantes. ¿Continuar?'
              : '¿Guardar los cambios de la reunión?'}
          </p>
          <div className="options__confirm-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              {busy ? 'Guardando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        dirty && (
          <button type="submit" className="btn btn--primary">
            Guardar cambios
          </button>
        )
      )}

      {error !== null && (
        <p className="options__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}