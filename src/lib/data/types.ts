/**
 * Tipos del data layer — interfaz única usada por supabaseDataLayer (producción)
 * y memoryDataLayer (desarrollo/tests).
 */

export type AgendaType = 'weekly' | 'one_off' | 'hybrid'

export interface Meeting {
  id: string
  slug: string
  title: string
  timezone: string
  granularityMin: number
  durationHintMin: number | null
  agendaType: AgendaType
  creatorName: string | null
  createdAt: string
}

export interface NewMeeting {
  slug: string
  title: string
  timezone: string
  granularityMin: number
  durationHintMin: number | null
  agendaType: AgendaType
  creatorName: string | null
}

export interface Participant {
  id: string
  meetingId: string
  name: string
  createdAt: string
}

export interface NewParticipant {
  meetingId: string
  name: string
}

export type SlotKind = 'weekly' | 'one_off'

export interface Slot {
  id: string
  participantId: string
  kind: SlotKind
  dayOfWeek: number | null
  date: string | null
  ranges: [number, number][]
}

export interface NewSlot {
  kind: SlotKind
  dayOfWeek: number | null
  date: string | null
  ranges: [number, number][]
}

export type Unsubscribe = () => void

export interface DataLayer {
  createMeeting(meeting: NewMeeting): Promise<Meeting>
  getMeetingBySlug(slug: string): Promise<Meeting | null>
  registerParticipant(data: NewParticipant): Promise<Participant>
  /** Devuelve el participante ya existente si el (meeting, name) ya está registrado. */
  getParticipants(meetingId: string): Promise<Participant[]>
  getSlots(participantId: string): Promise<Slot[]>
  /** Sustituye TODAS las reglas del participante por `slots`. */
  saveSlots(participantId: string, slots: NewSlot[]): Promise<Slot[]>
  /** Suscripción a cambios (participants/slots) de una reunión. Devuelve unsubscribe. */
  subscribeToMeeting(meetingId: string, onChange: () => void): Unsubscribe
}