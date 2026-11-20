import { test } from "node:test";
import assert from "node:assert/strict";
import { fitStroke, arcLength } from "../src/features/drawing/lib/fitting.ts";
import {
  appendSample,
  insideArtboard,
  JUMP_LIMIT,
  validSegments,
} from "../src/features/drawing/lib/ink.ts";
import type { Point } from "../src/shared/types.ts";

// 与 model/freehand.ts 的 toleranceOf 保持一致（纯常量映射，避免引入 Vue 依赖）
const MIN_TOLERANCE = 0.4;
const MAX_TOLERANCE = 12;
function toleranceOf(smoothness: number) {
  return MIN_TOLERANCE + (smoothness / 100) * (MAX_TOLERANCE - MIN_TOLERANCE);
}

// 固定种子的伪随机，保证测试可复现
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("手抖的近直线被平滑成少量节点且误差在容差量级", () => {
  const rand = rng(7);
  const pts: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    pts.push({ x: i * 4, y: (rand() - 0.5) * 3 });
  }
  const tol = 2;
  const r = fitStroke(pts, tol)!;
  assert.ok(r, "应返回拟合结果");
  assert.ok(
    r.nodes.length < pts.length / 3,
    "手抖直线应被显著简化，实际节点: " + r.nodes.length,
  );
  assert.ok(r.maxError <= tol * 2.2, "最大偏差应受容差约束: " + r.maxError);
  assert.equal(r.corners, 0, "抖动不应被识别为尖角");
  // 误差必须是文档坐标：同一组点在任意“缩放”下结果一致
  const r2 = fitStroke(pts, tol)!;
  assert.equal(r2.nodes.length, r.nodes.length);
  assert.ok(Math.abs(r2.rmse - r.rmse) < 1e-12);
});

test("刻意画出的尖角被保留为零手柄硬拐点", () => {
  const pts: Point[] = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: i * 4, y: 0 });
  for (let i = 1; i <= 20; i++) pts.push({ x: 80, y: i * 4 });
  const r = fitStroke(pts, 2)!;
  assert.ok(r.corners >= 1, "L 形转角必须识别为尖角");
  const corner = r.nodes.find(
    (n) =>
      n.in.x === n.x && n.in.y === n.y && n.out.x === n.x && n.out.y === n.y,
  );
  assert.ok(corner, "尖角节点的手柄长度应为 0");
  // 尖角位置应在原始转角 (80, 0) 附近
  assert.ok(Math.hypot(corner!.x - 80, corner!.y - 0) < 1);
});

test("平滑波浪不会被误判为尖角，单点尖峰稳定识别为一个角", () => {
  const wave: Point[] = [];
  for (let t = 0; t <= 80; t++)
    wave.push({ x: t * 3, y: Math.sin(t / 6) * 30 });
  assert.equal(fitStroke(wave, 2)!.corners, 0);

  const spike: Point[] = [];
  for (let i = 0; i <= 15; i++) spike.push({ x: i * 6, y: 0 });
  spike.push({ x: 96, y: -40 });
  for (let i = 1; i <= 15; i++) spike.push({ x: 96 + i * 6, y: 0 });
  assert.equal(fitStroke(spike, 2)!.corners, 1);
  // 尖峰附近叠加手抖噪声，仍然只能识别出那一个刻意尖角
  const noisy = spike.map((p, i) => ({
    x: p.x + (i % 3) - 1,
    y: p.y + (i % 2 ? 0.8 : -0.8),
  }));
  assert.equal(fitStroke(noisy, 2)!.corners, 1);
});

test("沿方形描一圈的三个内部转角都被保留，相邻尖角不会互相抑制", () => {
  const pts: Point[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
    }
  };
  line(100, 100, 500, 100, 24);
  line(500, 100, 500, 400, 18);
  line(500, 400, 100, 400, 24);
  line(100, 400, 100, 100, 18);
  const r = fitStroke(pts, 4.5)!;
  assert.equal(r.corners, 3);
  assert.equal(r.nodes.length, 5);
});

test("平滑度越高容差越大、节点越少", () => {
  const rand = rng(21);
  const pts: Point[] = [];
  for (let t = 0; t <= 80; t++) {
    pts.push({
      x: t * 3,
      y: Math.sin(t / 6) * 30 + (rand() - 0.5) * 4,
    });
  }
  const rough = fitStroke(pts, toleranceOf(0))!;
  const smooth = fitStroke(pts, toleranceOf(100))!;
  assert.ok(smooth.nodes.length < rough.nodes.length);
  assert.ok(smooth.rmse >= rough.rmse - 1e-9);
  assert.ok(arcLength(pts) > 200);
});

test("离开画板后的采样另起一段，两段不会连接", () => {
  let segments: Point[][] = [];
  let prev: Point | null = null;
  let wasOutside = false;
  const feed = (p: Point) => {
    const next = appendSample(segments, p, prev, wasOutside);
    segments = next.segments;
    prev = next.prev;
    wasOutside = next.wasOutside;
  };
  feed({ x: 50, y: 50 });
  feed({ x: 60, y: 52 });
  feed({ x: -20, y: 400 }); // 画板外
  feed({ x: -5, y: 400 });
  feed({ x: 700, y: 550 }); // 回到画板，必须新起一段
  feed({ x: 710, y: 548 });
  assert.equal(validSegments(segments).length, 2);
  assert.ok(segments[0].every(insideArtboard));
  assert.ok(segments[1].every(insideArtboard));
  assert.deepEqual(segments[1][0], { x: 700, y: 550 });
});

test("画板内快速移动产生的跨度超过上限也断开，不把两笔接上", () => {
  let segments: Point[][] = [];
  let prev: Point | null = null;
  let wasOutside = false;
  const feed = (p: Point) => {
    const next = appendSample(segments, p, prev, wasOutside);
    segments = next.segments;
    prev = next.prev;
    wasOutside = next.wasOutside;
  };
  feed({ x: 100, y: 100 });
  feed({ x: 110, y: 100 });
  feed({ x: 100 + JUMP_LIMIT + 80, y: 100 });
  assert.equal(segments.length, 2);
});

test("过短的误触段被过滤，空输入返回 null", () => {
  assert.equal(fitStroke([{ x: 0, y: 0 }], 1), null);
  assert.equal(fitStroke([], 1), null);
  const segs = [
    [
      { x: 1, y: 1 },
      { x: 1.2, y: 1.1 },
    ],
  ];
  assert.equal(validSegments(segs).length, 0);
});

test("断开的两段各自独立拟合，不会共享节点或互相连接", () => {
  const segA: Point[] = [];
  const segB: Point[] = [];
  for (let i = 0; i <= 12; i++) segA.push({ x: 50 + i * 5, y: 100 });
  for (let i = 0; i <= 12; i++) segB.push({ x: 500 + i * 5, y: 400 });
  const valid = validSegments([segA, segB]);
  assert.equal(valid.length, 2);
  const fitted = valid.map((s) => fitStroke(s, 2)!);
  assert.equal(fitted.length, 2);
  // 两段的节点集合互不相交，且都至少有起止两个节点
  assert.ok(fitted.every((f) => f.nodes.length >= 2));
  const ids = new Set(
    fitted.flatMap((f) => f.nodes.map((n) => `${n.x},${n.y}`)),
  );
  const total = fitted.reduce((acc, f) => acc + f.nodes.length, 0);
  assert.equal(ids.size, total);
});
