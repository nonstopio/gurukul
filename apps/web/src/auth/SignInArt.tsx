import type { CSSProperties } from 'react';

/** Staggered entrance: step `n` waits n x 30ms (see `.rise` in learn.css). */
export const rise = (n: number) => ({ '--i': n }) as CSSProperties;

type Circle = readonly [x: number, y: number, r: number];

/** A cartoon blob: circles with a thick ink outline drawn under their fills, plus soft highlights. */
function Blob({
  c,
  fill,
  hi = [],
}: {
  c: readonly Circle[];
  fill: string;
  hi?: readonly Circle[];
}) {
  const circles = (list: readonly Circle[], className: string) =>
    list.map(([x, y, r]) => <circle key={`${x}-${y}`} className={className} cx={x} cy={y} r={r} />);
  return (
    <>
      {circles(c, 'art-ol')}
      {circles(c, fill)}
      {circles(hi, 'art-highlight')}
    </>
  );
}

function Tree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className="art-wood art-o"
        d="M-14 0 L-10 -150 L-48 -200 L-40 -206 L-6 -168 L-2 -230 L8 -230 L10 -170 L44 -210 L52 -202 L14 -150 L16 0Z"
      />
      <Blob
        c={[
          [-70, -250, 70],
          [0, -300, 84],
          [72, -250, 70],
          [-40, -200, 58],
          [44, -196, 58],
        ]}
        fill="art-leaf"
        hi={[
          [-30, -320, 34],
          [-82, -264, 26],
        ]}
      />
    </g>
  );
}

function Bush({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Blob
        c={[
          [-60, -20, 44],
          [0, -44, 58],
          [62, -22, 46],
        ]}
        fill="art-leaf"
        hi={[[-14, -66, 22]]}
      />
    </g>
  );
}

/** The four things a person learns about Gurukul, written on the board one at a time. */
const LINES = [
  'Teammates teach teammates',
  'Short lessons, plain words',
  'Quick quizzes as you go',
  'A certificate at the end',
];

const TEACHER_HAIR: readonly Circle[] = [
  [1266, 318, 16],
  [1272, 298, 18],
  [1289, 282, 19],
  [1311, 275, 20],
  [1333, 282, 19],
  [1350, 298, 18],
  [1355, 318, 16],
  [1298, 294, 16],
  [1324, 294, 16],
];

const STUDENT_CURLS: readonly Circle[] = [
  [1596, 768, 22],
  [1614, 742, 24],
  [1640, 728, 25],
  [1668, 730, 25],
  [1692, 746, 24],
  [1706, 772, 22],
  [1600, 800, 20],
  [1702, 802, 20],
  [1650, 760, 30],
  [1620, 786, 24],
  [1684, 788, 24],
  [1650, 812, 30],
  [1628, 826, 22],
  [1672, 826, 22],
  [1612, 842, 16],
  [1650, 850, 20],
  [1688, 842, 16],
];

