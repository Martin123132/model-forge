# Changelog

## 1.0.0

ModelForge v1 is the first product-grade public release target for the local AI
forge cockpit.

- Added the Builder Wizard for plain-English AI intent, hardware-aware route
  selection, source scopes, and non-developer starter templates.
- Added a saved AI build contract to Builder plans so non-developers can see
  what AI is being made, what it may know, how it will be built, and when it is
  ready.
- Added AI naming, response voice selection, and starter model-card artifacts
  for every Builder plan before the one-click build run starts.
- Added saved hardware fit recipes for model class, quantization, context
  window, GPU layers, CPU threads, runner, storage budget, warnings, and
  reasoning.
- Added Apply Hardware Recipe so Builder checks or pulls the recommended base
  model, persists recipe-aware model profile metadata, writes an applied
  receipt, and unlocks a guided source-backed test prompt.
- Added Guided Builder Test Receipts so Run Test Prompt captures the model
  answer, checks source-backed citations against the selected source scope, and
  shows pass/warn/fail in Builder.
- Added Builder Create/Update AI receipts so the applied hardware recipe can
  create or refresh the Ollama target, mark it installed/ready in Builder, and
  register it in Your AIs with Rebuild AI and Retest AI actions.
- Added the Training Route Planner so Builder classifies requests into Profile,
  RAG/source-backed, LoRA/QLoRA adapter, continued pretraining, or tiny
  from-scratch routes with requirements, risks, outputs, and next receipts.
- Added the first Adapter Builder flow so Builder generates a source-scoped
  training dataset, writes a LoRA/QLoRA config, prepares a runner recipe,
  creates checkpoint/adapter folders, writes a receipt, and registers the
  adapter pack in Your AIs.
- Added Adapter Training Run receipts so Run Trainer executes the local runner,
  streams progress/log tails, supports cancellation, detects dry-run versus real
  checkpoints, and updates the adapter status.
- Added Adapter Promotion receipts so trained checkpoints can become Ollama
  targets while dry-run-only adapters are blocked with a clear receipt.
- Added First-Run Doctor checks for launch readiness, D-drive storage, Ollama,
  Python, disk space, CPU/RAM, and GPU/VRAM.
- Added Build From Plan as a guided local job that builds source receipts,
  Ollama profiles, proof gates, Dataset Forge packs, local knowledge packs,
  forge recipes, export packs, and a final build handoff.
- Added Model Lab with Your AIs, side-by-side comparison, local chat tests,
  receipts, source evidence, and answer sources.
- Added Project/Data Manager with project registry, source include/exclude
  rules, and guarded generated-data reset.
- Added diagnostics export for GitHub issues without environment values or
  source contents.
- Added First-Run Doctor repair actions for D-drive storage, starting Ollama,
  and installing a small starter model with local receipts.
- Added clean-machine First-Run Doctor scenario QA for missing tools, stopped
  services, empty model libraries, bad source folders, and low disk space.
- Added portable Windows release packaging with a double-click launcher and
  v1 release docs.

## 0.1.0

- Early local alpha with source inventory, proof bundle, eval gates, model
  profile export, Dataset Forge, recipe export, and README screenshots.
