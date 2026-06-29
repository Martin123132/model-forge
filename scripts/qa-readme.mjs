import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const readmePath = resolve(repoRoot, "README.md");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpgSignature = Buffer.from([0xff, 0xd8, 0xff]);

function localImageRefs(markdown) {
  const refs = new Set();
  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
    refs.add(match[1].trim());
  }
  for (const match of markdown.matchAll(/<img\s+[^>]*src="([^"]+)"/g)) {
    refs.add(match[1].trim());
  }
  return [...refs].filter((ref) => ref && !/^https?:\/\//i.test(ref));
}

function jpegInfo(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        size: buffer.length,
        format: "JPEG"
      };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions were not found");
}

async function imageInfo(path) {
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8).equals(pngSignature)) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      size: buffer.length,
      format: "PNG"
    };
  }
  if (buffer.subarray(0, 3).equals(jpgSignature)) {
    return jpegInfo(buffer);
  }
  throw new Error("not a PNG or JPEG file");
}

function checkImage(ref, info, fileStat) {
  const checks = [];
  checks.push({
    ok: info.width >= 320 && info.height >= 240,
    detail: `${info.width}x${info.height}`,
    label: `${ref} dimensions`
  });
  checks.push({
    ok: fileStat.size >= 20_000,
    detail: `${fileStat.size.toLocaleString()} bytes`,
    label: `${ref} file size`
  });
  if (ref.includes("model-forge-builder-wizard")) {
    checks.push({
      ok: fileStat.size >= 100_000,
      detail: `${fileStat.size.toLocaleString()} bytes`,
      label: `${ref} main screenshot guard`
    });
  }
  return checks;
}

async function main() {
  const markdown = await readFile(readmePath, "utf-8");
  const refs = localImageRefs(markdown);
  if (!refs.length) {
    throw new Error("README has no local image references.");
  }
  const checks = [];
  for (const ref of refs) {
    const filePath = resolve(repoRoot, ref);
    const fileStat = await stat(filePath);
    const info = await imageInfo(filePath);
    checks.push(...checkImage(ref, info, fileStat));
  }

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.detail}`);
  }
  const failures = checks.filter((check) => !check.ok);
  if (failures.length) {
    console.error(`README image QA failed: ${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`README image QA passed for ${refs.length} local image reference(s).`);
}

main().catch((error) => {
  console.error(`README image QA failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
