# Privacy And Local-First Statement

ModelForge is designed as a local-first AI model forge. The default workflow
keeps project files, generated artifacts, diagnostics, build receipts, chats,
datasets, knowledge packs, recipes, manual exports, and proof bundles on the
user's machine.

## What Stays Local

- Source inventories and SHA-256 hashes
- Dataset Forge JSONL examples
- Local knowledge-pack snippets
- Ollama Modelfiles and model profiles
- Chat transcripts and comparison transcripts
- Proof bundles, eval reports, build receipts, and export pack receipts
- Project registry and setup configuration
- Diagnostics downloads

## Where Data Is Stored

When a D drive exists, the launcher and First-Run Doctor prefer:

- `D:\AI\ModelForge\.modelforge-data`
- `D:\AI\Ollama\models`
- `D:\AI\ModelForge\.cache`

Without a D drive, generated data stays inside the local project or release
folder.

## What Diagnostics Include

Diagnostics are intended for GitHub issues and troubleshooting. They include
setup health, hardware fit, Ollama state, artifact status, recent log filenames,
and redacted paths.

Diagnostics do not include environment variable values, API keys, secrets,
source file contents, chat contents, datasets, or knowledge-pack text.

## When Data Leaves The Machine

ModelForge does not upload source files by default. Data leaves the machine only
when the user manually shares an export pack, diagnostics file, release page,
repository, screenshot, or other artifact.

If a future external trainer runner is used, rebuild proof first and review the
license and source boundary before sending anything outside the local machine.
