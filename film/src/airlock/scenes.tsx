import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { BlurText, Camera, clamp, Cursor, easeOut, popAt, useRoll, type CamKey, type CursorKey } from '../components/motion';
import boxesJson from '../../public/app/boxes.json';

type SceneProps = { duration: number };
type Box = { x: number; y: number; w: number; h: number };
const boxes = boxesJson as unknown as Record<string, Box>;
const B = (key: string): Box => {
  const b = boxes[key];
  if (!b) throw new Error(`No box ${key}`);
  return b;
};
const sec = (s: number) => Math.round(s * 60);

/* ------------------------------------------------------------ the desktop window */

// Captures are the app's full 1440 x 900 window; in world space the window is 1440 wide with a 36 px title bar.
const WIN = { w: 1440, h: 900, bar: 36 };
const winH = WIN.h + WIN.bar;
const w = (x: number, y: number) => ({ x: -WIN.w / 2 + x, y: -winH / 2 + WIN.bar + y });

type State = { src: string; at: number };

const Window: React.FC<{ states: State[] }> = ({ states }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: -WIN.w / 2,
        top: -winH / 2,
        width: WIN.w,
        height: winH,
        borderRadius: 20,
        overflow: 'hidden',
        background: theme.navy2,
        boxShadow: '0 60px 120px rgba(40,38,100,0.35), 0 0 0 1px rgba(255,255,255,0.5)',
      }}
    >
      <div style={{ height: WIN.bar, background: theme.navy2, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: c, opacity: 0.85 }} />
        ))}
        <div style={{ margin: '0 auto', color: theme.onNavy2, fontFamily: theme.font, fontSize: 14, fontWeight: 700, transform: 'translateX(-30px)' }}>Airlock</div>
      </div>
      <div style={{ position: 'relative', width: WIN.w, height: WIN.h }}>
        {states.map((s, i) => {
          const next = states[i + 1];
          const opacity = i === 0 ? 1 : interpolate(frame, [s.at, s.at + 12], [0, 1], { ...clamp, easing: easeOut });
          if (frame < s.at - 1 || (next && frame >= next.at + 14)) return null;
          return <Img key={s.src} src={staticFile(`app/${s.src}.png`)} style={{ position: 'absolute', inset: 0, width: WIN.w, height: WIN.h, opacity }} />;
        })}
      </div>
    </div>
  );
};

const WIDE = (f: number): CamKey => ({ f, x: 0, y: 0, z: 0.98 });
/** Camera key that frames a box of the window as close as fits, above the caption pill. */
const read = (f: number, b: Box, zmax = 1.8): CamKey => {
  const top = 40;
  const bottom = 1080 - 160;
  const z = Math.min(zmax, (bottom - top) / (b.h + 80), (1920 * 0.86) / (b.w + 120));
  const lift = (1080 / 2 - (top + bottom) / 2) / z;
  return { f, ...w(b.x + b.w / 2, b.y + b.h / 2 + lift), z };
};
const readKey = (f: number, key: string, zmax = 1.8) => read(f, B(key), zmax);
const union = (...keys: string[]): Box => {
  const bs = keys.map(B);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};
const cur = (f: number, x: number, y: number, click = false): CursorKey => ({ f, ...w(x, y), click });
const at = (key: string, dx = 0.5, dy = 0.5): [number, number] => {
  const b = B(key);
  return [b.x + b.w * dx, b.y + b.h * dy];
};

/** Navy caption pill with a periwinkle dot, for the point the line makes. */
const Callout: React.FC<{ text: string; at: number; outAt: number }> = ({ text, at: start, outAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, start, 15);
  const out = interpolate(frame, [outAt, outAt + 14], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56, pointerEvents: 'none' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 32px 16px 24px',
          borderRadius: 999,
          background: theme.navy,
          color: theme.onNavy,
          fontFamily: theme.font,
          fontSize: 34,
          fontWeight: 700,
          opacity: p * (1 - out),
          transform: `translateY(${String((1 - p) * 24 + out * 12)}px)`,
          boxShadow: '0 20px 50px rgba(30,28,80,0.35)',
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 999, background: theme.blue2, boxShadow: `0 0 16px ${theme.blue2}` }} />
        {text}
      </div>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <rect width="48" height="48" rx="14" fill={theme.navy2} />
    <rect x="15" y="22" width="18" height="13" rx="4" fill={theme.blue2} />
    <path d="M19 22v-3a5 5 0 0 1 10 0v3" stroke={theme.blue2} strokeWidth="3" fill="none" />
  </svg>
);

/* ------------------------------------------------------------ scenes */

export const IntroScene: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, 6, 14);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: theme.font, color: theme.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, transform: `scale(${String(0.9 + p * 0.1)})`, opacity: p }}>
        <Logo size={120} />
        <span style={{ fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em', color: theme.navy }}>Airlock</span>
      </div>
      <div style={{ marginTop: 34, fontSize: 44, fontWeight: 600, color: theme.muted, textAlign: 'center', maxWidth: 1300 }}>
        <BlurText text="Ask AI about your private life. Keep your secrets on your computer." at={34} />
      </div>
    </AbsoluteFill>
  );
};

