/**
 * Exporta la capa de datos activa:
 * - `VITE_USE_LOCAL=true` → capa en memoria (dev/tests sin credenciales).
 * - Credenciales VITE_SUPABASE_* presentes → capa real de Supabase.
 * - Ninguna de las dos → capa en memoria como fallback seguro.
 */

import type { DataLayer } from './types'
import { MemoryDataLayer } from './memoryDataLayer'
import { createSupabaseDataLayer } from './supabaseDataLayer'

export type { DataLayer } from './types'
export type { Meeting, NewMeeting, Participant, NewParticipant, Slot, NewSlot, Unsubscribe } from './types'
export type { AgendaType } from './types'
export { MemoryDataLayer } from './memoryDataLayer'
export { SupabaseDataLayer } from './supabaseDataLayer'

function resolveLayer(): DataLayer {
  const useLocal = import.meta.env.VITE_USE_LOCAL === 'true'
  if (useLocal) return new MemoryDataLayer()

  const supabase = createSupabaseDataLayer()
  if (supabase !== null) return supabase

  return new MemoryDataLayer()
}

export const dataLayer: DataLayer = resolveLayer()