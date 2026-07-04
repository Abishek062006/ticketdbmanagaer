import TableMetadata from "../models/TableMetadata.js";
import { findMatchingRecords } from "../utils/recordMatcher.js";
import { INTENTS } from "../utils/intentTypes.js";

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

  const { intent, parameters } = parsedIntent;

  if (
    ![
      INTENTS.GET_RECORD,
      INTENTS.UPDATE_RECORD,
      INTENTS.DELETE_RECORD,
    ].includes(intent)
  ) {
    return parsedIntent;
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