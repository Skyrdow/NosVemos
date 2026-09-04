import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryDataLayer } from './memoryDataLayer'

describe('MemoryDataLayer.saveSlots (semántica de reemplazo)', () => {
  let layer: MemoryDataLayer

  beforeEach(() => {
    layer = new MemoryDataLayer()
  })

  async function fixture() {
    const meeting = await layer.createMeeting({
      slug: 'abcde1',
      title: 'Retro',
      timezone: 'UTC',
      granularityMin: 30,
      durationHintMin: 60,
      agendaType: 'hybrid',
      creatorName: 'Ana',
    })
    const participant = await layer.registerParticipant({
      meetingId: meeting.id,
      name: 'Ana',
    })
    return { meeting, participant }
  }

  it('reemplaza las reglas en la segunda llamada sin dejar duplicados', async () => {
    const { participant } = await fixture()

    // Versión 1: dos reglas semanales
    const v1 = await layer.saveSlots(participant.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
      { kind: 'weekly', dayOfWeek: 1, date: null, ranges: [[600, 660]] },
    ])
    expect(v1).toHaveLength(2)

    // Versión 2: solo una regla distinta (reemplaza, no acumula)
    const v2 = await layer.saveSlots(participant.id, [
      { kind: 'weekly', dayOfWeek: 5, date: null, ranges: [[480, 540]] },
    ])
    expect(v2).toHaveLength(1)

    const after = await layer.getSlots(participant.id)
    expect(after).toHaveLength(1)
    expect(after[0]!.dayOfWeek).toBe(5)
    expect(after[0]!.ranges).toEqual([[480, 540]])
    // No queda ni la primera versión ni mezclas de ambas
    expect(after.map((s) => s.dayOfWeek)).not.toContain(0)
    expect(after.map((s) => s.dayOfWeek)).not.toContain(1)
  })

  it('vacía los slots del participante al guardar una lista vacía', async () => {
    const { participant } = await fixture()
    await layer.saveSlots(participant.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])

    const cleared = await layer.saveSlots(participant.id, [])
    expect(cleared).toHaveLength(0)
    expect(await layer.getSlots(participant.id)).toHaveLength(0)
  })

  it('persiste un reemplazo de un_off → weekly sin regresar a la versión anterior', async () => {
    const { participant } = await fixture()
    await layer.saveSlots(participant.id, [
      { kind: 'one_off', dayOfWeek: null, date: '2026-09-10', ranges: [[600, 720]] },
    ])

    await layer.saveSlots(participant.id, [
      { kind: 'weekly', dayOfWeek: 2, date: null, ranges: [[540, 660]] },
    ])

    const after = await layer.getSlots(participant.id)
    expect(after).toHaveLength(1)
    expect(after[0]!.kind).toBe('weekly')
    expect(after[0]!.dayOfWeek).toBe(2)
    expect(after[0]!.date).toBeNull()
    // La vieja regla one_off ya no existe
    expect(after.some((s) => s.kind === 'one_off')).toBe(false)
  })
})