<script setup lang="ts">
import { computed, watch } from "vue";
import { doc } from "../shared/document";
import {
  Tools,
  FreehandOverlay,
  FreehandReview,
  path,
  seed,
  beginEdit,
  undo,
  redo,
  revision,
  startPenGesture,
  freehand,
  cancelFreehand,
  cancelFreehandEdit,
  commitFreehand,
  type PenGesture,
} from "../features/drawing";
import { NodeOverlay, coordinates, select } from "../features/nodes";
import { Properties } from "../features/appearance";
import { Layers, translateSelected } from "../features/layers";
import { ExportBar, restore, save, storageStatus } from "../features/export";
import type { Shape } from "../shared/types";
if (!restore()) seed();
doc.selected = doc.shapes.length
  ? [doc.shapes[Math.min(3, doc.shapes.length - 1)].id]
  : [];
watch(() => doc.shapes, save, { deep: true });
const paths = computed(() => doc.shapes.map(path));
let drawing: Shape | undefined;
let gesture: PenGesture | undefined;

function abortGesture() {
  if (!gesture) return;
  if (freehand.active || freehand.reviewing) {
    // 切工具等主动打断：取消预览并丢弃本次空快照
    cancelFreehandEdit();
  }
  gesture.abort();
  gesture = undefined;
}
watch(
  () => doc.tool,
  () => {
    drawing = undefined;
    abortGesture();
  },
);
// 撤销/重做/恢复引发的外部修订：仅关闭预览，快照已由历史栈自身消费，不能再弹
watch(revision, () => {
  drawing = undefined;
  if (freehand.active || freehand.reviewing) {
    cancelFreehand();
    gesture?.abort();
    gesture = undefined;
  }
});
function down(e: PointerEvent) {
  // 自由笔迹采样中或预览确认期间，画布不接受新的按下
  if (freehand.active || freehand.reviewing) return;
  const svg = e.currentTarget as SVGSVGElement;
  const p = coordinates(e, svg);
  const id = (e.target as Element).getAttribute("data-shape");
  if (doc.tool === "pen") {
    // 快照在按下时建立；取消预览时通过 cancelFreehandEdit 丢弃，撤销只作用于已确认路径
    beginEdit();
    gesture = startPenGesture(
      e,
      svg,
      drawing,
      (s) => {
        drawing = s;
        gesture = undefined;
      },
      () => {
        // 没有产生有效笔迹（误触）：丢弃空快照，撤销不会出现空步
        cancelFreehandEdit();
        gesture = undefined;
      },
    );
    return;
  }
  beginEdit();
  if (id) {
    select(id, e.shiftKey);
    if (doc.tool === "nodes") return;
    let last = p;
    const f = (ev: PointerEvent) => {
      const q = coordinates(ev, svg);
      translateSelected(q.x - last.x, q.y - last.y);
      last = q;
    };
    window.addEventListener("pointermove", f);
    window.addEventListener(
      "pointerup",
      () => window.removeEventListener("pointermove", f),
      { once: true },
    );
  } else doc.selected = [];
}
function finish() {
  drawing = undefined;
  doc.tool = "select";
}
// 自由笔迹预览/采样期间屏蔽双击完成，避免与确认面板的画布操作冲突
function onDoubleClick() {
  if (freehand.active || freehand.reviewing) return;
  finish();
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (freehand.active || freehand.reviewing) {
      cancelFreehandEdit();
      gesture = undefined;
      return;
    }
    finish();
  } else if (e.key === "Enter") {
    if (freehand.reviewing) {
      commitFreehand();
      gesture = undefined;
      return;
    }
    finish();
  }
});
</script>
<template>
  <header>
    <b class="brand">◈ forma <small>VECTOR STUDIO</small></b>
    <div>Bloom exploration <span> / Personal workspace</span></div>
    <ExportBar :paths="paths" />
  </header>
  <div class="workspace">
    <div class="left">
      <h5>PROJECT <span>＋</span></h5>
      <p class="project">▣ Bloom / Artboard 01</p>
      <Tools /><Layers />
      <p class="signature">✧ Designed to explore.</p>
    </div>
    <main>
      <div class="toolbar">
        <span>Artboard 01　<small>800 × 600</small></span>
        <div>
          <button @click="undo">↶</button><button @click="redo">↷</button
          ><button @click="doc.zoom = Math.max(0.4, doc.zoom - 0.1)">−</button
          >{{ Math.round(doc.zoom * 100) }}%<button
            @click="doc.zoom = Math.min(1.5, doc.zoom + 0.1)"
          >
            ＋
          </button>
        </div>
      </div>
      <div class="stage">
        <svg
          data-testid="canvas"
          :style="{
            width: 800 * doc.zoom + 'px',
            height: 600 * doc.zoom + 'px',
          }"
          viewBox="0 0 800 600"
          @pointerdown="down"
          @dblclick="onDoubleClick"
        >
          <rect width="800" height="600" fill="#fffdfb" />
          <path
            v-for="s in doc.shapes"
            :key="s.id"
            :data-shape="s.id"
            :d="path(s)"
            :fill="s.fill"
            :stroke="s.stroke"
            :stroke-width="s.width"
            :opacity="s.opacity"
          />
          <FreehandOverlay />
          <NodeOverlay />
        </svg>
        <FreehandReview />
      </div>
      <footer>
        <span>● {{ storageStatus }}</span
        ><span>{{
          doc.tool === "pen"
            ? "点击放置节点 · 按住拖出手写笔迹，松手后可调节平滑并确认 · Enter 完成"
            : "Shift + click to select multiple · Drag to move"
        }}</span
        ><span>{{ doc.selected.length }} selected</span>
      </footer>
    </main>
    <Properties />
  </div>
</template>
