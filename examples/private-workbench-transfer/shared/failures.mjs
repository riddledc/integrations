export const DOCTOR_ERROR_CODES = Object.freeze([
  "ARGUMENT_OVERRIDE_FORBIDDEN",
  "HOSTED_ENV_PRESENT",
  "RUNTIME_ENV_INVALID",
  "BOOTSTRAP_INVALID",
  "POLICY_INVALID",
  "POLICY_PERMISSIONS_INVALID",
  "OS_BOUNDARY_NOT_ENFORCED",
  "SUPPLY_CHAIN_LOCK_INVALID",
  "SUPPLY_CHAIN_SIGNATURE_INVALID",
  "PACKAGE_MANIFEST_INVALID",
  "PACKAGE_VERSION_MISMATCH",
  "PACKAGE_INTEGRITY_MISMATCH",
  "PACKAGE_TREE_MISMATCH",
  "DEPENDENCY_CLOSURE_INVALID",
  "FORBIDDEN_PACKAGE_PRESENT",
  "CAPABILITY_MISMATCH",
  "RULE_TRUST_ROOT_INVALID",
  "EVIDENCE_TRUST_ROOT_INVALID",
  "OUTPUT_BOUNDARY_INVALID",
  "SYNTHETIC_CAPTURE_FAILED",
  "SYNTHETIC_SIGNING_FAILED",
  "SYNTHETIC_COMPOSITION_FAILED",
  "SYNTHETIC_CURRENTNESS_FAILED",
  "SYNTHETIC_REPLAY_FAILED",
  "INTERNAL_FAILURE",
]);

export class DoctorFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "DoctorFailure";
    this.code = code;
  }
}

export function doctorFail(code) {
  if (!DOCTOR_ERROR_CODES.includes(code)) throw new DoctorFailure("INTERNAL_FAILURE");
  throw new DoctorFailure(code);
}

export function fixedFailure(error) {
  return {
    ok: false,
    code: error instanceof DoctorFailure && DOCTOR_ERROR_CODES.includes(error.code)
      ? error.code
      : "INTERNAL_FAILURE",
  };
}
