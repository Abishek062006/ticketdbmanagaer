import TableMetadata from "../models/TableMetadata.js";
import {
  findMatchingRecords,
  resolveRowByFreeText,
} from "../utils/recordMatcher.js";
import { INTENTS } from "../utils/intentTypes.js";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const SINGULAR_INTENTS = [
  INTENTS.GET_RECORD,
  INTENTS.UPDATE_RECORD,
  INTENTS.DELETE_RECORD,
];

/**
 * Resolves a recordId from AI-generated filters.
 *
 * Only resolves when exactly one matching record exists.
 * Otherwise the parsed intent is returned unchanged.
 */
export const resolveRecord = async (
  parsedIntent
) => {
  if (!parsedIntent?.parameters) {
    return parsedIntent;
  }

  const { intent } = parsedIntent;
  let { parameters } = parsedIntent;

  if (!SINGULAR_INTENTS.includes(intent)) {
    return parsedIntent;
  }

  // The model sometimes puts a human value ("vijay") in recordId,
  // where only a real database id belongs - dispatching that crashes
  // with an ObjectId cast error. Treat it as the row's identifying
  // text and look the actual row up instead.
  if (
    parameters.recordId &&
    !OBJECT_ID_PATTERN.test(String(parameters.recordId)) &&
    parameters.tableName
  ) {
    const { recordId: bogusId, ...rest } = parameters;

    const { filters, matches } = await resolveRowByFreeText(
      parameters.tableName,
      String(bogusId)
    );

    if (filters) {
      return {
        ...parsedIntent,
        parameters: {
          ...rest,
          filters: { ...(rest.filters || {}), ...filters },
          ...(matches.length === 1
            ? { recordId: matches[0]._id.toString() }
            : { matchCount: matches.length }),
        },
      };
    }

    // Couldn't place the value on any row: drop the bogus id and let
    // the normal filters path (or the controller's "which row?"
    // clarification) take over.
    parameters = { ...rest, filters: rest.filters || {} };
    parsedIntent = { ...parsedIntent, parameters };
  }

  if (
    parameters.recordId ||
    !parameters.tableName ||
    !parameters.filters
  ) {
    return parsedIntent;
  }

  const table =
    await TableMetadata.findOne({
      tableName:
        parameters.tableName.toLowerCase(),
    });

  if (!table) {
    return parsedIntent;
  }

  const matches =
    await findMatchingRecords(
      table.tableName,
      parameters.filters
    );

  if (matches.length === 1) {
    return {
      ...parsedIntent,
      parameters: {
        ...parameters,
        recordId: matches[0]._id.toString(),
      },
    };
  }

  // 0 or >1 matches: leave recordId unresolved and
  // surface the match count so the controller can
  // ask the user to clarify instead of guessing.
  return {
    ...parsedIntent,
    parameters: {
      ...parameters,
      matchCount: matches.length,
    },
  };
};
