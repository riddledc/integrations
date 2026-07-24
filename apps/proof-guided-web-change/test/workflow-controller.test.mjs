import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProofGuidedChangeWorkflowController,
} from "../dist/workflow-controller.js";

const TASK = Object.freeze({
  title: "Change a synthetic specimen",
  description:
    "Change only the reviewed source after a current proof result.",
  requirements: Object.freeze(["The requested property is present."]),
});

const INITIAL_SOURCE = new TextEncoder().encode("initial source");
const CHANGED_SOURCE = new TextEncoder().encode("changed source");

function sameBytes(left, right) {
  return (
    left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index])
  );
}

function makeCandidate({
  candidateRef = "candidate_1",
  label = "Initial candidate",
  sourceBytes = INITIAL_SOURCE,
  sourceDigest = "digest-initial",
  revision = "revision-initial",
  previewUrl = "http://127.0.0.1:41001/?run=initial",
  close,
} = {}) {
  const ownedSource = new Uint8Array(sourceBytes);
  return {
    candidate_ref: candidateRef,
    label,
    source_digest: sourceDigest,
    revision,
    preview_url: previewUrl,
    readSourceBytes() {
      return new Uint8Array(ownedSource);
    },
    ...(close === undefined ? {} : { close }),
  };
}

function makeOutcome(candidateRef, overrides = {}) {
  return {
    level: "outcome",
    check_ref: "check_1",
    candidate_ref: candidateRef,
    disposition: "does_not_conform",
    current: true,
    headline: "The candidate is not yet in spec.",
    next_action: "Apply the bounded source change.",
    ...overrides,
  };
}

function makeMeaning(outcome, overrides = {}) {
  return {
    ...outcome,
    level: "meaning",
    findings: [{
      requirement_id: "requested-property-present",
      label: "The requested property is present",
      explanation: "The requested property is absent.",
      repair_guidance: "Add only the requested property.",
    }],
    non_conclusions: [
      "This result makes no claim outside the pinned contract.",
    ],
    ...overrides,
  };
}

function makeFactory(overrides = {}) {
  const log = {
    createInputs: [],
    closeAllCalls: 0,
  };
  let ordinal = 1;
  const factory = {
    async create(input) {
      log.createInputs.push({
        label: input.label,
        source_bytes: new Uint8Array(input.source_bytes),
      });
      if (overrides.create) return overrides.create(input, log);
      ordinal += 1;
      const isInitialSource = sameBytes(
        input.source_bytes,
        INITIAL_SOURCE,
      );
      return makeCandidate({
        candidateRef: `candidate_${ordinal}`,
        label: input.label,
        sourceBytes: input.source_bytes,
        sourceDigest:
          isInitialSource ? "digest-initial" : "digest-changed",
        revision:
          isInitialSource ? "revision-initial" : "revision-changed",
        previewUrl:
          `http://127.0.0.1:${41000 + ordinal}/?run=${ordinal}`,
      });
    },
    async closeAll() {
      log.closeAllCalls += 1;
      await overrides.closeAll?.(log);
    },
  };
  return { factory, log };
}

function makeProofClient({
  outcomes,
  meanings,
  check,
  inspect,
}) {
  let checkOrdinal = 0;
  return {
    async check(input) {
      const ordinal = checkOrdinal;
      checkOrdinal += 1;
      if (check) return check(input, ordinal);
      return structuredClone(outcomes[ordinal]);
    },
    inspect(checkRef, level = "outcome") {
      if (inspect) return inspect(checkRef, level, checkOrdinal - 1);
      assert.equal(level, "meaning");
      return structuredClone(meanings[checkOrdinal - 1]);
    },
  };
}

function makePolicy(overrides = {}) {
  const log = {
    availabilityCalls: 0,
    applyCalls: 0,
  };
  return {
    policy: {
      label: "Apply bounded change",
      availability(check) {
        log.availabilityCalls += 1;
        return overrides.availability?.(check) ?? {
          available: true,
          reason: "The current finding authorizes the bounded change.",
        };
      },
      async apply(input) {
        log.applyCalls += 1;
        if (overrides.apply) return overrides.apply(input);
        return {
          source_bytes: new Uint8Array(CHANGED_SOURCE),
          candidate_label: "Changed candidate",
          summary: "Applied the bounded source change.",
        };
      },
    },
    log,
  };
}

