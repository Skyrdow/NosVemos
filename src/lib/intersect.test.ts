import { describe, expect, it } from 'vitest'
import {
  computeIntersections,
  mergeRanges,
  type AllFreeRange,
  type Cell,
  type ParticipantSlot,
  type Rule,
} from './intersect'

function slot(
  participantId: string,
  name: string,
  rules: Rule[],
): ParticipantSlot {
  return { participantId, name, rules }
}

function weekly(dayOfWeek: number, ranges: [number, number][]): Rule {
  return { kind: 'weekly', dayOfWeek, ranges }
}

function oneOff(date: string, ranges: [number, number][]): Rule {
  return { kind: 'one_off', date, ranges }
}

function allFreeOf(ranges: AllFreeRange[]): string {
  return ranges
    .map((r) => `${r.dayOfWeek ?? r.date}:${r.startMin}-${r.endMin}`)
    .join(' | ')
}

describe('computeIntersections — casos obligatorios', () => {
  it('sin solapamiento → 0 celdas allFree', () => {
    const slots = [
      slot('a', 'Ana', [weekly(0, [[9 * 60, 12 * 60]])]),
      slot('b', 'Ben', [weekly(0, [[14 * 60, 17 * 60]])]),
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    expect(allFreeRanges).toHaveLength(0)
    expect(cells.every((c: Cell) => !c.allFree)).toBe(true)
    expect(new Set(cells.map((c: Cell) => c.freeCount))).toEqual(new Set([1]))
  })

  it('solapamiento exacto de 2 personas → 1 hueco allFree correcto', () => {
    const slots = [
      slot('a', 'Ana', [weekly(1, [[9 * 60, 11 * 60]])]),
      slot('b', 'Ben', [weekly(1, [[9 * 60, 11 * 60]])]),
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    expect(allFreeRanges).toHaveLength(1)
    expect(allFreeOf(allFreeRanges)).toBe('1:540-660')
    const hole = allFreeRanges[0]
    expect(hole.dayOfWeek).toBe(1)
    // Cada celda interna debe ser allFree con ambos participantes
    const holeCells = cells.filter(
      (c: Cell) => c.dayOfWeek === 1 && c.allFree,
    )
    expect(holeCells.length).toBe(4) // 2h a 30min
    for (const c of holeCells) {
      expect(c.freeParticipantIds).toEqual(['a', 'b'])
      expect(c.freeCount).toBe(2)
    }
  })

  it('solapamiento parcial → solo la fracción compartida es allFree', () => {
    const slots = [
      slot('a', 'Ana', [weekly(2, [[9 * 60, 12 * 60]])]),
      slot('b', 'Ben', [weekly(2, [[11 * 60, 14 * 60]])]),
    ]
    const { allFreeRanges } = computeIntersections(slots, 30)
    expect(allFreeOf(allFreeRanges)).toBe('2:660-720')
  })

  it('3 personas, una falta en un hueco → allFree solo donde las 3 coinciden', () => {
    const slots = [
      slot('a', 'Ana', [weekly(3, [[9 * 60, 12 * 60]])]),
      slot('b', 'Ben', [weekly(3, [[9 * 60, 12 * 60]])]),
      slot('c', 'Cris', [weekly(3, [[10 * 60, 12 * 60]])]),
    ]
    const { allFreeRanges } = computeIntersections(slots, 30)
    expect(allFreeOf(allFreeRanges)).toBe('3:600-720')
    // El resto de la grilla tiene freeCount 2 o menos, nunca allFree
  })

  it('rangos que se tocan/solapan dentro de una regla → se unen (sin doble marca)', () => {
    expect(mergeRanges([[9 * 60, 12 * 60], [11 * 60, 14 * 60]])).toEqual([
      [9 * 60, 14 * 60],
    ])
    expect(mergeRanges([[9 * 60, 12 * 60], [12 * 60, 14 * 60]])).toEqual([
      [9 * 60, 14 * 60],
    ])
    // Y el motor no cuenta dos veces al mismo participante
    const slots = [
      slot('a', 'Ana', [
        weekly(4, [
          [9 * 60, 11 * 60],
          [10 * 60, 13 * 60],
        ]),
      ]),
      slot('b', 'Ben', [weekly(4, [[9 * 60, 13 * 60]])]),
    ]
    const { cells } = computeIntersections(slots, 30)
    const konkCells = cells.filter((c: Cell) => c.dayOfWeek === 4)
    expect(konkCells.every((c: Cell) => c.freeCount === 2)).toBe(true)
  })

  it('híbrido weekly + one_off sobre la misma persona', () => {
    const slots = [
      slot('a', 'Ana', [
        weekly(5, [[10 * 60, 12 * 60]]),
        oneOff('2026-09-10', [[10 * 60, 12 * 60]]),
      ]),
      slot('b', 'Ben', [
        weekly(5, [[10 * 60, 12 * 60]]),
        oneOff('2026-09-10', [[10 * 60, 12 * 60]]),
      ]),
    ]
    const { cells, allFreeRanges } = computeIntersections(slots, 30)
    expect(allFreeOf(allFreeRanges)).toBe('5:600-720 | 2026-09-10:600-720')
    // Weekly de la misma persona no contamina el día puntual
    expect(cells).toHaveLength(8)
  })

  it('celda one_off usa date y weekly usa dayOfWeek', () => {
    const { cells } = computeIntersections(
      [slot('a', 'Ana', [oneOff('2026-09-10', [[9 * 60, 10 * 60]])])],
      60,
    )
    expect(cells[0].date).toBe('2026-09-10')
    expect(cells[0].startMin).toBe(9 * 60)
    expect(cells[0].endMin).toBe(10 * 60)
  })

  it('valida inputs: rangos inválidos se rechazan', () => {
    const bad: Array<() => unknown> = [
      () => computeIntersections([slot('a', 'Ana', [weekly(0, [[10, 5]])])], 30),
      () => computeIntersections([slot('a', 'Ana', [weekly(0, [[-5, 60]])])], 30),
      () => computeIntersections([slot('a', 'Ana', [weekly(7, [[0, 60]])])], 30),
      () => computeIntersections([slot('a', 'Ana', [weekly(0, [[1440, 1500]])])], 30),
      () => computeIntersections([slot('a', 'Ana', [oneOff('2026-13-40', [[0, 60]])])], 30),
      () => computeIntersections([slot('a', 'Ana', [weekly(0, [[0, 60]])])], 7),
      () => computeIntersections([slot('', 'Ana', [weekly(0, [[0, 60]])])], 30),
    ]
    for (const fn of bad) {
      expect(fn).toThrow()
    }
  })

  it('granularidades 15/30/60 dividen la hora correctamente', () => {
    const slots = [
      slot('a', 'Ana', [weekly(0, [[9 * 60, 10 * 60]])]),
      slot('b', 'Ben', [weekly(0, [[9 * 60, 10 * 60]])]),
    ]
    const f15 = computeIntersections(slots, 15).cells.filter((c) => c.allFree)
    const f30 = computeIntersections(slots, 30).cells.filter((c) => c.allFree)
    const f60 = computeIntersections(slots, 60).cells.filter((c) => c.allFree)
    expect(f15).toHaveLength(4)
    expect(f30).toHaveLength(2)
    expect(f60).toHaveLength(1)
  })
})

describe('perf smoke: 100 participantes < 50ms', () => {
  it('completa el cálculo rápido con 100 personas × 20 rangos', () => {
    const rng = mulberry32(42)
    const slots: ParticipantSlot[] = []
    for (let p = 0; p < 100; p++) {
      const ranges: [number, number][] = []
      for (let r = 0; r < 20; r++) {
        const start = Math.floor(rng() * 24) * 60
        const len = 30 + Math.floor(rng() * 4) * 30
        const end = Math.min(1440, start + len)
        if (start < end) ranges.push([start, end])
      }
      slots.push(slot(`p${p}`, `P${p}`, [weekly(p % 7, ranges)]))
    }

    // Calentamiento
    computeIntersections(slots, 30)

    const t0 = performance.now()
    const result = computeIntersections(slots, 30)
    const elapsed = performance.now() - t0

    expect(elapsed).toBeLessThan(50)
    expect(Array.isArray(result.cells)).toBe(true)
    expect(Array.isArray(result.allFreeRanges)).toBe(true)
    // Con 100 participantes ninguno cubre la semana entera → casi sin allFree
    expect(result.cells.length).toBeGreaterThan(0)
    expect(result.cells[0]!.freeCount).toBeLessThanOrEqual(100)
  })
})

/** PRNG determinista para el test de perf (sin flake). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}