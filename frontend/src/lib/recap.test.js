import { describe, it, expect } from 'vitest'
import {
  radarOf, topGroups, monthBounds, workoutsBetween, totalsOf, recordsBetween, topExercises,
  longestWeekStreak, heavyThingFor, monthlyCounts, monthRecap, yearRecap, workoutRecap, recapMonths,
} from './recap.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const wo = (d, entries, mins = 60) => {
  const start = new Date(d + 'T18:00:00').getTime()
  return { id: 'w' + d, d, start, end: start + mins * 60000, entries }
}
// 0001 is a catalogue barbell exercise id shape; any id works for the maths below.
const BENCH = 'bench'
const SQUAT = 'squat'

describe('recap periods', () => {
  it('bounds a month, leap February included', () => {
    expect(monthBounds(2024, 1)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthBounds(2026, 11)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('keeps workouts inside the window, oldest first', () => {
    const list = [wo('2026-03-02', []), wo('2026-02-28', []), wo('2026-03-31', []), wo('2026-04-01', [])]
    expect(workoutsBetween(list, '2026-03-01', '2026-03-31').map(w => w.d)).toEqual(['2026-03-02', '2026-03-31'])
  })

  it('totals work sets, volume, time and distinct days', () => {
    const list = [
      wo('2026-03-02', [{ id: BENCH, sets: [set(50, 10, { phase: 'warmup' }), set(100, 5), set(100, 5)] }], 45),
      wo('2026-03-02', [{ id: SQUAT, sets: [set(120, 5), { w: 120, r: 5, done: false }] }], 30),
    ]
    expect(totalsOf(list)).toEqual({ workouts: 2, durationMs: 75 * 60000, volume: 1600, sets: 3, days: 1 })
  })

  it('counts workouts per month of a year', () => {
    const list = [wo('2026-01-05', []), wo('2026-01-07', []), wo('2026-03-01', []), wo('2025-03-01', [])]
    expect(monthlyCounts(list, 2026)).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('lists months with workouts, newest first', () => {
    const list = [wo('2026-01-05', []), wo('2026-03-01', []), wo('2026-03-04', [])]
    expect(recapMonths(list)).toEqual([{ year: 2026, month: 2, count: 2 }, { year: 2026, month: 0, count: 1 }])
  })
})

describe('recordsBetween', () => {
  const history = [
    wo('2026-01-10', [{ id: BENCH, sets: [set(80, 5)] }]),
    wo('2026-02-10', [{ id: BENCH, sets: [set(85, 5)] }, { id: SQUAT, sets: [set(100, 5)] }]),
    wo('2026-02-20', [{ id: BENCH, sets: [set(85, 8)] }]),
    wo('2026-03-01', [{ id: BENCH, sets: [set(90, 3)] }]),
  ]

  it('does not call the first time an exercise is logged a record', () => {
    const r = recordsBetween(history, '2026-01-01', '2026-01-31')
    expect(r.count).toBe(0)
  })

  it('counts heavier sets and higher estimated 1RMs against everything before', () => {
    const r = recordsBetween(history, '2026-02-01', '2026-02-28')
    // 85×5 beat 80×5 (weight + e1RM); 85×8 beat 85×5 on e1RM only; squat was new.
    expect(r.count).toBe(2)
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ id: BENCH, w: 85 })
    expect(r.items[0].e1).toBeCloseTo(107.7, 1)
  })

  it('reads history after the window as not yet happened', () => {
    expect(recordsBetween(history, '2026-01-01', '2026-02-15').count).toBe(1)
  })
})

describe('topExercises and streaks', () => {
  it('ranks exercises by completed work sets', () => {
    const list = [
      wo('2026-01-01', [{ id: BENCH, sets: [set(1, 1), set(1, 1)] }, { id: SQUAT, sets: [set(1, 1)] }]),
      wo('2026-01-03', [{ id: SQUAT, sets: [set(1, 1), set(1, 1), { w: 1, r: 1, done: false }] }]),
    ]
    expect(topExercises(list)).toEqual([{ id: SQUAT, sets: 3 }, { id: BENCH, sets: 2 }])
  })

  it('finds the longest run of consecutive training weeks', () => {
    // Mondays 5, 12, 19 Jan (3 weeks), gap, then 9 and 16 Feb (2 weeks).
    const days = ['2026-01-05', '2026-01-14', '2026-01-19', '2026-02-09', '2026-02-16', '2026-02-17']
    expect(longestWeekStreak(days)).toBe(3)
    expect(longestWeekStreak([])).toBe(0)
  })
})

describe('radar and comparisons', () => {
  it('sums muscles into the six radar groups', () => {
    const r = radarOf({ chest: 2, deltoids: 1, quadriceps: 1, gluteal: 0.5, biceps: 1, abs: 0.25, 'upper-back': 3, 'cardiovascular system': 4 })
    expect(r).toEqual({ back: 3, chest: 2, core: 0.25, shoulders: 1, arms: 1, legs: 1.5 })
    expect(topGroups(r).slice(0, 3)).toEqual(['back', 'chest', 'legs'])
  })

  it('picks the heaviest thing a volume reaches', () => {
    expect(heavyThingFor(13264)).toMatchObject({ one: 'a truck', times: 1.1 })
    expect(heavyThingFor(805000)).toMatchObject({ many: '{0} Statues of Liberty', times: 3.9 })
    expect(heavyThingFor(150)).toMatchObject({ one: 'a grand piano', times: 0.5 })
  })
})

describe('recaps', () => {
  const S = {
    weekStart: 1,
    workouts: [
      wo('2026-01-10', [{ id: BENCH, sets: [set(80, 5)] }]),
      wo('2026-02-03', [{ id: BENCH, sets: [set(85, 5)] }]),
      wo('2026-02-10', [{ id: BENCH, sets: [set(90, 5)] }]),
    ],
  }

  it('builds a month with the month before for comparison', () => {
    const m = monthRecap(S, 2026, 1)
    expect(m.totals.workouts).toBe(2)
    expect(m.prev.workouts).toBe(1)
    expect(m.days).toEqual(['2026-02-03', '2026-02-10'])
    expect(m.records.count).toBe(2)
  })

  it('builds a year with its best month', () => {
    const y = yearRecap(S, 2026)
    expect(y.totals.workouts).toBe(3)
    expect(y.bestMonth).toBe(1)
    expect(y.avgActive).toBe(2)
    expect(y.streak).toBe(2)
  })

  it('numbers a workout in the whole history and reads its own records', () => {
    const r = workoutRecap(S, S.workouts[1])
    expect(r.n).toBe(2)
    expect(r.records.count).toBe(1)
    expect(r.exercises).toBe(1)
  })
})
