// Recaps: the numbers behind the shareable workout, month and year cards (views/Recap.jsx).
// Pure helpers over S.workouts, like the rest of lib/ — the cards only draw what comes out of here.
//
// Every figure is read from the logged sets, never from what a workout carries about itself:
// imported history has `prs: []` and no reliable `vol`, so records and volume are re-derived
// the same way for a session finished in the app and one that came in from Hevy or Strong.
import { workoutDay, workoutDuration, workoutVolume, workSetsDone, bestWeightForEntry, metricModeForEntry } from './history.js'
import { isWarmupRow, hasCompletedWork } from './workout-model.js'
import { bestSetOf } from './onerm.js'
import { isAssisted } from './exercises.js'
import { loadOfWorkouts } from './muscles.js'
import { weekKey, isoOf, MONDAY } from './format.js'

// The six spokes of the radar chart, and which of the body map's muscles each one sums.
export const RADAR_GROUPS = ['back', 'chest', 'core', 'shoulders', 'arms', 'legs']
const GROUP_OF = {
  trapezius: 'back', 'upper-back': 'back', 'lower-back': 'back',
  chest: 'chest', serratus: 'chest',
  abs: 'core', obliques: 'core',
  deltoids: 'shoulders',
  biceps: 'arms', triceps: 'arms', forearm: 'arms',
  gluteal: 'legs', quadriceps: 'legs', hamstring: 'legs', adductors: 'legs',
  'hip-flexors': 'legs', calves: 'legs', tibialis: 'legs',
}

/** Per-muscle load (lib/muscles.js) summed into the six radar groups. */
export function radarOf(load) {
  const out = Object.fromEntries(RADAR_GROUPS.map(g => [g, 0]))
  for (const slug in load || {}) {
    const g = GROUP_OF[slug]
    if (g) out[g] += Number(load[slug]) || 0
  }
  return out
}

/** Radar groups ordered hardest-worked first, untrained ones dropped. */
export const topGroups = radar => RADAR_GROUPS.filter(g => radar[g] > 0).sort((a, b) => radar[b] - radar[a])

