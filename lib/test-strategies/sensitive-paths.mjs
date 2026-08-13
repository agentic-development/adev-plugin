export const DEFAULT_SENSITIVE_PATHS = Object.freeze([
  "**/auth/**", "**/auth*", "**/crypto/**", "**/crypto*",
  "**/secrets/**", "**/*secret*", "**/credentials/**", "**/*credential*",
  "**/.env*", "**/*.pem", "**/*.key", "**/*.p12",
  ".context-index/governance/**", ".github/workflows/**",
]);

export function effectiveSensitivePaths(configured, { withWarnings = false } = {}) {
  const warnings = [];
  let extra = [];
  if (Array.isArray(configured) && configured.every((e) => typeof e === "string")) {
    extra = configured;
  } else if (configured != null && (!Array.isArray(configured) || configured.length > 0)) {
    warnings.push({
      code: "INVALID_SENSITIVE_PATHS",
      message: "sensitive-paths.yaml is present but unparseable, or contains a non-string entry; proceeding on the built-in set alone",
    });
  }
  const paths = Object.freeze([...new Set([...DEFAULT_SENSITIVE_PATHS, ...extra])]);
  return withWarnings ? { paths, warnings } : paths;
}
