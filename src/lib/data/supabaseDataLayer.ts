/**
 * Data layer sobre Supabase (Postgres + Realtime).
 * Misma interfaz que memoryDataLayer. Toda lectura/escritura pasa por aquí
 * usando RLS del MVP de link compartido.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  DataLayer,
  Meeting,
  MeetingPatch,
  NewMeeting,
  NewParticipant,
  NewSlot,
  Participant,
  Slot,
  Unsubscribe,
} from './types'

interface MeetingRow {
  id: string
  slug: string
  title: string
  timezone: string
  granularity_min: number
  time_start_min: number
  time_end_min: number
  agenda_type: string
  creator_name: string | null
  created_at: string
}

interface ParticipantRow {
  id: string
  meeting_id: string
  name: string
  created_at: string
}

interface SlotRow {
  id: string
  participant_id: string
  kind: string
  day_of_week: number | null
  date: string | null
  ranges: [number, number][]
}

function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    timezone: row.timezone,
    granularityMin: row.granularity_min,
    timeStartMin: row.time_start_min,
    timeEndMin: row.time_end_min,
    agendaType: row.agenda_type as Meeting['agendaType'],
    creatorName: row.creator_name,
    createdAt: row.created_at,
  }
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    name: row.name,
    createdAt: row.created_at,
  }
}

function toSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    participantId: row.participant_id,
    kind: row.kind as Slot['kind'],
    dayOfWeek: row.day_of_week,
    date: row.date,
    ranges: row.ranges,
  }
}

export class SupabaseDataLayer implements DataLayer {
  readonly client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey)
  }

  async createMeeting(data: NewMeeting): Promise<Meeting> {
    const { data: row, error } = await this.client
      .from('meetings')
      .insert({
        slug: data.slug,
        title: data.title,
        timezone: data.timezone,
        granularity_min: data.granularityMin,
        time_start_min: data.timeStartMin,
        time_end_min: data.timeEndMin,
        agenda_type: data.agendaType,
        creator_name: data.creatorName,
      })
      .select()
      .single()
    if (error !== null) throw error
    return toMeeting(row as MeetingRow)
  }

  async getMeetingBySlug(slug: string): Promise<Meeting | null> {
    const { data, error } = await this.client
      .from('meetings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error !== null) throw error
    return data ? toMeeting(data as MeetingRow) : null
  }

  async registerParticipant(data: NewParticipant): Promise<Participant> {
    const { data: row, error } = await this.client
      .from('participants')
      .insert({ meeting_id: data.meetingId, name: data.name })
      .select()
      .single()
    if (error !== null) {
      // Violación de unique (meeting, name) → devolver el existente
      if (isUniqueViolation(error)) {
        const existing = await this.getParticipants(data.meetingId)
        const found = existing.find((p) => p.name === data.name)
        if (found) return found
      }
      throw error
    }
    return toParticipant(row as ParticipantRow)
  }

  async getParticipants(meetingId: string): Promise<Participant[]> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true })
    if (error !== null) throw error
    return (data as ParticipantRow[]).map(toParticipant)
  }

  async getSlots(participantId: string): Promise<Slot[]> {
    const { data, error } = await this.client
      .from('slots')
      .select('*')
      .eq('participant_id', participantId)
    if (error !== null) throw error
    return (data as SlotRow[]).map(toSlot)
  }

  async saveSlots(participantId: string, slots: NewSlot[]): Promise<Slot[]> {
    // En un MVP basta con borrar y reinsertar las reglas del participante
    const { error: delError } = await this.client
      .from('slots')
      .delete()
      .eq('participant_id', participantId)
    if (delError !== null) throw delError

    if (slots.length === 0) return []

    const rows = slots.map((s) => ({
      participant_id: participantId,
      kind: s.kind,
      day_of_week: s.dayOfWeek,
      date: s.date,
      ranges: s.ranges,
    }))
    const { data, error } = await this.client.from('slots').insert(rows).select()
    if (error !== null) throw error
    return (data as SlotRow[]).map(toSlot)
  }

  async updateMeeting(id: string, patch: MeetingPatch): Promise<Meeting> {
    const fields: Record<string, unknown> = {}
    if (patch.title !== undefined) fields.title = patch.title
    if (patch.timezone !== undefined) fields.timezone = patch.timezone
    if (patch.granularityMin !== undefined) fields.granularity_min = patch.granularityMin
    if (patch.timeStartMin !== undefined) fields.time_start_min = patch.timeStartMin
    if (patch.timeEndMin !== undefined) fields.time_end_min = patch.timeEndMin
    if (patch.agendaType !== undefined) fields.agenda_type = patch.agendaType
    const { data, error } = await this.client
      .from('meetings')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error !== null) throw error
    return toMeeting(data as MeetingRow)
  }

  async clearMeetingSlots(meetingId: string): Promise<void> {
    const participants = await this.getParticipants(meetingId)
    const ids = participants.map((p) => p.id)
    if (ids.length === 0) return
    const { error } = await this.client
      .from('slots')
      .delete()
      .in('participant_id', ids)
    if (error !== null) throw error
  }

  subscribeToMeeting(meetingId: string, onChange: () => void): Unsubscribe {
    const channel = this.client
      .channel(`meeting:${meetingId}`)
      // Opciones de la reunión (granularidad/zona/agenda) editadas por el creador.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings', filter: `id=eq.${meetingId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `meeting_id=eq.${meetingId}` },
        onChange,
      )
      // MVP: no se puede filtrar slots por reunión sin join; se escucha la
      // tabla entera y el callback recarga solo los datos de esta reunión
      // (lectura idempotente y barata a esta escala).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, onChange)
      .subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return (error as { code?: string }).code === '23505'
}

/** Instancia por defecto si hay credenciales VITE_* en el entorno. */
export function createSupabaseDataLayer(): SupabaseDataLayer | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) return null
  return new SupabaseDataLayer(url, key)
}