/** The teacher, drawn in a 1920-wide frame and placed by the caller's transform. */
function Teacher() {
  return (
    <>
      <g className="art-arm-open">
        <path className="art-limb-o" d="M1188 590 Q1182 660 1180 722" />
        <path className="art-limb" d="M1188 590 Q1182 660 1180 722" />
        <g className="art-forearm-open">
          <path className="art-limb-o" d="M1180 722 Q1176 790 1172 846" />
          <path className="art-limb" d="M1180 722 Q1176 790 1172 846" />
          <path
            className="art-skin art-o"
            d="M1158 840 Q1156 874 1166 884 Q1178 892 1188 878 Q1194 860 1186 840Z"
          />
          <path className="art-ln" d="M1170 860 L1170 878 M1178 858 L1179 878" />
        </g>
      </g>
      <path
        className="art-trousers art-o"
        d="M1230 766 L1392 766 L1400 1100 L1320 1100 L1311 862 L1302 1100 L1222 1100Z"
      />
      <path className="art-ln" d="M1311 790 L1311 862 M1240 790 Q1262 800 1270 784" />
      <path className="art-skin art-o" d="M1290 392 L1332 392 L1338 444 L1284 444Z" />
      <path className="art-shade" d="M1290 392 L1332 392 L1334 420 Q1310 430 1288 420Z" />
      <path
        className="art-tee art-o"
        d="M1250 446 Q1310 432 1370 446 L1416 460 Q1440 470 1448 500 L1460 590 L1408 602 L1400 560 L1396 772 Q1310 784 1226 772 L1220 560 L1212 602 L1160 590 L1172 500 Q1180 470 1204 460Z"
      />
      <path
        className="art-tee-dark"
        d="M1380 470 L1404 470 L1400 560 L1396 770 L1372 772 Q1384 620 1380 470Z"
      />
      <path
        className="art-tee-dark art-o"
        d="M1282 442 Q1310 474 1338 442 L1346 446 Q1310 488 1274 446Z"
      />
      <path className="art-ln" d="M1212 602 L1220 560 M1408 602 L1400 560" />
      <g className="art-head">
        <ellipse className="art-skin art-o" cx="1263" cy="350" rx="10" ry="16" />
        <ellipse className="art-skin art-o" cx="1357" cy="350" rx="10" ry="16" />
        <path
          className="art-skin art-o"
          d="M1264 330 Q1262 392 1290 414 Q1310 426 1330 414 Q1358 392 1356 330 Q1356 290 1310 288 Q1264 290 1264 330Z"
        />
        <path
          className="art-hair art-o3"
          d="M1264 348 Q1266 398 1292 416 Q1310 428 1328 416 Q1354 398 1356 348 Q1350 374 1338 380 Q1326 370 1310 372 Q1294 370 1282 380 Q1270 374 1264 348Z"
        />
        <path
          className="art-skin"
          d="M1294 386 Q1310 392 1326 386 Q1318 402 1310 402 Q1302 402 1294 386Z"
        />
        <path
          className="art-hair"
          d="M1290 376 Q1310 366 1330 376 Q1320 382 1310 380 Q1300 382 1290 376Z"
        />
        <path
          className="art-mouth art-white art-o3"
          d="M1295 387 Q1310 401 1325 387 Q1310 391 1295 387Z"
        />
        <path className="art-ln" d="M1310 338 Q1302 360 1307 365 Q1313 368 1318 363" />
        <g className="art-eyes">
          <ellipse className="art-white art-o3" cx="1290" cy="341" rx="9" ry="5.5" />
          <ellipse className="art-white art-o3" cx="1330" cy="341" rx="9" ry="5.5" />
          <g className="art-pupils">
            <circle className="art-hair" cx="1289" cy="340" r="5.2" />
            <circle className="art-hair" cx="1329" cy="340" r="5.2" />
            <circle className="art-white" cx="1291" cy="338" r="1.5" />
            <circle className="art-white" cx="1331" cy="338" r="1.5" />
          </g>
        </g>
        <path className="art-hair" d="M1275 326 Q1290 316 1304 322 L1303 327 Q1290 323 1276 330Z" />
        <path className="art-hair" d="M1345 326 Q1330 316 1316 322 L1317 327 Q1330 323 1344 330Z" />
        <Blob c={TEACHER_HAIR} fill="art-hair" />
        <path
          className="art-hair"
          d="M1262 334 Q1258 292 1290 282 Q1310 272 1330 282 Q1362 292 1358 334 Q1350 308 1310 306 Q1270 308 1262 334Z"
        />
        <path
          className="art-strand"
          d="M1280 292 q6 -8 14 -4 M1306 280 q6 -8 14 -3 M1334 292 q6 -8 13 -2 M1296 300 q5 -6 12 -3"
        />
      </g>
      <g>
        <path className="art-limb-o" d="M1434 590 Q1440 620 1438 650" />
        <path className="art-limb" d="M1434 590 Q1440 620 1438 650" />
        <g className="art-forearm-point">
          <path className="art-limb-o" d="M1438 650 Q1392 606 1334 560" />
          <path className="art-limb" d="M1438 650 Q1392 606 1334 560" />
          {/* the smartwatch */}
          <rect
            className="art-hair art-o3"
            x="-14"
            y="-15"
            width="30"
            height="30"
            rx="8"
            transform="translate(1352 574) rotate(40)"
          />
          <g transform="translate(1330 556) rotate(-8)">
            <path
              className="art-skin art-o"
              d="M6 -14 Q-12 -20 -26 -14 L-66 -14 Q-78 -9 -66 -3 L-30 -2 Q-30 10 -20 16 Q-4 20 8 10 Q14 -2 6 -14Z"
            />
            <path className="art-ln" d="M-24 4 Q-14 8 -6 4" />
          </g>
        </g>
      </g>
    </>
  );
}

