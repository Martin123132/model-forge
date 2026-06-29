import process from "node:process";

const apiRoot = (process.env.MODEL_FORGE_API_URL || "http://127.0.0.1:4188").replace(/\/$/, "");

async function getJson(path) {
  const response = await fetch(`${apiRoot}${path}`, { headers: { accept: "application/json" } });
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
  const [project, sources, ollama, exportPackResponse, datasetResponse] = await Promise.all([
    getJson("/api/project"),
    getJson("/api/sources"),
    getJson("/api/ollama/status"),
    getJson("/api/export/latest"),
    getJson("/api/dataset/latest")
  ]);
  const evalReport = project.latestEval || null;
  const dataset = project.latestDataset || datasetResponse.dataset || null;
  const exportPack = exportPackResponse.pack || null;
  const latestPackRun = project.latestRecipeRun || null;
  const latestBuilderRun = project.latestBuilderRun || null;
  const builderStages = latestBuilderRun?.stages || [];
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
      "Builder blueprint",
      Boolean(project.latestBuildPlan?.blueprint?.summary && project.latestBuildPlan?.request?.aiType),
      project.latestBuildPlan?.blueprint ? `${project.latestBuildPlan.blueprint.aiType?.label}: ${project.latestBuildPlan.blueprint.summary}` : "no builder blueprint"
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
      "Export dataset artifacts",
      Boolean(exportPack?.copiedArtifacts?.includes("training/dataset.jsonl") && exportPack?.copiedArtifacts?.includes("training/dataset-manifest.json")),
      exportPack ? `${exportPack.artifactCount} artifacts in ${exportPack.recipeId}` : "no export pack"
    ),
    check(
      "Export pack run receipt",
      latestPackRun?.status === "pass" && latestPackRun?.recipeId === exportPack?.recipeId,
      latestPackRun ? `${latestPackRun.status}: ${latestPackRun.summary}` : "pack has not been run yet",
      "warn"
    ),
    check(
      "Build From Plan receipt",
      latestBuilderRun?.status === "pass" && builderStages.length > 0 && builderStages.every((stage) => stage.status === "pass"),
      latestBuilderRun ? `${latestBuilderRun.status}: ${latestBuilderRun.summary}` : "builder run has not been run yet"
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
  console.log(warnings.length ? `Smoke passed with ${warnings.length} alpha warning(s).` : "Smoke passed.");
}

main().catch((error) => {
  console.error(`Smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
