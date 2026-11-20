import { computed, reactive } from "vue";
import { doc } from "../../../shared/document";
import type { Node, Point, Shape } from "../../../shared/types";
import { discardEdit } from "./history";
import { DEFAULT_PATH_STYLE } from "./create";
import { fitStroke, type FitResult } from "../lib/fitting";
import { appendSample, validSegments } from "../lib/ink";

export interface FittedSegment {
  nodes: Node[];
  rmse: number;
  maxError: number;
  samples: number;
  corners: number;
}

interface FreehandState {
  active: boolean;
  reviewing: boolean;
  /** 0–100，越大越平滑（容差越大） */
  smoothness: number;
  segments: Point[][];
  fitted: FittedSegment[];
  pointerId: number | null;
  last: Point | null;
  wasOutside: boolean;
}

const MIN_TOLERANCE = 0.4;
const MAX_TOLERANCE = 12;

export const freehand = reactive<FreehandState>({
  active: false,
  reviewing: false,
  smoothness: 35,
  segments: [],
  fitted: [],
  pointerId: null,
  last: null,
  wasOutside: false,
});

/** 平滑度转 RDP 容差，全程文档单位，不受缩放影响 */
export function toleranceOf(smoothness: number) {
  return MIN_TOLERANCE + (smoothness / 100) * (MAX_TOLERANCE - MIN_TOLERANCE);
}

export function beginFreehand(pointerId: number, p: Point) {
  freehand.active = true;
  freehand.reviewing = false;
  freehand.segments = [];
  freehand.fitted = [];
  freehand.pointerId = pointerId;
  freehand.last = null;
  freehand.wasOutside = false;
  sampleFreehand(p);
}

export function sampleFreehand(p: Point) {
  if (!freehand.active) return;
  const next = appendSample(
    freehand.segments,
    p,
    freehand.last,
    freehand.wasOutside,
  );
  freehand.segments = next.segments;
  freehand.last = next.prev;
  freehand.wasOutside = next.wasOutside;
}

function refit(): FittedSegment[] {
  const tolerance = toleranceOf(freehand.smoothness);
  const fitted: FittedSegment[] = [];
  for (const seg of validSegments(freehand.segments)) {
    const result: FitResult | null = fitStroke(seg, tolerance);
    if (result) fitted.push(result);
  }
  return fitted;
}

/** 松手：结束采样并拟合成可编辑曲线，进入预览确认态 */
export function endFreehand(): boolean {
  if (!freehand.active) return false;
  const hadSegments = validSegments(freehand.segments).length > 0;
  freehand.active = false;
  freehand.pointerId = null;
  freehand.last = null;
  if (!hadSegments) {
    freehand.reviewing = false;
    freehand.segments = [];
    freehand.fitted = [];
    return false;
  }
  freehand.fitted = refit();
  freehand.reviewing = true;
  return true;
}

export function setSmoothness(value: number) {
  if (!freehand.reviewing) return;
  freehand.smoothness = Math.max(0, Math.min(100, value));
  freehand.fitted = refit();
}

export function cancelFreehand() {
  freehand.active = false;
  freehand.reviewing = false;
  freehand.segments = [];
  freehand.fitted = [];
  freehand.pointerId = null;
  freehand.last = null;
}

/**
 * 取消预览并丢弃按下时建立的历史快照。
 * 快照由撤销/重做外部消费时不要调用本函数（见 App 的 revision 监听）。
 */
export function cancelFreehandEdit() {
  cancelFreehand();
  discardEdit();
}

/** 确认：把拟合曲线按当前钢笔颜色与描边写入文档，之后与普通路径完全一致 */
export function commitFreehand(): string[] {
  if (!freehand.reviewing) return [];
  const ids: string[] = [];
  for (const seg of freehand.fitted) {
    const shape: Shape = {
      id: crypto.randomUUID(),
      name: "Freehand path",
      nodes: seg.nodes.map((n) => ({
        x: n.x,
        y: n.y,
        in: { ...n.in },
        out: { ...n.out },
      })),
      closed: false,
      ...DEFAULT_PATH_STYLE,
    };
    doc.shapes.push(shape);
    ids.push(shape.id);
  }
  if (ids.length) doc.selected = ids;
  freehand.reviewing = false;
  freehand.segments = [];
  freehand.fitted = [];
  return ids;
}

export const freehandMetrics = computed(() => {
  let nodes = 0,
    samples = 0,
    corners = 0,
    sumSq = 0,
    maxError = 0;
  for (const f of freehand.fitted) {
    nodes += f.nodes.length;
    samples += f.samples;
    corners += f.corners;
    sumSq += f.rmse ** 2 * f.samples;
    maxError = Math.max(maxError, f.maxError);
  }
  return {
    nodes,
    samples,
    corners,
    rmse: samples ? Math.sqrt(sumSq / samples) : 0,
    maxError,
  };
});
