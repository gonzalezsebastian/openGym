// Recaps: shareable cards for one workout, a month, and a year in review — the openGym take on
// Hevy's share sheet. The numbers come from lib/recap.js, the pictures from lib/recap-cards.js;
// this screen shows them as a swipeable row and hands the current one to the OS share sheet
// (Instagram, Messages, Save Image…) as a PNG.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { todayISO, ACCENTS, ACCENT_INK } from '../lib/format.js'
import { workoutDay } from '../lib/history.js'
import { monthRecap, yearRecap, workoutRecap, recapMonths } from '../lib/recap.js'
import { W, H, paletteOf, workoutCards, monthCards, yearCards, loadImages } from '../lib/recap-cards.js'
import { MOBILE, shareExportBlob } from '../lib/mobile.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

const cap = s => (s ? s[0].toLocaleUpperCase(dateLocale()) + s.slice(1) : s)
const monthLabel = (y, m) => cap(new Date(y, m, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }))

/** The route segment that finds a workout again: its id, or its day and start for an old one. */
export const workoutRef = w => encodeURIComponent(w?.id || `${w?.d}|${w?.start}`)
const findWorkout = (workouts, ref) => {
  const key = decodeURIComponent(ref || '')
  return (workouts || []).find(w => w.id === key || `${w.d}|${w.start}` === key) || null
}

const BG_KEY = 'gym_recap_bg'
const readBg = () => { try { return localStorage.getItem(BG_KEY) || 'light' } catch { return 'light' } }

function toBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
}

// One card on screen. It draws itself whenever the background or its pictures change, and keeps
// its PNG ready so the share button can hand it over inside the tap — iOS refuses a share sheet
// that opens after an await.
function CardCanvas({ card, pal, imgs, onBlob }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !imgs) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    card.draw(ctx, pal, imgs)
    ctx.restore()
    let live = true
    toBlob(canvas).then(b => { if (live && b) onBlob(b) })
    return () => { live = false }
  }, [card, pal, imgs])
  return <canvas ref={ref} width={W} height={H} className="recap-canvas" />
}

function Viewer({ title, sub, cards, back, fileBase }) {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const accent = useStore(s => s.S.accent)
  const [bg, setBg] = useState(readBg)
  const [idx, setIdx] = useState(0)
  const [imgs, setImgs] = useState(null)
  const blobs = useRef({})
  const rowRef = useRef(null)
  const pal = useMemo(() => paletteOf(bg, ACCENTS[accent] || ACCENTS.lime, ACCENT_INK[accent] || '#000'), [bg, accent])

  useEffect(() => {
    let live = true
    loadImages(cards.flatMap(c => c.imgs)).then(m => { if (live) setImgs(m) })
    return () => { live = false }
  }, [cards])
  useEffect(() => { blobs.current = {} }, [bg, cards])

  const pickBg = v => { setBg(v); try { localStorage.setItem(BG_KEY, v) } catch { /* private mode */ } }
  const onScroll = () => {
    const el = rowRef.current
    if (!el) return
    // The card whose centre is nearest the row's centre is the one on screen.
    const mid = el.scrollLeft + el.clientWidth / 2
    let best = 0
    ;[...el.children].forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid)
      const bd = Math.abs(el.children[best].offsetLeft + el.children[best].offsetWidth / 2 - mid)
      if (d < bd) best = i
    })
    setIdx(best)
  }
  const goTo = i => {
    const el = rowRef.current
    const n = Math.max(0, Math.min(cards.length - 1, i))
    const slide = el?.children[n]
    if (!slide) return
    setIdx(n)
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: 'smooth' })
  }

  const fileOf = i => {
    const b = blobs.current[i]
    return b ? new File([b], `${fileBase}-${cards[i].key}.png`, { type: 'image/png' }) : null
  }
  const share = async all => {
    const files = (all ? cards.map((_, i) => fileOf(i)) : [fileOf(idx)]).filter(Boolean)
    if (!files.length) { toast(t('Still drawing — try again in a second')); return }
    try {
      if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files }); return }
      if (MOBILE) { for (const f of files) await shareExportBlob(f, f.name); return }
      for (const f of files) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      }
      toast(files.length === 1 ? t('Image saved') : t('Images saved'))
    } catch (e) {
      if (e?.name !== 'AbortError') toast(t('Could not share'))
    }
  }

  return <div className="recap-view">
    <div className="hdr"><button className="iconbtn" onClick={() => (back ? nav(back) : nav(-1))} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div></div>

    <div ref={rowRef} className={'recap-row bg-' + bg} onScroll={onScroll}>
      {cards.map((card, i) => <div key={card.key} className="recap-slide">
        <CardCanvas card={card} pal={pal} imgs={imgs} onBlob={b => { blobs.current[i] = b }} />
      </div>)}
    </div>
    <div className="recap-nav">
      <button className="iconbtn" disabled={idx === 0} onClick={() => goTo(idx - 1)} aria-label={t('Previous')}><Icon name="chevronLeft" /></button>
      <div className="recap-dots">{cards.map((c, i) => <button key={c.key} className={i === idx ? 'on' : ''} aria-label={String(i + 1)} onClick={() => goTo(i)} />)}</div>
      <button className="iconbtn" disabled={idx === cards.length - 1} onClick={() => goTo(idx + 1)} aria-label={t('Next')}><Icon name="chevronRight" /></button>
    </div>

    <div className="small muted" style={{ margin: '4px 0 6px' }}>{t('Background')}</div>
    <Segmented className="seg-range" value={bg} onChange={pickBg}
      options={[{ value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }, { value: 'transparent', label: t('Transparent') }]} />
    <Button variant="primary" icon="upload" onClick={() => share(false)}>{t('Share this image')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="image" onClick={() => share(true)}>{t('Share all {0}', cards.length)}</Button>
    <p className="small muted" style={{ marginTop: 10 }}>{t('Pick Instagram in the share sheet to post it to your story, or Save Image to keep it.')}</p>
  </div>
}

