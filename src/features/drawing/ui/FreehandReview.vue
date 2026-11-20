<script setup lang="ts">
import {
  cancelFreehandEdit,
  commitFreehand,
  freehand,
  freehandMetrics,
  setSmoothness,
} from "../model/freehand";
</script>

<template>
  <div
    v-if="freehand.reviewing"
    class="freehand-review"
    data-testid="freehand-review"
  >
    <div class="metrics">
      <span data-testid="freehand-nodes">
        {{ freehandMetrics.nodes }} 个节点
      </span>
      <span data-testid="freehand-rmse">
        拟合误差 RMSE {{ freehandMetrics.rmse.toFixed(2) }}px
      </span>
      <span data-testid="freehand-max">
        最大偏差 {{ freehandMetrics.maxError.toFixed(2) }}px
      </span>
      <span class="hint">误差按文档坐标计算，缩放不改变形状</span>
    </div>
    <label class="smoothness">
      平滑程度
      <input
        aria-label="平滑程度"
        data-testid="freehand-smoothness"
        type="range"
        min="0"
        max="100"
        :value="freehand.smoothness"
        @input="setSmoothness(+($event.target as HTMLInputElement).value)"
      />
      <small>{{ freehand.smoothness }}</small>
    </label>
    <div class="actions">
      <button data-testid="freehand-cancel" @click="cancelFreehandEdit">
        取消
      </button>
      <button
        class="primary"
        data-testid="freehand-confirm"
        @click="commitFreehand"
      >
        确认
      </button>
    </div>
  </div>
</template>

<style scoped>
.freehand-review {
  position: absolute;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 18px;
  background: white;
  border: 1px solid #e9e3ef;
  border-radius: 10px;
  box-shadow: 0 12px 32px #49366024;
  padding: 10px 16px;
  z-index: 5;
  font-size: 11px;
  color: #6b5c7d;
}
.metrics {
  display: flex;
  align-items: center;
  gap: 12px;
}
.metrics .hint {
  color: #b0a4bc;
}
.smoothness {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.smoothness small {
  width: 22px;
  text-align: right;
  color: #8055d5;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button {
  padding: 6px 14px;
}
</style>
