const conversations = new Map();

/**
 * Returns the current conversation state.
 *
 * @param {string} sessionId
 * @returns {Object}
 */
export const getConversation = (sessionId) => {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, {
      currentTable: null,
      lastIntent: null,
      history: [],
      pendingAction: null,
      ownerEmail: null,
    });
  }

  return conversations.get(sessionId);
};

/**
 * A client-supplied sessionId is untrusted - it's just a random UUID
 * from sessionStorage, not verified server-side. This ties a session
 * to the authenticated user who first used it, and resets it (rather
 * than letting a different logged-in user read/continue it) if the
 * email on a later request doesn't match.
 *
 * @param {string} sessionId
 * @param {string} email
 */
export const ensureConversationOwner = (sessionId, email) => {
  const conversation = getConversation(sessionId);

  if (!conversation.ownerEmail) {
    conversation.ownerEmail = email;
    return;
  }

  if (conversation.ownerEmail !== email) {
    conversations.set(sessionId, {
      currentTable: null,
      lastIntent: null,
      history: [],
      pendingAction: null,
      ownerEmail: email,
    });
  }
};

/**
 * Stores the last detected intent.
 *
 * @param {string} sessionId
 * @param {string} intent
 */
export const setLastIntent = (sessionId, intent) => {
  const conversation = getConversation(sessionId);

  conversation.lastIntent = intent;
};

/**
 * Stores the current working table.
 *
 * @param {string} sessionId
 * @param {string} tableName
 */
export const setCurrentTable = (
  sessionId,
  tableName
) => {
  const conversation = getConversation(sessionId);

  conversation.currentTable = tableName;
};

/**
 * Returns the current working table.
 *
 * @param {string} sessionId
 * @returns {string|null}
 */
export const getCurrentTable = (sessionId) => {
  return getConversation(sessionId).currentTable;
};

/**
 * Adds a message to the conversation history.
 *
 * @param {string} sessionId
 * @param {string} role
 * @param {string} message
 */
export const addMessage = (
  sessionId,
  role,
  message
) => {
  const conversation = getConversation(sessionId);

  conversation.history.push({
    role,
    message,
    timestamp: Date.now(),
  });

  // Keep only the latest 20 messages
  if (conversation.history.length > 20) {
    conversation.history.shift();
  }
};

/**
 * Returns conversation history.
 *
 * @param {string} sessionId
 * @returns {Array}
 */
export const getHistory = (sessionId) => {
  return getConversation(sessionId).history;
};

/**
 * Clears a conversation.
 *
 * @param {string} sessionId
 */
export const clearConversation = (
  sessionId
) => {
  conversations.delete(sessionId);
};

/**
 * Stores a pending action awaiting the user's
 * next message (clarification answer, form
 * submission, or yes/no confirmation).
 *
 * @param {string} sessionId
 * @param {Object|null} pendingAction
 */
export const setPendingAction = (
  sessionId,
  pendingAction
) => {
  const conversation = getConversation(sessionId);

  conversation.pendingAction = pendingAction;
};

/**
 * Returns the pending action awaiting resolution, if any.
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
export const getPendingAction = (sessionId) => {
  return getConversation(sessionId).pendingAction;
};

/**
 * Clears the pending action.
 *
 * @param {string} sessionId
 */
export const clearPendingAction = (sessionId) => {
  const conversation = getConversation(sessionId);

  conversation.pendingAction = null;
};