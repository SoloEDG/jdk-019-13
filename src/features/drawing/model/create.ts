import { doc } from "../../../shared/document";
import type { Point, Shape } from "../../../shared/types";

/** 钢笔路径与自由笔迹确认后共同沿用的默认外观 */
export const DEFAULT_PATH_STYLE = {
  fill: "none",
  stroke: "#7754dc",
  width: 3,
  opacity: 1,
} as const;

export function create(p: Point) {
  const s: Shape = {
    id: crypto.randomUUID(),
    name: "Pen path",
    nodes: [],
    closed: false,
    ...DEFAULT_PATH_STYLE,
  };
  doc.shapes.push(s);
  doc.selected = [s.id];
  // 返回响应式代理而非原始对象：之后对 nodes 的增改才能触发视图与深度 watch
  return doc.shapes[doc.shapes.length - 1];
}
export function add(s: Shape, p: Point) {
  s.nodes.push({ ...p, in: { ...p }, out: { ...p } });
}
