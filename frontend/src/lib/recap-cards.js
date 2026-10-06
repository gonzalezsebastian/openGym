// Draws the shareable recap cards onto a <canvas> (views/Recap.jsx). The numbers come from
// lib/recap.js; this file only lays them out. Canvas rather than a screenshot of the DOM, so the
// picture that is shared is exactly the one on screen and no dependency is needed to make it.
import { t, dateLocale, exerciseNameFor } from './i18n.js'
import { EXIDX, imgSrc } from './exercises.js'
import { fmtNum, fmtDur, weekOrder } from './format.js'
import { heavyThingFor, topGroups } from './recap.js'

export const W = 1080
export const H = 1350
const P = 84
const FONT = '-apple-system, "SF Pro Display", system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif, "Apple Color Emoji", "Noto Color Emoji"'
const GOLD = '#f2b200'
const LB_KG = 0.45359237

/** Colours for one background choice: 'light', 'dark' or 'transparent'. */
export function paletteOf(bg, accent = '#30d158', onAccent = '#000') {
  if (bg === 'dark') return { bg: '#10141d', ink: '#ffffff', sub: '#8d95a8', grid: '#2b3243', chip: '#1e2534', acc: accent, onAcc: onAccent, bar: '#ffffff', barInk: '#10141d' }
  if (bg === 'transparent') return { bg: null, ink: '#ffffff', sub: 'rgba(255,255,255,.82)', grid: 'rgba(255,255,255,.4)', chip: 'rgba(255,255,255,.2)', acc: accent, onAcc: onAccent, bar: '#ffffff', barInk: '#10141d', shadow: true }
  return { bg: '#ffffff', ink: '#0b1b33', sub: '#8a93a6', grid: '#e4e8ef', chip: '#eef1f6', acc: accent, onAcc: onAccent, bar: '#0b1b33', barInk: '#ffffff' }
}

