/**
 * Utilidades compartidas de la app (formato, slugs, fechas).
 */

import { DAY_LABELS } from './intersect'

/** Genera un slug de 5-6 caracteres, minúsculas, sin caracteres ambiguos. */
export function generateSlug(length = 6): string {
  // Sin mayúsculas ni 0/O/1/l/I/-
  const charset = 'abcdefghijkmnpqrstuvwxyz23456789'
  let slug = ''
  for (let i = 0; i < length; i++) {
    slug += charset[Math.floor(Math.random() * charset.length)]
  }
  return slug
}

/** Formatea minutos desde medianoche como HH:MM (24h). */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Formatea una fecha YYYY-MM-DD como "DD/MM". */
export function formatShortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

/** Etiqueta legible de una fecha YYYY-MM-DD. */
export function formatFullDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    // La fecha se construyó en UTC: sin esta opción la zona local (p. ej. UTC-3)
    // correría el día y mostraría la fecha anterior.
    timeZone: 'UTC',
  })
}

/** Etiqueta de día de semana de Izq. semanal (0=Lun). */
export function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? String(dayOfWeek)
}

/** Nombre de archivo/JS Date → fecha YYYY-MM-DD (UTC local). */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Fecha de hoy en YYYY-MM-DD. */
export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * Sube/limpia un string a formato "Nombre normalizado".
 * Usado como clave estable del participante en sessionStorage.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 60)
}

const STORAGE_KEY = 'nosvemos:me'

/** Guarda el participante actual (id) de una reunión en sessionStorage. */
export function rememberParticipant(meetingId: string, participantId: string): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[meetingId] = participantId
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // sessionStorage puede no estar disponible (SSR/webviews) → ignorar
  }
}

/** Recupera el participante guardado de una reunión, si existe. */
export function getRememberedParticipant(meetingId: string): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    return map[meetingId] ?? null
  } catch {
    return null
  }
}

/** Nombre humanizado de la zona horaria del navegador. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Preajustes de zona horaria ofrecidos en los selects de la app. */
export const TIMEZONE_PRESETS = [
  'UTC',
  'America/Buenos_Aires',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Lisbon',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
] as const

/**
 * Opciones del select de zona horaria.
 * Si la zona del navegador no está en los preajustes, se agrega primero
 * etiquetada como "(tu zona)" para que siempre haya una opción válida.
 */
export function getTimezoneOptions(): { value: string; label: string }[] {
  const browser = browserTimezone()
  const options: { value: string; label: string }[] = []
  if (!TIMEZONE_PRESETS.includes(browser as (typeof TIMEZONE_PRESETS)[number])) {
    options.push({ value: browser, label: `${browser} (tu zona)` })
  }
  for (const tz of TIMEZONE_PRESETS) {
    options.push({ value: tz, label: tz })
  }
  return options
}

const CREATOR_KEY = 'nosvemos:creator'

/** Marca el dispositivo actual como creador de una reunión (sessionStorage). */
export function rememberCreator(meetingId: string): void {
  try {
    const raw = sessionStorage.getItem(CREATOR_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    if (!list.includes(meetingId)) list.push(meetingId)
    sessionStorage.setItem(CREATOR_KEY, JSON.stringify(list))
  } catch {
    // sessionStorage puede no estar disponible (SSR/webviews) → ignorar
  }
}

/** True si este dispositivo creó la reunión indicada. */
export function isCreatorOf(meetingId: string): boolean {
  try {
    const raw = sessionStorage.getItem(CREATOR_KEY)
    if (!raw) return false
    const list = JSON.parse(raw) as string[]
    return list.includes(meetingId)
  } catch {
    return false
  }
}

function parseISODate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toUTCISO(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Lunes (en formato YYYY-MM-DD) de la semana que contiene `dateISO`. */
export function mondayOf(dateISO: string): string {
  const date = parseISODate(dateISO)
  const dow = (date.getUTCDay() + 6) % 7 // 0 = lunes
  return toUTCISO(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dow)),
  )
}

/** Suma días (puede ser negativo) a una fecha YYYY-MM-DD. */
export function addDaysISO(dateISO: string, days: number): string {
  const date = parseISODate(dateISO)
  return toUTCISO(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)),
  )
}

/** True si `dateISO` está entre startISO y endISO (inclusive). */
export function dateInRange(dateISO: string, startISO: string, endISO: string): boolean {
  return dateISO >= startISO && dateISO <= endISO
}