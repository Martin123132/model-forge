# Known Limitations

ModelForge v1 is a local-first model forge cockpit. It creates practical local
AI build artifacts and reproducible Ollama targets, but it is not a foundation
model trainer.

## Model Building

- ModelForge does not train a new foundation model from scratch.
- Ollama profile creation and export-pack recreation are the supported local
  execution path.
- The Training Route Planner may classify tiny from-scratch experiments, but
  those are educational lab routes, not general foundation-model claims.
- Adapter Builder prepares LoRA/QLoRA datasets, configs, runner recipes,
  runner scripts, checkpoint folders, manifests, and receipts. It dry-runs by
  default unless hardware, Python ML dependencies, explicit long-run approval,
  and a compatible Transformers/Hugging Face or local base model id are present.
- Adapter Training Readiness can check Python, CUDA, packages, D-drive cache
  paths, dataset examples, and a recommended Transformers base model. The
  dependency installer uses pip and can still fail because of platform wheels,
  driver/CUDA mismatches, network outages, or package resolver changes.
- Dry-run adapter receipts prove the dataset/config/runner path executed, but
  they do not claim trained weights. Promotion into an Ollama target is blocked
  until real adapter weight and config files are detected.
- Hardware fit estimates are guidance, not a promise that every base model,
  context length, quantization, or adapter setting will fit.

## Knowledge And Dataset Quality

- Dataset Forge and local knowledge packs use selected source-scope files.
  Unsupported files, binary assets, oversized files, and excluded paths are not
  ingested.
- Retrieval is local and source bounded, but answers still depend on the active
  Ollama model. Users should test important prompts before publishing.
- The source chips behind answers show retrieved local evidence, not a guarantee
  that every sentence is perfect.

## Release And Licensing

- Release gates check source hashes, proof freshness, receipts, filenames,
  model profile creation, local Ollama create, tool availability, and license
  review coverage.
- Gates help catch obvious release risks, but they are not legal advice.
- Public or commercial use must follow the project license.

## Installer

- v1 provides a portable Windows release zip and a double-click launcher.
- A signed native installer, auto-update, notarized binaries, and bundled Node or
  Ollama are future packaging milestones.

## Operations

- Long jobs can be canceled where supported, but full resume across restarts is
  still limited.
- Project registry actions keep generated data separated, but users should still
  keep their own backups before deleting or resetting data.
- External trainer and cloud-runner integrations should not be treated as safe
  until they preserve source scopes, receipts, and proof boundaries.
