import { test, expect, type Page } from "playwright/test";

async function freshPage(page: Page) {
  // 预置空文档，避免 App 启动时 seed() 播种示例图形干扰计数
  await page.addInitScript(() => localStorage.setItem("forma-document", "[]"));
  await page.goto("/");
  await page.getByTestId("tool-pen").click();
}

function docShapes(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("forma-document") || "[]"),
  );
}

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("钢笔点击放置节点的原有行为保持可用", async ({ page }) => {
  // 短点击（不拖动）应直接创建逐节点路径，不进入自由笔迹预览
  const tap = (x: number, y: number) =>
    page.evaluate(
      ({ x, y }) => {
        const el = document.querySelector('[data-testid="canvas"]')!;
        const r = el.getBoundingClientRect();
        const opts = {
          bubbles: true,
          clientX: r.left + x,
          clientY: r.top + y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
        } as PointerEventInit;
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        window.dispatchEvent(new PointerEvent("pointerup", opts));
      },
      { x, y },
    );
  await tap(120, 120);
  await tap(220, 140);
  await tap(260, 240);
  await expect(page.getByTestId("freehand-review")).toHaveCount(0);
  const shapes = await docShapes(page);
  expect(shapes).toHaveLength(1);
  expect(shapes[0].nodes.length).toBe(3);
});

test("按住拖出笔迹后进入预览，显示节点数与文档坐标误差，可调平滑并确认", async ({
  page,
}) => {
  const svg = page.getByTestId("canvas");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  for (let i = 0; i <= 30; i++) {
    await page.mouse.move(
      box.x + 100 + i * 8,
      box.y + 300 + Math.sin(i / 3) * 25,
    );
  }
  await page.mouse.up();

  const review = page.getByTestId("freehand-review");
  await expect(review).toBeVisible();
  const nodesText = await page.getByTestId("freehand-nodes").textContent();
  const rmseText = await page.getByTestId("freehand-rmse").textContent();
  expect(nodesText).toMatch(/个节点/);
  expect(rmseText).toMatch(/RMSE/);
  const before = await docShapes(page);
  expect(before).toHaveLength(0); // 确认前不入库、不保存

  // 调高平滑度后节点应减少
  const slider = page.getByTestId("freehand-smoothness");
  await slider.fill("90");
  const smoothNodes = Number(
    (await page.getByTestId("freehand-nodes").textContent())!.match(/\d+/)![0],
  );
  await slider.fill("5");
  const roughNodes = Number(
    (await page.getByTestId("freehand-nodes").textContent())!.match(/\d+/)![0],
  );
  expect(smoothNodes).toBeLessThan(roughNodes);

  await page.getByTestId("freehand-confirm").click();
  await expect(page.getByTestId("freehand-review")).toHaveCount(0);
  const after = await docShapes(page);
  expect(after).toHaveLength(1);
  expect(after[0].name).toBe("Freehand path");
  expect(after[0].stroke).toBe("#7754dc");
  expect(after[0].width).toBe(3);
  expect(after[0].nodes.length).toBeGreaterThan(1);
  // 确认后节点工具可继续修改
  await page.getByTestId("tool-nodes").click();
  await expect(page.locator("[data-testid='anchor']").first()).toBeVisible();
});

test("取消只移除本次预览，不保存也不影响撤销历史", async ({ page }) => {
  const svg = page.getByTestId("canvas");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await page.mouse.move(box.x + 100 + i * 8, box.y + 300 + i * 2);
  }
  await page.mouse.up();
  await expect(page.getByTestId("freehand-review")).toBeVisible();
  await page.getByTestId("freehand-cancel").click();
  await expect(page.getByTestId("freehand-review")).toHaveCount(0);
  expect(await docShapes(page)).toHaveLength(0);

  // 再确认一条新路径后撤销，只能撤销这一条（取消时的空快照已被丢弃）
  await page.getByTestId("tool-pen").click();
  await page.mouse.move(box.x + 120, box.y + 250);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await page.mouse.move(
      box.x + 120 + i * 8,
      box.y + 250 + Math.sin(i / 2) * 15,
    );
  }
  await page.mouse.up();
  await page.getByTestId("freehand-confirm").click();
  expect(await docShapes(page)).toHaveLength(1);

  // 切回选择工具启用撤销按钮所在视图，撤销一次应回到空文档
  await page.getByTestId("tool-select").click();
  await page.getByRole("button", { name: "↶" }).click();
  expect(await docShapes(page)).toHaveLength(0);
});

