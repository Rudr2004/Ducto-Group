import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { useStore } from '@/store/store';
import { useViews, go, drill, canOpen, type Route } from '@/lib/hooks';
import { OWNERS } from '@/domain/milestones';
import { cx } from './ui';

type Msg = { id: number; from: 'ai' | 'me'; text: string; route?: Route; run?: () => void; typing?: boolean };

const QUICK = ['Which packages are delayed?', 'Who is causing the delays?', 'Open exceptions', 'How many are awarded?'];

/** Original robot mascot: dark visor helmet, antennas, glowing cyan eyes that blink, and a smile. */
function AiMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="ai-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7BE4FF" /><stop offset=".45" stopColor="#2AA5E0" /><stop offset="1" stopColor="#0B4F96" /></linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B1F47" /><stop offset="1" stopColor="#020816" /></linearGradient>
        <radialGradient id={`${id}e`} cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#E6FEFF" /><stop offset=".45" stopColor="#5CF0FF" /><stop offset="1" stopColor="#15B8E0" /></radialGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5AD3F7" /><stop offset="1" stopColor="#1676B8" /></linearGradient>
      </defs>
      {/* antenna */}
      <line x1="32" y1="14" x2="32" y2="7" stroke="#4CCBF2" strokeWidth="2.4" strokeLinecap="round" />
      <circle className="ai-tip" cx="32" cy="5.2" r="3" fill="#9DF6FF" />
      {/* ear pods */}
      <rect x="4" y="29" width="7" height="14" rx="3.5" fill={`url(#${id}p)`} /><rect x="53" y="29" width="7" height="14" rx="3.5" fill={`url(#${id}p)`} />
      {/* head */}
      <rect x="8.5" y="13" width="47" height="43" rx="21.5" fill={`url(#${id}h)`} />
      <path d="M15 25Q16.5 17 28 16" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.2" strokeLinecap="round" />
      {/* visor */}
      <rect x="13.5" y="19" width="37" height="32" rx="16" fill={`url(#${id}v)`} />
      {/* eyes (each eye = ball + glint, so a blink squashes both together) */}
      <g className="ai-eyes">
        <g className="ai-eye"><circle cx="24.5" cy="34" r="5.2" fill={`url(#${id}e)`} /><circle cx="22.8" cy="32.2" r="1.3" fill="#fff" /></g>
        <g className="ai-eye"><circle cx="39.5" cy="34" r="5.2" fill={`url(#${id}e)`} /><circle cx="37.8" cy="32.2" r="1.3" fill="#fff" /></g>
      </g>
      {/* smile */}
      <path className="ai-smile" d="M26.5 43Q32 47.8 37.5 43" fill="none" stroke="#5CF0FF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Floating assistant: an emoji orb appears centre-screen with a greeting, then flies to the bottom-right corner and becomes the chat launcher. */
