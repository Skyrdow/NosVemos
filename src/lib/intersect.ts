/**
 * Motor de intersección de disponibilidad.
 *
 * TS puro (sin DOM, sin React, sin Red): calcula en qué franjas TODOS los
 * participantes están libres y la disponibilidad agregada por celda.
 *
 * Algoritmo por buckets: (díaKey, bucketIdx) → set de participantIds.
 * Antes de marcar, se unen los rangos solapados/tocantes de una misma regla.
 */

export type Rule =
  | { kind: 'weekly'; dayOfWeek: number; ranges: [number, number][] }
  | { kind: 'one_off'; date: string; ranges: [number, number][] }

export interface ParticipantSlot {
  participantId: string
  name: string
  rules: Rule[]
}

export interface Cell {
  dayOfWeek?: number // solo para weekly
  date?: string // solo para one_off
  startMin: number
  endMin: number
  freeCount: number
  freeParticipantIds: string[]
  allFree: boolean
}

export interface AllFreeRange {
  dayOfWeek?: number
  date?: string
  startMin: number
  endMin: number
}

export const ALLOWED_GRANULARITIES = [15, 30, 60, 90, 120] as const
export type Granularity = (typeof ALLOWED_GRANULARITIES)[number]

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/** Valida una regla completa y devuelve true si es correcta. */
export function isValidRule(rule: Rule): boolean {
  if (rule.kind === 'weekly') {
    if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
      return false
    }
  } else {
    if (typeof rule.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rule.date)) {
      return false
    }
    const [y, m, d] = rule.date.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      return false
    }
  }
  return rule.ranges.length > 0 && rule.ranges.every(isValidRange)
}

/** Un rango es válido si está dentro de 0..1440 y start < end. */
export function isValidRange(range: [number, number]): boolean {
  const [start, end] = range
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= 1440 &&
    start < end
  )
}

/** Une rangos que se tocan o solapan dentro de una misma lista ([9,12],[11,14] → [9,14]). */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1]
    if (last !== undefined && s <= last[1]) {
      // Se tocan o solapan → unir (siempre sobre una tupla propia del resultado)
      last[1] = Math.max(last[1], e)
    } else {
      // Copia nueva: nunca se reutiliza una tupla del input
      merged.push([s, e])
    }
  }
  return merged
}

function isGranularitySupported(granularityMin: number): boolean {
  return granularityMin > 0 && 1440 % granularityMin === 0 && granularityMin <= 120
}

function assertValidInput(
  slots: ParticipantSlot[],
  granularityMin: number,
): void {
  if (!Number.isFinite(granularityMin) || !isGranularitySupported(granularityMin)) {
    throw new Error(
      `Granularidad inválida: ${granularityMin}. Debe ser un divisor de 1440 entre 1 y 120.`,
    )
  }
  for (const slot of slots) {
    if (!slot.participantId) {
      throw new Error('Cada participante necesita un participantId no vacío.')
    }
    for (const rule of slot.rules) {
      if (!isValidRule(rule)) {
        throw new Error(
          `Regla inválida para el participante "${slot.name ?? slot.participantId}".`,
        )
      }
    }
  }
}

function ruleDayKey(rule: Rule): string {
  return rule.kind === 'weekly' ? `w:${rule.dayOfWeek}` : `d:${rule.date}`
}

/**
 * Calcula las intersecciones de disponibilidad de todos los participantes.
 *
 * Devuelve `cells` ordenadas por día y bucket, y `allFreeRanges`: rangos
 * contiguos (en buckets) donde todos están libres, comprimidos por día.
 */
export function computeIntersections(
  slots: ParticipantSlot[],
  granularityMin: number,
): { cells: Cell[]; allFreeRanges: AllFreeRange[] } {
  assertValidInput(slots, granularityMin)

  if (slots.length === 0) {
    return { cells: [], allFreeRanges: [] }
  }

  const total = slots.length
  // (díaKey, bucketIdx) → set de participantIds libres
  const buckets = new Map<string, Set<string>>()
  const key = (dayKey: string, bucket: number) => `${dayKey}|${bucket}`

  for (const slot of slots) {
    for (const rule of slot.rules) {
      const dayKey = ruleDayKey(rule)
      for (const [start, end] of mergeRanges(rule.ranges)) {
        const firstBucket = Math.floor(start / granularityMin)
        const lastBucket = Math.floor((end - 1) / granularityMin)
        for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
          const mapKey = key(dayKey, bucket)
          let set = buckets.get(mapKey)
          if (set === undefined) {
            set = new Set()
            buckets.set(mapKey, set)
          }
          set.add(slot.participantId)
        }
      }
    }
  }

  // Ordenar buckets: primero por díaKey (weekly 0..6 antes que fechas), luego por bucket.
  const sortedKeys = [...buckets.keys()].sort((a, b) => {
    const [dayA, bucketA] = a.split('|')
    const [dayB, bucketB] = b.split('|')
    const dayCmp = compareDayKeys(dayA, dayB)
    return dayCmp !== 0 ? dayCmp : Number(bucketA) - Number(bucketB)
  })

  const cells: Cell[] = []
  const allFreeRanges: AllFreeRange[] = []
  let currentRange: AllFreeRange | null = null

  for (const mapKey of sortedKeys) {
    const [dayKey, bucketIdx] = mapKey.split('|')
    const freeParticipantIds = [...buckets.get(mapKey)!].sort()
    const freeCount = freeParticipantIds.length
    const allFree = freeCount === total

    const cell: Cell = {
      ...dayFieldsOf(dayKey),
      startMin: Number(bucketIdx) * granularityMin,
      endMin: (Number(bucketIdx) + 1) * granularityMin,
      freeCount,
      freeParticipantIds,
      allFree,
    }
    cells.push(cell)

    if (allFree) {
      if (
        currentRange !== null &&
        sameDay(currentRange, cell) &&
        currentRange.endMin === cell.startMin
      ) {
        currentRange.endMin = cell.endMin
      } else {
        currentRange = {
          ...dayFieldsOf(dayKey),
          startMin: cell.startMin,
          endMin: cell.endMin,
        }
        allFreeRanges.push(currentRange)
      }
    } else {
      currentRange = null
    }
  }

  return { cells, allFreeRanges }
}

function compareDayKeys(a: string, b: string): number {
  if (a === b) return 0
  const aWeekly = a.startsWith('w:')
  const bWeekly = b.startsWith('w:')
  if (aWeekly && bWeekly) return Number(a.slice(2)) - Number(b.slice(2))
  if (aWeekly) return -1 // primero weekly, luego fechas
  if (bWeekly) return 1
  return a.slice(2).localeCompare(b.slice(2))
}

function dayFieldsOf(dayKey: string): { dayOfWeek?: number; date?: string } {
  if (dayKey.startsWith('w:')) return { dayOfWeek: Number(dayKey.slice(2)) }
  return { date: dayKey.slice(2) }
}

function sameDay(a: AllFreeRange, b: AllFreeRange): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.date === b.date
}