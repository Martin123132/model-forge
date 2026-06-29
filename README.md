# ModelForge

<p align="center">
  <strong>A local-first AI builder that tells you what your machine can honestly build.</strong>
</p>

<p align="center">
  ModelForge is heading toward a Build-A-Bear-style workflow for AI: describe
  the assistant you want, let the app inspect your hardware and source folder,
  then get a realistic build plan with datasets, model recipes, export packs,
  and proof bundles you can inspect before anyone asks you to trust it.
</p>

<p align="center">
  <a href="#why-it-exists">Why</a> |
  <a href="#what-it-does">What it does</a> |
  <a href="#builder-wizard">Builder Wizard</a> |
  <a href="#screenshots">Screenshots</a> |
  <a href="#quickstart">Quickstart</a> |
  <a href="#proof-posture">Proof posture</a> |
  <a href="#license">License</a>
</p>

![ModelForge Builder Wizard](docs/screenshots/model-forge-builder-wizard.png)

## Why It Exists

Most AI tooling asks builders to accept a black-box claim: this model is safe,
this dataset is allowed, this release is fine. ModelForge goes in the other
direction. It starts with the local source boundary, records hashes and receipts,
builds a model recipe, and makes the proof visible.

The goal is not to pretend that a dashboard magically solves AI safety. The goal
is to make model-building measurable, inspectable, and reproducible enough that
open builders can improve it in public.

## What It Does

ModelForge is a source-available, local-first cockpit for building model-ready
artifacts from code and project folders.

- Scans a local repo or folder into a source inventory with SHA-256 hashes.
- Creates hardware-aware build plans from plain-English intent, including CPU,
  RAM, GPU, disk, Ollama status, recommended route, expected time/disk, and next
  actions.
- Estimates which model sizes are comfortable, possible, tight, or unrealistic
  for the current machine before a user starts building.
- Runs **Build From Plan** as one guided job: source boundary, Ollama profile,
  proof gates, Dataset Forge, recipe, export pack, receipts, and a refreshed
  plan at the end.
- Builds Dataset Forge JSONL examples with source paths, hashes, license labels,
  and proof-bundle provenance.
- Reuses local Ollama models and exports an Ollama `Modelfile`.
- Runs release gates for source hashes, proof freshness, receipts, license
  review, PII filename sweeps, model profile creation, and tool availability.
- Builds proof bundles with model cards, evidence manifests, RepoMori snapshots,
  AgentLedger run records, and local evidence paths.
- Exports model-building recipes for Ollama now, with LoRA/QLoRA and external
  runner adapter plans shaped for the next stage.
- Runs exported Ollama packs back from the export folder and stores receipts so
  the pack proves it can recreate the local target.

This alpha is intentionally focused on the forge layer: source boundary,
training-ready packs, recipes, evidence, local model profiles, and release
gates. It is not a full foundation model trainer yet.

## Builder Wizard

The Builder workspace is the non-developer front door. Instead of asking people
to know whether they need RAG, LoRA, QLoRA, Modelfiles, or runner contracts, it
asks what the AI should do and then produces a saved build plan.

The plan records:

- What the user wants the AI to do.
- Local hardware facts: CPU threads, RAM, GPU/VRAM, D-drive space, and Ollama
  availability.
- The recommended route, such as Dataset Pack, Recipe Export, or LoRA/QLoRA
  prep when the hardware makes that realistic.
- Ordered next steps mapped back to the app: Setup, Sources, Dataset Forge,
  Model Lab, export pack run, proof, and release gates.
- Limitations, so the app stays honest about what is ready today and what needs
  a future trainer runner.

Once a plan exists, **Start Build** runs the complete local forge route and shows
each stage as it completes. The run writes a receipt under
`.modelforge-data/builder/runs/`, so someone who is not a developer can still see
what happened and where the artifacts landed.

## Screenshots