function useEnv() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  return { S, env: { unit: S.unit || 'kg', handle: user?.name || '', ws: S.weekStart === 0 ? 0 : 1 } }
}

export function RecapWorkout() {
  const { ref } = useParams()
  const { S, env } = useEnv()
  const w = findWorkout(S.workouts, ref)
  const cards = useMemo(() => (w ? workoutCards(workoutRecap(S, w), env) : []), [w, S.unit, env.handle])
  if (!w) return <Missing />
  return <Viewer title={t('Share workout')} sub={w.name} cards={cards} fileBase={'opengym-' + (workoutDay(w) || 'workout')} />
}

export function RecapMonth() {
  const { ym } = useParams()
  const { S, env } = useEnv()
  const [y, m] = String(ym || todayISO().slice(0, 7)).split('-').map(Number)
  const cards = useMemo(() => monthCards(monthRecap(S, y, m - 1), env), [S.workouts, y, m, S.unit, env.handle, env.ws])
  return <Viewer title={t('Monthly recap')} sub={monthLabel(y, m - 1)} cards={cards} back="/recap" fileBase={`opengym-${ym}`} />
}

export function RecapYear() {
  const { year } = useParams()
  const { S, env } = useEnv()
  const y = Number(year) || new Date().getFullYear()
  const cards = useMemo(() => yearCards(yearRecap(S, y), env), [S.workouts, y, S.unit, env.handle, env.ws])
  return <Viewer title={t('{0} in review', y)} cards={cards} back="/recap" fileBase={`opengym-${y}`} />
}

function Missing() {
  const nav = useNavigate()
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Recaps')}</h1></div></div>
    <p className="muted">{t('This workout is no longer in your history.')}</p>
  </>
}

/** The list of recaps: a year in review per year, a recap per month that has workouts. */
export default function Recaps() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const months = useMemo(() => recapMonths(S.workouts), [S.workouts])
  const years = [...new Set(months.map(m => m.year))]
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Recaps')}</h1>
        <div className="sub">{t('Your months and years as cards to share.')}</div></div></div>
    {!months.length && <p className="muted">{t('No workouts yet. Your first recap appears after your first workout.')}</p>}
    {years.length > 0 && <div className="card">
      <h2>{t('Year in review')}</h2>
      <div className="list">{years.map(y => <button key={y} className="row recap-item" onClick={() => nav('/recap/year/' + y)}>
        <Icon name="star" /><span className="grow">{t('{0} in review', y)}</span>
        <span className="small dim">{t('{0} workouts', months.filter(m => m.year === y).reduce((n, m) => n + m.count, 0))}</span>
        <Icon name="chevronRight" className="chev" />
      </button>)}</div>
    </div>}
    {months.length > 0 && <div className="card">
      <h2>{t('Monthly recap')}</h2>
      <div className="list">{months.map(m => <button key={m.year + '-' + m.month} className="row recap-item"
        onClick={() => nav(`/recap/month/${m.year}-${String(m.month + 1).padStart(2, '0')}`)}>
        <Icon name="calendar" /><span className="grow">{monthLabel(m.year, m.month)}</span>
        <span className="small dim">{t('{0} workouts', m.count)}</span>
        <Icon name="chevronRight" className="chev" />
      </button>)}</div>
    </div>}
  </>
}