test("拟合误差以文档坐标计算：缩放下形状与误差一致", async ({ page }) => {
  // 固定的文档坐标轨迹，两次测试都按同样的点序列采样
  const docPoints = Array.from({ length: 26 }, (_, i) => ({
    x: 150 + i * 10,
    y: 300 + Math.cos(i / 3) * 20,
  }));
  async function drawAndRead() {
    const svg = page.getByTestId("canvas");
    const box = (await svg.boundingBox())!;
    const zoom =
      Number(
        (await page.locator("main .toolbar").innerText()).match(/(\d+)%/)![1],
      ) / 100;
    await page.getByTestId("tool-pen").click();
    await page.mouse.move(
      box.x + docPoints[0].x * zoom,
      box.y + docPoints[0].y * zoom,
    );
    await page.mouse.down();
    // 用 steps 保证每个文档采样点都产生一次 pointermove，不依赖插值
    for (const p of docPoints) {
      await page.mouse.move(box.x + p.x * zoom, box.y + p.y * zoom, {
        steps: 1,
      });
    }
    await page.mouse.up();
    const d = await page
      .locator(".freehand-overlay path")
      .last()
      .getAttribute("d");
    const rmse = await page.getByTestId("freehand-rmse").textContent();
    const max = await page.getByTestId("freehand-max").textContent();
    return { d, rmse, max };
  }
  const a = await drawAndRead();
  await page.getByTestId("freehand-cancel").click();
  // 放大到 150% 后重画同样的文档坐标轨迹
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "＋" }).click();
  }
  const b = await drawAndRead();
  // 几何形状必须一致：不同缩放下 getScreenCTM 仅有亚像素浮点舍入，
  // 逐数值近似比较（容差 0.01 文档单位），而不是要求字符串逐位相等
  const nums = (d: string | null) =>
    (d || "").match(/-?\d+(\.\d+)?/g)!.map(Number);
  const na = nums(a.d);
  const nb = nums(b.d);
  expect(nb).toHaveLength(na.length);
  na.forEach((v, i) => expect(nb[i]).toBeCloseTo(v, 2));
  // 误差按文档坐标计算，两次显示必须完全相同
  expect(b.rmse).toBe(a.rmse);
  expect(b.max).toBe(a.max);
});

test("快速离开画板再回来不会把两段笔迹接起来", async ({ page }) => {
  const svg = page.getByTestId("canvas");
  const box = (await svg.boundingBox())!;
  // 第一段：画板内左上区域
  await page.mouse.move(box.x + 60, box.y + 120);
  await page.mouse.down();
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(box.x + 60 + i * 8, box.y + 120);
  }
  // 不松手直接快速移出画板外，再从远处回到画板右下区域（仍在视口内）
  await page.mouse.move(box.x - 120, box.y - 120, { steps: 2 });
  await page.mouse.move(box.x + 520, box.y + 360, { steps: 2 });
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(box.x + 520 + i * 6, box.y + 360);
  }
  await page.mouse.up();
  await expect(page.getByTestId("freehand-review")).toBeVisible();
  // 两段原始笔迹 + 两条拟合曲线，共四个路径，且两段互不相连
  await expect(page.locator(".freehand-overlay path")).toHaveCount(4);
  await page.getByTestId("freehand-confirm").click();
  const shapes = await docShapes(page);
  expect(shapes).toHaveLength(2);
});

test("画板内快速掠过造成的大跨度跳跃也断开成两段", async ({ page }) => {
  const svg = page.getByTestId("canvas");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 200);
  await page.mouse.down();
  for (let i = 0; i <= 8; i++) {
    await page.mouse.move(box.x + 80 + i * 8, box.y + 200);
  }
  // 单次移动跨越远超 JUMP_LIMIT（150 文档单位），且始终在画板内
  await page.mouse.move(box.x + 600, box.y + 400);
  for (let i = 0; i <= 8; i++) {
    await page.mouse.move(box.x + 600 + i * 6, box.y + 400);
  }
  await page.mouse.up();
  await expect(page.getByTestId("freehand-review")).toBeVisible();
  await expect(page.locator(".freehand-overlay path")).toHaveCount(4);
  await page.getByTestId("freehand-confirm").click();
  expect(await docShapes(page)).toHaveLength(2);
});

test("导出的 SVG 只包含已确认的曲线", async ({ page }) => {
  const svg = page.getByTestId("canvas");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  for (let i = 0; i <= 16; i++) {
    await page.mouse.move(
      box.x + 100 + i * 10,
      box.y + 300 + Math.sin(i / 2) * 18,
    );
  }
  await page.mouse.up();
  await expect(page.getByTestId("freehand-review")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk;
  expect(content).toContain("<svg");
  expect(content).not.toContain("Freehand");
  // 预览阶段没有确认的路径，SVG 中没有 path 元素
  expect(content).not.toContain("<path");

  await page.getByTestId("freehand-confirm").click();
  const [download2] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  const stream2 = await download2.createReadStream();
  let content2 = "";
  for await (const chunk of stream2) content2 += chunk;
  expect(content2).toContain("<path");
});