/**
 * Decorative only (hidden from assistive tech): an outdoor class. A teammate teaches at a
 * chalkboard that writes what Gurukul is, line by line, then turns to two teammates who nod. The
 * ~7 s lesson loops in CSS (`.signin-art` in learn.css); reduced motion shows the finished board.
 * Colours are the `--art-*` roles in tokens.css, the same in both themes.
 */
export function SignInArt() {
  return (
    <div className="signin-art rise" style={rise(3)} aria-hidden="true">
      <svg viewBox="0 0 960 840" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="signin-art-sky" x1="0" y1="0" x2="1" y2="0.2">
            <stop className="art-sky-top" offset="0" />
            <stop className="art-sky-bottom" offset="1" />
          </linearGradient>
        </defs>
        <rect width="960" height="840" fill="url(#signin-art-sky)" />
        <circle className="art-sun art-o" cx="872" cy="84" r="52" />
        <circle className="art-sun-light" cx="856" cy="68" r="25" />
        <g className="art-clouds">
          <path
            className="art-white art-o3"
            transform="translate(-110 -36) scale(0.6)"
            d="M284 212 Q270 176 306 170 Q314 128 362 132 Q392 92 444 116 Q494 108 504 156 Q544 162 536 212Z"
          />
          <path
            className="art-white art-o3"
            transform="translate(-60 -40) scale(0.55)"
            d="M1228 240 Q1218 214 1246 210 Q1254 180 1290 184 Q1314 156 1350 176 Q1388 174 1392 206 Q1418 210 1410 240Z"
          />
        </g>
        {[30, 54, 42].map((y, i) => (
          <g key={y} className="art-flight" style={{ '--bird': i } as CSSProperties}>
            <g transform={`translate(0 ${y}) scale(${1 - i * 0.15})`}>
              <path className="art-bird" d="M-16 -7 Q-7 -11 0 2 Q7 -11 16 -7" />
            </g>
          </g>
        ))}
        <path
          className="art-mountain art-o3"
          d="M-10 502 L125 294 L220 406 L320 190 L430 366 L550 230 L650 366 L780 214 L910 366 L970 294 V550 H-10Z"
        />
        <path
          className="art-snow"
          d="M320 190 L299 230 L311 223.6 L320 238 L330 222 L342 230Z M780 214 L757 254 L770 247.6 L780 262 L791 246 L804 255.6Z M550 230 L532 262 L542 257.2 L550 270 L558 257.2 L568 262Z"
        />
        <path
          className="art-hill art-o3"
          d="M-10 534 Q120 438 260 502 Q380 550 500 486 Q630 422 750 486 Q860 542 970 470 V598 H-10Z"
        />
        <path
          className="art-river"
          d="M-10 542 Q250 518 480 546.8 T970 530.8 V574 Q710 564.4 480 585.2 T-10 580.4Z"
        />
        <path className="art-grass" d="M-10 574 Q240 562.8 480 585.2 T970 574 V850 H-10Z" />
        <Tree x={10} y={600} s={0.6} />
        <Tree x={930} y={600} s={0.55} />
        <Bush x={20} y={650} s={0.6} />
        <Bush x={940} y={660} s={0.5} />

        {/* The chalkboard on its posts */}
        <path className="art-wood art-o" d="M108 470 H126 V610 H108Z M534 470 H552 V610 H534Z" />
        <path
          className="art-grass-dark"
          d="M96 612 l8 -12 l5 10 l6 -14 l6 14 l6 -9 l5 11Z M522 612 l8 -12 l5 10 l6 -14 l6 14 l6 -9 l5 11Z"
        />
        <rect className="art-wood art-o" x="30" y="86" width="600" height="392" rx="12" />
        <rect className="art-board art-o3" x="48" y="104" width="564" height="356" rx="6" />
        <text className="art-chalk art-heading" x="80" y="172" fontSize="46">
          Learning at Gurukul
        </text>
        <g className="art-writing">
          <path className="art-underline" pathLength="1" d="M80 192 Q250 198 450 189" />
          {LINES.map((line, i) => (
            <g key={line}>
              <text className="art-chalk art-line" y={252 + i * 54} fontSize="32">
                <tspan x="82">{i + 1}</tspan>
                <tspan x="114">{line}</tspan>
              </text>
              <rect
                className={`art-board art-wipe art-wipe-${i + 1}`}
                x="72"
                y={218 + i * 54}
                width="530"
                height="48"
              />
            </g>
          ))}
        </g>

        {/* The teacher behind the desk: drawn at 1920 wide, scaled into the scene */}
        <g transform="translate(-202.5 -46) scale(0.75)">
          <rect className="art-wood art-o" x="1080" y="780" width="490" height="26" rx="6" />
          <rect className="art-wood-dark art-o" x="1098" y="806" width="454" height="300" />
          <path
            className="art-ln"
            d="M1130 840 Q1150 900 1126 960 M1440 950 Q1420 1010 1444 1070"
          />
          <rect className="art-tee art-o3" x="1450" y="752" width="92" height="28" rx="4" />
          <rect className="art-top art-o3" x="1458" y="728" width="78" height="24" rx="4" />
          <rect className="art-sun art-o3" x="1462" y="708" width="68" height="20" rx="4" />
          <rect className="art-sun art-o3" x="1488" y="900" width="30" height="30" rx="2" />
          <rect className="art-white art-o3" x="1478" y="850" width="34" height="26" rx="2" />
          <Teacher />
        </g>

        {/* Two teammates seen from behind: long black hair and a green top */}
        <g transform="translate(-86 131.5) scale(0.65)">
          <path
            className="art-top art-o"
            d="M170 1090 Q190 962 330 934 L550 934 Q690 962 712 1090Z"
          />
          <path className="art-shade" d="M580 942 Q690 966 712 1090 H620 Q620 1000 580 942Z" />
          <g className="art-nod-left">
            <ellipse className="art-skin-light art-o" cx="340" cy="806" rx="11" ry="18" />
            <ellipse className="art-skin-light art-o" cx="540" cy="806" rx="11" ry="18" />
            <path
              className="art-hair art-o"
              d="M344 770 Q340 698 440 694 Q540 698 536 770 L552 1062 Q440 1092 328 1062Z"
            />
            <path
              className="art-strand"
              d="M400 712 Q382 860 372 1050 M424 704 Q414 860 412 1060 M448 704 Q452 860 456 1060 M474 710 Q492 860 506 1050 M380 740 Q364 860 352 1030 M500 740 Q518 860 528 1030"
            />
          </g>
        </g>
        {/* ...and short curly hair with a white collared shirt */}
        <g transform="translate(-272.5 131.5) scale(0.65)">
          <path
            className="art-shirt art-o"
            d="M1396 1090 Q1416 962 1540 938 L1760 938 Q1886 962 1906 1090Z"
          />
          <path
            className="art-shirt-shade"
            d="M1430 960 Q1410 1020 1404 1090 H1470 Q1470 1010 1490 950Z"
          />
          <path className="art-skin-deep art-o" d="M1612 860 L1688 860 L1694 946 L1606 946Z" />
          <path
            className="art-shirt art-o"
            d="M1560 922 L1650 956 L1740 922 L1760 946 L1650 990 L1540 946Z"
          />
          <path className="art-ln" d="M1650 956 L1650 990" />
          <g className="art-nod-right">
            <ellipse className="art-skin-deep art-o" cx="1578" cy="806" rx="12" ry="20" />
            <ellipse className="art-skin-deep art-o" cx="1722" cy="806" rx="12" ry="20" />
            <ellipse className="art-skin-deep art-o" cx="1650" cy="796" rx="72" ry="80" />
            <Blob c={STUDENT_CURLS} fill="art-hair" />
            <path
              className="art-strand"
              d="M1620 748 q5 -7 12 -3 M1652 738 q5 -7 12 -2 M1680 752 q5 -7 11 -2 M1636 790 q5 -7 12 -3 M1668 800 q5 -7 11 -2"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