export function AiAssistant() {
  const booted = useStore((s) => s.booted);
  const events = useStore((s) => s.events);
  const settings = useStore((s) => s.settings);
  const role = useStore((s) => s.role);
  const views = useViews();
  const [phase, setPhase] = useState<'wait' | 'enter' | 'blink' | 'intro' | 'docked'>('wait');
  const [played, setPlayed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'ai', text: 'Hi! I\'m Tower AI 👋 Ask me about delays, owners, awards or the exception queue.' }]);
  const [q, setQ] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    if (!booted) return;
    // 1) robot bounces in from the right  2) it settles and blinks  3) the greeting appears  4) it flies to the corner
    setPlayed(true); setPhase('enter');
    const blink = setTimeout(() => setPhase('blink'), 1800);
    const greet = setTimeout(() => setPhase('intro'), 3000);
    const dock = setTimeout(() => { setPhase('docked'); setNudge(true); }, 6800);
    const hide = setTimeout(() => setNudge(false), 13500);
    return () => { clearTimeout(blink); clearTimeout(greet); clearTimeout(dock); clearTimeout(hide); };
  }, [booted]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, open]);

  const skip = () => { setPhase('docked'); setNudge(true); setTimeout(() => setNudge(false), 6000); };

  const facts = useMemo(() => {
    const live = views.filter((v) => !v.pkg.excluded);
    const delayed = live.filter((v) => v.health === 'Delayed');
    const lost = (v: (typeof live)[number]) => OWNERS.reduce((t, o) => t + v.daysLost[o], 0);
    const worst = [...live].sort((a, b) => lost(b) - lost(a))[0];
    const byOwner = OWNERS.map((o) => ({ o, d: live.reduce((t, v) => t + v.daysLost[o], 0) })).sort((a, b) => b.d - a.d);
    return { live, delayed, worst, worstLost: worst ? lost(worst) : 0, byOwner, awarded: live.filter((v) => v.status === 'Awarded').length };
  }, [views]);

  const answer = (text: string): { text: string; route?: Route; run?: () => void } => {
    const t = text.toLowerCase();
    const { live, delayed, worst, worstLost, byOwner, awarded } = facts;
    if (/delay|late|overdue|behind/.test(t) && !/who|owner|cause/.test(t))
      return { text: `${delayed.length} of ${live.length} packages are delayed. The worst is “${worst?.pkg.name ?? '—'}” with ${worstLost} days lost over SLA.`, route: 'schedule', run: () => drill({ health: 'Delayed' }) };
    if (/who|owner|cause|blame/.test(t))
      return { text: `Most days are lost with ${byOwner[0].o} (${byOwner[0].d}d), then ${byOwner[1].o} (${byOwner[1].d}d) and ${byOwner[2].o} (${byOwner[2].d}d).`, route: 'dashboard' };
    if (/exception|queue|review/.test(t)) {
      const n = events.filter((e) => e.decision === 'QUEUED').length;
      return { text: n ? `${n} email${n > 1 ? 's' : ''} are waiting in the exception queue for an admin decision.` : 'The exception queue is empty — nothing needs review right now.', route: canOpen(role, 'exceptions') ? 'exceptions' : undefined };
    }
    if (/award|won|complete/.test(t)) return { text: `${awarded} of ${live.length} packages are awarded; ${live.length - awarded} are still in procurement.`, route: 'schedule', run: () => drill({ status: 'Awarded' }) };
    if (/ai|classif|model|how.*work/.test(t)) return { text: settings.aiOutage ? 'The AI is currently offline, so emails needing AI confirmation go to the exception queue.' : 'A simulated classifier reads each email and only commits a date when both the system evidence and the AI agree. Anything doubtful is queued for an admin.' };
    if (/^(hi|hello|hey)\b/.test(t)) return { text: 'Hello! Try one of the quick questions below 👇' };
    return { text: 'I can answer about delays, delay owners, awards and the exception queue. Try one of the suggestions below.' };
  };

  const ask = (text: string) => {
    const clean = text.trim(); if (!clean) return;
    const me: Msg = { id: idRef.current++, from: 'me', text: clean };
    const tid = idRef.current++;
    setMsgs((m) => [...m, me, { id: tid, from: 'ai', text: '', typing: true }]);
    setQ('');
    setTimeout(() => {
      const a = answer(clean);
      setMsgs((m) => m.map((x) => (x.id === tid ? { id: tid, from: 'ai', text: a.text, route: a.route, run: a.run, typing: false } : x)));
    }, 750);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(q); };

  if (phase === 'wait') return null;
  return (
    <div className="ai-root" aria-live="polite">
      {played && <div className={cx('ai-veil', phase !== 'docked' && 'on')} onClick={skip} aria-hidden />}
      {played && (
        <div className={cx('ai-intro-msg', phase === 'intro' && 'on')} role="status">
          <b>Hi, I'm Tower AI 👋</b>
          <span>I read procurement emails, catch delays early and tell you who they belong to.</span>
          <i className="ai-typing"><u /><u /><u /></i>
        </div>
      )}

      {nudge && !open && <button className="ai-nudge" onClick={() => { setOpen(true); setNudge(false); }}>Need a hand? Ask me anything ✨</button>}

      {open && (
        <section className="ai-panel" aria-label="Tower AI assistant">
          <header>
            <span className="ai-avatar"><AiMark size={22} /></span>
            <div className="flex-1 leading-tight"><b>Tower AI</b><small><i className="ai-live" />{settings.aiOutage ? 'offline (degraded)' : 'simulated · online'}</small></div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant"><X size={16} /></button>
          </header>
          <div className="ai-body" ref={bodyRef}>
            {msgs.map((m) => (
              <div key={m.id} className={cx('ai-msg', m.from === 'me' ? 'me' : 'bot')}>
                {m.typing ? <i className="ai-typing dark"><u /><u /><u /></i> : m.text}
                {m.route && !m.typing && <button className="ai-link" onClick={() => (m.run ? m.run() : go(m.route!))}>Open {m.route} →</button>}
              </div>
            ))}
          </div>
          <div className="ai-chips">{QUICK.map((c) => <button key={c} onClick={() => ask(c)}>{c}</button>)}</div>
          <form onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your packages…" aria-label="Message Tower AI" />
            <button type="submit" aria-label="Send" disabled={!q.trim()}><Send size={15} /></button>
          </form>
        </section>
      )}

      <button className={cx('ai-orb', phase !== 'docked' && 'is-intro', phase === 'enter' && 'is-enter', phase === 'blink' && 'is-blink', open && 'is-open')} onClick={() => { if (phase !== 'docked') return skip(); setOpen((o) => !o); setNudge(false); }} aria-label={open ? 'Close assistant' : 'Open Tower AI assistant'}>
        <span className="ai-fly-x"><span className="ai-fly-y"><span className="ai-face">
          <span className="ai-ring" /><span className="ai-ring r2" />
          {open ? <X size={24} className="ai-x" /> : <AiMark />}
          {phase === 'docked' && !open && <i className="ai-dot" />}
        </span></span></span>
      </button>
    </div>
  );
}
