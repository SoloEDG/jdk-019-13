<script setup lang="ts">
import { computed } from "vue";
import { freehand } from "../model/freehand";
import { DEFAULT_PATH_STYLE } from "../model/create";
import { validSegments } from "../lib/ink";
import { path } from "../lib/path";
import type { Point, Shape } from "../../../shared/types";

function polyline(points: Point[]) {
  return points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
}

// 只渲染有效段：穿过画板边缘的孤立采样点不构成笔迹，不显示也不参与拟合
const rawSegments = computed(() => validSegments(freehand.segments));

const previewShapes = computed<Shape[]>(() =>
  freehand.fitted.map((seg, i) => ({
    id: `freehand-preview-${i}`,
    name: "Freehand preview",
    nodes: seg.nodes,
    closed: false,
    ...DEFAULT_PATH_STYLE,
  })),
);
</script>

<template>
  <g v-if="freehand.active || freehand.reviewing" class="freehand-overlay">
    <path
      v-for="(seg, i) in rawSegments"
      :key="'raw-' + i"
      :d="polyline(seg)"
      fill="none"
      stroke="#9974ec"
      stroke-width="1.5"
      stroke-dasharray="4 3"
      opacity="0.7"
      :class="{ faint: freehand.reviewing }"
    />
    <path
      v-for="s in previewShapes"
      :key="s.id"
      :d="path(s)"
      fill="none"
      :stroke="s.stroke"
      :stroke-width="s.width"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</template>

<style scoped>
.faint {
  opacity: 0.25;
}
</style>
