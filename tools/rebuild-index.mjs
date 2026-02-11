#!/usr/bin/env node
/**
 * tools/rebuild-index.mjs
 * - data/site.json 에 등록된 index.json 목록을 기준으로
 * - 각 index.json이 있는 폴더의 items/*.json 을 읽어서
 * - entries[] 를 자동 재생성한다.
 *
 * 실행:
 *   node tools/rebuild-index.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function toPosix(p) {
  return p.split(path.sep).join("/");
}

async function readJson(filePath) {
  const buf = await fs.readFile(filePath, "utf-8");
  return JSON.parse(buf);
}

async function writeJson(filePath, obj) {
  const out = JSON.stringify(obj, null, 2);
  await fs.writeFile(filePath, out, "utf-8");
}

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const sitePath = path.join(ROOT, "data", "site.json");
  const site = await readJson(sitePath);
  const indexes = site.indexes || [];

  if (!indexes.length) {
    console.error("data/site.json 의 indexes 가 비어있습니다.");
    process.exit(1);
  }

  for (const idxRel of indexes) {
    const idxAbs = path.join(ROOT, idxRel);
    const idxDir = path.dirname(idxAbs);
    const itemsDir = path.join(idxDir, "items");

    const idx = await readJson(idxAbs);

    let files = [];
    try {
      files = (await fs.readdir(itemsDir)).filter((f) => f.endsWith(".json"));
    } catch (e) {
      console.warn(`[skip] items 폴더 없음: ${toPosix(path.relative(ROOT, itemsDir))}`);
      continue;
    }

    const entries = [];
    for (const f of files) {
      const itemAbs = path.join(itemsDir, f);
      const item = await readJson(itemAbs);

      const itemRel = toPosix(path.relative(ROOT, itemAbs));
      entries.push({
        id: item.id,
        type: item.type,
        title: item.title,
        date: item.date,
        tags: item.tags || [],
        visibility: item.visibility || "private",
        summary: item.summary || "",
        src: itemRel,
      });
    }

    entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    const rebuilt = {
      section: idx.section || "",
      title: idx.title || "",
      short: idx.short || idx.section || "",
      listPage: idx.listPage || "",
      updated: today(),
      entries,
    };

    await writeJson(idxAbs, rebuilt);
    console.log(`[ok] ${idxRel} (${entries.length} entries)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
