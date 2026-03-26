const PROVIDER_ORDER = ["claude-code", "codex", "opencode"];

const DEFAULT_LOADERS = {
  "claude-code": () => import("./claude-code.mjs"),
  codex: () => import("./codex.mjs"),
  opencode: () => import("./opencode.mjs"),
};

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function getWrapperExport(moduleNamespace, providerId) {
  const wrapper = moduleNamespace.providerWrapper ?? moduleNamespace.default ?? moduleNamespace;
  if (!wrapper || typeof wrapper !== "object") {
    fail("invalid_provider_wrapper", `${providerId}: wrapper export must be an object`);
  }
  return wrapper;
}

function validateProviderWrapper(providerId, wrapper) {
  if (wrapper.provider_id !== providerId) {
    fail("invalid_provider_wrapper", `${providerId}: invalid provider_id ${wrapper.provider_id}`);
  }

  for (const field of ["supports_tokens", "supports_model_id", "supports_subagents", "is_available"]) {
    if (typeof wrapper[field] !== "boolean") {
      fail("invalid_provider_wrapper", `${providerId}: ${field} must be boolean`);
    }
  }

  if (!(wrapper.availability_reason === null || typeof wrapper.availability_reason === "string")) {
    fail("invalid_provider_wrapper", `${providerId}: availability_reason must be a string or null`);
  }

  if (typeof wrapper.runPhase !== "function") {
    fail("invalid_provider_wrapper", `${providerId}: runPhase must be a function`);
  }

  if (wrapper.worker_module_path !== undefined && typeof wrapper.worker_module_path !== "string") {
    fail("invalid_provider_wrapper", `${providerId}: worker_module_path must be a string when provided`);
  }
}

export async function createProviderRegistry({ loaders = DEFAULT_LOADERS } = {}) {
  const providers = [];
  const seenIds = new Set();

  for (const providerId of PROVIDER_ORDER) {
    const loader = loaders[providerId];
    if (typeof loader !== "function") {
      fail("missing_provider_loader", `${providerId}: loader is required`);
    }

    let loaded;
    try {
      loaded = await loader();
    } catch (error) {
      fail("provider_load_error", `${providerId}: ${error.message}`);
    }

    const wrapper = getWrapperExport(loaded, providerId);
    validateProviderWrapper(providerId, wrapper);

    if (seenIds.has(wrapper.provider_id)) {
      fail("duplicate_provider_id", `duplicate provider id ${wrapper.provider_id}`);
    }

    seenIds.add(wrapper.provider_id);
    providers.push(wrapper);
  }

  return providers;
}

export async function loadProviderRegistry() {
  return createProviderRegistry();
}

export { PROVIDER_ORDER };
