/**
 * Helpers puros para convertir entre "reglas" (modelo del motor) y
 * "slots" (modelo persistido), y entre selección de grilla y reglas.
 */

import type { Rule } from './intersect'
import type { NewSlot, Slot } from './data/types'

export type DayKey = `w:${number}` | `d:${string}`

/** Convierte buckets seleccionados contiguos en rangos [startMin, endMin]. */
export function bucketsToRanges(
  buckets: Iterable<number>,
  granularityMin: number,
): [number, number][] {
  const sorted = [...buckets].sort((a, b) => a - b)
  const ranges: [number, number][] = []
  if (sorted.length === 0) return ranges

  let start = sorted[0]!
  let prev = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const bucket = sorted[i]!
    if (bucket === prev + 1) {
      prev = bucket
      continue
    }
    ranges.push([start * granularityMin, (prev + 1) * granularityMin])
    start = bucket
    prev = bucket
  }
  ranges.push([start * granularityMin, (prev + 1) * granularityMin])
  return ranges
}

/** Marca los buckets (de granularidad) que cubre un rango. */
export function rangeToBuckets(
  range: [number, number],
  granularityMin: number,
): number[] {
  const [start, end] = range
  const buckets: number[] = []
  for (let b = Math.floor(start / granularityMin); b < Math.ceil(end / granularityMin); b++) {
    buckets.push(b)
  }
  return buckets
}

/** Semántica de difusión por buckets contiguos (marca bucket si cubre >= 1 minuto). */
export function selectionToRules(
  selection: Map<DayKey, Set<number>>,
  granularityMin: number,
): Rule[] {
  const rules: Rule[] = []
  const sortedKeys = [...selection.keys()].sort((a, b) => {
    const [ka, kb] = [a.split(':')[0]!, b.split(':')[0]!]
    if (ka !== kb) return ka === 'w' ? -1 : 1
    return a.localeCompare(b)
  })

  for (const dayKey of sortedKeys) {
    const buckets = selection.get(dayKey)
    if (!buckets || buckets.size === 0) continue
    const ranges = bucketsToRanges(buckets, granularityMin)
    if (ranges.length === 0) continue
    const [kind, value] = dayKey.split(':') as ['w' | 'd', string]
    if (kind === 'w') {
      rules.push({ kind: 'weekly', dayOfWeek: Number(value), ranges })
    } else {
      rules.push({ kind: 'one_off', date: value, ranges })
    }
  }
  return rules
}

/** Convierte reglas iniciales en el mapa de selección de la grilla. */
export function rulesToSelection(
  rules: Rule[],
  granularityMin: number,
): Map<DayKey, Set<number>> {
  const selection = new Map<DayKey, Set<number>>()
  for (const rule of rules) {
    const key: DayKey =
      rule.kind === 'weekly' ? `w:${rule.dayOfWeek}` : `d:${rule.date}`
    let buckets = selection.get(key)
    if (buckets === undefined) {
      buckets = new Set()
      selection.set(key, buckets)
    }
    for (const range of rule.ranges) {
      for (const bucket of rangeToBuckets(range, granularityMin)) {
        buckets.add(bucket)
      }
    }
  }
  return selection
}

/** Reglas → slots persistibles. */
export function rulesToSlots(rules: Rule[]): NewSlot[] {
  return rules.map((rule) =>
    rule.kind === 'weekly'
      ? { kind: 'weekly', dayOfWeek: rule.dayOfWeek, date: null, ranges: rule.ranges }
      : { kind: 'one_off', dayOfWeek: null, date: rule.date, ranges: rule.ranges },
  )
}

/** Un slot persistido → regla del motor. */
export function slotToRule(slot: Slot): Rule {
  return slot.kind === 'weekly'
    ? { kind: 'weekly', dayOfWeek: slot.dayOfWeek ?? 0, ranges: slot.ranges }
    : { kind: 'one_off', date: slot.date ?? '', ranges: slot.ranges }
}