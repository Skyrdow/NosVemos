import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      timeStartMin: 480,
      timeEndMin: 1200,
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

describe('MemoryDataLayer.updateMeeting', () => {
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
      timeStartMin: 480,
      timeEndMin: 1200,
      agendaType: 'hybrid',
      creatorName: 'Ana',
    })
    const participant = await layer.registerParticipant({
      meetingId: meeting.id,
      name: 'Ana',
    })
    return { meeting, participant }
  }

  it('actualiza los campos pedidos y notifica a los suscriptores', async () => {
    const { meeting } = await fixture()
    const listener = vi.fn()
    layer.subscribeToMeeting(meeting.id, listener)

    const updated = await layer.updateMeeting(meeting.id, {
      granularityMin: 60,
      timezone: 'Europe/Madrid',
      timeStartMin: 600,
      timeEndMin: 1380,
    })

    expect(updated.granularityMin).toBe(60)
    expect(updated.timezone).toBe('Europe/Madrid')
    expect(updated.timeStartMin).toBe(600)
    expect(updated.timeEndMin).toBe(1380)
    // No toca campos no incluidos en el patch
    expect(updated.title).toBe('Retro')
    expect(updated.agendaType).toBe('hybrid')

    const reloaded = await layer.getMeetingBySlug('abcde1')
    expect(reloaded!.granularityMin).toBe(60)

    // El realtime local emite el evento de cambio
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('lanza error si la reunión no existe', async () => {
    await expect(
      layer.updateMeeting('inexistente', { granularityMin: 15 }),
    ).rejects.toThrow('Reunión no encontrada')
  })
})

describe('MemoryDataLayer.clearMeetingSlots', () => {
  let layer: MemoryDataLayer

  beforeEach(() => {
    layer = new MemoryDataLayer()
  })

  it('borra los slots de la reunión indicada y respeta los de otras', async () => {
    const meeting = await layer.createMeeting({
      slug: 'abcde1',
      title: 'Retro',
      timezone: 'UTC',
      granularityMin: 30,
      timeStartMin: 480,
      timeEndMin: 1200,
      agendaType: 'hybrid',
      creatorName: 'Ana',
    })
    const other = await layer.createMeeting({
      slug: 'zzz123',
      title: 'Otra',
      timezone: 'UTC',
      granularityMin: 30,
      timeStartMin: 480,
      timeEndMin: 1200,
      agendaType: 'weekly',
      creatorName: 'Zoe',
    })
    const ana = await layer.registerParticipant({ meetingId: meeting.id, name: 'Ana' })
    const ben = await layer.registerParticipant({ meetingId: meeting.id, name: 'Ben' })
    const zoe = await layer.registerParticipant({ meetingId: other.id, name: 'Zoe' })

    await layer.saveSlots(ana.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])
    await layer.saveSlots(ben.id, [
      { kind: 'weekly', dayOfWeek: 1, date: null, ranges: [[600, 660]] },
    ])
    await layer.saveSlots(zoe.id, [
      { kind: 'weekly', dayOfWeek: 2, date: null, ranges: [[660, 720]] },
    ])

    await layer.clearMeetingSlots(meeting.id)

    expect(await layer.getSlots(ana.id)).toHaveLength(0)
    expect(await layer.getSlots(ben.id)).toHaveLength(0)
    // La otra reunión queda intacta
    expect(await layer.getSlots(zoe.id)).toHaveLength(1)
  })

  it('notifica el cambio a los suscriptores de la reunión', async () => {
    const meeting = await layer.createMeeting({
      slug: 'abcde1',
      title: 'Retro',
      timezone: 'UTC',
      granularityMin: 30,
      timeStartMin: 480,
      timeEndMin: 1200,
      agendaType: 'hybrid',
      creatorName: 'Ana',
    })
    const ana = await layer.registerParticipant({ meetingId: meeting.id, name: 'Ana' })
    await layer.saveSlots(ana.id, [
      { kind: 'weekly', dayOfWeek: 0, date: null, ranges: [[540, 600]] },
    ])

    const listener = vi.fn()
    layer.subscribeToMeeting(meeting.id, listener)
    await layer.clearMeetingSlots(meeting.id)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})