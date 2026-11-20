import type { Point } from "../../../shared/types";
import { arcLength, dist } from "./fitting";

export const ARTBOARD = { width: 800, height: 600 };
/**
 * 相邻采样点的最大允许跨度（文档单位）。
 * 超过该距离说明指针快速掠过、事件丢失或离开画板，
 * 必须断开成两段，绝不把两段不相连的笔迹接起来。
 */
export const JUMP_LIMIT = 150;

export function insideArtboard(p: Point) {
  return (
    p.x >= 0 && p.y >= 0 && p.x <= ARTBOARD.width && p.y <= ARTBOARD.height
  );
}

/**
 * 把采样点追加到笔画分段：
 * - 画板外的点不参与笔迹，并标记下一个入板点需要另起一段；
 * - 与上一有效点跨度超过 JUMP_LIMIT 时另起一段；
 * - 与上一点几乎重合时忽略，避免手抖产生零长度段。
 */
export function appendSample(
  segments: Point[][],
  p: Point,
  prev: Point | null,
  wasOutside: boolean,
): { segments: Point[][]; prev: Point | null; wasOutside: boolean } {
  if (!insideArtboard(p)) return { segments, prev, wasOutside: true };
  if (prev && dist(prev, p) < 0.5) {
    return { segments, prev: p, wasOutside };
  }
  if (!prev || wasOutside || dist(prev, p) > JUMP_LIMIT || !segments.length) {
    segments.push([{ x: p.x, y: p.y }]);
  } else {
    segments[segments.length - 1].push({ x: p.x, y: p.y });
  }
  return { segments, prev: p, wasOutside: false };
}

/** 丢弃过短的无效段（总弧长不足 1 文档单位视为误触） */
export function validSegments(segments: Point[][]) {
  return segments.filter((s) => s.length >= 2 && arcLength(s) >= 1);
}
