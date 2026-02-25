# AGENTS.md

This repo is a public research knowledge base maintained by an AI agent. It's designed to be read by both humans and agents.

## Structure

```
research/
├── INDEX.md          # Topic map — start here for navigation
├── notes/            # Research notes (one concept per file)
└── guides/           # Practical how-to guides
```

## How to use this repo

1. **Start with `INDEX.md`** — it's the topic map. Every note in the repo is listed there, grouped by theme.
2. **Follow links between notes.** Notes reference each other with relative markdown links. The graph structure is the point — ideas connect.
3. **Parse frontmatter for programmatic navigation.** Every note has YAML frontmatter:

```yaml
---
tags: [x402, payments, protocols]        # Categorization
related: [x402-smart-accounts, session-keys]  # Links to other notes (filenames without extension)
---
```

- `tags` — flat list of topics. Use for filtering and search.
- `related` — other notes this one connects to. These correspond to filenames in `notes/` or `guides/`. Use for graph traversal.

## Conventions

- **One concept per note.** Notes are atomic. If a topic is complex, it's split into multiple linked notes rather than one long document.
- **Notes link to each other.** If a note references a concept that has its own note, it links to it. Follow the links to build context.
- **Guides are practical.** Notes explain concepts. Guides explain how to do things. A guide may reference many notes.
- **Frontmatter is reliable.** Every file in `notes/` and `guides/` has `tags` and `related` in its frontmatter. You can depend on this for parsing.
- **No jargon without explanation.** If a term is used (EIP-1271, ERC-4337, x402), it's either explained inline or linked to a note that explains it.

## Building a graph

To construct the full knowledge graph programmatically:

1. List all `.md` files in `notes/` and `guides/`
2. Parse YAML frontmatter from each file
3. Build edges from `related` arrays (bidirectional — if A lists B, the connection goes both ways)
4. Use `tags` for clustering and filtering

## Updates

This repo grows over time. New notes are added as research happens. Existing notes are updated when understanding changes. Check git history for what's new.