const pad = n => String(n).padStart(2, '0')
/** 'YYYY-MM' → first and last ISO day of that month. */
export function monthBounds(year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` }
}
export const yearBounds = year => ({ from: `${year}-01-01`, to: `${year}-12-31` })

/** Workouts whose calendar day lies in [from, to] (ISO strings, inclusive), oldest first. */
export function workoutsBetween(workouts, from, to) {
  return (workouts || [])
    .map(w => ({ w, d: workoutDay(w) }))
    .filter(x => x.d && x.d >= from && x.d <= to)
    .sort((a, b) => a.d.localeCompare(b.d) || (Number(a.w.start) || 0) - (Number(b.w.start) || 0))
    .map(x => x.w)
}

/** Headline totals for a list of workouts. Imported sessions without a clock add no time. */
export function totalsOf(workouts) {
  const list = workouts || []
  return {
    workouts: list.length,
    durationMs: list.reduce((n, w) => n + workoutDuration(w), 0),
    volume: list.reduce((n, w) => n + workoutVolume(w), 0),
    sets: list.reduce((n, w) => n + workSetsDone(w), 0),
    days: new Set(list.map(workoutDay).filter(Boolean)).size,
  }
}

/** Distinct exercises with at least one completed work set. */
export const exerciseCountOf = w =>
  new Set((w?.entries || []).filter(e => (e.sets || []).some(s => hasCompletedWork(s) && !isWarmupRow(s))).map(e => e.id)).size

/**
 * Personal records set inside [from, to], re-read from the whole history in date order.
 *
 * A record is a heavier top set, or a higher estimated 1RM, than every earlier session of the
 * same exercise. The first time an exercise is ever logged sets no record — there is nothing it
 * beat — or a year of imported history would open with a record on every exercise. Assistance
 * machines (lighter is better) count their weight records and never a 1RM, as in onerm.js.
 *
 * Returns { count, items }: `count` is one per exercise per workout that beat something, `items`
 * one per exercise — its best weight and best estimate inside the window — heaviest first.
 */
export function recordsBetween(workouts, from, to) {
  const best = new Map()   // id → { w, e1 } across everything before the workout being read
  const byEx = new Map()   // id → { id, w, e1, d } best record inside the window
  let count = 0
  for (const w of workoutsBetween(workouts, '0000-01-01', to)) {
    const day = workoutDay(w)
    const inWindow = day >= from
    const seen = new Map()
    for (const e of w.entries || []) {
      if (metricModeForEntry(e) !== 'reps') continue
      const cur = seen.get(e.id) || { w: 0, e1: 0 }
      const wt = bestWeightForEntry(e) || 0
      const assisted = isAssisted(e.id)
      if (wt > 0) cur.w = cur.w > 0 ? (assisted ? Math.min(cur.w, wt) : Math.max(cur.w, wt)) : wt
      const est = bestSetOf(e)?.est || 0
      if (est > cur.e1) cur.e1 = est
      seen.set(e.id, cur)
    }
    for (const [id, cur] of seen) {
      const prev = best.get(id)
      const assisted = isAssisted(id)
      if (prev && inWindow) {
        const wPr = cur.w > 0 && prev.w > 0 && (assisted ? cur.w < prev.w : cur.w > prev.w)
        const ePr = !assisted && cur.e1 > 0 && cur.e1 > prev.e1
        if (wPr || ePr) {
          count++
          const rec = byEx.get(id) || { id, w: 0, e1: 0, d: day }
          if (wPr && (!rec.w || (assisted ? cur.w < rec.w : cur.w > rec.w))) { rec.w = cur.w; rec.d = day }
          if (ePr && cur.e1 > rec.e1) rec.e1 = cur.e1
          byEx.set(id, rec)
        }
      }
      if (!prev) best.set(id, { w: cur.w, e1: cur.e1 })
      else {
        if (cur.w > 0) prev.w = prev.w > 0 ? (assisted ? Math.min(prev.w, cur.w) : Math.max(prev.w, cur.w)) : cur.w
        if (cur.e1 > prev.e1) prev.e1 = cur.e1
      }
    }
  }
  const items = [...byEx.values()].sort((a, b) => (b.w || b.e1) - (a.w || a.e1))
  return { count, items }
}

/** Exercises by completed work sets, most first: [{ id, sets }]. */
export function topExercises(workouts, limit = 4) {
  const n = new Map()
  for (const w of workouts || []) for (const e of w.entries || []) {
    const done = (e.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s)).length
    if (done) n.set(e.id, (n.get(e.id) || 0) + done)
  }
  return [...n].map(([id, sets]) => ({ id, sets })).sort((a, b) => b.sets - a.sets).slice(0, limit)
}

/** Longest run of consecutive weeks (by the profile's first weekday) with at least one workout. */
export function longestWeekStreak(days, ws = MONDAY) {
  const weeks = [...new Set((days || []).map(d => weekKey(d, ws)))].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const wk of weeks) {
    if (prev) {
      const next = new Date(prev + 'T12:00:00')
      next.setDate(next.getDate() + 7)
      run = isoOf(next) === wk ? run + 1 : 1
    } else run = 1
    best = Math.max(best, run)
    prev = wk
  }
  return best
}

// Things that weigh about as much as a volume, lightest first, in kg. The emoji is the picture.
export const HEAVY_THINGS = [
  { kg: 300, emoji: '🎹', one: 'a grand piano', many: '{0} grand pianos' },
  { kg: 1500, emoji: '🚗', one: 'a car', many: '{0} cars' },
  { kg: 6000, emoji: '🐘', one: 'an elephant', many: '{0} elephants' },
  { kg: 12000, emoji: '🚚', one: 'a truck', many: '{0} trucks' },
  { kg: 41000, emoji: '✈️', one: 'a passenger jet', many: '{0} passenger jets' },
  { kg: 150000, emoji: '🐋', one: 'a blue whale', many: '{0} blue whales' },
  { kg: 204000, emoji: '🗽', one: 'the Statue of Liberty', many: '{0} Statues of Liberty' },
  { kg: 7300000, emoji: '🗼', one: 'the Eiffel Tower', many: '{0} Eiffel Towers' },
]

/**
 * What a volume is "like lifting": the heaviest thing it reaches, and how many of them.
 * `times` is rounded to one decimal; under 1.5 it reads as one. Below the lightest thing,
 * the piano is still the comparison, as a fraction.
 */
export function heavyThingFor(volumeKg) {
  const v = Math.max(0, Number(volumeKg) || 0)
  let pick = HEAVY_THINGS[0]
  for (const thing of HEAVY_THINGS) if (v >= thing.kg) pick = thing
  return { ...pick, times: Math.round(v / pick.kg * 10) / 10 }
}

/** Workouts per calendar month of a year: twelve counts. */
export function monthlyCounts(workouts, year) {
  const out = Array(12).fill(0)
  for (const w of workoutsBetween(workouts, `${year}-01-01`, `${year}-12-31`)) out[Number(workoutDay(w).slice(5, 7)) - 1]++
  return out
}

/** Everything the month cards draw. `month` is 0-based. */
export function monthRecap(S, year, month) {
  const { from, to } = monthBounds(year, month)
  const prevM = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 }
  const pb = monthBounds(prevM.y, prevM.m)
  const list = workoutsBetween(S.workouts, from, to)
  return {
    kind: 'month', year, month, from, to,
    totals: totalsOf(list),
    prev: totalsOf(workoutsBetween(S.workouts, pb.from, pb.to)),
    days: [...new Set(list.map(workoutDay))],
    records: recordsBetween(S.workouts, from, to),
    radar: radarOf(loadOfWorkouts(list)),
    top: topExercises(list, 4),
  }
}

/** Everything the year-in-review cards draw. */
export function yearRecap(S, year) {
  const { from, to } = yearBounds(year)
  const list = workoutsBetween(S.workouts, from, to)
  const counts = monthlyCounts(S.workouts, year)
  const active = counts.filter(n => n > 0)
  const bestMonth = counts.indexOf(Math.max(...counts))
  const days = [...new Set(list.map(workoutDay))]
  return {
    kind: 'year', year, from, to,
    totals: totalsOf(list),
    days,
    counts,
    bestMonth: counts[bestMonth] > 0 ? bestMonth : -1,
    avgActive: active.length ? Math.round(active.reduce((a, b) => a + b, 0) / active.length) : 0,
    streak: longestWeekStreak(days, S.weekStart === 0 ? 0 : MONDAY),
    records: recordsBetween(S.workouts, from, to),
    radar: radarOf(loadOfWorkouts(list)),
    top: topExercises(list, 4),
  }
}

/** The cards for one finished workout. `n` is its place in the whole history (1-based). */
export function workoutRecap(S, w) {
  const d = workoutDay(w)
  const all = workoutsBetween(S.workouts, '0000-01-01', '9999-12-31')
  const n = all.indexOf(w) + 1 || all.length
  const records = d ? recordsBetween(S.workouts.filter(x => x === w || workoutDay(x) < d || (workoutDay(x) === d && (Number(x.start) || 0) < (Number(w.start) || 0))), d, d) : { count: 0, items: [] }
  return {
    kind: 'workout', w, d, n,
    totals: totalsOf([w]),
    exercises: exerciseCountOf(w),
    records,
    radar: radarOf(loadOfWorkouts([w])),
  }
}

/** Months that hold at least one workout, newest first: [{ year, month, count }]. */
export function recapMonths(workouts) {
  const n = new Map()
  for (const w of workouts || []) {
    const d = workoutDay(w)
    if (d) n.set(d.slice(0, 7), (n.get(d.slice(0, 7)) || 0) + 1)
  }
  return [...n].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, count]) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) - 1, count }))
}
