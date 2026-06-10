const serviceTypeDefinitions = require("../src/services/service-types.json");

const VALID_SERVICE_TYPE_IDS = new Set(Object.keys(serviceTypeDefinitions));

function extractJson(output) {
  if (output && typeof output === "object") return output;

  const text = String(output ?? "").trim();
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidate = withoutFence.startsWith("{") && withoutFence.endsWith("}")
    ? withoutFence
    : withoutFence.slice(withoutFence.indexOf("{"), withoutFence.lastIndexOf("}") + 1);

  if (!candidate || candidate === withoutFence.slice(0, 0)) {
    throw new Error("No JSON object found in model output");
  }

  return JSON.parse(candidate);
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

  const checks = 6 + (expectedIds.length > 0 ? 1 : 0) + (minConfidence !== undefined ? 1 : 0) + (maxConfidence !== undefined ? 1 : 0);
  const score = Math.max(0, (checks - failures.length) / checks);

  return {
    pass: failures.length === 0,
    score,
    reason: failures.length === 0
      ? `Parsed ${parsed.serviceTypeId} at confidence ${parsed.confidenceScore}`
      : `${failures.join("; ")}\nParsed output: ${JSON.stringify(parsed)}`,
  };
};
