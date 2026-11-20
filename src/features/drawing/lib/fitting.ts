import type { Node, Point } from "../../../shared/types";

export interface FitResult {
  nodes: Node[];
  /** 原始采样点相对拟合曲线的均方根误差（文档单位） */
  rmse: number;
  /** 最大偏差（文档单位） */
  maxError: number;
  /** 参与拟合的采样点数 */
  samples: number;
  /** 保留下来的尖角数 */
  corners: number;
}

const DEFAULT_CORNER_ANGLE = (60 * Math.PI) / 180;

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function arcLength(points: Point[]) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** 点到线段的最短距离（端点处截断） */
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 去除近重复采样点，避免零长度段污染转角判断 */
function dedupe(points: Point[], minGap = 0.5): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (!last || dist(last, p) >= minGap) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * Ramer–Douglas–Peucker 折线简化，返回保留点的下标。
 * 尖角点由调用方预先切分，保证不会被容差吞掉。
 */
function rdpIndices(points: Point[], epsilon: number): number[] {
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let maxD = -1,
      idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = segmentDistance(points[i], points[lo], points[hi]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = true;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return keep.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
}

/**
 * 基于弦方向的尖角检测：用两侧固定弧长的弦计算转角，
 * 手抖只会产生短距离的小折返，刻意尖角则是持续的大转角。
 * 随后按分数做非极大值抑制，避免一个尖角被重复标记。
 */
function detectCorners(
  points: Point[],
  windowDist: number,
  minTurn: number,
): boolean[] {
  const n = points.length;
  const corner = new Array(n).fill(false);
  if (n < 5) return corner;
  const arc = [0];
  for (let i = 1; i < n; i++)
    arc.push(arc[i - 1] + dist(points[i - 1], points[i]));
  const score = new Array<number>(n).fill(0);
  // 尖角只在内部点检测：转角必须有左右两条弦共同支撑，
  // 端点只有单侧弦，在曲线起笔/收笔处极易被噪声误判，保持平滑手柄。
  for (let i = 1; i < n - 1; i++) {
    let i0 = i;
    while (i0 > 0 && arc[i] - arc[i0] < windowDist) i0--;
    let i1 = i;
    while (i1 < n - 1 && arc[i1] - arc[i] < windowDist) i1++;
    const v1x = points[i].x - points[i0].x,
      v1y = points[i].y - points[i0].y;
    const v2x = points[i1].x - points[i].x,
      v2y = points[i1].y - points[i].y;
    const l1 = Math.hypot(v1x, v1y),
      l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const cos = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
    score[i] = Math.acos(cos);
  }
  const candidates = score
    .map((s, i) => ({ s, i }))
    .filter((c) => c.s >= minTurn)
    .sort((a, b) => b.s - a.s);
  // 非极大值抑制只在局部索引邻域生效：防止同一个尖角被重复标记，
  // 同时不会误伤空间上靠近但彼此独立的多个尖角（如小方形的四个角）
  const suppressRadius = Math.max(2, Math.floor(n / 24));
  for (const c of candidates) {
    let blocked = false;
    for (
      let k = Math.max(0, c.i - suppressRadius);
      k <= Math.min(n - 1, c.i + suppressRadius);
      k++
    ) {
      if (corner[k]) {
        blocked = true;
        break;
      }
    }
    if (!blocked) corner[c.i] = true;
  }
  return corner;
}

/** 折线顶点转三次贝塞尔节点；尖角节点的手柄长度为 0，形成硬拐点 */
function buildNodes(points: Point[], corner: boolean[]): Node[] {
  const m = points.length - 1;
  return points.map((p, i) => {
    const node: Node = { x: p.x, y: p.y, in: { ...p }, out: { ...p } };
    if (corner[i]) return node;
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(m, i + 1)];
    const tx = (next.x - prev.x) / 6,
      ty = (next.y - prev.y) / 6;
    node.out = { x: p.x + tx, y: p.y + ty };
    node.in = { x: p.x - tx, y: p.y - ty };
    return node;
  });
}

function cubicPoint(a: Node, b: Node, t: number): Point {
  const p0 = a,
    c0 = a.out,
    c1 = b.in,
    p1 = b;
  const mt = 1 - t;
  return {
    x:
      mt ** 3 * p0.x +
      3 * mt ** 2 * t * c0.x +
      3 * mt * t ** 2 * c1.x +
      t ** 3 * p1.x,
    y:
      mt ** 3 * p0.y +
      3 * mt ** 2 * t * c0.y +
      3 * mt * t ** 2 * c1.y +
      t ** 3 * p1.y,
  };
}

/** 将拟合曲线离散成密折线，用于在文档坐标下量误差 */
function curvePolyline(nodes: Node[], perSegment = 24): Point[] {
  const line: Point[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    for (let j = 0; j < perSegment; j++) {
      line.push(cubicPoint(nodes[i], nodes[i + 1], j / perSegment));
    }
  }
  line.push({ ...nodes[nodes.length - 1] });
  return line;
}

function fitError(raw: Point[], nodes: Node[]) {
  const line = curvePolyline(nodes);
  let sumSq = 0,
    maxError = 0;
  for (const p of raw) {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
      best = Math.min(best, segmentDistance(p, line[i - 1], line[i]));
    }
    sumSq += best * best;
    maxError = Math.max(maxError, best);
  }
  return { rmse: Math.sqrt(sumSq / raw.length), maxError };
}

/**
 * 把一条连续笔迹的采样点拟合为可编辑贝塞尔曲线。
 * 全程只使用文档坐标：同一笔迹无论缩放多少，结果完全一致。
 */
export function fitStroke(
  input: Point[],
  tolerance: number,
  cornerAngle = DEFAULT_CORNER_ANGLE,
): FitResult | null {
  const points = dedupe(input);
  if (points.length < 2 || arcLength(points) < 1) return null;

  // 弦长随容差增大：平滑越强，越能滤掉短距离的手抖转角
  const windowDist = Math.max(5, tolerance * 1.5);
  const corner = detectCorners(points, windowDist, cornerAngle);
  const cornerIdx = corner.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

  // 在尖角处切开后分段 RDP，尖角必然保留为端点
  const bounds = [0, ...cornerIdx, points.length - 1];
  const kept = new Set<number>([0, points.length - 1]);
  for (let k = 1; k < bounds.length; k++) {
    const lo = bounds[k - 1],
      hi = bounds[k];
    if (hi - lo < 1) continue;
    for (const i of rdpIndices(points.slice(lo, hi + 1), tolerance)) {
      kept.add(lo + i);
    }
  }
  const keptIdx = [...kept].sort((a, b) => a - b);
  const simplified = keptIdx.map((i) => points[i]);
  const keptCorner = keptIdx.map((i) => corner[i]);
  const nodes = buildNodes(simplified, keptCorner);
  const { rmse, maxError } = fitError(points, nodes);

  return {
    nodes,
    rmse,
    maxError,
    samples: points.length,
    corners: keptCorner.filter(Boolean).length,
  };
}
