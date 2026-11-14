import type { ReactNode } from 'react';
import './mascot.css';

/**
 * The Gurukul owl: one drawing, 24 faces. Ported from Eklavya's mascot (same expression names,
 * labels, state mapping and fallbacks), redrawn for the owl's face disc: eyes at (84,76) and
 * (116,76), mouth around (100,90), on a 200 by 200 grid.
 */

/** Every face, in gallery order, with the words a gallery or an accessible name uses. */
export const MASCOT_EXPRESSIONS = {
  neutral: 'Calm and attentive',
  happy: 'Happy',
  excited: 'Excited',
  celebrate: 'Celebrating',
  curious: 'Curious',
  thinking: 'Thinking',
  focused: 'Focused',
  wink: 'Offering a tip',
  surprised: 'Surprised',
  confused: 'Seeking clarity',
  worried: 'Concerned',
  sad: 'Sad',
  sleepy: 'Resting',
  proud: 'Proud',
  determined: 'Determined',
  idea: 'Having an idea',
  laugh: 'Laughing',
  love: 'Loving it',
  shy: 'Shy',
  relieved: 'Relieved',
  starstruck: 'Starstruck',
  cool: 'Cool and confident',
  hopeful: 'Hopeful',
  nervous: 'Nervous',
} as const;

export type MascotExpression = keyof typeof MASCOT_EXPRESSIONS;

/** Product moments, each mapped to one face so the owl reacts the same way everywhere. */
export const MASCOT_STATES = {
  idle: 'sleepy',
  info: 'neutral',
  success: 'happy',
  complete: 'celebrate',
  milestone: 'celebrate',
  empty: 'curious',
  notFound: 'curious',
  loading: 'cool',
  review: 'focused',
  tip: 'wink',
  new: 'surprised',
  validation: 'confused',
  warning: 'worried',
  error: 'sad',
} as const satisfies Record<string, MascotExpression>;

export type MascotState = keyof typeof MASCOT_STATES;
export type MascotVariant = 'body' | 'face' | 'loading';

const own = (o: object, k: unknown): k is string => typeof k === 'string' && Object.hasOwn(o, k);

/** The face for a state; an unknown state (or `toString`) is `neutral`. */
export function mascotExpressionForState(state: unknown): MascotExpression {
  return own(MASCOT_STATES, state) ? MASCOT_STATES[state as MascotState] : 'neutral';
}

/** Sizes are px, clamped to 16–512; anything not a positive finite number is 64. */
function dimension(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(512, Math.max(16, n)) : 64;
}

