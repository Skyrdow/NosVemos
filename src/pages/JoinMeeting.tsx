import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import AvailabilityGrid from '../components/AvailabilityGrid'
import MeetingOptions from '../components/MeetingOptions'
import MonthCalendar from '../components/MonthCalendar'
import NamePrompt from '../components/NamePrompt'
import ResultGrid from '../components/ResultGrid'
import { dataLayer } from '../lib/data'
import type { Meeting, MeetingPatch, Participant, Slot } from '../lib/data/types'
import { computeIntersections, type Rule } from '../lib/intersect'
import { rulesToSlots, slotToRule } from '../lib/rules'
import {
  addDaysISO,
  dateInRange,
  formatMinutes,
  getRememberedParticipant,
  isCreatorOf,
  mondayOf,
  normalizeName,
  rememberParticipant,
  todayISO,
} from '../lib/utils'

type LoadState = 'loading' | 'ready' | 'notfound' | 'error'

/** Para reuniones legacy "hybrid": el input y los resultados se tratan como
 *  semana recurrente. El modo de vista nace solo del tipo de agenda. */
function effectiveAgenda(agendaType: Meeting['agendaType']): 'weekly' | 'one_off' {
  return agendaType === 'one_off' ? 'one_off' : 'weekly'
}

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
  const [duplicateWarning, setDuplicateWarning] = useState(false)

