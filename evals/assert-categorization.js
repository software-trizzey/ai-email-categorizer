const serviceTypeDefinitions = require("../src/services/categorizer/service-types.json");

const VALID_SERVICE_TYPE_IDS = new Set(Object.keys(serviceTypeDefinitions));

function extractJson(output) {
  if (output && typeof output === "object") return output;

  const text = String(output ?? "").trim();
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
    return JSON.parse(withoutFence);
  }

  const jsonStartIndex = withoutFence.indexOf("{");
  const jsonEndIndex = withoutFence.lastIndexOf("}");

  if (jsonStartIndex === -1 || jsonEndIndex <= jsonStartIndex) {
    throw new Error("No JSON object found in model output");
  }

  return JSON.parse(withoutFence.slice(jsonStartIndex, jsonEndIndex + 1));
}

function asNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asExpectedIds(vars) {
  if (Array.isArray(vars.expectedServiceTypeIds)) return vars.expectedServiceTypeIds;
  if (typeof vars.expectedServiceTypeIds === "string" && vars.expectedServiceTypeIds.trim()) {
    return vars.expectedServiceTypeIds.split(",").map((id) => id.trim()).filter(Boolean);
  }
  if (typeof vars.expectedServiceTypeId === "string" && vars.expectedServiceTypeId.trim()) {
    return [vars.expectedServiceTypeId.trim()];
  }
  return [];
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

module.exports = (output, context) => {
  const vars = context?.vars ?? context?.test?.vars ?? {};
  const failures = [];
  let parsed;

  try {
    parsed = extractJson(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Could not parse categorizer JSON: ${error.message}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      pass: false,
      score: 0,
      reason: `Output must be a JSON object. Parsed output: ${JSON.stringify(parsed)}`,
    };
  }

  if (typeof parsed.explanation !== "string" || parsed.explanation.trim().length === 0) {
    failures.push("explanation must be a non-empty string");
  }

  if (!VALID_SERVICE_TYPE_IDS.has(parsed.serviceTypeId)) {
    failures.push(`serviceTypeId must be one of ${Array.from(VALID_SERVICE_TYPE_IDS).join(", ")}`);
  }

  const confidenceScore = parsed.confidenceScore;
  if (typeof confidenceScore !== "number" || confidenceScore < 0 || confidenceScore > 1) {
    failures.push("confidenceScore must be a number between 0 and 1");
  }

  if (typeof parsed.shouldAlertAdmin !== "boolean") {
    failures.push("shouldAlertAdmin must be a boolean");
  }

  if (typeof parsed.alertReason !== "string" || parsed.alertReason.trim().length === 0) {
    failures.push("alertReason must be a non-empty string");
  }

  const expectedShouldNotify = asBoolean(vars.expectedShouldNotify);
  if (expectedShouldNotify === undefined) {
    failures.push("expectedShouldNotify test variable must be true or false");
  } else if (typeof parsed.shouldAlertAdmin === "boolean" && parsed.shouldAlertAdmin !== expectedShouldNotify) {
    failures.push(`expected shouldAlertAdmin ${expectedShouldNotify}, got ${parsed.shouldAlertAdmin}`);
  }

  const expectedIds = asExpectedIds(vars);
  if (expectedIds.length > 0 && !expectedIds.includes(parsed.serviceTypeId)) {
    failures.push(`expected serviceTypeId ${expectedIds.join(" or ")}, got ${parsed.serviceTypeId}`);
  }

  const minConfidence = asNumber(vars.minConfidence);
  if (minConfidence !== undefined && typeof confidenceScore === "number" && confidenceScore < minConfidence) {
    failures.push(`expected confidenceScore >= ${minConfidence}, got ${confidenceScore}`);
  }

  const maxConfidence = asNumber(vars.maxConfidence);
  if (maxConfidence !== undefined && typeof confidenceScore === "number" && confidenceScore > maxConfidence) {
    failures.push(`expected confidenceScore <= ${maxConfidence}, got ${confidenceScore}`);
  }

  const checks = 6
    + (expectedShouldNotify !== undefined ? 1 : 0)
    + (expectedIds.length > 0 ? 1 : 0)
    + (minConfidence !== undefined ? 1 : 0)
    + (maxConfidence !== undefined ? 1 : 0);
  const score = Math.max(0, (checks - failures.length) / checks);

  return {
    pass: failures.length === 0,
    score,
    reason: failures.length === 0
      ? `Parsed ${parsed.serviceTypeId} at confidence ${parsed.confidenceScore}; shouldAlertAdmin=${parsed.shouldAlertAdmin}`
      : `${failures.join("; ")}\nParsed output: ${JSON.stringify(parsed)}`,
  };
};
