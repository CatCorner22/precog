import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

let passed = 0;

async function test(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

try {
  const vision = await server.ssrLoadModule("/src/lib/precog/map-vision.ts");
  const rag = await server.ssrLoadModule("/src/lib/precog/rag/retrieve.ts");
  const corpus = await server.ssrLoadModule("/src/lib/precog/rag/corpus.ts");
  const scoring = await server.ssrLoadModule("/src/lib/precog/threat-scoring.ts");
  const profile = await server.ssrLoadModule("/src/lib/precog/practice-profile.ts");
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  const blueprint = await server.ssrLoadModule("/src/lib/precog/operating-blueprint.ts");
  const industryModule = await server.ssrLoadModule("/src/lib/precog/industry.ts");
  const sodRules = await server.ssrLoadModule("/src/lib/precog/sod/conflict-rules.ts");
  const sodDetect = await server.ssrLoadModule("/src/lib/precog/sod/detect.ts");
  const powerGuidance = await server.ssrLoadModule("/src/lib/precog/sod/power-guidance.ts");
  const controlMeasures = await server.ssrLoadModule("/src/lib/precog/sod/control-measures.ts");
  const resolutionPlanner = await server.ssrLoadModule("/src/lib/precog/sod/resolution-planner.ts");
  const coverageAnalysis = await server.ssrLoadModule("/src/lib/precog/sod/coverage-analysis.ts");
  const modelIo = await server.ssrLoadModule("/src/lib/precog/sod/model-io.ts");
  const changeImpact = await server.ssrLoadModule("/src/lib/precog/sod/change-impact.ts");
  const coveragePlanner = await server.ssrLoadModule("/src/lib/precog/sod/coverage-planner.ts");
  const governanceReport = await server.ssrLoadModule("/src/lib/precog/sod/governance-report.ts");
  const assignmentDiff = await server.ssrLoadModule("/src/lib/precog/sod/assignment-diff.ts");
  const powerIndex = await server.ssrLoadModule("/src/lib/precog/sod/power-index.ts");
  const valueCase = await server.ssrLoadModule("/src/lib/precog/value-case.ts");
  const valueEvidence = await server.ssrLoadModule("/src/lib/precog/value-evidence.ts");
  const snapshotComparison = await server.ssrLoadModule("/src/lib/precog/snapshot-comparison.ts");

  await test("every duty has complete four-category control alternatives", () => {
    const categories = ["directive", "preventive", "detective", "corrective"];
    assert.deepEqual(
      Object.keys(controlMeasures.DUTY_CONTROL_MEASURES).sort(),
      sodRules.ENTITLEMENTS.map((item) => item.id).sort(),
    );
    for (const entitlement of sodRules.ENTITLEMENTS) {
      const catalog = controlMeasures.DUTY_CONTROL_MEASURES[entitlement.id];
      for (const category of categories) {
        assert.ok(
          catalog[category].length >= 2,
          `${entitlement.id} needs ${category} alternatives`,
        );
        assert.ok(catalog[category].every((action) => action.trim().length >= 12));
      }
    }
  });

  await test("value evidence is bounded, deduplicated, and summarized from verified records", () => {
    const records = valueEvidence.normalizeValueEvidence([
      {
        id: "one",
        kind: "recovery",
        description: "Recovered duplicate",
        source: "AP-1",
        amount: 500,
        observedAt: "2026-09-20",
        verified: true,
        injected: true,
      },
      { id: "one", kind: "recovery", description: "duplicate", amount: 999 },
      {
        id: "two",
        kind: "time",
        description: "Review time",
        amount: -5,
        observedAt: "invalid",
        verified: false,
      },
      { id: "bad", kind: "unknown", description: "invalid" },
    ]);
    assert.equal(records.length, 2);
    assert.equal("injected" in records[0], false);
    assert.equal(records[1].amount, 0);
    assert.equal(records[1].observedAt, "");
    const asOf = new Date("2026-09-20T00:00:00.000Z");
    assert.deepEqual(valueEvidence.summarizeValueEvidence(records, asOf), {
      total: 2,
      verified: 1,
      recoveries: 500,
      hours: 0,
      completion: 50,
    });
    assert.equal(valueEvidence.formatEvidenceAmount(records[0]), "$500");
    assert.equal(valueEvidence.formatEvidenceAmount({ kind: "time", amount: 12.5 }), "12.5 hrs");
    assert.deepEqual(
      valueEvidence.assessEvidenceQuality(records, new Date("2026-09-20T00:00:00.000Z")),
      { unsourced: 1, stale: 1, future: 0, verified: 1, score: 50 },
    );
    const unsourcedVerified = valueEvidence.normalizeValueEvidence([
      {
        id: "unsafe",
        kind: "control",
        description: "No source",
        source: "",
        amount: 1,
        observedAt: "2026-09-20",
        verified: true,
      },
    ]);
    assert.equal(unsourcedVerified[0].verified, false);
    const impossibleDate = valueEvidence.normalizeValueEvidence([
      {
        id: "date",
        kind: "control",
        description: "Bad date",
        source: "ticket",
        amount: 1,
        observedAt: "2026-99-99",
        verified: true,
      },
    ]);
    assert.equal(impossibleDate[0].observedAt, "");
    const futureQuality = valueEvidence.assessEvidenceQuality(
      [{ ...records[0], observedAt: "2026-09-21" }],
      new Date("2026-09-20T00:00:00.000Z"),
    );
    assert.deepEqual(futureQuality, { unsourced: 0, stale: 0, future: 1, verified: 0, score: 0 });
    // The totals the Value screen applies follow the same rule as the quality score.
    const futureSummary = valueEvidence.summarizeValueEvidence(
      [{ ...records[0], observedAt: "2026-09-21" }],
      asOf,
    );
    assert.equal(futureSummary.verified, 0);
    assert.equal(futureSummary.recoveries, 0);
    const undatedSummary = valueEvidence.summarizeValueEvidence(
      [{ ...records[0], observedAt: "" }],
      asOf,
    );
    assert.equal(undatedSummary.recoveries, 0);
    const serialized = valueEvidence.serializeValueEvidence(
      records,
      new Date("2026-09-20T00:00:00.000Z"),
    );
    assert.deepEqual(valueEvidence.parseValueEvidence(serialized), records);
    assert.throws(
      () => valueEvidence.parseValueEvidence('{"version":2,"evidence":[]}'),
      /Unsupported evidence version/,
    );
    assert.throws(() => valueEvidence.parseValueEvidence("x".repeat(128_001)), /exceeds 128 KB/);
  });

  await test("value cases separate observed value from modeled avoided loss", () => {
    const result = valueCase.calculateValueCase({
      reviewHoursBefore: 30,
      reviewHoursAfter: 10,
      hourlyCost: 100,
      annualReviews: 4,
      directRecoveries: 2_000,
      annualExposure: 500_000,
      eventProbability: 0.02,
      controlEffectiveness: 0.4,
      annualProgramCost: 5_000,
    });
    assert.equal(result.observed.hoursSaved, 80);
    assert.equal(result.observed.laborValue, 8_000);
    assert.equal(result.observed.total, 10_000);
    assert.equal(result.observed.net, 5_000);
    assert.equal(result.observed.roi, 1);
    assert.equal(result.observed.paybackMonths, 6);
    assert.equal(result.modeled.expectedLossBefore, 10_000);
    assert.equal(result.modeled.base, 4_000);
    assert.equal(result.modeled.low, 2_000);
    assert.equal(result.modeled.high, 6_000);
    assert.equal("total" in result, false, "observed and modeled value must not be combined");
    const memo = valueCase.createValueCaseMemo(result.inputs, new Date("2026-01-01T00:00:00.000Z"));
    assert.match(memo, /Net observed value: \$5,000/);
    assert.match(memo, /Modeled risk reduction \(not realized savings\)/);
    assert.match(memo, /2026-01-01T00:00:00.000Z/);
    const memoWithEvidence = valueCase.createValueCaseMemo(
      result.inputs,
      new Date("2026-01-01T00:00:00.000Z"),
      [
        {
          id: "e1",
          kind: "recovery",
          description: "Vendor | refund",
          source: "AP-7",
          amount: 500,
          observedAt: "2026-01-01",
          verified: true,
        },
      ],
    );
    assert.match(memoWithEvidence, /\| Verified \| recovery \| Vendor \\\| refund \| AP-7 \|/);
    const reconciledHours = valueCase.applyVerifiedAnnualHours(result.inputs, 40);
    assert.equal(reconciledHours.reviewHoursAfter, 20);
    assert.equal(valueCase.calculateValueCase(reconciledHours).observed.hoursSaved, 40);
    assert.equal(
      valueCase.applyVerifiedAnnualHours({ ...result.inputs, annualReviews: 0 }, 40)
        .reviewHoursAfter,
      result.inputs.reviewHoursAfter,
    );
  });

  await test("value case inputs are finite and conservatively bounded", () => {
    const normalized = valueCase.normalizeValueCase({
      reviewHoursBefore: -10,
      reviewHoursAfter: Number.NaN,
      annualExposure: Number.POSITIVE_INFINITY,
      eventProbability: 8,
      controlEffectiveness: -2,
    });
    assert.equal(normalized.reviewHoursBefore, 0);
    assert.equal(normalized.eventProbability, 1);
    assert.equal(normalized.controlEffectiveness, 0);
    assert.ok(Object.values(normalized).every(Number.isFinite));
  });

  await test("snapshot comparison reports profile, assignment, and observed-value movement", () => {
    const archivedProfile = profile.defaultProfile();
    const currentProfile = profile.normalizeProfile({
      ...archivedProfile,
      staff: { ...archivedProfile.staff, teamSize: archivedProfile.staff.teamSize + 2 },
      riskVariables: {
        ...archivedProfile.riskVariables,
        deductible: archivedProfile.riskVariables.deductible + 1_000,
      },
    });
    const archivedMap = sodDetect.buildAssignments();
    const currentMap = archivedMap.map((item, index) =>
      index === 0 ? { ...item, entitlements: [...item.entitlements, "manage_backups"] } : item,
    );
    // Net value is observed only from the owner's own figures: recoveries
    // and the program's cost, both entered in each assessment.
    const archivedValue = {
      ...valueCase.DEFAULT_VALUE_CASE,
      directRecoveries: 1_000,
      annualProgramCost: 10_000,
    };
    const currentValue = { ...archivedValue, directRecoveries: 6_000 };
    const comparison = snapshotComparison.compareAssessmentStates(
      {
        profile: currentProfile,
        powerMap: currentMap,
        valueCase: currentValue,
        evidence: [
          {
            id: "recovery",
            kind: "recovery",
            description: "Recovered",
            source: "AP-1",
            amount: 500,
            observedAt: "2026-09-22",
            verified: true,
          },
        ],
        asOf: new Date("2026-09-22T00:00:00.000Z"),
      },
      {
        profile: archivedProfile,
        powerMap: archivedMap,
        valueCase: archivedValue,
        evidence: [],
        asOf: new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    assert.equal(comparison.teamSizeDelta, 2);
    assert.equal(comparison.riskChanges, 1);
    assert.equal(comparison.riskVariableChanges[0].key, "deductible");
    assert.equal(comparison.netObservedValueDelta, 5_000);
    const fromDefaults = snapshotComparison.compareAssessmentStates(
      {
        profile: currentProfile,
        powerMap: currentMap,
        valueCase: valueCase.DEFAULT_VALUE_CASE,
        evidence: [],
      },
      {
        profile: archivedProfile,
        powerMap: archivedMap,
        valueCase: valueCase.DEFAULT_VALUE_CASE,
        evidence: [],
      },
    );
    assert.equal(fromDefaults.netObservedValueDelta, null);
    assert.equal(comparison.grants, 1);
    assert.equal(comparison.assignmentChanges.length, 1);
    assert.equal(comparison.assignmentChanges[0].kind, "duty_granted");
    assert.equal(comparison.verifiedEvidenceDelta, 1);
    assert.equal(comparison.verifiedRecoveryDelta, 500);
    assert.equal(comparison.evidenceReadinessDelta, 100);
    const agingEvidence = [
      {
        id: "old",
        kind: "control",
        description: "Control tested",
        source: "test-1",
        amount: 1,
        observedAt: "2025-06-01",
        verified: true,
      },
    ];
    const agingComparison = snapshotComparison.compareAssessmentStates(
      {
        profile: currentProfile,
        powerMap: currentMap,
        valueCase: currentValue,
        evidence: agingEvidence,
        asOf: new Date("2026-09-22T00:00:00.000Z"),
      },
      {
        profile: archivedProfile,
        powerMap: archivedMap,
        valueCase: archivedValue,
        evidence: agingEvidence,
        asOf: new Date("2025-06-01T00:00:00.000Z"),
      },
    );
    assert.equal(agingComparison.evidenceReadinessDelta, -100);
    const comparisonReport = snapshotComparison.createSnapshotComparisonReport(
      "Quarterly\nreview",
      "2026-01-01T00:00:00.000Z",
      comparison,
      new Date("2026-09-22T00:00:00.000Z"),
    );
    assert.match(comparisonReport, /# Assessment comparison — Quarterly review/);
    assert.match(comparisonReport, /duty granted:/);
    assert.match(comparisonReport, /Report generated: 2026-09-22T00:00:00.000Z/);
    assert.match(comparisonReport, /deductible:/);
  });

  await test("priority bands preserve their documented boundaries", () => {
    assert.equal(vision.priorityBand(34), "cold");
    assert.equal(vision.priorityBand(35), "watch");
    assert.equal(vision.priorityBand(55), "elevated");
    assert.equal(vision.priorityBand(72), "critical");
    assert.equal(vision.priorityBand(88), "white_hot");
  });

  await test("priority scores stay bounded and flag high-impact open controls", () => {
    const samples = [-1_000, -20, 0, 50, 100, 140, 1_000].map((heat) =>
      vision.scorePriority({ heat, kind: "control", controlOpen: true }),
    );
    const high = samples.at(-1);
    assert.ok(samples.every(({ priority }) => priority >= 0 && priority <= 100));
    assert.equal(high.immediate, true);
    assert.ok(high.reasons.includes("Open control / SoD gap"));
  });

  await test("control guidance retrieval returns authoritative guidance", () => {
    const hits = rag.retrieveKnowledge("weekly owner bank reconciliation ongoing monitoring", {
      topK: 2,
    });
    const ids = hits.map((h) => h.chunk.id);
    assert.ok(ids.includes("coso-monitoring"), `expected the COSO monitoring chunk, got ${ids}`);
    const cited = hits.find((h) => h.chunk.id === "coso-monitoring");
    assert.equal(cited.chunk.basis.kind, "cited");
    assert.match(cited.chunk.basis.url, /^https:\/\//);
    // The weekly cadence is practitioner guidance and must not carry the cited badge.
    const cadence = corpus.KNOWLEDGE_CORPUS.find((c) => c.id === "monitoring-cadence-practice");
    assert.equal(cadence?.basis.kind, "practice");
  });

  await test("control guidance retrieval returns authoritative access guidance", () => {
    const [hit] = rag.retrieveKnowledge("least privilege MFA termination access review", {
      topK: 1,
    });
    assert.equal(hit?.chunk.id, "logical-access-leavers");
    assert.equal(hit.chunk.basis.kind, "cited");
    assert.match(hit.chunk.basis.url, /^https:\/\//);
  });

  await test("every authoritative corpus URL uses HTTPS", () => {
    const sourced = corpus.KNOWLEDGE_CORPUS.filter((chunk) => chunk.basis.kind === "cited");
    assert.ok(sourced.length >= 4);
    for (const chunk of sourced) assert.match(chunk.basis.url, /^https:\/\//);
  });

  await test("knowledge chunk identifiers are unique", () => {
    const ids = corpus.KNOWLEDGE_CORPUS.map((chunk) => chunk.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  await test("core control domains return targeted guidance", () => {
    const cases = [
      ["payroll direct deposit rate change", "payroll-change-controls"],
      ["patient refund credit balance", "refund-controls"],
      ["PMS configuration production rollback", "system-change-management"],
      ["HIPAA ePHI risk analysis", "hipaa-risk-analysis"],
      ["management override unusual journal entry", "management-override"],
    ];
    for (const [query, expectedId] of cases) {
      const [hit] = rag.retrieveKnowledge(query, { topK: 1 });
      assert.equal(hit?.chunk.id, expectedId, query);
      assert.ok(hit.score > 0.05, query);
    }
  });

  await test("threat assessment supports a missing risk-variable override", () => {
    const defaults = profile.defaultProfile();
    const report = scoring.buildThreatAssessment({
      practiceName: defaults.practiceName,
      staff: defaults.staff,
      dualRelease: defaults.dualRelease,
    });
    assert.ok(Number.isFinite(report.overallThreatIndex));
    assert.ok(report.targetDeck.length > 0);
    assert.ok(report.targetDeck.every((target) => Number.isFinite(target.priority)));
  });

  await test("restored profiles merge current model defaults", () => {
    const restored = profile.normalizeProfile({
      practiceName: "Archived Practice",
      staff: { teamSize: 9 },
      riskVariables: { deductible: 12_500 },
    });
    assert.equal(restored.practiceName, "Archived Practice");
    assert.equal(restored.staff.teamSize, 9);
    assert.equal(restored.riskVariables.deductible, 12_500);
    assert.equal(typeof restored.riskVariables.policyLimit, "number");
    assert.ok(Array.isArray(restored.decisions));
  });

  await test("profile normalization constrains untrusted decision content", () => {
    const restored = profile.normalizeProfile({
      practiceName: "A".repeat(200),
      staff: { teamSize: "many", segregationScore: 900, dualControlPayments: "false" },
      riskVariables: { deductible: "free", claimsLoadFactor: 99, hasAlarmAccess: "yes" },
      decisions: [
        {
          id: "safe",
          createdAt: "2026-01-01",
          subject: "S".repeat(400),
          kind: "monitor",
          note: "N".repeat(3_000),
        },
        { id: "bad", createdAt: "2026-01-01", subject: "Bad", kind: "not-a-kind", note: "ignored" },
      ],
      injected: "must not survive",
    });
    assert.equal(restored.practiceName.length, 80);
    assert.equal(restored.decisions.length, 1);
    assert.equal(restored.decisions[0].subject.length, 200);
    assert.equal(restored.decisions[0].note.length, 2_000);
    assert.equal(restored.staff.teamSize, profile.defaultProfile().staff.teamSize);
    assert.equal(restored.staff.segregationScore, 100);
    assert.equal(typeof restored.staff.dualControlPayments, "boolean");
    assert.equal(
      restored.riskVariables.deductible,
      profile.defaultProfile().riskVariables.deductible,
    );
    assert.equal(restored.riskVariables.claimsLoadFactor, 2.5);
    assert.equal(typeof restored.riskVariables.hasAlarmAccess, "boolean");
    assert.equal("injected" in restored, false);
  });

  await test("snapshot migration provides ownership and provenance columns", async () => {
    const sql = await db.getSql();
    const rows = await sql.query(
      `select column_name from information_schema.columns
       where table_name = 'assessment_snapshots'`,
    );
    const columns = new Set(rows.map((row) => row.column_name));
    for (const required of [
      "id",
      "user_id",
      "profile_json",
      "model_version",
      "corpus_version",
      "created_at",
      "power_map_json",
      "value_case_json",
      "value_evidence_json",
    ]) {
      assert.ok(columns.has(required), required);
    }
  });

  await test("operating blueprint covers complete tiered process guidance for every industry", () => {
    for (const industry of industryModule.INDUSTRIES) {
      const processes = blueprint.blueprintsForIndustry(industry.id);
      assert.ok(processes.length >= 10, industry.id);
      assert.equal(new Set(processes.map((process) => process.id)).size, processes.length);
      for (const process of processes) {
        assert.ok(process.primaryOwner, `${industry.id}:${process.id}`);
        assert.ok(process.independentReviewer);
        assert.ok(process.standard.length > 0);
        assert.ok(process.leading.length > 0);
        assert.ok(process.optimal.length > 0);
        assert.ok(process.fallback.length > 0);
        assert.ok(process.evidence.length > 0);
      }
      // No line of business reads another's vocabulary in the shared processes.
      const shared = processes
        .slice(3)
        .map((p) => `${p.name} ${p.objective}`)
        .join(" ");
      if (industry.id !== "dental") assert.ok(!/patient|claim/i.test(shared), industry.id);
    }
  });

  await test("power map covers common jobs and valid duty relationships", () => {
    assert.ok(sodDetect.COMMON_JOB_TEMPLATES.length >= 18);
    assert.ok(sodRules.ENTITLEMENTS.length >= 25);
    const entitlementIds = new Set(sodRules.ENTITLEMENTS.map((item) => item.id));
    for (const template of sodDetect.COMMON_JOB_TEMPLATES) {
      assert.ok(template.role);
      assert.ok(template.entitlements.length > 0);
      for (const entitlement of template.entitlements) assert.ok(entitlementIds.has(entitlement));
    }
    for (const rule of sodRules.CONFLICT_RULES) {
      assert.ok(entitlementIds.has(rule.a), `${rule.id}:a`);
      assert.ok(entitlementIds.has(rule.b), `${rule.id}:b`);
    }
    for (const entitlement of sodRules.ENTITLEMENTS) {
      assert.ok(powerGuidance.POWER_GUIDANCE[entitlement.id]?.purpose, `${entitlement.id}:purpose`);
      assert.ok(
        powerGuidance.POWER_GUIDANCE[entitlement.id]?.evidence,
        `${entitlement.id}:evidence`,
      );
      assert.ok(
        powerGuidance.POWER_GUIDANCE[entitlement.id]?.boundary,
        `${entitlement.id}:boundary`,
      );
    }
  });

  await test("family heuristics do not create cross-process false positives", () => {
    const assignments = [
      {
        personId: "cross-process",
        personName: "Cross Process",
        role: "Test",
        entitlements: ["collect_cash", "manage_backups"],
      },
    ];
    const report = sodDetect.detectSodConflicts(undefined, { assignments });
    assert.equal(report.conflicts.length, 0);
    const cell = report.matrix.find(
      (item) => item.row === "collect_cash" && item.col === "manage_backups",
    );
    assert.equal(cell.status, "safe");
    // Two custody duties in one cash chain (take the payment, bag the deposit)
    // are no longer a finding on their own; the control is that someone else
    // posts and reconciles, which the named rules cover. A recording duty and
    // a reconciliation duty on the same process still fall through to a
    // family finding when no named rule describes the pair.
    const sameProcess = sodDetect.detectSodConflicts(undefined, {
      assignments: [
        {
          personId: "same-process",
          personName: "Same Process",
          role: "Test",
          entitlements: ["post_adjustments", "bank_reconcile"],
        },
      ],
    });
    assert.ok(sameProcess.conflicts.some((item) => item.severity === "family"));
    const cashChain = sodDetect.detectSodConflicts(undefined, {
      assignments: [
        {
          personId: "cash-chain",
          personName: "Cash Chain",
          role: "Test",
          entitlements: ["collect_cash", "prepare_deposit"],
        },
      ],
    });
    assert.equal(cashChain.conflicts.length, 0);
  });

  await test("conflict identity is invariant to entitlement order", () => {
    const forward = [
      {
        personId: "ordered",
        personName: "Ordered",
        role: "Test",
        entitlements: ["collect_cash", "prepare_deposit", "post_payments"],
      },
    ];
    const reverse = [{ ...forward[0], entitlements: [...forward[0].entitlements].reverse() }];
    const forwardReport = sodDetect.detectSodConflicts(undefined, { assignments: forward });
    const reverseReport = sodDetect.detectSodConflicts(undefined, { assignments: reverse });
    assert.deepEqual(forwardReport.conflicts, reverseReport.conflicts);
    const forwardCell = forwardReport.matrix.find(
      (item) => item.row === "collect_cash" && item.col === "prepare_deposit",
    );
    const reverseCell = forwardReport.matrix.find(
      (item) => item.row === "prepare_deposit" && item.col === "collect_cash",
    );
    assert.deepEqual(forwardCell.ruleIds, reverseCell.ruleIds);
  });

  await test("every duty process lens resolves to a known process", async () => {
    const templates = await server.ssrLoadModule("/src/lib/precog/active-template.ts");
    const processIds = new Set(
      templates.getBaseTemplate("dental").processes.map((process) => process.id),
    );
    for (const entitlement of sodRules.ENTITLEMENTS) {
      for (const processId of entitlement.processIds)
        assert.ok(processIds.has(processId), `${entitlement.id}:${processId}`);
    }
  });

  await test("resolution planner only proposes conflict-safe transfers", () => {
    const assignments = sodDetect.buildAssignments();
    const before = sodDetect.detectSodConflicts(undefined, { assignments });
    const conflict = before.conflicts[0];
    assert.ok(conflict, "demo assignments should exercise at least one conflict");
    const plans = resolutionPlanner.buildResolutionPlans(assignments, conflict);
    assert.ok(plans.length > 0);
    for (const plan of plans) {
      const nextAssignments = resolutionPlanner.applyResolutionPlan(assignments, plan);
      const after = sodDetect.detectSodConflicts(undefined, { assignments: nextAssignments });
      assert.ok(after.conflicts.length < before.conflicts.length, plan.summary);
      assert.equal(plan.conflictsCreated, 0);
      assert.ok(!after.conflicts.some((item) => item.id === conflict.id));
    }
  });

  await test("coverage analysis exposes ownership gaps and continuity risk", () => {
    const assignments = sodDetect.buildAssignments();
    const baseline = coverageAnalysis.analyzeDutyCoverage(assignments);
    assert.ok(baseline.resilienceScore >= 0 && baseline.resilienceScore <= 100);
    assert.equal(baseline.duties.length, sodRules.ENTITLEMENTS.length - 1);
    const empty = coverageAnalysis.analyzeDutyCoverage([]);
    // Optional control steps nobody holds are a choice, not a gap.
    const optional = sodRules.ENTITLEMENTS.filter((item) => item.optional).length;
    assert.equal(empty.unassigned.length, sodRules.ENTITLEMENTS.length - 1 - optional);
    assert.equal(empty.resilienceScore, 0);
    assert.ok(
      baseline.duties.every((duty) =>
        ["unassigned", "single_point", "covered"].includes(duty.status),
      ),
    );
  });

  await test("absence stress tests identify work that stops and lost backups", () => {
    const assignments = sodDetect.buildAssignments();
    const person = assignments.find((item) =>
      item.entitlements.some((id) => {
        const holders = assignments.filter((candidate) => candidate.entitlements.includes(id));
        return holders.length === 1 && id !== "view_reports_only";
      }),
    );
    assert.ok(person, "demo model should contain a continuity dependency");
    const impact = coverageAnalysis.analyzeAbsenceImpact(assignments, person.personId);
    assert.equal(impact.personId, person.personId);
    assert.ok(impact.newlyUnassigned.length > 0);
    assert.ok(
      impact.remainingResilienceScore <=
        coverageAnalysis.analyzeDutyCoverage(assignments).resilienceScore,
    );
    assert.equal(coverageAnalysis.analyzeAbsenceImpact(assignments, "missing"), undefined);
  });

  await test("power-map imports are bounded and allow-listed", () => {
    const normalized = modelIo.normalizeRoleAssignments({
      assignments: [
        {
          personId: " person-1 ",
          personName: "A".repeat(200),
          role: "Manager",
          entitlements: ["collect_cash", "collect_cash", "not-a-power"],
          injected: true,
        },
      ],
    });
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].personId, "person-1");
    assert.equal(normalized[0].personName.length, 80);
    assert.deepEqual(normalized[0].entitlements, ["collect_cash"]);
    assert.equal("injected" in normalized[0], false);
    assert.equal(modelIo.normalizeRoleAssignments([]), undefined);
    assert.equal(
      modelIo.normalizeRoleAssignments([
        { personId: "x", personName: "X", role: "R", entitlements: [] },
        { personId: "x", personName: "Y", role: "R", entitlements: [] },
      ]),
      undefined,
    );
  });

  await test("responsibility CSV is complete and formula-safe", () => {
    const assignments = [
      {
        personId: "csv",
        personName: "=Injected",
        role: "Reviewer",
        entitlements: ["bank_reconcile"],
      },
    ];
    const csv = modelIo.createResponsibilityMatrixCsv(assignments);
    // The cell starts with an apostrophe, so a spreadsheet shows it as text;
    // no cell anywhere starts a formula.
    assert.match(csv, /(^|,)'=Injected · Reviewer(\r|,|$)/m);
    const cells = csv.split("\r\n").flatMap((line) => line.split(","));
    assert.ok(cells.every((cell) => !/^"?[=+@]/.test(cell)));
    assert.match(csv, /Reconcile the bank account,reconciliation,5,Assigned/);
    assert.equal(csv.split("\r\n").length, sodRules.ENTITLEMENTS.length);
  });

  await test("assignment previews match post-change conflict results", () => {
    const assignments = sodDetect.buildAssignments();
    const person = assignments[0];
    const entitlement = sodRules.ENTITLEMENTS.find(
      (item) => !person.entitlements.includes(item.id) && item.id !== "view_reports_only",
    );
    assert.ok(entitlement);
    const impact = changeImpact.evaluateAssignmentChange(
      assignments,
      person.personId,
      entitlement.id,
    );
    const before = sodDetect.detectSodConflicts(undefined, { assignments });
    const after = sodDetect.detectSodConflicts(undefined, { assignments: impact.nextAssignments });
    assert.equal(impact.action, "assign");
    assert.equal(
      after.conflicts.length - before.conflicts.length,
      impact.conflictsCreated.length - impact.conflictsResolved.length,
    );
    const reverse = changeImpact.evaluateAssignmentChange(
      impact.nextAssignments,
      person.personId,
      entitlement.id,
    );
    assert.equal(reverse.action, "remove");
    assert.deepEqual(reverse.nextAssignments, assignments);
    assert.equal(
      changeImpact.evaluateAssignmentChange(assignments, "missing", entitlement.id),
      undefined,
    );
  });

  await test("assignment previews honor practice-specific scoring inputs", () => {
    const assignments = sodDetect.buildAssignments();
    const person = assignments[0];
    const entitlement = sodRules.ENTITLEMENTS.find(
      (item) => !person.entitlements.includes(item.id) && item.id !== "view_reports_only",
    );
    const staff = {
      ...profile.defaultProfile().staff,
      segregationScore: 20,
      dualControlPayments: false,
      independentBankRec: false,
    };
    const impact = changeImpact.evaluateAssignmentChange(
      assignments,
      person.personId,
      entitlement.id,
      staff,
    );
    const before = sodDetect.detectSodConflicts(staff, { assignments });
    const after = sodDetect.detectSodConflicts(staff, { assignments: impact.nextAssignments });
    assert.equal(
      impact.sodHealthChange,
      after.summary.segregationHealth - before.summary.segregationHealth,
    );
  });

  await test("every matrix duty can be toggled for every modeled person", () => {
    const assignments = sodDetect.buildAssignments();
    for (const person of assignments) {
      for (const entitlement of sodRules.ENTITLEMENTS.filter(
        (item) => item.id !== "view_reports_only",
      )) {
        const impact = changeImpact.evaluateAssignmentChange(
          assignments,
          person.personId,
          entitlement.id,
        );
        assert.ok(impact);
        const changed = impact.nextAssignments.find((item) => item.personId === person.personId);
        assert.equal(
          changed.entitlements.includes(entitlement.id),
          !person.entitlements.includes(entitlement.id),
        );
      }
    }
  });

  // A small retail team whose owner can safely back up the cash duties. The
  // dental sample gets no suggestion: everyone there who works in a
  // single-holder duty's process already holds a conflict, or would gain one.
  const plannerRetail = [
    {
      personId: "o",
      personName: "Owner",
      role: "Owner",
      entitlements: ["approve_payroll", "sign_checks"],
    },
    {
      personId: "b",
      personName: "Bookkeeper",
      role: "Bookkeeper",
      entitlements: ["post_payments", "enter_invoices"],
    },
    { personId: "c", personName: "Amir Haddad", role: "Cashier", entitlements: ["collect_cash"] },
    {
      personId: "s",
      personName: "Derek Hollins",
      role: "Stock Associate",
      entitlements: ["receive_goods", "order_supplies"],
    },
  ];

  await test("continuity planner recommends only conflict-free coverage improvements", () => {
    const dental = sodDetect.buildAssignments();
    const dentalPlans = coveragePlanner.buildCoveragePlans(dental);
    const conflicted = new Set(
      sodDetect
        .detectSodConflicts(undefined, { assignments: dental })
        .conflicts.filter((c) => !c.ownerHeld)
        .map((c) => c.personId),
    );
    assert.ok(dentalPlans.every((plan) => !conflicted.has(plan.toPersonId)));
    assert.ok(coveragePlanner.buildCoveragePlans(plannerRetail).length > 0);
    for (const assignments of [dental, plannerRetail]) {
      const beforeCoverage = coverageAnalysis.analyzeDutyCoverage(assignments);
      const beforeConflicts = sodDetect.detectSodConflicts(undefined, { assignments }).conflicts
        .length;
      for (const plan of coveragePlanner.buildCoveragePlans(assignments)) {
        const afterCoverage = coverageAnalysis.analyzeDutyCoverage(plan.nextAssignments);
        const afterConflicts = sodDetect.detectSodConflicts(undefined, {
          assignments: plan.nextAssignments,
        }).conflicts.length;
        assert.ok(afterCoverage.resilienceScore > beforeCoverage.resilienceScore, plan.id);
        assert.equal(afterConflicts, beforeConflicts, plan.id);
        assert.ok(plan.continuityGain > 0);
      }
    }
  });

  await test("continuity program safely sequences interacting recommendations", () => {
    const assignments = plannerRetail;
    const beforeCoverage = coverageAnalysis.analyzeDutyCoverage(assignments);
    const beforeConflicts = sodDetect.detectSodConflicts(undefined, { assignments }).conflicts
      .length;
    const program = coveragePlanner.buildCoverageProgram(assignments);
    const afterCoverage = coverageAnalysis.analyzeDutyCoverage(program.nextAssignments);
    const afterConflicts = sodDetect.detectSodConflicts(undefined, {
      assignments: program.nextAssignments,
    }).conflicts.length;
    assert.ok(program.steps.length > 0);
    assert.equal(program.startingScore, beforeCoverage.resilienceScore);
    assert.equal(program.projectedScore, afterCoverage.resilienceScore);
    assert.ok(program.projectedScore > program.startingScore);
    assert.equal(afterConflicts, beforeConflicts);
    const counts = new Map();
    for (const step of program.steps)
      counts.set(step.entitlement, (counts.get(step.entitlement) ?? 0) + 1);
    assert.ok([...counts.values()].every((count) => count <= 2));
  });

  await test("governance report reconciles to live SoD and continuity results", () => {
    const assignments = sodDetect.buildAssignments();
    const sod = sodDetect.detectSodConflicts(undefined, { assignments });
    const coverage = coverageAnalysis.analyzeDutyCoverage(assignments);
    const report = governanceReport.createGovernanceReport(
      assignments,
      undefined,
      new Date("2026-09-19T00:00:00Z"),
    );
    assert.match(report, /Generated: 2026-09-19T00:00:00.000Z/);
    assert.ok(report.includes(`SoD health: **${sod.summary.segregationHealth}/100**`));
    assert.ok(report.includes(`Continuity resilience: **${coverage.resilienceScore}/100**`));
    assert.ok(report.includes(`Open conflicts: **${sod.conflicts.length}**`));
    for (const person of assignments) assert.ok(report.includes(person.personName));
    assert.match(report, /Planning analysis only/);
  });

  await test("assignment change review detects grants, revocations, hires, and removals", () => {
    const baseline = [
      {
        personId: "a",
        personName: "Alex",
        role: "Manager",
        entitlements: ["collect_cash", "post_payments"],
      },
    ];
    const current = [
      {
        personId: "a",
        personName: "Alex",
        role: "Manager",
        entitlements: ["collect_cash", "bank_reconcile"],
      },
      { personId: "b", personName: "Blair", role: "Reviewer", entitlements: ["view_reports_only"] },
    ];
    const changes = assignmentDiff.diffAssignments(baseline, current);
    assert.deepEqual(
      new Set(changes.map((item) => item.kind)),
      new Set(["duty_granted", "duty_revoked", "person_added"]),
    );
    assert.equal(
      assignmentDiff
        .diffAssignments(current, baseline)
        .some((item) => item.kind === "person_removed"),
      true,
    );
    assert.deepEqual(assignmentDiff.diffAssignments(baseline, baseline), []);
  });

  await test("authority concentration index is bounded, complete, and deterministic", () => {
    const assignments = sodDetect.buildAssignments();
    const ranked = powerIndex.calculatePowerIndex(assignments);
    assert.equal(ranked.length, assignments.length);
    assert.ok(ranked.every((item) => item.authorityIndex >= 0 && item.authorityIndex <= 100));
    assert.ok(
      ranked.every(
        (item, index) => index === 0 || ranked[index - 1].authorityIndex >= item.authorityIndex,
      ),
    );
    assert.deepEqual(powerIndex.calculatePowerIndex(assignments), ranked);
    const exclusive = powerIndex.calculatePowerIndex([
      { personId: "solo", personName: "Solo", role: "Owner", entitlements: ["collect_cash"] },
    ]);
    assert.equal(exclusive[0].exclusiveDutyCount, 1);
  });

  console.log(`\n${passed} domain checks passed.`);
} finally {
  await server.close();
}
