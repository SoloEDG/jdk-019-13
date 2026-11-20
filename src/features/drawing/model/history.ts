import { ref } from "vue";
import { doc } from "../../../shared/document";
const past: string[] = [];
const future: string[] = [];
export const revision = ref(0);
export function beginEdit() {
  past.push(JSON.stringify(doc.shapes));
  if (past.length > 100) past.shift();
  future.length = 0;
}
/**
 * 丢弃最近一次 beginEdit 建立的空快照而不改变文档。
 * 仅当快照与当前文档一致时才弹出，避免重复调用时误撤前一条路径的历史。
 * 用于取消尚未确认的预览：保证之后撤销不会连带前一条路径。
 */
export function discardEdit() {
  const snapshot = past.at(-1);
  if (snapshot !== undefined && snapshot === JSON.stringify(doc.shapes)) {
    past.pop();
  }
}
function install(snapshot: string) {
  doc.shapes = JSON.parse(snapshot);
  doc.selected = doc.selected.filter((id) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}
export function undo() {
  const state = past.pop();
  if (state) {
    future.push(JSON.stringify(doc.shapes));
    install(state);
  }
}
export function redo() {
  const state = future.pop();
  if (state) {
    past.push(JSON.stringify(doc.shapes));
    install(state);
  }
}
