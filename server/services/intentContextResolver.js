import { getCurrentTable } from "./conversationMemory.js";
import {
  RECORD_INTENTS,
} from "../utils/intentTypes.js";

/**
 * Enriches an AI-generated intent using
 * conversation context.
 *
 * Currently fills missing tableName
 * from the active conversation.
 *
 * @param {string} sessionId
 * @param {Object} parsedIntent
 * @returns {Object}
 */
export const resolveIntentContext = (
  sessionId,
  parsedIntent
) => {
  if (!parsedIntent) {
    return parsedIntent;
  }

  const resolvedIntent = {
    ...parsedIntent,
    parameters: {
      ...(parsedIntent.parameters || {}),
    },
  };

  const { intent, parameters } =
    resolvedIntent;

  const currentTable =
    getCurrentTable(sessionId);

  // Only record operations can safely
  // inherit the active table.
  if (
    RECORD_INTENTS.includes(intent) &&
    !parameters.tableName &&
    currentTable
  ) {
    parameters.tableName = currentTable;
  }

  return resolvedIntent;
};