export const VaultScene: React.FC<SceneProps> = ({ duration }) => (
  <AbsoluteFill>
    <Camera keys={[WIDE(0), WIDE(sec(1.6)), readKey(sec(3.4), 'd-home:vault', 1.45), readKey(duration, 'd-home:vault', 1.5)]}>
      <Window states={[{ src: 'd-home', at: 0 }]} />
    </Camera>
    <Callout text="Your vault stays on this computer" at={sec(2.2)} outAt={duration - 16} />
  </AbsoluteFill>
);

export const CaughtScene: React.FC<SceneProps> = ({ duration }) => {
  const click = sec(0.9);
  const flip = sec(6.6);
  const tile = at('d-item:tile');
  const toggle = at('d-item-sealed:toggle', 0.75);
  return (
    <AbsoluteFill>
      <Camera keys={[WIDE(0), WIDE(click + 6), read(sec(2.2), union('d-item:doc', 'd-item:col'), 1.4), readKey(sec(4.6), 'd-item:doc', 1.6), readKey(flip + sec(1), 'd-item-sealed:doc', 1.6), readKey(duration, 'd-item-sealed:doc', 1.65)]}>
        <Window states={[{ src: 'd-home', at: 0 }, { src: 'd-item', at: click }, { src: 'd-item-sealed', at: flip }]} />
        <Cursor
          keys={[cur(0, 700, 760), cur(click, tile[0], tile[1], true), cur(sec(3), tile[0] + 380, tile[1] - 200), cur(flip - sec(0.5), toggle[0], toggle[1]), cur(flip, toggle[0], toggle[1], true), cur(duration, toggle[0] + 40, toggle[1] + 60)]}
          visibleFrom={0}
          visibleTo={flip + sec(1.4)}
        />
      </Camera>
      <Callout text="Caught here, before anything is sent" at={sec(2.4)} outAt={flip - 10} />
      <Callout text="All that would leave" at={flip + sec(0.6)} outAt={duration - 16} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ the phone */

const PHONE = { w: 390, h: 844, pad: 12 };
const Phone: React.FC<{ states: State[] }> = ({ states }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: -(PHONE.w / 2 + PHONE.pad),
        top: -(PHONE.h / 2 + PHONE.pad),
        width: PHONE.w + PHONE.pad * 2,
        height: PHONE.h + PHONE.pad * 2,
        borderRadius: 64,
        padding: PHONE.pad,
        background: 'linear-gradient(145deg, #2c2b52, #14132c)',
        boxShadow: '0 60px 120px rgba(40,38,100,0.4), inset 0 0 0 2px rgba(255,255,255,0.12)',
      }}
    >
      <div style={{ position: 'relative', width: PHONE.w, height: PHONE.h, borderRadius: 52, overflow: 'hidden', background: theme.navy2 }}>
        {states.map((s, i) => {
          const next = states[i + 1];
          const opacity = i === 0 ? 1 : interpolate(frame, [s.at, s.at + 12], [0, 1], { ...clamp, easing: easeOut });
          if (frame < s.at - 1 || (next && frame >= next.at + 14)) return null;
          return <Img key={s.src} src={staticFile(`app/${s.src}.png`)} style={{ position: 'absolute', inset: 0, width: PHONE.w, height: PHONE.h, opacity }} />;
        })}
      </div>
    </div>
  );
};

