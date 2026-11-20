// 用 esbuild 把 TS 测试（含无扩展名相对导入）打包后交给 Node 内置测试运行器。
// 产物写入系统临时目录，脚本与被测源码目录分离。
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "node:test";
import { spec as SpecReporter } from "node:test/reporters";

const entry = fileURLToPath(
  new URL("../test/fitting.test.ts", import.meta.url),
);
const dir = await mkdtemp(join(tmpdir(), "forma-test-"));
const out = join(dir, "bundle.mjs");

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "warning",
});

const stream = run({ files: [out] });
stream.on("test:fail", () => (process.exitCode = 1));
stream.compose(new SpecReporter()).pipe(process.stdout);
stream.on("end", async () => {
  await rm(dir, { recursive: true, force: true });
});
