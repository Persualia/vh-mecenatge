#!/usr/bin/env node
/**
 * Puts the snapshot inside the preview page.
 *
 *   pnpm dev --port 3500                        # in another shell
 *   node scripts/build-preview-data.mjs > preview/data.json
 *   node scripts/build-preview.mjs              # writes preview/index.html
 *
 * `preview/page.html` is the page; `preview/data.json` is what the app was showing.
 * Keeping them apart means a new snapshot never touches the page's own code.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "..", "preview");
const page = readFileSync(resolve(dir, "page.html"), "utf8");
const data = readFileSync(resolve(dir, "data.json"), "utf8").trim();

if (!page.includes("{{SNAPSHOT}}")) throw new Error("preview/page.html ha perdut el marcador {{SNAPSHOT}}.");
// `</script>` inside a JSON island would close the block early.
const safe = data.replace(/<\/script/gi, "<\\/script");
const html = page.replace("{{SNAPSHOT}}", safe);

writeFileSync(resolve(dir, "index.html"), html);
console.log(`Escrit preview/index.html · ${(html.length / 1024).toFixed(0)} KB · instantània de ${JSON.parse(data).campaigns.length} campanyes i ${JSON.parse(data).donors.records.length} registres.`);
