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