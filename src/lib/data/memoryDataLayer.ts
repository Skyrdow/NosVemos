/**
 * Data layer en memoria — misma interfaz que supabaseDataLayer.
 * Permite desarrollo, preview y tests sin credenciales.
 * Simula el realtime con un pequeño emisor de eventos por reunión.
 */

import type {
  DataLayer,
  Meeting,
  NewMeeting,
  NewParticipant,
  NewSlot,
  Participant,
  Slot,
  Unsubscribe,
} from './types'

type Listener = () => void

function cuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export class MemoryDataLayer implements DataLayer {
  private meetings = new Map<string, Meeting>()
  private participants = new Map<string, Participant>()
  private slots = new Map<string, Slot>()
  private listeners = new Map<string, Set<Listener>>()

  /** Vacía todos los datos. Útil en tests para aislar entre casos. */
  reset(): void {
    this.meetings.clear()
    this.participants.clear()
    this.slots.clear()
    this.listeners.clear()
  }

  async createMeeting(data: NewMeeting): Promise<Meeting> {
    const meeting: Meeting = {
      id: cuid(),
      slug: data.slug,
      title: data.title,
      timezone: data.timezone,
      granularityMin: data.granularityMin,
      durationHintMin: data.durationHintMin,
      agendaType: data.agendaType,
      creatorName: data.creatorName,
      createdAt: new Date().toISOString(),
    }
    this.meetings.set(meeting.id, meeting)
    return meeting
  }

  async getMeetingBySlug(slug: string): Promise<Meeting | null> {
    for (const meeting of this.meetings.values()) {
      if (meeting.slug === slug) return meeting
    }
    return null
  }

  async registerParticipant(data: NewParticipant): Promise<Participant> {
    // Al ser el par (meeting, name) único, devolver el existente si ya está
    const existing = [...this.participants.values()].find(
      (p) => p.meetingId === data.meetingId && p.name === data.name,
    )
    if (existing) {
      this.notify(data.meetingId)
      return existing
    }
    const participant: Participant = {
      id: cuid(),
      meetingId: data.meetingId,
      name: data.name,
      createdAt: new Date().toISOString(),
    }
    this.participants.set(participant.id, participant)
    this.notify(data.meetingId)
    return participant
  }

  async getParticipants(meetingId: string): Promise<Participant[]> {
    return [...this.participants.values()]
      .filter((p) => p.meetingId === meetingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async getSlots(participantId: string): Promise<Slot[]> {
    return [...this.slots.values()].filter((s) => s.participantId === participantId)
  }

  async saveSlots(participantId: string, slots: NewSlot[]): Promise<Slot[]> {
    // Sustituir todas las reglas del participante
    for (const slot of [...this.slots.values()]) {
      if (slot.participantId === participantId) this.slots.delete(slot.id)
    }
    const saved: Slot[] = slots.map((slot) => {
      const full: Slot = { id: cuid(), participantId, ...slot }
      this.slots.set(full.id, full)
      return full
    })
    const meeting = [...this.participants.values()].find(
      (p) => p.id === participantId,
    )
    if (meeting) this.notify(meeting.meetingId)
    else {
      const slotMeeting = [...this.slots.values()][0]
      if (slotMeeting) {
        const owner = this.participants.get(slotMeeting.participantId)
        if (owner) this.notify(owner.meetingId)
      }
    }
    return saved
  }

  subscribeToMeeting(meetingId: string, onChange: () => void): Unsubscribe {
    let set = this.listeners.get(meetingId)
    if (set === undefined) {
      set = new Set()
      this.listeners.set(meetingId, set)
    }
    set.add(onChange)
    return () => {
      const current = this.listeners.get(meetingId)
      current?.delete(onChange)
      if (current?.size === 0) this.listeners.delete(meetingId)
    }
  }

  private notify(meetingId: string): void {
    const set = this.listeners.get(meetingId)
    if (set === undefined) return
    for (const listener of [...set]) {
      // Emisión asíncrona para no bloquear la mutación que la provocó
      queueMicrotask(listener)
    }
  }
}