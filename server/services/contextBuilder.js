import { getConversation } from "./conversationMemory.js";
import {
  buildSchemaContext,
  buildAllTablesSchemaContext,
} from "./schemaContextService.js";

/**
 * Builds the contextual prompt sent to Ollama.
 *
 * @param {string} sessionId
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export const buildContextMessage = async (
  sessionId,
  userMessage,
  user
) => {
  const conversation =
    getConversation(sessionId);

  const sections = [];

  // Current table
  sections.push(
    `Current Table:\n${
      conversation.currentTable ?? "None"
    }`
  );

  // Last intent
  sections.push(
    `Last Intent:\n${
      conversation.lastIntent ?? "None"
    }`
  );

  // Schema - prefer the established current table's schema, but fall
  // back to every accessible table's schema when there isn't one yet
  // (e.g. the session's first message), so the model always has real
  // table/column names to map the request onto instead of guessing.
  const schema = conversation.currentTable
    ? await buildSchemaContext(
        conversation.currentTable,
        user
      )
    : await buildAllTablesSchemaContext(user);

  if (schema) {
    sections.push(schema);
  }

  // Recent history
  const history = conversation.history
    .slice(-10)
    .map(
      ({ role, message }) =>
        `${role}: ${message}`
    )
    .join("\n");

  if (history) {
    sections.push(
      `Conversation History:\n${history}`
    );
  }

  // Current request
  sections.push(
    `Current User Request:\n${userMessage}`
  );

  return sections.join("\n\n");
};

/**
 * Builds the contextual prompt sent to Ollama when
 * the user's message is the answer to a clarification
 * question the app asked on the previous turn.
 *
 * @param {Object} pendingAction {question, intent, parameters}
 * @param {string} userAnswer
 * @returns {string}
 */
export const buildClarificationContextMessage = (
  pendingAction,
  userAnswer
) => {
  const sections = [];

  sections.push(
    `Pending Clarification:\nQuestion asked: ${pendingAction.question}`
  );

  sections.push(
    `Original Intent:\n${JSON.stringify(
      {
        intent: pendingAction.intent,
        parameters: pendingAction.parameters,
      },
      null,
      2
    )}`
  );

  sections.push(
    `User's Answer:\n${userAnswer}`
  );

  sections.push(
    `Instruction:\nMerge the user's answer into the original intent's parameters and return the completed intent as the usual single JSON object. Do not change the intent name.`
  );

  return sections.join("\n\n");
};