// ── formatting ────────────────────────────────────────────────────────────────────────────
const num = (n, d = 0) => Number(n || 0).toLocaleString(dateLocale(), { maximumFractionDigits: d })
/** 48 600 → "48.6k", 805 000 → "805k": the short form a card has room for. */
export function compact(v) {
  const n = Math.abs(Number(v) || 0)
  if (n >= 1e6) return num(v / 1e6, 1) + 'M'
  if (n >= 1e5) return num(Math.round(v / 1000)) + 'k'
  if (n >= 1e4) return num(v / 1000, 1) + 'k'
  return fmtNum(v)
}
const hours = ms => (ms >= 3600000 * 10 ? t('{0} h', num(ms / 3600000)) : fmtDur(ms))
const cap = s => (s ? s[0].toLocaleUpperCase(dateLocale()) + s.slice(1) : s)
const monthName = (y, m) => cap(new Date(y, m, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }))
const exName = (id, fallback) => (EXIDX[id] ? cap(exerciseNameFor(EXIDX[id])) : fallback || id)
const exImg = id => (EXIDX[id]?.img ? imgSrc(EXIDX[id]) : null)
const GROUP_LABEL = { back: 'back', chest: 'Chest', core: 'Core', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs' }
const listJoin = parts => (parts.length < 2 ? parts.join('') : t('{0} and {1}', parts.slice(0, -1).join(', '), parts.at(-1)))

// ── drawing primitives ────────────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}
function text(ctx, s, x, y, { size = 40, weight = 400, color, align = 'left', max } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  let str = String(s)
  // Too wide: shrink first (a number cut short says nothing), down to 60%, then cut the end.
  if (max && ctx.measureText(str).width > max) {
    const fit = Math.max(size * 0.6, Math.floor(size * max / ctx.measureText(str).width))
    ctx.font = `${weight} ${fit}px ${FONT}`
  }
  if (max) while (str.length > 1 && ctx.measureText(str).width > max) str = str.slice(0, -2) + '…'
  ctx.fillText(str, x, y)
}
/** Centered text wrapped onto as many lines as it needs; returns the y below the last line. */
function wrap(ctx, s, cx, y, { size = 50, weight = 700, color, max = W - 2 * P, lh = 1.2 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`
  const lines = []
  let line = ''
  for (const word of String(s).split(' ')) {
    const next = line ? line + ' ' + word : word
    if (line && ctx.measureText(next).width > max) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  lines.forEach((l, i) => text(ctx, l, cx, y + i * size * lh, { size, weight, color, align: 'center' }))
  return y + (lines.length - 1) * size * lh
}
function thumb(ctx, img, cx, cy, r, pal) {
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'; ctx.fill()
  ctx.clip()
  if (img) {
    const s = Math.min(img.width, img.height)
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, cx - r, cy - r, 2 * r, 2 * r)
  }
  ctx.restore()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 4; ctx.strokeStyle = pal.grid; ctx.stroke()
}

// No footer: the whole card is the content, so the type can be as large as the card allows.
function frame(ctx, pal, { eyebrow, title }) {
  ctx.clearRect(0, 0, W, H)
  if (pal.bg) { rr(ctx, 0, 0, W, H, 64); ctx.fillStyle = pal.bg; ctx.fill() }
  if (pal.shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12 }
  if (eyebrow) text(ctx, eyebrow, P, 140, { size: 42, color: pal.sub, max: W - 2 * P })
  if (title) text(ctx, title, P, 228, { size: 72, weight: 800, color: pal.ink, max: W - 2 * P })
}

function statGrid(ctx, pal, items, y0, { cols = 2, gap = 380 } = {}) {
  const cw = (W - 2 * P) / cols
  items.forEach((it, i) => {
    const x = P + (i % cols) * cw
    const y = y0 + Math.floor(i / cols) * gap
    text(ctx, it.label, x, y, { size: 46, color: pal.sub, max: cw - 20 })
    text(ctx, it.value, x, y + 106, { size: 100, weight: 800, color: pal.ink, max: cw - 20 })
    if (it.delta) text(ctx, it.delta, x, y + 166, { size: 40, color: pal.sub, max: cw - 20 })
  })
}
const delta = (cur, prev, fmt = v => num(v)) => {
  const d = cur - prev
  if (d === 0) return ''
  return (d > 0 ? '↑ ' : '↓ ') + fmt(Math.abs(d))
}

// Hexagon radar, spokes in the order Hevy reads them clockwise from the top left.
const RADAR_ORDER = ['back', 'legs', 'chest', 'arms', 'core', 'shoulders']
function radar(ctx, pal, values, cx, cy, r) {
  const max = Math.max(...RADAR_ORDER.map(g => values[g] || 0)) || 1
  const pt = (i, f) => {
    const a = (-120 + i * 60) * Math.PI / 180
    return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f]
  }
  ctx.lineWidth = 3; ctx.strokeStyle = pal.grid
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath()
    RADAR_ORDER.forEach((_, i) => { const [x, y] = pt(i, ring / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
    ctx.closePath(); ctx.stroke()
  }
  RADAR_ORDER.forEach((_, i) => { const [x, y] = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke() })
  ctx.beginPath()
  RADAR_ORDER.forEach((g, i) => { const [x, y] = pt(i, Math.max(0.04, (values[g] || 0) / max)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
  ctx.closePath()
  ctx.globalAlpha = 0.35; ctx.fillStyle = pal.acc; ctx.fill(); ctx.globalAlpha = 1
  ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = pal.acc; ctx.stroke()
  RADAR_ORDER.forEach((g, i) => {
    const [x, y] = pt(i, 1.24)
    text(ctx, cap(t(GROUP_LABEL[g])), x, y + 15, { size: 44, weight: 500, color: pal.sub, align: 'center' })
  })
}

function monthCalendar(ctx, pal, year, month, days, ws, y0) {
  const order = weekOrder(ws)
  const step = (W - 2 * P) / 7
  const r = Math.min(54, step / 2 - 6)
  const dayHead = d => cap(new Date(2024, 0, 7 + d).toLocaleDateString(dateLocale(), { weekday: 'narrow' }))
  order.forEach((d, i) => text(ctx, dayHead(d), P + step * (i + 0.5), y0, { size: 42, weight: 700, color: pal.ink, align: 'center' }))
  const first = new Date(year, month, 1)
  const offset = (first.getDay() - ws + 7) % 7
  const len = new Date(year, month + 1, 0).getDate()
  const on = new Set(days)
  for (let d = 1; d <= len; d++) {
    const slot = offset + d - 1
    const cx = P + step * (slot % 7 + 0.5)
    const cy = y0 + 90 + Math.floor(slot / 7) * (r * 2 + 22)
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const hit = on.has(iso)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = hit ? pal.acc : pal.chip; ctx.fill()
    text(ctx, d, cx, cy + 14, { size: 40, weight: hit ? 800 : 500, color: hit ? pal.onAcc : pal.sub, align: 'center' })
  }
}

function yearDots(ctx, pal, year, days, ws, y0, y1) {
  const on = new Set(days)
  const colW = (W - 2 * P) / 3
  const rowH = (y1 - y0) / 4
  const step = Math.min(colW / 7.3, (rowH - 52) / 6)
  const r = step * 0.38
  for (let m = 0; m < 12; m++) {
    const x0 = P + (m % 3) * colW
    const top = y0 + Math.floor(m / 3) * rowH
    text(ctx, cap(new Date(year, m, 1).toLocaleDateString(dateLocale(), { month: 'short' })).replace('.', ''), x0, top + 36, { size: 38, weight: 600, color: pal.ink })
    const offset = (new Date(year, m, 1).getDay() - ws + 7) % 7
    const len = new Date(year, m + 1, 0).getDate()
    for (let d = 1; d <= len; d++) {
      const slot = offset + d - 1
      const iso = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      ctx.beginPath()
      ctx.arc(x0 + step * (slot % 7 + 0.5), top + 52 + step * (Math.floor(slot / 7) + 0.5), r, 0, Math.PI * 2)
      ctx.fillStyle = on.has(iso) ? pal.acc : pal.chip
      ctx.fill()
    }
  }
}

function monthBars(ctx, pal, year, counts, best, y0, y1) {
  const max = Math.max(1, ...counts)
  const slot = (W - 2 * P) / 12
  const bw = slot * 0.64
  counts.forEach((n, i) => {
    const h = Math.max(bw, (y1 - y0 - 60) * n / max)
    const x = P + slot * i + (slot - bw) / 2
    rr(ctx, x, y1 - 60 - h, bw, h, bw / 2)
    ctx.fillStyle = i === best ? pal.acc : n ? pal.bar : pal.chip
    ctx.fill()
    const ini = cap(new Date(year, i, 1).toLocaleDateString(dateLocale(), { month: 'narrow' }))
    text(ctx, ini, x + bw / 2, y1, { size: 40, weight: i === best ? 800 : 500, color: i === best ? pal.ink : pal.sub, align: 'center' })
  })
}

function exerciseBars(ctx, pal, top, imgs, y0) {
  const max = Math.max(1, ...top.map(x => x.sets))
  const full = W - 2 * P
  const bh = 104
  top.forEach((x, i) => {
    const y = y0 + i * 226
    text(ctx, exName(x.id), P, y, { size: 44, weight: 600, color: pal.ink, max: full })
    const len = Math.max(bh * 2.7, full * x.sets / max)
    rr(ctx, P, y + 24, len, bh, bh / 2)
    ctx.fillStyle = i === 0 ? pal.acc : pal.bar
    ctx.fill()
    text(ctx, t('{0} sets', num(x.sets)), P + len - bh - 18, y + 24 + bh / 2 + 17, { size: 48, weight: 800, color: i === 0 ? pal.onAcc : pal.barInk, align: 'right' })
    thumb(ctx, imgs[exImg(x.id)], P + len - bh / 2, y + 24 + bh / 2, bh / 2 - 7, pal)
  })
}

function recordList(ctx, pal, items, imgs, unit, y0, { limit = 3, rowH = 230 } = {}) {
  items.slice(0, limit).forEach((rec, i) => {
    const y = y0 + i * rowH
    thumb(ctx, imgs[exImg(rec.id)], P + 76, y + 66, 74, pal)
    const x = P + 186
    text(ctx, exName(rec.id), x, y + 34, { size: 46, weight: 700, color: pal.ink, max: W - P - x })
    let ly = y + 98
    if (rec.w) { text(ctx, '🏆 ' + t('Weight') + ' · ' + fmtNum(rec.w) + ' ' + unit, x, ly, { size: 42, weight: 700, color: GOLD, max: W - P - x }); ly += 56 }
    if (rec.e1) text(ctx, '🏆 ' + t('Est. 1RM') + ' · ' + fmtNum(rec.e1) + ' ' + unit, x, ly, { size: 42, weight: 700, color: GOLD, max: W - P - x })
  })
}

function bigNumber(ctx, pal, value, unitLabel, y) {
  text(ctx, value, W / 2, y, { size: 200, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
  if (unitLabel) text(ctx, unitLabel, W / 2, y + 84, { size: 56, weight: 500, color: pal.ink, align: 'center' })
}

function heavyCard(ctx, pal, volume, unit, y0) {
  const kg = unit === 'lb' ? volume * LB_KG : volume
  const thing = heavyThingFor(kg)
  text(ctx, compact(volume) + ' ' + unit, W / 2, y0 + 190, { size: 180, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
  text(ctx, thing.emoji, W / 2, y0 + 610, { size: 360, color: pal.ink, align: 'center' })
  const what = thing.times >= 1.5 ? t(thing.many, num(thing.times, 1)) : t(thing.one)
  wrap(ctx, t("That's like lifting {0}!", what), W / 2, y0 + 790, { size: 60, weight: 700, color: pal.ink })
}

// ── card sets ─────────────────────────────────────────────────────────────────────────────
// Each card: { key, imgs: [urls it needs], draw(ctx, pal, imgs) }. `env` carries the profile
// bits a card uses: { unit, handle, ws }.

export function workoutCards(r, env) {
  const { w, totals } = r
  const unit = env.unit
  const eyebrow = t('Your workout #{0}', num(r.n))
  const dur = totals.durationMs >= 60000 ? fmtDur(totals.durationMs) : '—'
  const cards = [
    {
      key: 'summary', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: w.name || t('Workout') })
        const cols = [[t('Duration'), dur], [t('Volume'), compact(totals.volume) + ' ' + unit], [t('Sets'), num(totals.sets)]]
        const cw = (W - 2 * P) / 3
        cols.forEach(([l, v], i) => {
          const cx = P + cw * (i + 0.5)
          text(ctx, l, cx, 350, { size: 44, color: pal.sub, align: 'center', max: cw - 10 })
          text(ctx, v, cx, 436, { size: 66, weight: 800, color: pal.ink, align: 'center', max: cw - 10 })
        })
        radar(ctx, pal, r.radar, W / 2, 870, 300)
      },
    },
    {
      key: 'heavy', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: t('You lifted a total of') })
        heavyCard(ctx, pal, totals.volume, unit, 240)
      },
    },
    {
      key: 'stats', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: w.name || t('Workout') })
        statGrid(ctx, pal, [
          { label: t('Duration'), value: dur },
          { label: t('Volume'), value: compact(totals.volume) + ' ' + unit },
          { label: t('Exercises'), value: num(r.exercises) },
          { label: t('Sets'), value: num(totals.sets) },
        ], 470, { gap: 420 })
      },
    },
  ]
  if (r.records.count) cards.push({
    key: 'prs', imgs: r.records.items.slice(0, 4).map(x => exImg(x.id)),
    draw(ctx, pal, imgs) {
      frame(ctx, pal, { eyebrow, title: t('Personal records') })
      recordList(ctx, pal, r.records.items, imgs, unit, 340, { limit: 4, rowH: 240 })
    },
  })
  return cards
}

export function monthCards(r, env) {
  const unit = env.unit
  const eyebrow = monthName(r.year, r.month)
  const { totals, prev } = r
  const groups = topGroups(r.radar).slice(0, 3).map(g => cap(t(GROUP_LABEL[g])))
  const cards = [
    {
      key: 'totals', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: t('Workouts') })
        statGrid(ctx, pal, [
          { label: t('Workouts'), value: num(totals.workouts), delta: delta(totals.workouts, prev.workouts) },
          { label: t('Duration'), value: totals.durationMs >= 60000 ? fmtDur(totals.durationMs) : '—', delta: delta(totals.durationMs, prev.durationMs, fmtDur) },
          { label: t('Volume'), value: compact(totals.volume) + ' ' + unit, delta: delta(totals.volume, prev.volume, v => compact(v) + ' ' + unit) },
          { label: t('Sets'), value: num(totals.sets), delta: delta(totals.sets, prev.sets) },
        ], 420, { gap: 400 })
        text(ctx, t('Compared with the month before'), P, H - 100, { size: 40, color: pal.sub, max: W - 2 * P })
      },
    },
    {
      key: 'prs', imgs: r.records.items.slice(0, 4).map(x => exImg(x.id)),
      draw(ctx, pal, imgs) {
        frame(ctx, pal, { eyebrow, title: t('Personal records') })
        if (!r.records.count) { wrap(ctx, t('No new records this month. Next one is coming!'), W / 2, 660, { size: 60, weight: 700, color: pal.sub }); return }
        recordList(ctx, pal, r.records.items, imgs, unit, 340, { limit: 4, rowH: 240 })
      },
    },
    {
      key: 'days', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: t('Workout days log') })
        monthCalendar(ctx, pal, r.year, r.month, r.days, env.ws, 350)
        text(ctx, t('{0} days trained', num(totals.days)), W / 2, H - 90, { size: 60, weight: 800, color: pal.ink, align: 'center' })
      },
    },
    {
      key: 'radar', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: t('This month you worked mainly on') })
        radar(ctx, pal, r.radar, W / 2, 690, 300)
        if (groups.length) wrap(ctx, listJoin(groups), W / 2, 1200, { size: 80, weight: 800, color: pal.ink })
      },
    },
  ]
  if (r.top.length) cards.push({
    key: 'top', imgs: r.top.map(x => exImg(x.id)),
    draw(ctx, pal, imgs) {
      frame(ctx, pal, { eyebrow, title: t('Your top exercises') })
      exerciseBars(ctx, pal, r.top, imgs, 360)
    },
  })
  return cards
}

export function yearCards(r, env) {
  const unit = env.unit
  const eyebrow = t('{0} in review', r.year)
  const { totals } = r
  const groups = topGroups(r.radar).slice(0, 3).map(g => cap(t(GROUP_LABEL[g])))
  const cards = [
    {
      key: 'intro', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow })
        wrap(ctx, t('Well done! You crushed {0} 💪', r.year), W / 2, 250, { size: 68, weight: 800, color: pal.ink })
        ctx.beginPath(); ctx.arc(W / 2, 540, 140, 0, Math.PI * 2); ctx.fillStyle = pal.acc; ctx.fill()
        text(ctx, (env.handle || 'G')[0].toLocaleUpperCase(), W / 2, 594, { size: 150, weight: 800, color: pal.onAcc, align: 'center' })
        bigNumber(ctx, pal, num(totals.workouts), t('Workouts'), 910)
        const cols = [[hours(totals.durationMs), t('Duration')], [compact(totals.volume) + ' ' + unit, t('Volume')]]
        cols.forEach(([v, l], i) => {
          const cx = W / 2 + (i ? 1 : -1) * 230
          text(ctx, v, cx, 1170, { size: 76, weight: 800, color: pal.ink, align: 'center', max: 440 })
          text(ctx, l, cx, 1232, { size: 44, color: pal.sub, align: 'center' })
        })
      },
    },
    {
      key: 'heavy', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow, title: t('Total weight you have lifted') })
        heavyCard(ctx, pal, totals.volume, unit, 240)
      },
    },
    {
      key: 'dots', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow })
        text(ctx, num(totals.workouts), W / 2, 320, { size: 140, weight: 800, color: pal.ink, align: 'center' })
        text(ctx, t('Workouts this year'), W / 2, 392, { size: 50, weight: 500, color: pal.ink, align: 'center' })
        yearDots(ctx, pal, r.year, r.days, env.ws, 430, H - 50)
      },
    },
    {
      key: 'months', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow })
        if (r.bestMonth < 0) { wrap(ctx, t('No workouts this year yet.'), W / 2, 660, { size: 60, weight: 700, color: pal.sub }); return }
        const best = cap(new Date(r.year, r.bestMonth, 1).toLocaleDateString(dateLocale(), { month: 'long' }))
        text(ctx, t('{0} was your best month with', best), W / 2, 250, { size: 64, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
        bigNumber(ctx, pal, num(r.counts[r.bestMonth]), t('Workouts'), 520)
        monthBars(ctx, pal, r.year, r.counts, r.bestMonth, 650, 1130)
        wrap(ctx, t('On average, you trained {0} times in active months', num(r.avgActive)), W / 2, 1215, { size: 46, weight: 600, color: pal.ink })
      },
    },
    {
      key: 'radar', imgs: [],
      draw(ctx, pal) {
        frame(ctx, pal, { eyebrow })
        text(ctx, t('This year you worked mainly on'), W / 2, 250, { size: 64, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
        radar(ctx, pal, r.radar, W / 2, 700, 290)
        if (groups.length) wrap(ctx, listJoin(groups), W / 2, 1200, { size: 80, weight: 800, color: pal.ink })
      },
    },
  ]
  if (r.top.length) cards.push({
    key: 'top', imgs: r.top.map(x => exImg(x.id)),
    draw(ctx, pal, imgs) {
      frame(ctx, pal, { eyebrow })
      text(ctx, t('Your top exercises were'), W / 2, 250, { size: 64, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
      exerciseBars(ctx, pal, r.top, imgs, 380)
    },
  })
  cards.push({
    key: 'prs', imgs: r.records.items.slice(0, 3).map(x => exImg(x.id)),
    draw(ctx, pal, imgs) {
      frame(ctx, pal, { eyebrow })
      text(ctx, t('In {0} you had in total', r.year), W / 2, 250, { size: 64, weight: 800, color: pal.ink, align: 'center', max: W - 2 * P })
      text(ctx, '🏆', W / 2, 400, { size: 120, color: pal.ink, align: 'center' })
      bigNumber(ctx, pal, num(r.records.count), t('Personal records'), 600)
      recordList(ctx, pal, r.records.items, imgs, unit, 760, { limit: 3, rowH: 190 })
    },
  })
  cards.push({
    key: 'streak', imgs: [],
    draw(ctx, pal) {
      frame(ctx, pal, { eyebrow, title: t('Your longest streak') })
      text(ctx, '🔥', W / 2, 700, { size: 360, color: pal.ink, align: 'center' })
      bigNumber(ctx, pal, num(r.streak), r.streak === 1 ? t('week') : t('weeks'), 950)
      wrap(ctx, t('was your longest streak this year - keep that fire burning!'), W / 2, 1150, { size: 52, weight: 600, color: pal.ink })
    },
  })
  return cards
}

/** Loads every image the cards need; a missing one resolves to null and draws as a blank disc. */
export async function loadImages(urls) {
  const out = {}
  await Promise.all([...new Set(urls.filter(Boolean))].map(src => new Promise(resolve => {
    const img = new Image()
    img.onload = () => { out[src] = img; resolve() }
    img.onerror = () => resolve()
    img.src = src
  })))
  return out
}