<table>
  <tr>
    <td colspan="2">
      <strong>Builder Wizard</strong><br />
      <img src="docs/screenshots/model-forge-builder-wizard.png" alt="ModelForge Builder Wizard showing a plain-English AI request, hardware scan, recommended route, and route steps" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Dataset Forge</strong><br />
      <img src="docs/screenshots/model-forge-dataset-forge.png" alt="ModelForge Dataset Forge showing JSONL examples, token estimate, and export pack controls" />
    </td>
    <td width="50%">
      <strong>Model Lab</strong><br />
      <img src="docs/screenshots/model-forge-model-lab.png" alt="ModelForge Model Lab showing a fresh forge recipe and runner plan" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Source Browser</strong><br />
      <img src="docs/screenshots/model-forge-sources.png" alt="ModelForge source browser showing hashed local project files" />
    </td>
    <td width="50%">
      <strong>Release Gates</strong><br />
      <img src="docs/screenshots/model-forge-release.png" alt="ModelForge release dashboard showing passing proof and license gates" />
    </td>
  </tr>
</table>

## Quickstart

Requirements:

- Node.js and npm
- Ollama, recommended for local model profile creation
- Windows PowerShell users should run `npm.cmd`, because some systems block
  `npm.ps1`

Clone and run:

```powershell
git clone https://github.com/Martin123132/model-forge.git
cd model-forge
npm.cmd install
npm.cmd run dev
```

The dev command starts both services:

```text
API: http://127.0.0.1:4188
Web: http://127.0.0.1:5178
```

Open the Builder workspace first. Describe the AI you want, create a build plan,
and let ModelForge show the route your current machine can support.

Then open Setup. Confirm the source folder, data root, Ollama model path,
Python command, base model, and target model, then run the first setup pass to
build proof, gates, share card, Dataset Forge JSONL, and recipe artifacts.

After setup, or after a successful **Build From Plan** run:

1. Open **Model Lab**.
2. Use **Dataset Forge** to rebuild or download `dataset.jsonl`.
3. Build a **Forge Recipe** to package the dataset, proof, eval report, Ollama
   profile, LoRA/QLoRA plan, and runner contract.
4. Enable **Allow Ollama create**, then run the export pack to produce a receipt
   proving the exported folder can recreate the local model target.

The dev script defaults the data root to `.modelforge-data` inside the repo and
keeps npm/temp/browser caches beside the workspace instead of leaning on a small
system drive. If you want explicit D-drive paths, set them before running:

```powershell
$env:MODEL_FORGE_DATA_ROOT='D:\AI\ModelForge\.modelforge-data'
$env:MODEL_FORGE_SOURCE_ROOT='D:\Users\ollet\Documents\ai stuff\model-forge'
$env:OLLAMA_MODELS='D:\AI\Ollama\models'
npm.cmd run dev
```

Use `.env.example` as a checklist for local shell values. The dev runner reads
environment variables from the process.

## Proof Posture

The current public alpha smoke target is:

```text
8/8 gates passing, 0 warnings, 0 failures.
```

The gates check:

- Source hashes exist for sampled files.
- RepoMori and AgentLedger receipts are linked.
- Proof bundles match the current source inventory.
- License review coverage meets the release threshold.
- Filenames pass the basic PII signal sweep.
- An Ollama model profile exists.
- The local Ollama create step completed.
- Required local tools are available.

Dataset and export checks also verify:

- Dataset Forge has produced JSONL examples.
- Export packs include `training/dataset.jsonl` and
  `training/dataset-manifest.json`.
- Pack runs write receipts in the export folder and in the local run history.
- Build From Plan has completed every stage and written a builder receipt.

Run the repeatable smoke check while `npm.cmd run dev` is active:

```powershell
npm.cmd run qa:smoke
```

## Project Map

- `src/` - React cockpit UI
- `server.mjs` - local API, hardware scan, build plans, source inventory, proof,
  eval, recipe, and export flow
- `.modelforge-data/builder/` - ignored local build-plan artifacts
- `.modelforge-data/datasets/` - ignored local Dataset Forge JSONL packs
- `scripts/dev.mjs` - D-drive-friendly local dev runner
- `scripts/qa-smoke.mjs` - public alpha smoke gate
- `docs/screenshots/` - README screenshots
- `.modelforge-data/` - ignored local proof bundles, evals, models, and exports

## Roadmap

- More guided Builder Wizard routes for non-developers choosing any local source
  folder.
- LoRA/QLoRA runner execution from the existing recipe export and adapter-pack
  route.
- Stronger dataset review queues, chunk controls, and license explainability.
- Shareable release pages backed by proof-bundle artifacts.
- CI-friendly proof checks for public repository releases.

## License

ModelForge follows the same source-available posture as the current project
license: personal and non-commercial use under PolyForm Noncommercial 1.0.0.
Commercial use requires a separate written license. See `LICENSE`.
