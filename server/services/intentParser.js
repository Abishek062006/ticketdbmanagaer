import { chatWithOllama } from "./ollamaService.js";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt.js";
import { buildContextMessage } from "./contextBuilder.js";
import { INTENTS } from "../utils/intentTypes.js";

const VALID_INTENTS = new Set(Object.values(INTENTS));

function createUnknownIntent() {
  return {
    intent: INTENTS.UNKNOWN,
    confidence: 0,
    parameters: {},
  };
}

function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty response from Ollama.");
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in Ollama response.");
  }

  return text.slice(start, end + 1);
}

// The model sometimes fills a column it doesn't have a value for with
// the literal string "null" instead of just omitting the key. Left
// alone, that string is a truthy, defined value - it slips past the
// CREATE_RECORD "missing field" check (which only looks for the key
// being absent) and goes straight to a broken confirm-then-crash
// instead of the "fill in the rest" form. Strip those placeholders so
// an unspecified column is actually absent from `record`.
function stripNullPlaceholders(record) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const cleaned = {};

  for (const [key, value] of Object.entries(record)) {
    if (value === null) continue;
    if (
      typeof value === "string" &&
      /^(null|undefined|n\/a)$/i.test(value.trim())
    ) {
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

// The model persistently invents a standalone "sort the table" intent
// (under several names/shapes) instead of reusing LIST_RECORDS with
// sortBy/order, no matter how explicitly the prompt forbids it - this
// is a model capability ceiling, not something more prompt wording
// fixes. Rather than losing the request to UNKNOWN, recognize the
// hallucinated shape and translate it back into a real LIST_RECORDS
// intent so the app still does something useful with it.
const SORT_INTENT_ALIASES = new Set([
  "ORDER_RECORDS",
  "SORT_RECORDS",
  "SORT",
  "ORDER",
  "SORT_TABLE",
  "ORDER_TABLE",
]);

function firstSortColumn(orderBy) {
  const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;

  if (typeof first === "string" && first.trim()) {
    return { column: first.trim(), direction: null };
  }

  if (first && typeof first === "object") {
    const column = first.field || first.column || first.name || null;
    const direction =
      first.direction || first.order || first.sort || null;

    return { column, direction };
  }

  return { column: null, direction: null };
}

function normalizeSortAliasParameters(parameters = {}) {
  const params = { ...parameters };

  if (params.sortBy === undefined && "orderBy" in params) {
    const { column, direction } = firstSortColumn(params.orderBy);
    params.sortBy = column;

    if (!params.order && direction) {
      params.order = direction;
    }
  }

  if (!params.order) {
    if (typeof params.orderDirection === "string") {
      params.order = params.orderDirection;
    } else if (typeof params.ascending === "boolean") {
      params.order = params.ascending ? "asc" : "desc";
    } else if (typeof params.direction === "string") {
      params.order = params.direction;
    }
  }

  if (typeof params.order === "string") {
    params.order = /^desc/i.test(params.order) ? "desc" : "asc";
  }

  delete params.orderBy;
  delete params.orderDirection;
  delete params.ascending;
  delete params.direction;

  if (!params.filters || typeof params.filters !== "object") {
    params.filters = {};
  }

  return params;
}

// Sanitizes the raw LLM JSON output shape/confidence - distinct from
// (and unrelated to) utils/intentValidator.js's exported validateIntent,
// which checks required parameters before dispatch.
function sanitizeParsedIntent(result) {
  if (!result || typeof result !== "object") {
    return createUnknownIntent();
  }

  let { intent, confidence, parameters } = result;

  if (
    typeof intent === "string" &&
    SORT_INTENT_ALIASES.has(intent.toUpperCase())
  ) {
    intent = INTENTS.LIST_RECORDS;
    parameters = normalizeSortAliasParameters(parameters);
  }

  if (!VALID_INTENTS.has(intent)) {
    return createUnknownIntent();
  }

  const cleanParameters =
    parameters && typeof parameters === "object"
      ? { ...parameters }
      : {};

  if (cleanParameters.record) {
    cleanParameters.record = stripNullPlaceholders(
      cleanParameters.record
    );
  }

  if (cleanParameters.updates) {
    cleanParameters.updates = stripNullPlaceholders(
      cleanParameters.updates
    );
  }

  return {
    intent,
    confidence:
      typeof confidence === "number"
        ? Math.max(0, Math.min(1, confidence))
        : 0,
    parameters: cleanParameters,
  };
}

/**
 * Sends an already-built context message to Ollama
 * and returns a validated intent object. Shared by
 * the normal parse path and the clarification-answer
 * merge path (which builds its own context message).
 *
 * @param {string} contextualMessage
 * @returns {Promise<Object>}
 */
export async function parseIntentFromContext(
  contextualMessage
) {
  try {
    const response = await chatWithOllama({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: contextualMessage,
    });

    const json = extractJson(response);

    const parsed = JSON.parse(json);

    const sanitized = sanitizeParsedIntent(parsed);

    // Always visible in the server terminal - the model's output
    // shape varies run to run, and diagnosing a bad parse without
    // this means guessing.
    console.log(
      "[intent-parse]",
      JSON.stringify(sanitized)
    );

    return sanitized;
  } catch (error) {
    console.error(
      "Intent Parser Error:",
      error.message
    );

    return createUnknownIntent();
  }
}

/**
 * Converts a natural language request
 * into a validated intent object.
 *
 * @param {string} sessionId
 * @param {string} userMessage
 * @returns {Promise<Object>}
 */
export async function parseIntent(
  sessionId,
  userMessage,
  user
) {
  const contextualMessage =
    await buildContextMessage(
      sessionId,
      userMessage,
      user
    );

  return parseIntentFromContext(contextualMessage);
}