async function makeController({
  proofClient,
  factory,
  policy,
  registerCandidate = () => {},
}) {
  return createProofGuidedChangeWorkflowController({
    task: TASK,
    initial_candidate: makeCandidate(),
    candidate_factory: factory,
    register_candidate: registerCandidate,
    proof_client: proofClient,
    change_policy: policy,
    now: () => "2026-07-24T12:00:00.000Z",
  });
}

test("a nonconforming outcome marked non-current is rejected and cannot authorize a change", async () => {
  const invalid = makeOutcome("candidate_1", { current: false });
  const { factory } = makeFactory();
  const { policy, log: policyLog } = makePolicy();
  const controller = await makeController({
    factory,
    policy,
    proofClient: makeProofClient({
      outcomes: [invalid],
      meanings: [makeMeaning(invalid)],
    }),
  });

  try {
    await assert.rejects(
      controller.checkCurrent(),
      /proof client returned an invalid outcome/u,
    );

    const failed = controller.snapshot();
    assert.equal(failed.current_check, null);
    assert.equal(failed.can_check, false);
    assert.equal(failed.can_repair, false);
    assert.equal(failed.can_retry, true);
    assert.equal(policyLog.availabilityCalls, 0);
    await assert.rejects(
      controller.applyRepair(),
      /Check the current candidate before applying a repair/u,
    );
    assert.equal(policyLog.applyCalls, 0);
  } finally {
    await controller.close();
  }
});

test("a proof client cannot reuse an owned check reference on a fresh attempt", async () => {
  const first = makeOutcome("candidate_1", {
    check_ref: "check_reused",
    disposition: "stale",
    current: false,
    headline: "The result is stale.",
    next_action: "Prepare a fresh attempt.",
  });
  const second = makeOutcome("candidate_2", {
    check_ref: "check_reused",
    disposition: "conforms",
    current: true,
    headline: "The candidate conforms.",
    next_action: "No change is needed.",
  });
  const { factory } = makeFactory();
  const { policy } = makePolicy();
  const controller = await makeController({
    factory,
    policy,
    proofClient: makeProofClient({
      outcomes: [first, second],
      meanings: [
        makeMeaning(first),
        makeMeaning(second, { findings: [] }),
      ],
    }),
  });

  try {
    assert.equal(
      (await controller.checkCurrent()).disposition,
      "stale",
    );
    await controller.prepareFreshAttempt();
    await assert.rejects(
      controller.checkCurrent(),
      /reused check reference check_reused/u,
    );

    const failed = controller.snapshot();
    assert.equal(failed.current_check, null);
    assert.equal(failed.history.length, 1);
    assert.equal(failed.history[0].check_ref, "check_reused");
    assert.equal(failed.can_repair, false);
    assert.equal(failed.can_retry, true);
  } finally {
    await controller.close();
  }
});

test("a meaning view that does not bind to its outcome is rejected", async () => {
  const outcome = makeOutcome("candidate_1");
  const malformedMeaning = makeMeaning(outcome, {
    candidate_ref: "candidate_other",
  });
  const { factory } = makeFactory();
  const { policy, log: policyLog } = makePolicy();
  const controller = await makeController({
    factory,
    policy,
    proofClient: makeProofClient({
      outcomes: [outcome],
      meanings: [malformedMeaning],
    }),
  });

  try {
    await assert.rejects(
      controller.checkCurrent(),
      /proof client returned an invalid meaning view/u,
    );
    const failed = controller.snapshot();
    assert.equal(failed.current_check, null);
    assert.deepEqual(failed.history, []);
    assert.equal(failed.can_repair, false);
    assert.equal(policyLog.applyCalls, 0);
  } finally {
    await controller.close();
  }
});