// Shared pieces of the face. Stroke-only paths carry no fill (the CSS makes them fill none).
const eyes = (
  <>
    <circle cx="84" cy="76" r="4.5" />
    <circle cx="116" cy="76" r="4.5" />
  </>
);
const closed = <path d="M77 79q7-9 14 0M109 79q7-9 14 0" />;
const smile = <path d="M90 88q10 11 20 0" />;
const shine = (y: number) => (
  <>
    <circle className="g-mascot__shine" cx="85.5" cy={y} r="1.5" />
    <circle className="g-mascot__shine" cx="117.5" cy={y} r="1.5" />
  </>
);
const blush = (
  <g className="g-mascot__blush">
    <ellipse cx="73" cy="88" rx="6" ry="3.5" />
    <ellipse cx="127" cy="88" rx="6" ry="3.5" />
  </g>
);
const sweat = <path className="g-mascot__sweat" d="M138 48q-5 7-5 10a5 5 0 0 0 10 0q0-3-5-10Z" />;
const open = (
  <>
    <path d="M88 87q12 24 24 0Z" fill="currentColor" />
    <path className="g-mascot__tongue" d="M94 98q6-4 12 0" />
  </>
);
const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}Z`;

const FACES: Record<MascotExpression, ReactNode> = {
  neutral: (
    <>
      {eyes}
      <path d="M93 91q7 5 14 0" />
    </>
  ),
  happy: (
    <>
      {closed}
      {smile}
    </>
  ),
  excited: (
    <>
      {eyes}
      <path d="M89 88q11 22 22 0Z" fill="currentColor" />
      <path className="g-mascot__tongue" d="M95 98q5-3 10 0" />
    </>
  ),
  celebrate: (
    <>
      {closed}
      <path d="M90 88q10 22 20 0Z" fill="currentColor" />
      <path className="g-mascot__tongue" d="M95 99h10" />
    </>
  ),
  curious: (
    <>
      {eyes}
      <path d="M94 92q6-4 12 0" />
    </>
  ),
  thinking: (
    <>
      {eyes}
      <path d="M94 92h10" />
    </>
  ),
  focused: (
    <>
      {eyes}
      <path d="M93 92h14" />
    </>
  ),
  wink: (
    <>
      <circle cx="84" cy="76" r="4.5" />
      <path d="M109 79q7-9 14 0" />
      {smile}
    </>
  ),
  surprised: (
    <>
      {eyes}
      <ellipse cx="100" cy="93" rx="5" ry="7" />
    </>
  ),
  confused: (
    <>
      {eyes}
      <path d="M91 94q5-7 10-2t9-2" />
    </>
  ),
  worried: (
    <>
      {eyes}
      <path d="M91 96q9-9 18 0" />
    </>
  ),
  sad: (
    <>
      {eyes}
      <path d="M91 97q9-9 18 0" />
    </>
  ),
  sleepy: <path d="M77 75q7 6 14 0M109 75q7 6 14 0M95 92h10" />,
  proud: (
    <>
      {closed}
      <path d="M88 88q12 11 24 0" />
    </>
  ),
  determined: (
    <>
      {eyes}
      <path d="M92 93q8-3 16 0" />
    </>
  ),
  idea: (
    <>
      {eyes}
      {shine(74.3)}
      <path d="M89 88q11 18 22 0Z" fill="currentColor" />
    </>
  ),
  laugh: (
    <>
      <path d="M79 70l9 6-9 6M121 70l-9 6 9 6" />
      {open}
      {blush}
    </>
  ),
  love: (
    <>
      <path
        d="M84 84l-7-7a4 4 0 0 1 7-5 4 4 0 0 1 7 5ZM116 84l-7-7a4 4 0 0 1 7-5 4 4 0 0 1 7 5Z"
        fill="currentColor"
      />
      <path d="M92 90q4 4 8 0q4 4 8 0" />
      {blush}
    </>
  ),
  shy: (
    <>
      <circle cx="82" cy="79" r="4" />
      <circle cx="114" cy="79" r="4" />
      <path d="M94 94q3-2 6 0t6 0" />
      {blush}
    </>
  ),
  relieved: (
    <>
      {closed}
      {smile}
      {sweat}
    </>
  ),
  starstruck: (
    <>
      <path d={`${sparkle(84, 76, 8)}${sparkle(116, 76, 8)}`} fill="currentColor" />
      {open}
    </>
  ),
  cool: (
    <>
      <path d="M76 70h16v5q0 8-8 8q-8 0-8-8ZM108 70h16v5q0 8-8 8q-8 0-8-8Z" fill="currentColor" />
      <path d="M72 71h56M94 93q9 3 15-4" />
    </>
  ),
  hopeful: (
    <>
      <circle cx="84" cy="72" r="4.5" />
      <circle cx="116" cy="72" r="4.5" />
      {shine(70.3)}
      <path d="M94 90q6 5 12 0" />
    </>
  ),
  nervous: (
    <>
      <circle cx="88" cy="76" r="4.5" />
      <circle cx="120" cy="76" r="4.5" />
      <path d="M90 94q3-3 6 0t6 0t6 0t6 0" />
      {sweat}
    </>
  ),
};

/** Eyebrows, for the faces that have them; drawn above the eyes. */
const BROWS: Partial<Record<MascotExpression, string>> = {
  curious: 'M77 65h14m18-6 14 5',
  thinking: 'M77 64h14m19-2 13 3',
  focused: 'M77 63l14 4m18 0 14-4',
  confused: 'M77 64l14-5m18 4h14',
  worried: 'M77 65l14-6m18 0 14 6',
  sad: 'M77 66l14-5m18 0 14 5',
  proud: 'M77 62q7-4 14 0m18 0q7-4 14 0',
  determined: 'M76 60l15 7m18 0 15-7',
  hopeful: 'M77 62l14-3m18 0 14 3',
  nervous: 'M77 64l14-4m18 0 14 4',
};

/** Decorations around the head: sparkles and a lightbulb. The face variant's viewBox keeps them in view. */
const ACCENTS: Partial<Record<MascotExpression, ReactNode>> = {
  celebrate: (
    <path className="g-mascot__sparkle" d={`${sparkle(46, 30, 7)}${sparkle(158, 64, 5)}`} />
  ),
  proud: <path className="g-mascot__sparkle" d={sparkle(156, 26, 5)} />,
  idea: (
    <g className="g-mascot__bulb">
      <path className="g-mascot__rays" d="M155 15v-3m9 6 2-2m-20 2-2-2" />
      <circle cx="155" cy="28" r="7" />
      <path className="g-mascot__bulb-base" d="M152 36h6v4h-6Z" />
    </g>
  ),
};

const VIEWBOX: Record<MascotVariant, string> = {
  body: '0 0 200 200',
  face: '36 12 128 128',
  loading: '0 0 200 200',
};

export interface MascotProps {
  /** A product moment. Wins over `expression`; an unknown state shows `neutral`. */
  state?: MascotState;
  /** A face for editorial art. Unknown values show `neutral`. Default: `neutral`. */
  expression?: MascotExpression;
  /** `body` the whole owl, `face` the head cropped for 24–40px, `loading` the waiting loop. Default: `body`. */
  variant?: MascotVariant;
  /** Width and height in px, clamped to 16–512. Default: 64. */
  size?: number;
  /** Names the owl for a screen reader. Without it the owl is decorative: the text beside it carries the meaning. */
  label?: string;
  /** Draws the owl on a fixed light or dark ground, whatever the theme, to compare the two. Default: none (the page's ground). */
  ground?: 'light' | 'dark';
  /** Holds the loading loop still where it is, for a pause control. Default: false. */
  paused?: boolean;
  className?: string;
}

/**
 * The owl. Decorative by default; give it a `label` only when the picture says something the
 * text around it does not. A loader's words belong to one surrounding `role="status"` region.
 */
export function Mascot({
  state,
  expression,
  variant,
  size,
  label,
  ground,
  paused,
  className,
}: MascotProps) {
  const face: MascotExpression = state
    ? mascotExpressionForState(state)
    : own(FACES, expression)
      ? (expression as MascotExpression)
      : 'neutral';
  const kind: MascotVariant = own(VIEWBOX, variant) ? (variant as MascotVariant) : 'body';
  const px = dimension(size);
  const brow = BROWS[face];
  const classes = [
    'g-mascot',
    kind === 'loading' && 'g-mascot--loading',
    (ground === 'light' || ground === 'dark') && `g-mascot--ground-${ground}`,
    paused && 'g-mascot--paused',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX[kind]}
      width={px}
      height={px}
      className={classes}
      data-expression={face}
      data-variant={kind}
      focusable="false"
      {...(label == null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <ellipse className="g-mascot__shadow" cx="100" cy="184" rx="50" ry="6" />
      {ACCENTS[face]}
      <g className="g-mascot__owl">
        <g className="g-mascot__feet">
          <rect
            className="g-mascot__foot g-mascot__foot--l"
            x="78"
            y="170"
            width="16"
            height="10"
            rx="5"
          />
          <rect
            className="g-mascot__foot g-mascot__foot--r"
            x="106"
            y="170"
            width="16"
            height="10"
            rx="5"
          />
        </g>
        <g className="g-mascot__dark">
          <path d="M56 46l2-30 26 16Z" />
          <path d="M144 46l-2-30-26 16Z" />
        </g>
        <path
          className="g-mascot__body"
          d="M100 24c40 0 58 34 58 80 0 40-24 70-58 70s-58-30-58-70c0-46 18-80 58-80Z"
        />
        <path
          className="g-mascot__dark g-mascot__wing g-mascot__wing--l"
          d="M44 98q-16 32 6 58l10-42Z"
        />
        <path
          className="g-mascot__dark g-mascot__wing g-mascot__wing--r"
          d="M156 98q16 32-6 58l-10-42Z"
        />
        <ellipse className="g-mascot__belly" cx="100" cy="144" rx="30" ry="24" />
        <path
          className="g-mascot__feathers"
          d="M86 138q7 6 14 0q7 6 14 0M90 152q5 5 10 0q5 5 10 0"
        />
        <ellipse className="g-mascot__disc" cx="100" cy="80" rx="46" ry="34" />
        <g
          className="g-mascot__face"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {FACES[face]}
          {brow && <path d={brow} />}
        </g>
      </g>
    </svg>
  );
}
