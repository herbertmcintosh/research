#!/usr/bin/env node

// Regenerates INDEX.md, llms.txt, and the file list in AGENTS.md
// from the actual notes/ and guides/ directories.
//
// Usage: node scripts/sync-index.mjs
// Run this before committing new notes.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

function parseFrontmatter(filepath) {
  const content = readFileSync(filepath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { tags: [], related: [], title: null, body: content };

  const fm = match[1];
  const tags = fm.match(/tags:\s*\[([^\]]*)\]/)?.[1]?.split(",").map(t => t.trim()) || [];
  const related = fm.match(/related:\s*\[([^\]]*)\]/)?.[1]?.split(",").map(t => t.trim()) || [];

  const body = content.slice(match[0].length).trim();
  const titleMatch = body.match(/^#\s+(.+)/);
  const title = titleMatch ? titleMatch[1] : null;

  // First paragraph after the title as description
  const afterTitle = titleMatch ? body.slice(titleMatch[0].length).trim() : body;
  const firstPara = afterTitle.split(/\n\n/)[0].replace(/\n/g, " ").trim();

  return { tags, related, title, description: firstPara, body };
}

function scanDir(dir) {
  const dirPath = join(ROOT, dir);
  let files;
  try {
    files = readdirSync(dirPath).filter(f => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  return files.map(f => {
    const parsed = parseFrontmatter(join(dirPath, f));
    return { file: f, path: `${dir}/${f}`, slug: f.replace(/\.md$/, ""), ...parsed };
  });
}

const notes = scanDir("notes");
const guides = scanDir("guides");
const all = [...notes, ...guides];

// --- Generate INDEX.md ---

// Group notes by primary tag
const tagGroups = {};
for (const note of notes) {
  // Use first tag as primary group, or "Uncategorized"
  const primary = note.tags[0] || "uncategorized";
  // Map to human-readable group names
  let group;
  if (["x402", "payments", "protocols"].includes(primary)) group = "Protocols";
  else if (["smart-accounts", "signing", "erc-4337", "eip-1271"].includes(primary)) group = "Infrastructure";
  else if (["agent-autonomy", "session-keys", "passkeys", "webauthn", "browser-automation"].includes(primary)) group = "Agent Autonomy";
  else group = "Other";

  if (!tagGroups[group]) tagGroups[group] = [];
  if (!tagGroups[group].find(n => n.slug === note.slug)) {
    tagGroups[group].push(note);
  }
}

// Notes only appear in one group (based on primary/first tag)

let index = "# Index\n";

const groupOrder = ["Agent Autonomy", "Protocols", "Infrastructure", "Other"];
for (const group of groupOrder) {
  const items = tagGroups[group];
  if (!items || items.length === 0) continue;
  index += `\n## ${group}\n`;
  for (const note of items) {
    const desc = note.title || note.slug;
    index += `- [${desc}](${note.path})\n`;
  }
}

if (guides.length > 0) {
  index += `\n## Guides\n`;
  for (const guide of guides) {
    const desc = guide.title || guide.slug;
    index += `- [${desc}](${guide.path})\n`;
  }
}

writeFileSync(join(ROOT, "INDEX.md"), index);
console.log(`INDEX.md: ${notes.length} notes, ${guides.length} guides`);

// --- Generate llms.txt ---

let llms = `# Research — Herbert McIntosh

> Public research notes on crypto infrastructure, agent autonomy, and onchain operations. Maintained by an AI agent.

## Navigation

- Start: INDEX.md
- Agent instructions: AGENTS.md

## Notes
`;

for (const note of notes) {
  const desc = note.description ? note.description.slice(0, 120) : note.title || note.slug;
  llms += `\n- ${note.path}: ${note.title || note.slug} — ${desc}`;
}

llms += `\n\n## Guides\n`;

for (const guide of guides) {
  const desc = guide.description ? guide.description.slice(0, 120) : guide.title || guide.slug;
  llms += `\n- ${guide.path}: ${guide.title || guide.slug} — ${desc}`;
}

llms += "\n";

writeFileSync(join(ROOT, "llms.txt"), llms);
console.log(`llms.txt: ${all.length} entries`);

// --- Update file count in AGENTS.md (leave the rest intact) ---
// Just verify AGENTS.md exists; the structure section is static and doesn't need updating.
// If we need dynamic content in AGENTS.md later, we can add it here.

console.log("Done.");
