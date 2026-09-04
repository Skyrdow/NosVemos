import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import AvailabilityGrid from '../components/AvailabilityGrid'
import NamePrompt from '../components/NamePrompt'
import ResultGrid from '../components/ResultGrid'
import { dataLayer } from '../lib/data'
import type { Meeting, Participant, Slot } from '../lib/data/types'
import { computeIntersections, type Rule } from '../lib/intersect'
import { rulesToSlots, slotToRule } from '../lib/rules'
import {
  getRememberedParticipant,
  normalizeName,
  rememberParticipant,
} from '../lib/utils'

type LoadState = 'loading' | 'ready' | 'notfound' | 'error'

export default function JoinMeeting() {
  const { slug } = useParams<{ slug: string }>()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [me, setMe] = useState<Participant | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [slotsBy, setSlotsBy] = useState<Map<string, Slot[]>>(new Map())
  const [namingBusy, setNamingBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!meeting) return
    const parts = await dataLayer.getParticipants(meeting.id)
    const map = new Map<string, Slot[]>()
    for (const participant of parts) {
      map.set(participant.id, await dataLayer.getSlots(participant.id))
    }
    setParticipants(parts)
    setSlotsBy(map)
    // Si tengo un participante recordado en este dispositivo, usarlo.
    // Re-registrar el mismo valor es un no-op, así que no hace falta guard.
    const rememberedId = getRememberedParticipant(meeting.id)
    if (rememberedId !== null) {
      const found = parts.find((p) => p.id === rememberedId)
      if (found) setMe(found)
    }
  }, [meeting])

  useEffect(() => {
    const value = slug ?? ''
    let cancelled = false
    dataLayer
      .getMeetingBySlug(value)
      .then((found) => {
        if (cancelled) return
        if (found === null) setLoadState('notfound')
        else {
          setMeeting(found)
          setLoadState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Carga inicial + suscripción al realtime de la reunión (memory: eventos locales).
  useEffect(() => {
    if (!meeting) return
    const run = async () => {
      await loadData()
    }
    void run()
    const unsubscribe = dataLayer.subscribeToMeeting(meeting.id, () => {
      void loadData()
    })
    return unsubscribe
  }, [meeting, loadData])

  const slotsInput = useMemo(
    () =>
      participants.map((p) => ({
        participantId: p.id,
        name: p.name,
        rules: (slotsBy.get(p.id) ?? []).map(slotToRule),
      })),
    [participants, slotsBy],
  )

  const { cells, allFreeRanges } = useMemo(() => {
    if (meeting === null) return { cells: [], allFreeRanges: [] }
    return computeIntersections(slotsInput, meeting.granularityMin)
  }, [meeting, slotsInput])

  const myRules = useMemo<Rule[]>(() => {
    if (!me) return []
    return (slotsBy.get(me.id) ?? []).map(slotToRule)
  }, [me, slotsBy])

  async function handleName(name: string) {
    if (!meeting) return
    setNamingBusy(true)
    setLoadError(null)
    try {
      const participant = await dataLayer.registerParticipant({
        meetingId: meeting.id,
        name: normalizeName(name),
      })
      rememberParticipant(meeting.id, participant.id)
      setMe(participant)
      await loadData()
    } catch {
      setLoadError('No se pudo registrar tu nombre. Intentá de nuevo.')
    } finally {
      setNamingBusy(false)
    }
  }

  async function handleSaveRules(rules: Rule[]) {
    if (!me) return
    setSaving(true)
    setSavedMessage(false)
    setLoadError(null)
    try {
      await dataLayer.saveSlots(me.id, rulesToSlots(rules))
      await loadData()
      setSavedMessage(true)
      window.setTimeout(() => setSavedMessage(false), 3000)
    } catch {
      setLoadError('No se pudo guardar tu disponibilidad. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyLink() {
    if (!meeting) return
    const url = `${window.location.origin}/m/${meeting.slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Sin portapapeles disponible: mostrar el link para copiar manualmente
      window.prompt('Copiá el link:', url)
    }
  }

  if (loadState === 'loading') {
    return (
      <section className="join" aria-busy="true">
        <p className="join__status">Cargando reunión…</p>
      </section>
    )
  }

  if (loadState === 'notfound' || meeting === null) {
    return (
      <section className="join join--empty">
        <h2>Reunión no encontrada</h2>
        <p>
          El link <code>/m/{slug}</code> no corresponde a ninguna reunión. Verificá
          que esté bien copiado o creá una nueva.
        </p>
        <a className="btn" href="/">
          Crear una reunión
        </a>
      </section>
    )
  }

  if (loadState === 'error') {
    return (
      <section className="join join--empty">
        <h2>Error al cargar la reunión</h2>
        <p>{loadError ?? 'Ocurrió un problema con el servidor de datos.'}</p>
        <a className="btn" href="/">
          Volver al inicio
        </a>
      </section>
    )
  }

  const participantsWithSlots = participants.filter(
    (p) => (slotsBy.get(p.id)?.length ?? 0) > 0,
  )

  return (
    <div className="join">
      <section className="join__header">
        <h2 data-testid="meeting-title">{meeting.title}</h2>
        <p className="join__meta">
          Granularidad: {meeting.granularityMin} min · Agenda:{' '}
          {meeting.agendaType === 'weekly'
            ? 'semana recurrente'
            : meeting.agendaType === 'one_off'
              ? 'día puntual'
              : 'híbrida'}{' '}
          · Zona: {meeting.timezone}
        </p>
        <div className="join__share">
          <code>/{meeting.slug}</code>
          <button type="button" className="btn" onClick={() => void handleCopyLink()}>
            Copiar link
          </button>
        </div>
      </section>

      {me === null ? (
        <NamePrompt
          meetingTitle={meeting.title}
          onSubmit={handleName}
          busy={namingBusy}
        />
      ) : (
        <>
          <section className="join__section" aria-labelledby="results-title">
            <h3 id="results-title">
              Disponibilidad agregada
              <span className="join__count">{participantsWithSlots.length}/{participants.length} con aportes</span>
            </h3>
            <ResultGrid
              key={`${meeting.granularityMin}:${participants.length}:${slotsBy.size}`}
              granularityMin={meeting.granularityMin}
              cells={cells}
              allFreeRanges={allFreeRanges}
              participants={participants}
            />
          </section>

          <section className="join__section" aria-labelledby="your-input-title">
            <h3 id="your-input-title">Tu disponibilidad ({me.name})</h3>
            <AvailabilityGrid
              key={`av:${me.id}:${JSON.stringify(myRules)}`}
              granularityMin={meeting.granularityMin}
              agendaType={meeting.agendaType}
              initialRules={myRules}
              onSave={handleSaveRules}
              saving={saving}
            />
            {savedMessage && (
              <p className="join__saved" role="status">
                Disponibilidad guardada ✓
              </p>
            )}
          </section>
        </>
      )}

      {loadError !== null && (
        <p className="join__error" role="alert">
          {loadError}
        </p>
      )}
    </div>
  )
}