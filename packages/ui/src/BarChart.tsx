// A bar chart drawn in SVG, no chart library. The picture is `role="img"` with a summary; the same
// numbers are in a visually hidden table for screen readers. With no data it renders nothing, so
// the caller shows an EmptyState instead.

import './bar-chart.css';

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** Names the chart: the figure's accessible name and the hidden table's caption. */
  title: string;
  /** What a value counts, in words, for the summary and the table: "active learners". */
  unit?: string;
  /** Column header for the labels in the hidden table. Default: "Period". */
  labelHeader?: string;
}

const W = 640;
const H = 260;
const PAD = { top: 24, right: 8, bottom: 28, left: 40 };
const TICKS = 4;

/** Rounds a maximum up to 1, 2, 4, 5 or 10 times a power of ten, so the axis ends on a clean number. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 4, 5, 10].find((s) => s * power >= max) as number;
  return step * power;
}

export function BarChart({ data, title, unit = '', labelHeader = 'Period' }: BarChartProps) {
  if (data.length === 0) return null;

  const top = niceMax(Math.max(...data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = slot * 0.62;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * i);

  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  const first = data[0] as BarChartDatum;
  const last = data[data.length - 1] as BarChartDatum;
  const what = unit ? ` ${unit}` : '';
  const summary =
    `${title}. ${data.length} bars. ${first.label}: ${first.value}${what}; ` +
    `${last.label}: ${last.value}${what}. Highest: ${peak.label}, ${peak.value}${what}.`;

  return (
    <figure className="g-chart">
      <svg className="g-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="g-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text
              className="g-chart__tick"
              x={PAD.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          const x = PAD.left + slot * i + (slot - barW) / 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                className={isLast ? 'g-chart__bar g-chart__bar--last' : 'g-chart__bar'}
                x={x}
                y={y(d.value)}
                width={barW}
                height={PAD.top + plotH - y(d.value)}
                rx="3"
              />
              {isLast ? (
                <text
                  className="g-chart__value"
                  x={x + barW / 2}
                  y={y(d.value) - 6}
                  textAnchor="middle"
                >
                  {d.value}
                </text>
              ) : null}
              <text className="g-chart__x" x={x + barW / 2} y={H - 8} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="g-chart__sr">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{labelHeader}</th>
            <th scope="col">{unit || 'Value'}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
