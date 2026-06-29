# ModelForge

Source-available local-first AI model forge cockpit.

ModelForge turns a local repo or folder into a provenance-backed model workflow:

1. scan source files on disk
2. draft dataset/source summaries
3. reuse local Ollama models
4. run eval/proof gates
5. export model-building plans, runner adapters, and proof-bundle artifacts under a local data root

This first scaffold deliberately starts with a thin local API and a React cockpit.
RepoMori, AgentLedger, ManifoldGuard, Sentinel, and fine-tuning backends can be
connected behind the same pipeline without changing the product shell.

## D-Drive First

By default, ModelForge writes local proof bundles and run records into
`.modelforge-data` inside the project folder. On smaller Windows system drives,
set the data root to a `D:` path before running the app:

```text
MODEL_FORGE_DATA_ROOT=D:\AI\ModelForge\.modelforge-data
```

If Ollama is installed on `D:`, point Ollama at that model store:

```text
OLLAMA_MODELS=D:\AI\Ollama\models
```

For local development, keep npm and temporary caches off `C:` when useful:

```powershell
$env:npm_config_cache='D:\AI\ModelForge\.cache\npm'
$env:TEMP='D:\AI\ModelForge\.cache\temp'
$env:TMP='D:\AI\ModelForge\.cache\temp'
$env:PLAYWRIGHT_BROWSERS_PATH='D:\AI\ModelForge\.cache\playwright'
```

PowerShell blocks `npm.ps1` on this machine, so use `npm.cmd`.

## License

ModelForge follows the same repo posture as the newer Two Hands Network tools:
source-available for personal and non-commercial use under PolyForm
Noncommercial 1.0.0. See `LICENSE`. Commercial use requires a separate written
license.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

The app starts:

```text
API: http://127.0.0.1:4188
Web: Vite prints the browser URL, usually http://127.0.0.1:5178
```

## Public Alpha Smoke

With `npm.cmd run dev` already running, use the repeatable smoke check:

```powershell
npm.cmd run qa:smoke
```

A healthy local-alpha run should prove:

- the API returns the active project
- the source inventory is non-empty
- RepoMori, AgentLedger, and Ollama are available
- proof and eval artifacts are linked
- proof and eval artifacts match the current source inventory
- no release gate is failing

Warnings are still meaningful. The current baseline uses the same PolyForm
Noncommercial license posture as the other Two Hands Network repos and can pass
the license gate after proof/eval are rebuilt. Treat any remaining smoke warning
as a specific evidence/tooling caveat, not as a broad public-release clearance.

## Local Tooling

The API prefers the project venv when it exists:

```text
.\.venv\Scripts\python.exe
```

That venv should carry:

- RepoMori `0.2.0`
- AgentLedger `0.1.26a0`

You can override the Python runtime with:

```text
MODEL_FORGE_PYTHON=D:\AI\ModelForge\.venv\Scripts\python.exe
```

## Production-Style Run

```powershell
npm.cmd run build
npm.cmd run start
```

The production server serves the built app and API from:

```text
http://127.0.0.1:4178
```

## Release Posture

The Release tab is the public-alpha decision surface. It separates:

- gate posture: pass/warn/fail counts from the eval report
- proof bundle: whether evidence paths are linked
- license review: the current release review blocker or warning
- share card: whether public summary copy exists

Do not present a pack as public-release cleared until the Release tab shows no
failures and no review warnings. A warning state is still useful: it means the
forge has receipts, but the claim boundary must remain explicit.

The License Review Queue shows the first files still waiting on a license
decision. A clean queue means the repo has both a project `LICENSE` file and
package license metadata, and the source inventory has been regenerated after
that decision.

## Public Alpha Export Pack

The Model Lab builds a versioned Forge Recipe and an export folder under
`.modelforge-data\exports`. The export pack is designed to be shared or copied
without local cache noise. It includes:

- project README, LICENSE, and package metadata
- Forge Recipe JSON and Markdown
- Ollama Modelfile, system prompt, and model profile
- proof manifest, model card, dataset card, and source summary
- eval report and share card
- LoRA/QLoRA planning JSON
- external runner adapter contract

The pack is still local-first: rebuild proof/eval after any source change before
presenting it as fresh.

## Useful Environment Variables

```text
MODEL_FORGE_DATA_ROOT   Where proof bundles and run records are written.
MODEL_FORGE_SOURCE_ROOT Source folder to scan for the current project.
MODEL_FORGE_PORT        API/web port for server.mjs.
MODEL_FORGE_PYTHON      Python runtime used for RepoMori and AgentLedger.
OLLAMA_MODELS           Ollama model storage root.
```

## Current MVP Boundary

Implemented now:

- D-drive local data root
- Ollama status/model detection
- local source scan with SHA-256 hashes
- RepoMori source-pack snapshots
- AgentLedger summary/privacy receipt snapshots
- Ollama Modelfile/profile export
- gated Ollama model creation as `modelforge-local:latest`
- local chat smoke test against the created Ollama model
- pipeline run records
- selectable versioned forge recipe artifacts with model target, dataset estimates, gates, evidence paths, and local export packs
- source-available release wording and PolyForm Noncommercial license review gate
- export packs with project license/readme, LoRA/QLoRA planning JSON, and runner adapter contract
- proof bundle with model card, dataset card, evidence manifest, receipts, and model profile
- in-app proof viewer, release gates, and share-card generation
- React cockpit matching the first product concept

Next intended integrations:

- ManifoldGuard/Sentinel release-gate suites
- real dataset materialization from selected source packs
- executable LoRA/QLoRA training backends
- external runner adapters that can launch and report receipts