// Modo one_off: el calendario compartido controla el día activo (la semana que
// muestra el input con sus 7 fechas) y la semana de resultados. Default: hoy.
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => mondayOf(todayISO()))
  const [activeDate, setActiveDate] = useState(() => todayISO())
  // Popup de "Opciones de la reunión" (solo anfitrión).
  const [optionsOpen, setOptionsOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!meeting) return
    // Refrescar también la reunión: el creador puede editar las opciones
    // (granularidad/zona/agenda/rango) y el realtime emite cambios en `meetings`.
    const refreshed = await dataLayer.getMeetingBySlug(meeting.slug)
    if (
      refreshed !== null &&
      (refreshed.granularityMin !== meeting.granularityMin ||
        refreshed.agendaType !== meeting.agendaType ||
        refreshed.timezone !== meeting.timezone ||
        refreshed.timeStartMin !== meeting.timeStartMin ||
        refreshed.timeEndMin !== meeting.timeEndMin ||
        refreshed.title !== meeting.title)
    ) {
      setMeeting(refreshed)
    }
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

  // El modo de vista viene SOLO del tipo de agenda (weekly/hybrid → semana
  // recurrente; one_off → calendario compartido + resultados + input a la vez).
  const agenda: 'weekly' | 'one_off' =
    meeting === null ? 'weekly' : effectiveAgenda(meeting.agendaType)

  // Modo "Semana": los resultados muestran SIEMPRE la semana actual (sin
  // selector ni header): columnas recurrentes Lun–Dom + one_off en esa semana.
  const currentWeekStart = useMemo(() => mondayOf(todayISO()), [])
  const currentWeekEnd = useMemo(
    () => addDaysISO(currentWeekStart, 6),
    [currentWeekStart],
  )

  // Modo one_off: semana elegida en el calendario compartido.
  const selectedWeekEnd = useMemo(
    () => addDaysISO(selectedWeekStart, 6),
    [selectedWeekStart],
  )
  // Las 7 fechas (lun..dom) de esa semana: los resultados las muestran SIEMPRE.
  const selectedWeekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(selectedWeekStart, i)),
    [selectedWeekStart],
  )

  const resultCells = useMemo(() => {
    if (agenda === 'one_off') {
      return cells.filter(
        (c) =>
          c.date !== undefined &&
          dateInRange(c.date, selectedWeekStart, selectedWeekEnd),
      )
    }
    return cells.filter(
      (c) =>
        c.dayOfWeek !== undefined ||
        (c.date !== undefined &&
          dateInRange(c.date, currentWeekStart, currentWeekEnd)),
    )
  }, [agenda, cells, selectedWeekStart, selectedWeekEnd, currentWeekStart, currentWeekEnd])

  const resultAllFree = useMemo(() => {
    if (agenda === 'one_off') {
      return allFreeRanges.filter(
        (r) =>
          r.date !== undefined &&
          dateInRange(r.date, selectedWeekStart, selectedWeekEnd),
      )
    }
    return allFreeRanges.filter(
      (r) =>
        r.dayOfWeek !== undefined ||
        (r.date !== undefined &&
          dateInRange(r.date, currentWeekStart, currentWeekEnd)),
    )
  }, [agenda, allFreeRanges, selectedWeekStart, selectedWeekEnd, currentWeekStart, currentWeekEnd])

  // Días puntuales con algún aporte (marcados en el calendario de resultados).
  const filledDates = useMemo(() => {
    const set = new Set<string>()
    for (const cell of cells) {
      if (cell.date !== undefined && cell.freeCount > 0) set.add(cell.date)
    }
    return [...set]
  }, [cells])

  async function handleName(name: string) {
    if (!meeting) return
    setNamingBusy(true)
    setLoadError(null)
    setDuplicateWarning(false)
    try {
      const normalized = normalizeName(name)
      // Si el nombre ya está registrado, avisar (sin bloquear la participación).
      const existing = await dataLayer.getParticipants(meeting.id)
      const isDuplicate = existing.some((p) => p.name === normalized)
      const participant = await dataLayer.registerParticipant({
        meetingId: meeting.id,
        name: normalized,
      })
      rememberParticipant(meeting.id, participant.id)
      setMe(participant)
      setDuplicateWarning(isDuplicate)
      await loadData()
    } catch {
      setLoadError('No se pudo registrar tu nombre. Intenta de nuevo.')
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
      setLoadError('No se pudo guardar tu disponibilidad. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateMeeting(patch: MeetingPatch) {
    if (!meeting) return
    // Solo cambiar la granularidad o el tipo de agenda invalida los horarios
    // guardados (borrar primero y actualizar después: un fallo del borrado no
    // deja la reunión actualizada con disponibilidad vieja). Un cambio de solo
    // zona horaria o rango NO borra la disponibilidad.
    const needsClear =
      (patch.granularityMin !== undefined &&
        patch.granularityMin !== meeting.granularityMin) ||
      (patch.agendaType !== undefined &&
        patch.agendaType !== effectiveAgenda(meeting.agendaType))
    if (needsClear) await dataLayer.clearMeetingSlots(meeting.id)
    const updated = await dataLayer.updateMeeting(meeting.id, patch)
    setMeeting(updated)
    await loadData()
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
          El link <code>/m/{slug}</code> no corresponde a ninguna reunión. Verifica
          que esté bien copiado o crea una nueva.
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

  const creatorDevice = isCreatorOf(meeting.id)

  return (
    <div className="join">
      <section className="join__header">
        <h2 data-testid="meeting-title">{meeting.title}</h2>
        <p className="join__meta">
          Granularidad: {meeting.granularityMin} min · Agenda:{' '}
          {meeting.agendaType === 'one_off' ? 'día puntual' : 'semana recurrente'}{' '}
          · Rango: {formatMinutes(meeting.timeStartMin)}–{formatMinutes(meeting.timeEndMin)}{' '}
          · Zona: {meeting.timezone}
        </p>
        <div className="join__actions">
          <div className="join__share">
            <code>/{meeting.slug}</code>
            <button type="button" className="btn" onClick={() => void handleCopyLink()}>
              Copiar link
            </button>
          </div>
          {creatorDevice && (
            <button
              type="button"
              className="btn"
              aria-expanded={optionsOpen}
              aria-haspopup="dialog"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              ⚙ Opciones
            </button>
          )}
        </div>
      </section>

      {optionsOpen && creatorDevice && (
        <div
          className="join__modal"
          onClick={() => setOptionsOpen(false)}
        >
          <div
            className="join__options"
            role="dialog"
            aria-modal="true"
            aria-label="Opciones de la reunión"
            data-testid="options-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="join__options-title">Opciones de la reunión</h3>
            <MeetingOptions
              key={`${meeting.granularityMin}:${meeting.agendaType}:${meeting.timezone}:${meeting.timeStartMin}:${meeting.timeEndMin}`}
              meeting={meeting}
              onSave={handleUpdateMeeting}
              onSaved={() => setOptionsOpen(false)}
            />
          </div>
        </div>
      )}

      {duplicateWarning && me !== null && (
        <div className="join__warning" role="alert">
          <p>
            El nombre «{me.name}» ya está en uso en esta reunión. Si no eres tú,
            prueba con otro, pero puedes continuar.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setDuplicateWarning(false)}
          >
            Entendido
          </button>
        </div>
      )}

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

            {agenda === 'one_off' ? (
              <>
                {/* Calendario compartido (único): elige día y semana; los
                    resultados y el input siguen al día activo, todo a la vez. */}
                <MonthCalendar
                  mondayISO={selectedWeekStart}
                  selectedDate={activeDate}
                  filledDates={filledDates}
                  onSelectDay={(day) => {
                    setActiveDate(day)
                    setSelectedWeekStart(mondayOf(day))
                  }}
                  onSelectWeek={(monday) => {
                    setActiveDate(monday)
                    setSelectedWeekStart(monday)
                  }}
                />
                <ResultGrid
                  key={`oneoff:${meeting.granularityMin}:${selectedWeekStart}:${participants.length}:${slotsBy.size}`}
                  granularityMin={meeting.granularityMin}
                  cells={resultCells}
                  allFreeRanges={resultAllFree}
                  participants={participants}
                  timeStartMin={meeting.timeStartMin}
                  timeEndMin={meeting.timeEndMin}
                  forceWeekDates={selectedWeekDates}
                />
              </>
            ) : (
              <ResultGrid
                key={`week:${meeting.granularityMin}:${participants.length}:${slotsBy.size}`}
                granularityMin={meeting.granularityMin}
                cells={resultCells}
                allFreeRanges={resultAllFree}
                participants={participants}
                timeStartMin={meeting.timeStartMin}
                timeEndMin={meeting.timeEndMin}
                forceWeeklyDays
              />
            )}
          </section>

          <section className="join__section" aria-labelledby="your-input-title">
            <h3 id="your-input-title">Tu disponibilidad ({me.name})</h3>
            <AvailabilityGrid
              key={`av:${me.id}:${JSON.stringify(myRules)}`}
              granularityMin={meeting.granularityMin}
              agendaType={meeting.agendaType}
              activeDate={activeDate}
              initialRules={myRules}
              onSave={handleSaveRules}
              saving={saving}
              timeStartMin={meeting.timeStartMin}
              timeEndMin={meeting.timeEndMin}
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