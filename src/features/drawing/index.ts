export { default as Tools } from "./ui/Tools.vue";
export { default as FreehandOverlay } from "./ui/FreehandOverlay.vue";
export { default as FreehandReview } from "./ui/FreehandReview.vue";
export { path } from "./lib/path";
export { fitStroke } from "./lib/fitting";
export {
  appendSample,
  validSegments,
  insideArtboard,
  JUMP_LIMIT,
} from "./lib/ink";
export { create, add } from "./model/create";
export { seed } from "./model/seed";
export { beginEdit, discardEdit, undo, redo, revision } from "./model/history";
export { startPenGesture } from "./model/penGesture";
export type { PenGesture } from "./model/penGesture";
export {
  freehand,
  beginFreehand,
  sampleFreehand,
  endFreehand,
  cancelFreehand,
  cancelFreehandEdit,
  commitFreehand,
  setSmoothness,
  freehandMetrics,
  toleranceOf,
} from "./model/freehand";
