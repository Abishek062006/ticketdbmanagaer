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

const MAX_BATCH_ACTIONS = 10;

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

  // A batch: sanitize each sub-action through this same function,
  // drop the broken ones, cap the count, and unwrap a one-action
  // batch back into a plain single intent.
  if (intent === INTENTS.MULTI_ACTION) {
    const rawActions = Array.isArray(parameters?.actions)
      ? parameters.actions
      : [];

    const actions = rawActions
      .slice(0, MAX_BATCH_ACTIONS)
      .map((action) => sanitizeParsedIntent(action))
      .filter(
        (action) =>
          action.intent !== INTENTS.UNKNOWN &&
          action.intent !== INTENTS.MULTI_ACTION
      )
      .map(({ intent: subIntent, parameters: subParameters }) => ({
        intent: subIntent,
        parameters: subParameters,
      }));

    if (actions.length === 0) {
      return createUnknownIntent();
    }

    if (actions.length === 1) {
      return {
        intent: actions[0].intent,
        confidence: 1,
        parameters: actions[0].parameters,
      };
    }

    return {
      intent: INTENTS.MULTI_ACTION,
      confidence:
        typeof confidence === "number"
          ? Math.max(0, Math.min(1, confidence))
          : 0,
      parameters: { actions },
    };
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

// A message that's clearly about a meeting ("create a google meeting
// name is diet planning for @x tomorrow at 4pm") must never die as
// UNKNOWN just because the model missed the phrasing - the meeting
// pipeline extracts attendees/time/title deterministically anyway,
// so classification is the ONLY thing the model was needed for here.
const MEETING_KEYWORD_PATTERN =
  /\b(google\s*meet(ing)?|meeting|gmeet|schedule\s+a\s+(meet|call|sync))\b/i;

function deterministicFallback(userMessage, parsed) {
  if (parsed.intent !== INTENTS.UNKNOWN) {
    return parsed;
  }

  if (MEETING_KEYWORD_PATTERN.test(userMessage)) {
    console.log(
      "[intent-fallback] UNKNOWN remapped to SCHEDULE_MEETING"
    );

    return {
      intent: INTENTS.SCHEDULE_MEETING,
      confidence: 0.5,
      parameters: {},
    };
  }

  return parsed;
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

  const parsed = await parseIntentFromContext(
    contextualMessage
  );

  return deterministicFallback(userMessage, parsed);
}
