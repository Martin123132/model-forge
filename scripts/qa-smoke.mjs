import { existsSync } from "node:fs";
import process from "node:process";

const apiRoot = (process.env.MODEL_FORGE_API_URL || "http://127.0.0.1:4188").replace(/\/$/, "");

async function getJson(path) {
  const response = await fetch(`${apiRoot}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${apiRoot}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function gateCounts(gates = []) {
  return gates.reduce(
    (summary, gate) => {
      const status = String(gate.status || "").toLowerCase();
      if (status === "pass" || status === "passed") summary.pass += 1;
      else if (status === "fail" || status === "failed") summary.fail += 1;
      else if (status === "warn" || status === "warning") summary.warn += 1;
      else summary.pending += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0, pending: 0 }
  );
}

function check(label, ok, detail, severity = "fail") {
  return { label, ok: Boolean(ok), detail, severity };
}

function formatCheck(item) {
  const icon = item.ok ? "PASS" : item.severity === "warn" ? "WARN" : "FAIL";
  return `${icon} ${item.label}: ${item.detail}`;
}

async function main() {
  const [project, sources, setup, ollama, exportPackResponse, datasetResponse, modelLibraryResponse, projectRegistryResponse, diagnosticsResponse, doctorStartDryRun, doctorRepairDryRun] = await Promise.all([
    getJson("/api/project"),
    getJson("/api/sources"),
    getJson("/api/setup"),
    getJson("/api/ollama/status"),
    getJson("/api/export/latest"),
    getJson("/api/dataset/latest"),
    getJson("/api/models/library"),
    getJson("/api/projects"),
    getJson("/api/diagnostics"),
    postJson("/api/setup/doctor/action", { actionId: "start-ollama", dryRun: true }),
    postJson("/api/setup/doctor/action", { actionId: "pull-small-model", dryRun: true })
  ]);
  const evalReport = project.latestEval || null;
  const dataset = project.latestDataset || datasetResponse.dataset || null;
  const knowledgePack = project.latestKnowledgePack || null;
  const exportPack = exportPackResponse.pack || null;
  const modelLibrary = modelLibraryResponse.library || null;
  const projectRegistry = projectRegistryResponse.registry || null;
  const diagnostics = diagnosticsResponse.diagnostics || null;
  const activeRegistryProject = projectRegistry?.projects?.find((item) => item.id === projectRegistry.activeProjectId) || null;
  const latestPackRun = project.latestRecipeRun || null;
  const latestBuilderRun = project.latestBuilderRun || null;
  const builderStages = latestBuilderRun?.stages || [];
  const planScope = project.latestBuildPlan?.request?.sourceScope || "";
  const scopePreviewOptions = project.latestBuildPlan?.sourceScopePreview?.options || [];
  const gates = evalReport?.gates || [];
  const counts = gateCounts(gates);
  const tools = project.toolStatus || {};
  const allToolsAvailable = ["repomori", "agentledger", "ollama"].every((key) => tools[key]?.ok);
  const licenseGate = gates.find((gate) => gate.id === "license-review");
  const licenseReview = evalReport?.licenseReview || null;
  const licenseOk = licenseGate ? String(licenseGate.status).toLowerCase() === "pass" : false;
  const proofSummary = project.latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    proofSummary &&
      proofSummary.totalFiles === sources.totalFiles &&
      proofSummary.sampledFiles === sources.sampledFiles &&
      proofSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalFresh = Boolean(evalReport && project.latestProof?.path && evalReport.proofPath === project.latestProof.path && proofFresh);

  const checks = [
    check("Project API", project.name && project.status, `${project.name || "unknown"} / ${project.status || "unknown"}`),
    check("Source inventory", sources.totalFiles > 0 && sources.rows?.length > 0, `${sources.totalFiles || 0} files, ${sources.rows?.length || 0} rows`),
    check(
      "First-run doctor",
      Boolean(setup.doctor?.schema === "modelforge.first_run_doctor.v1" && setup.doctor?.checks?.length >= 6),
      setup.doctor ? `${setup.doctor.status}: ${setup.doctor.title}; ${setup.doctor.checks?.length || 0} checks` : "missing doctor"
    ),
    check(
      "Windows launcher",
      existsSync("Start-ModelForge.cmd") && Boolean(setup.doctor?.launch?.available),
      setup.doctor?.launch?.scriptPath || "Start-ModelForge.cmd missing"
    ),
    check(
      "Storage preference",
      Boolean(setup.doctor?.recommended?.dataRoot),
      setup.doctor ? `${setup.doctor.preferredDrive}: ${setup.doctor.recommended.dataRoot}` : "no storage recommendation"
    ),
    check(
      "Project registry",
      Boolean(
        projectRegistry?.schema === "modelforge.project_registry.v1" &&
          projectRegistry.projects?.length &&
          projectRegistry.activeProjectId &&
          projectRegistry.projects.some((item) => item.id === projectRegistry.activeProjectId)
      ),
      projectRegistry ? `${projectRegistry.summary.active} active, ${projectRegistry.summary.archived} archived, preferred=${projectRegistry.recommended.preferredDrive}` : "no project registry"
    ),
    check(
      "Project data reset",
      Boolean(activeRegistryProject?.dataResetReady && String(activeRegistryProject.dataRoot || "").toLowerCase().endsWith(".modelforge-data")),
      activeRegistryProject ? `${activeRegistryProject.name}: ${activeRegistryProject.dataResetReason || "reset contract ready"}` : "no active project"
    ),
    check(
      "Issue diagnostics",
      Boolean(
        diagnostics?.schema === "modelforge.diagnostics.v1" &&
          diagnostics.privacy?.environmentIncluded === false &&
          diagnostics.privacy?.sourceContentsIncluded === false &&
          diagnostics.files?.downloadName &&
          diagnostics.setup?.doctorChecks?.length >= 6
      ),
      diagnostics ? `${diagnostics.setup.doctorStatus}: ${diagnostics.files?.downloadName || "no download name"}` : "no diagnostics report"
    ),
    check(
      "Doctor start repair",
      Boolean(
        doctorStartDryRun?.repair?.schema === "modelforge.setup_repair.v1" &&
          doctorStartDryRun.repair.dryRun === true &&
          doctorStartDryRun.repair.actionId === "start-ollama" &&
          doctorStartDryRun.repair.command?.join(" ").includes("ollama serve")
      ),
      doctorStartDryRun?.repair ? `${doctorStartDryRun.repair.summary} (${doctorStartDryRun.repair.command?.join(" ") || "no command"})` : "no start dry run"
    ),
    check(
      "Doctor model repair",
      Boolean(
        doctorRepairDryRun?.repair?.schema === "modelforge.setup_repair.v1" &&
          doctorRepairDryRun.repair.dryRun === true &&
          doctorRepairDryRun.repair.actionId === "pull-small-model" &&
          doctorRepairDryRun.repair.command?.join(" ").includes("ollama pull")
      ),
      doctorRepairDryRun?.repair ? `${doctorRepairDryRun.repair.summary} (${doctorRepairDryRun.repair.command?.join(" ") || "no command"})` : "no repair dry run"
    ),
    check(
      "Source rules",
      Boolean(sources.sourceRules?.schema === "modelforge.source_rules.v1" && Array.isArray(sources.sourceRules.includePatterns) && Array.isArray(sources.sourceRules.excludePatterns)),
      sources.sourceRules ? `${sources.sourceRules.includedFiles} included, ${sources.sourceRules.excludedFiles} hidden by rules` : "no source rules"
    ),
    check("Tool availability", allToolsAvailable, Object.entries(tools).map(([key, value]) => `${key}=${value.label}`).join(", ")),
    check("Ollama status", ollama.ok, ollama.ok ? `${ollama.selectedModel} running` : ollama.error || "not available", "warn"),
    check(
      "Builder plan",
      Boolean(project.latestBuildPlan?.planId),
      project.latestBuildPlan ? `${project.latestBuildPlan.routeLabel} / ${project.latestBuildPlan.planId}` : "no builder plan"
    ),
    check(
      "Model fit estimator",
      Boolean(project.latestBuildPlan?.hardware?.modelFit?.candidates?.length),
      project.latestBuildPlan?.hardware?.modelFit?.summary || "no hardware fit estimate"
    ),
    check(
      "Hardware fit recipe",
      Boolean(
        project.latestBuildPlan?.hardwareRecipe?.schema === "modelforge.hardware_recipe.v1" &&
          project.latestBuildPlan.hardwareRecipe.recommended?.modelClass &&
          project.latestBuildPlan.hardwareRecipe.recommended?.quantization &&
          project.latestBuildPlan.hardwareRecipe.recommended?.contextWindowTokens &&
          project.latestBuildPlan.hardwareRecipe.recommended?.runner &&
          project.latestBuildPlan.hardwareRecipe.reasoning?.length >= 3
      ),
      project.latestBuildPlan?.hardwareRecipe
        ? `${project.latestBuildPlan.hardwareRecipe.recommended.modelClass} / ${project.latestBuildPlan.hardwareRecipe.recommended.quantization} / ${project.latestBuildPlan.hardwareRecipe.recommended.contextWindowTokens} context`
        : "no hardware recipe"
    ),
    check(
      "Applied hardware recipe",
      Boolean(
        project.latestAppliedHardwareRecipe?.schema === "modelforge.applied_hardware_recipe.v1" &&
          project.latestAppliedHardwareRecipe.ok === true &&
          project.latestAppliedHardwareRecipe.baseModel?.installedAfter === true &&
          project.latestAppliedHardwareRecipe.modelProfile?.profilePath &&
          existsSync(project.latestAppliedHardwareRecipe.modelProfile.profilePath) &&
          project.latestAppliedHardwareRecipe.modelProfile?.modelfilePath &&
          existsSync(project.latestAppliedHardwareRecipe.modelProfile.modelfilePath) &&
          project.latestAppliedHardwareRecipe.testPrompt?.unlocked === true &&
          project.latestAppliedHardwareRecipe.testPrompt?.prompt &&
          project.latestAppliedHardwareRecipe.files?.latestJson &&
          existsSync(project.latestAppliedHardwareRecipe.files.latestJson)
      ),
      project.latestAppliedHardwareRecipe
        ? `${project.latestAppliedHardwareRecipe.baseModel?.resolved || "no base"} -> ${project.latestAppliedHardwareRecipe.modelProfile?.modelName || "no model"}; test=${project.latestAppliedHardwareRecipe.testPrompt?.unlocked ? "unlocked" : "locked"}`
        : "no applied hardware recipe"
    ),
    check(
      "Builder blueprint",
      Boolean(project.latestBuildPlan?.blueprint?.summary && project.latestBuildPlan?.request?.aiType),
      project.latestBuildPlan?.blueprint ? `${project.latestBuildPlan.blueprint.aiType?.label}: ${project.latestBuildPlan.blueprint.summary}` : "no builder blueprint"
    ),
    check(
      "Builder AI profile",
      Boolean(
        project.latestBuildPlan?.aiProfile?.schema === "modelforge.builder_ai_profile.v1" &&
          project.latestBuildPlan.aiProfile.name &&
          project.latestBuildPlan.aiProfile.voice &&
          project.latestBuildPlan.aiProfile.answerRules?.length >= 3 &&
          project.latestBuildPlan.aiProfile.outputs?.length >= 5 &&
          project.latestBuildPlan.aiProfile.doneWhen?.length >= 3
      ),
      project.latestBuildPlan?.aiProfile
        ? `${project.latestBuildPlan.aiProfile.name} / ${project.latestBuildPlan.aiProfile.voice}: ${project.latestBuildPlan.aiProfile.outputs?.length || 0} outputs, ${project.latestBuildPlan.aiProfile.answerRules?.length || 0} rules`
        : "no AI build contract"
    ),
    check(
      "Starter model card",
      Boolean(
        project.latestBuildPlan?.starterModelCard?.schema === "modelforge.starter_model_card.v1" &&
          project.latestBuildPlan.starterModelCard.aiName &&
          project.latestBuildPlan.starterModelCard.voice &&
          project.latestBuildPlan.starterModelCard.files?.markdown &&
          project.latestBuildPlan.starterModelCard.files?.json &&
          existsSync(project.latestBuildPlan.starterModelCard.files.markdown) &&
          existsSync(project.latestBuildPlan.starterModelCard.files.json)
      ),
      project.latestBuildPlan?.starterModelCard
        ? `${project.latestBuildPlan.starterModelCard.aiName}: ${project.latestBuildPlan.starterModelCard.files?.markdown || "missing path"}`
        : "no starter model card"
    ),
    check(
      "Builder guided setup",
      Boolean(
        project.latestBuildPlan?.request?.templateId &&
          project.latestBuildPlan?.request?.sourceScope &&
          project.latestBuildPlan?.blueprint?.firstRunChecklist?.length &&
          scopePreviewOptions.length === 4
      ),
      project.latestBuildPlan
        ? `${project.latestBuildPlan.request.templateId || "no template"} / ${project.latestBuildPlan.request.sourceScope || "no source scope"} / ${scopePreviewOptions.length} scope previews / ${project.latestBuildPlan.blueprint?.firstRunChecklist?.length || 0} checklist items`
        : "no guided builder plan"
    ),
    check(
      "Model library",
      Boolean(
        modelLibrary?.schema === "modelforge.model_library.v1" &&
          modelLibrary.items?.length &&
          modelLibrary.summary?.total === modelLibrary.items.length
      ),
      modelLibrary ? `${modelLibrary.summary.total} targets, ${modelLibrary.summary.runnable} runnable, ${modelLibrary.summary.recipes} recipes` : "no model library"
    ),
    check(
      "Model receipts",
      Boolean(modelLibrary?.receipts?.length && modelLibrary.items?.some((item) => item.kind === "forged" && item.receipts?.length)),
      modelLibrary ? `${modelLibrary.receipts?.length || 0} shared receipts, forged=${modelLibrary.items?.find((item) => item.kind === "forged")?.receipts?.length || 0}` : "no receipts"
    ),
    check(
      "Compare playground contract",
      Boolean(modelLibrary?.defaultPrompt && modelLibrary.compare?.baseModel && modelLibrary.compare?.forgedModel),
      modelLibrary?.compare
        ? `${modelLibrary.compare.baseModel || "no base"} vs ${modelLibrary.compare.forgedModel || "no forged"} / canCompare=${modelLibrary.compare.canCompare}`
        : "no compare contract",
      "warn"
    ),
    check("Proof bundle", Boolean(project.latestProof?.path), project.latestProof?.path || "no proof bundle"),
    check(
      "Proof freshness",
      proofFresh,
      proofSummary
        ? `${proofSummary.totalFiles}/${sources.totalFiles} files, ${proofSummary.sampledFiles}/${sources.sampledFiles} sampled, ${proofSummary.totalSizeBytes}/${sources.totalSizeBytes} bytes`
        : "no proof source summary"
    ),
    check("Eval report", gates.length > 0, evalReport?.summary || "no eval report"),
    check("Eval freshness", evalFresh, evalReport?.proofPath ? `eval proof path: ${evalReport.proofPath}` : "no eval proof path"),
    check(
      "Dataset Forge",
      Boolean(dataset?.summary?.totalExamples),
      dataset ? `${dataset.summary.totalExamples} examples, ${dataset.summary.estimatedTokens} tokens` : "no dataset pack"
    ),
    check(
      "Dataset source scope",
      Boolean(dataset?.sourceScope?.id && dataset.sourceScope.id === planScope && dataset.files?.sourceScopeReceipt),
      dataset?.sourceScope
        ? `${dataset.sourceScope.label}: ${dataset.sourceScope.includedFiles} included, ${dataset.sourceScope.excludedFiles} excluded, receipt=${dataset.files?.sourceScopeReceipt || "missing"}`
        : "dataset has no source scope"
    ),
    check(
      "Local knowledge pack",
      Boolean(
        knowledgePack?.schema === "modelforge.knowledge_pack.v1" &&
          knowledgePack.summary?.totalSnippets > 0 &&
          dataset?.knowledgePack?.packId === knowledgePack.packId
      ),
      knowledgePack ? `${knowledgePack.summary.totalSnippets} snippets, ${knowledgePack.summary.estimatedTokens} tokens` : "no knowledge pack"
    ),
    check(
      "Knowledge source scope",
      Boolean(knowledgePack?.sourceScope?.id && knowledgePack.sourceScope.id === planScope && knowledgePack.files?.sourceScopeReceipt),
      knowledgePack?.sourceScope
        ? `${knowledgePack.sourceScope.label}: ${knowledgePack.sourceScope.includedFiles} included, ${knowledgePack.sourceScope.excludedFiles} excluded, receipt=${knowledgePack.files?.sourceScopeReceipt || "missing"}`
        : "knowledge pack has no source scope"
    ),
    check(
      "Export dataset artifacts",
      Boolean(
        exportPack?.copiedArtifacts?.includes("training/dataset.jsonl") &&
          exportPack?.copiedArtifacts?.includes("training/dataset-manifest.json") &&
          exportPack?.copiedArtifacts?.includes("training/source-scope.md") &&
          exportPack?.copiedArtifacts?.includes("training/source-scope.json")
      ),
      exportPack ? `${exportPack.artifactCount} artifacts in ${exportPack.recipeId}` : "no export pack"
    ),
    check(
      "Export knowledge artifacts",
      Boolean(
        exportPack?.copiedArtifacts?.includes("knowledge/knowledge-pack.jsonl") &&
          exportPack?.copiedArtifacts?.includes("knowledge/knowledge-manifest.json") &&
          exportPack?.copiedArtifacts?.includes("knowledge/source-scope.md")
      ),
      exportPack ? `${exportPack.copiedArtifacts?.filter((artifact) => artifact.startsWith("knowledge/")).length || 0} knowledge artifacts in ${exportPack.recipeId}` : "no export pack"
    ),
    check(
      "Export pack run receipt",
      latestPackRun?.status === "pass" && latestPackRun?.recipeId === exportPack?.recipeId,
      latestPackRun ? `${latestPackRun.status}: ${latestPackRun.summary}` : "pack has not been run yet",
      "warn"
    ),
    check(
      "Build From Plan receipt",
      latestBuilderRun?.status === "pass" &&
        builderStages.length > 0 &&
        builderStages.every((stage) => stage.status === "pass") &&
        Boolean(latestBuilderRun.outputs?.sourceScopeReceiptPath),
      latestBuilderRun ? `${latestBuilderRun.status}: ${latestBuilderRun.summary}; scope=${latestBuilderRun.outputs?.sourceScopeReceiptPath || "missing"}` : "builder run has not been run yet"
    ),
    check(
      "Build handoff",
      Boolean(
        latestBuilderRun?.handoff?.schema === "modelforge.builder_handoff.v1" &&
          latestBuilderRun.handoff.title &&
          latestBuilderRun.handoff.summary?.includes("Your hardware supports") &&
          latestBuilderRun.handoff.builtArtifacts?.length >= 4 &&
          latestBuilderRun.handoff.actions?.some((action) => action.id === "test-ai" && action.workspace === "model")
      ),
      latestBuilderRun?.handoff ? `${latestBuilderRun.handoff.title}; ${latestBuilderRun.handoff.builtArtifacts?.length || 0} artifacts` : "no build handoff"
    ),
    check("Release failures", counts.fail === 0, `${counts.fail} failing gates`),
    check(
      "License review",
      licenseOk,
      licenseReview
        ? `${licenseReview.coveragePercent}% coverage, ${licenseReview.blockers[0] || "no blockers"}`
        : licenseGate
          ? `${licenseGate.value} coverage, ${licenseGate.status}`
          : "not measured",
      "warn"
    ),
    check(
      "Project license decision",
      Boolean(licenseReview?.projectLicenseReady),
      licenseReview
        ? `LICENSE=${licenseReview.projectLicensePath || "missing"}, package=${licenseReview.packageLicense || "missing"}`
        : "not measured",
      "warn"
    ),
    check("Share card", Boolean(project.latestShare?.text), project.latestShare?.headline || "not built", "warn")
  ];

  console.log(`ModelForge smoke against ${apiRoot}`);
  for (const item of checks) {
    console.log(formatCheck(item));
  }

  const hardFailures = checks.filter((item) => !item.ok && item.severity !== "warn");
  if (hardFailures.length) {
    console.error(`Smoke failed: ${hardFailures.length} hard check(s) failed.`);
    process.exit(1);
  }

  const warnings = checks.filter((item) => !item.ok && item.severity === "warn");
  console.log(warnings.length ? `Smoke passed with ${warnings.length} release warning(s).` : "Smoke passed.");
}

main().catch((error) => {
  console.error(`Smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
