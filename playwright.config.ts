import { defineConfig } from "playwright/test";
import { existsSync } from "node:fs";

// 无 root 环境下系统可能缺少 chromium 运行库（libnss3/libnspr4 等）。
// 若存在本地解压的库目录则注入 LD_LIBRARY_PATH；常规机器上该目录不存在，等于空操作。
const localLibRoot = "/tmp/chromelibs/root";
const localLibs = [
  `${localLibRoot}/usr/lib/aarch64-linux-gnu`,
  `${localLibRoot}/lib/aarch64-linux-gnu`,
].filter((p) => existsSync(p));
if (localLibs.length) {
  process.env.LD_LIBRARY_PATH = [...localLibs, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":");
}

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5199",
    // 使用完整 chromium，避免依赖单独下载的 headless-shell
    channel: "chromium",
  },
  webServer: {
    command: "npm run dev -- --port 5199",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
