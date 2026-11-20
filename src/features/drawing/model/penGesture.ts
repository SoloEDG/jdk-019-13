import type { Shape } from "../../../shared/types";
import { doc } from "../../../shared/document";
import { coordinates } from "../../nodes";
import { add, create } from "./create";
import {
  beginFreehand,
  cancelFreehand,
  endFreehand,
  sampleFreehand,
} from "./freehand";

/** 超过该拖动距离（文档单位）判定为自由笔迹，否则沿用逐点放置 */
const FREEHAND_THRESHOLD = 4;

export interface PenGesture {
  abort: () => void;
}

/**
 * 钢笔按下后的完整手势：
 * - 点击/短拖：在 pointerdown 同步阶段放置节点（短拖可拉出手柄），
 *   传入 existing 时向现有路径追加节点，与历史行为一致；
 * - 按住拖出：越过阈值后切换自由笔迹，指针离开画板也持续以文档坐标采样。
 */
export function startPenGesture(
  e: PointerEvent,
  svg: SVGSVGElement,
  existing: Shape | undefined,
  onDone: (shape: Shape) => void,
  onEmpty: () => void,
): PenGesture {
  const start = coordinates(e, svg);
  // 与基线一致：节点在按下时同步写入，确保 Vue 响应式在事件上下文中被触发
  const createdHere = !existing;
  const drawing = existing ?? create(start);
  add(drawing, start);
  const placed = drawing.nodes.at(-1)!;
  let mode: "click" | "freehand" = "click";
  let move: ((ev: PointerEvent) => void) | undefined;
  let up: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  let removed = false;

  function teardown() {
    if (move) window.removeEventListener("pointermove", move);
    if (up) window.removeEventListener("pointerup", up);
    if (cancel) window.removeEventListener("pointercancel", cancel);
    removed = true;
  }

  /**
   * 升级为自由笔迹前，回滚按下时同步预放置的点击节点：
   * - 本次手势新建的路径直接移除；
   * - 向已有路径追加的节点弹出，恢复到按下前状态。
   */
  function rollbackPlaced() {
    if (createdHere) {
      const idx = doc.shapes.indexOf(drawing);
      if (idx >= 0) doc.shapes.splice(idx, 1);
    } else {
      drawing.nodes.pop();
    }
  }

  function enterFreehand(ev: PointerEvent) {
    mode = "freehand";
    rollbackPlaced();
    beginFreehand(ev.pointerId, start);
  }

  // 点击模式下的手柄调整；一旦越过阈值则升级为自由笔迹
  move = (ev: PointerEvent) => {
    const q = coordinates(ev, svg);
    if (mode === "click") {
      if (Math.hypot(q.x - start.x, q.y - start.y) < FREEHAND_THRESHOLD) {
        // 与原实现一致：短拖调整新节点手柄
        placed.out = q;
        placed.in = { x: 2 * placed.x - q.x, y: 2 * placed.y - q.y };
        return;
      }
      enterFreehand(ev);
    }
    if (mode === "freehand") sampleFreehand(q);
  };

  up = () => {
    if (mode === "freehand") {
      if (!endFreehand()) onEmpty();
    } else {
      onDone(drawing);
    }
    teardown();
  };

  // 触摸被系统手势打断（pointercancel）
  cancel = () => {
    if (mode === "freehand") {
      cancelFreehand();
      onEmpty();
    } else {
      onDone(drawing);
    }
    teardown();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", cancel, { once: true });

  return {
    abort() {
      if (removed) return;
      if (mode === "freehand") cancelFreehand();
      teardown();
    },
  };
}