export const PhoneScene: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = popAt(frame, fps, 0, 18);
  const add = sec(1.2);
  const item = sec(3.6);
  const sealed = sec(6.0);
  return (
    <AbsoluteFill>
      <Camera keys={[{ f: 0, x: 0, y: 0, z: 1.08 }, { f: sec(3.2), x: 0, y: 0, z: 1.1 }, { f: item + sec(1.2), x: 0, y: -150, z: 1.55 }, { f: duration, x: 0, y: -150, z: 1.6 }]}>
        <div style={{ transform: `translateY(${String((1 - enter) * 200)}px)`, opacity: enter }}>
          <Phone states={[{ src: 'p-home', at: 0 }, { src: 'p-add', at: add }, { src: 'p-item', at: item }, { src: 'p-item-sealed', at: sealed }]} />
        </div>
      </Camera>
      <Callout text="Sealed on the phone itself" at={sec(3.0)} outAt={duration - 16} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ ask, receipt */

export const AskScene: React.FC<SceneProps> = ({ duration }) => {
  const send = sec(1.6);
  const flight = send + sec(0.3);
  const answer = sec(6.4);
  const askBtn = at('d-typed:ask', 0.97);
  return (
    <AbsoluteFill>
      <Camera
        keys={[
          readKey(0, 'd-typed:ask', 1.3),
          readKey(send, 'd-typed:ask', 1.35),
          read(flight + sec(1.0), union('d-flight:question', 'd-flight:chambers', 'd-flight:payload'), 1.5),
          readKey(answer - sec(0.6), 'd-flight:payload', 1.7),
          readKey(answer + sec(0.8), 'd-answer:answer', 1.7),
          readKey(duration, 'd-answer:answer', 1.75),
        ]}
      >
        <Window states={[{ src: 'd-typed', at: 0 }, { src: 'd-flight', at: flight }, { src: 'd-answer', at: answer }]} />
        <Cursor keys={[cur(0, askBtn[0] - 120, askBtn[1] + 80), cur(send, askBtn[0], askBtn[1], true), cur(send + sec(1), askBtn[0] + 30, askBtn[1] + 120)]} visibleTo={send + sec(1)} />
      </Camera>
      <Callout text="Nemotron reads only sealed text" at={flight + sec(0.8)} outAt={answer - 10} />
      <Callout text="Real values filled in on this computer" at={answer + sec(0.6)} outAt={duration - 16} />
    </AbsoluteFill>
  );
};

export const ReceiptScene: React.FC<SceneProps> = ({ duration }) => {
  const tamper = sec(7.6);
  const ghost = at('d-receipt:ghost');
  const proofs: Box = { x: 1000, y: 640, w: 420, h: 220 };
  return (
    <AbsoluteFill>
      <Camera keys={[readKey(0, 'd-answer:col', 1.0), readKey(sec(1.8), 'd-answer:col', 1.05), read(sec(3.6), proofs, 1.9), read(tamper + sec(0.8), proofs, 1.95), read(duration, proofs, 2.0)]}>
        <Window states={[{ src: 'd-answer', at: 0 }, { src: 'd-receipt', at: sec(2.4) }, { src: 'd-tamper', at: tamper }]} />
        <Cursor keys={[cur(sec(4), ghost[0] + 200, ghost[1] + 90), cur(tamper - sec(0.4), ghost[0], ghost[1]), cur(tamper, ghost[0], ghost[1], true), cur(duration, ghost[0] + 60, ghost[1] + 80)]} visibleFrom={sec(4)} visibleTo={tamper + sec(1.2)} />
      </Camera>
      <Callout text="Signed by the relay, checked by Airlock" at={sec(3.0)} outAt={tamper - 10} />
      <Callout text="One changed byte: the check fails" at={tamper + sec(0.5)} outAt={duration - 16} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ leak test */

export const LeakScene: React.FC<SceneProps> = ({ duration }) => {
  const t1 = sec(3.4);
  const t2 = sec(6.2);
  const t3 = sec(8.6);
  return (
    <AbsoluteFill>
      <Camera keys={[WIDE(0), WIDE(sec(1.2)), readKey(sec(3.0), 'd-leak:alert', 1.6), read(t1 + sec(1.2), union('d-leak-run1:table', 'd-leak-run1:stream'), 1.3), read(duration, union('d-leak-run1:table', 'd-leak-run1:stream'), 1.33)]}>
        <Window states={[{ src: 'd-leak', at: 0 }, { src: 'd-leak-run1', at: t1 }, { src: 'd-leak-run2', at: t2 }, { src: 'd-leak-done', at: t3 }]} />
      </Camera>
      <Callout text="Nemotron 3 Ultra plays red team" at={sec(1.0)} outAt={duration - 16} />
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ value: React.ReactNode; label: string; at: number; tone?: string }> = ({ value, label, at: start, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, start, 16);
  return (
    <div style={{ opacity: p, transform: `translateY(${String((1 - p) * 30)}px)`, textAlign: 'center' }}>
      <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em', color: tone ?? theme.navy, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 16, fontSize: 34, fontWeight: 600, color: theme.muted }}>{label}</div>
    </div>
  );
};

export const ScoreScene: React.FC<SceneProps> = () => {
  const held = Math.round(useRoll(0, 1083, 10, 90));
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: theme.font, gap: 70 }}>
      <Stat value={<>{held.toLocaleString('en-US')}<span style={{ color: theme.blue }}> / 1,170</span></>} label="planted secrets held on the device" at={6} />
      <div style={{ display: 'flex', gap: 140 }}>
        <Stat value="87" label="got through, every one published" at={sec(4.6)} tone="#c0364a" />
        <Stat value="$0.05" label="for the whole attack" at={sec(9.0)} />
      </div>
    </AbsoluteFill>
  );
};

export const OutroScene: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, 4, 14);
  const q = popAt(frame, fps, sec(1.6), 16);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: theme.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: p, transform: `scale(${String(0.92 + p * 0.08)})` }}>
        <Logo size={96} />
        <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.03em', color: theme.navy }}>Airlock</span>
      </div>
      <div style={{ marginTop: 28, fontSize: 46, fontWeight: 700, color: theme.ink }}>
        <BlurText text="Your secrets stay home." at={sec(1.0)} />
      </div>
      <div style={{ marginTop: 40, fontSize: 28, fontWeight: 600, color: theme.muted, opacity: q, display: 'flex', gap: 22 }}>
        <span>NVIDIA Nemotron</span>
        <span style={{ color: theme.blue }}>·</span>
        <span>Nebius Token Factory</span>
        <span style={{ color: theme.blue }}>·</span>
        <span>github.com/asiyetajwa/airlock</span>
      </div>
    </AbsoluteFill>
  );
};