test("malformed change-policy output is rejected before candidate creation", async () => {
  const outcome = makeOutcome("candidate_1");
  const { factory, log: factoryLog } = makeFactory();
  const { policy, log: policyLog } = makePolicy({
    apply() {
      return {
        source_bytes: "not bytes",
        candidate_label: "Changed candidate",
        summary: "This malformed result must not be accepted.",
      };
    },
  });
  const controller = await makeController({
    factory,
    policy,
    proofClient: makeProofClient({
      outcomes: [outcome],
      meanings: [makeMeaning(outcome)],
    }),
  });

  try {
    await controller.checkCurrent();
    await assert.rejects(
      controller.applyRepair(),
      /source_bytes must be a Uint8Array/u,
    );
    assert.equal(policyLog.applyCalls, 1);
    assert.equal(factoryLog.createInputs.length, 0);
    const unchanged = controller.snapshot();
    assert.equal(unchanged.candidate.candidate_ref, "candidate_1");
    assert.equal(unchanged.repair.last, null);
    assert.equal(unchanged.current_check?.check_ref, "check_1");
  } finally {
    await controller.close();
  }
});

test("a candidate rejected after factory creation is closed immediately", async () => {
  const outcome = makeOutcome("candidate_1");
  let rejectedCloseCalls = 0;
  const { factory, log: factoryLog } = makeFactory({
    create(input) {
      return makeCandidate({
        candidateRef: "candidate_rejected",
        label: input.label,
        sourceBytes: input.source_bytes,
        sourceDigest: "digest-changed",
        revision: "",
        previewUrl: "http://127.0.0.1:41002/?run=rejected",
        async close() {
          rejectedCloseCalls += 1;
        },
      });
    },
  });
  const { policy } = makePolicy();
  const registered = [];
  const controller = await makeController({
    factory,
    policy,
    registerCandidate(candidate) {
      registered.push(candidate.candidate_ref);
    },
    proofClient: makeProofClient({
      outcomes: [outcome],
      meanings: [makeMeaning(outcome)],
    }),
  });

  try {
    await controller.checkCurrent();
    await assert.rejects(
      controller.applyRepair(),
      /changed candidate\.revision must be a non-empty string/u,
    );
    assert.equal(rejectedCloseCalls, 1);
    assert.equal(
      factoryLog.closeAllCalls,
      0,
      "prompt candidate cleanup does not wait for application shutdown",
    );
    assert.deepEqual(registered, ["candidate_1"]);
    assert.equal(
      controller.snapshot().candidate.candidate_ref,
      "candidate_1",
    );
  } finally {
    await controller.close();
  }
  assert.equal(factoryLog.closeAllCalls, 1);
});

test("an active check excludes concurrent checking and application close", async () => {
  let releaseCheck;
  const blockedCheck = new Promise((resolve) => {
    releaseCheck = resolve;
  });
  const outcome = makeOutcome("candidate_1", {
    disposition: "conforms",
    current: true,
    headline: "The candidate conforms.",
    next_action: "No change is needed.",
  });
  const { factory, log: factoryLog } = makeFactory();
  const { policy } = makePolicy();
  const controller = await makeController({
    factory,
    policy,
    proofClient: makeProofClient({
      async check() {
        await blockedCheck;
        return outcome;
      },
      inspect(_checkRef, level) {
        assert.equal(level, "meaning");
        return makeMeaning(outcome, { findings: [] });
      },
    }),
  });

  const runningCheck = controller.checkCurrent();
  assert.equal(controller.snapshot().can_check, false);
  await assert.rejects(
    controller.checkCurrent(),
    /one-shot and cannot be checked again/u,
  );
  await assert.rejects(
    controller.close(),
    /cannot close during an active operation/u,
  );
  assert.equal(factoryLog.closeAllCalls, 0);

  releaseCheck();
  assert.equal((await runningCheck).disposition, "conforms");
  await controller.close();
  assert.equal(factoryLog.closeAllCalls, 1);
});
