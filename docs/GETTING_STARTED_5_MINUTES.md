# Getting Started In 5 Minutes

This is the shortest path for a Windows user who wants ModelForge to build a
local AI from a folder they control.

## 1. Start The App

Use the portable release or the cloned repo.

```text
Start-ModelForge.cmd
```

The launcher opens `http://127.0.0.1:5178/` in dev mode or
`http://127.0.0.1:4178/` in the portable release. When a D drive exists, it
prefers:

- `D:\AI\ModelForge\.modelforge-data` for generated ModelForge data
- `D:\AI\Ollama\models` for Ollama model files
- `D:\AI\ModelForge\.cache` for npm/temp/browser cache data

## 2. Open Setup

Check the source folder, data root, Ollama model folder, base model, target
model, and Python command. Use the First-Run Doctor status before building.

If D-drive storage is recommended, press **Use D-drive storage**. If Ollama is
running but has no local model yet, press **Install starter model** and
ModelForge will pull `llama3.2:3b`, save it as the base model, and write a local
repair receipt.

## 3. Describe The AI

Open Builder and pick a starter template such as Support agent, Repo copilot,
Docs tutor, Research brief, or Game lore NPC.

Write what you want in normal language. ModelForge will choose a practical route
for your machine and show whether the hardware fit is comfortable, possible,
tight, or unrealistic.

## 4. Start Build

Press **Start Build**. ModelForge will run the source boundary, model profile,
proof gates, Dataset Forge, local knowledge pack, recipe, export pack, and final
handoff.

When the build succeeds, read **Build handoff**. It tells you:

- What AI target was built
- Why your hardware supports the route
- How many dataset examples and local knowledge snippets were created
- Where the proof, recipe, and export receipts are
- Whether to test the AI or review release proof next

## 5. Test It

Open Model Lab and use **Smoke Prompt** or **Test side by side**. Answers from
the forged target show local source chips when the knowledge pack is used.

Before sharing publicly, open Release and confirm the gates are passing.
