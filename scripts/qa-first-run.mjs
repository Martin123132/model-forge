const apiRoot = (process.env.MODEL_FORGE_API_URL || "http://127.0.0.1:4188").replace(/\/$/, "");

const scenarios = [
  {
    id: "ready",
    status: "ready",
    checks: { "source-folder": "pass", ollama: "pass", python: "pass", "disk-space": "pass" },
    actions: []
  },
  {
    id: "missing-ollama",
    status: "blocked",
    checks: { ollama: "fail" },
    actions: ["install-ollama"],
    absentActions: ["start-ollama", "pull-small-model"]
  },
  {
    id: "stopped-ollama",
    status: "blocked",
    checks: { ollama: "fail" },
    actions: ["start-ollama"],
    absentActions: ["install-ollama", "pull-small-model"]
  },
  {
    id: "no-models",
    status: "needs-attention",
    checks: { ollama: "warn" },
    actions: ["pull-small-model"]
  },
  {
    id: "bad-source-folder",
    status: "blocked",
    checks: { "source-folder": "fail" },
    actions: []
  },
  {
    id: "missing-python",
    status: "needs-attention",
    checks: { python: "warn" },
    actions: ["set-python"]
  },
  {
    id: "low-disk",
    status: "blocked",
    checks: { "disk-space": "fail" },
    actions: []
  },
  {
    id: "c-drive-storage",
    status: "needs-attention",
    checks: { "data-drive": "warn", "ollama-models": "warn" },
    actions: ["use-d-drive-storage"]
  }
];

function check(label, ok, detail, severity = "fail") {
  return { label, ok: Boolean(ok), detail, severity };
}

function format(item) {
  const status = item.ok ? "PASS" : item.severity === "warn" ? "WARN" : "FAIL";
  return `${status} ${item.label}: ${item.detail}`;
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

async function main() {
  const checks = [];
  for (const scenario of scenarios) {
    const result = await postJson("/api/setup/doctor/simulate", { scenario: scenario.id });
    const actionIds = new Set(result.observed?.actionIds || []);
    const checkStatuses = result.observed?.checkStatuses || {};
    checks.push(
      check(`${scenario.id} schema`, result.schema === "modelforge.first_run_doctor_simulation.v1" && result.doctor?.schema === "modelforge.first_run_doctor.v1", result.schema || "missing"),
      check(`${scenario.id} status`, result.observed?.status === scenario.status, `${result.observed?.status || "missing"} expected ${scenario.status}`)
    );
    for (const [checkId, status] of Object.entries(scenario.checks)) {
      checks.push(check(`${scenario.id} ${checkId}`, checkStatuses[checkId] === status, `${checkStatuses[checkId] || "missing"} expected ${status}`));
    }
    for (const actionId of scenario.actions) {
      checks.push(check(`${scenario.id} action ${actionId}`, actionIds.has(actionId), `${[...actionIds].join(", ") || "no actions"}`));
    }
    for (const actionId of scenario.absentActions || []) {
      checks.push(check(`${scenario.id} absent ${actionId}`, !actionIds.has(actionId), `${[...actionIds].join(", ") || "no actions"}`));
    }
  }

  console.log(`ModelForge first-run scenario QA against ${apiRoot}`);
  for (const item of checks) {
    console.log(format(item));
  }
  const failures = checks.filter((item) => !item.ok && item.severity !== "warn");
  if (failures.length) {
    console.error(`First-run scenario QA failed: ${failures.length} hard check(s) failed.`);
    process.exit(1);
  }
  console.log("First-run scenario QA passed.");
}

main().catch((error) => {
  console.error(`First-run scenario QA failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
