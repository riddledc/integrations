/**
 * Compatibility export for the pure, capability-bounded evidence-template
 * trust-root implementation owned by @riddledc/riddle-proof-core.
 */
export {
  RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_ARRAY_ITEMS,
  RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH,
  RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES,
  RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES,
  RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING,
  RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE,
  RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_DIGEST_DOMAIN,
  RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_MAX_PROFILES,
  RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION,
  createRiddleProofEvidenceTrustRoot,
  materializeRiddleProofEvidenceTrustProfile,
  resolveRiddleProofEvidenceTrustRoot,
  validateRiddleProofEvidenceObservationSchema,
} from "@riddledc/riddle-proof-core/evidence-trust-root";
export type * from "@riddledc/riddle-proof-core/evidence-trust-root";
