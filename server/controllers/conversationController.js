import {
  parseIntent,
  parseIntentFromContext,
} from "../services/intentParser.js";
import { enrichIntent } from "../services/intentEnricher.js";
import { dispatchIntent } from "../utils/intentDispatcher.js";
import { validateIntent } from "../utils/intentValidator.js";
import { sendSuccess } from "../utils/response.js";

import {
  addMessage,
  setCurrentTable,
  setLastIntent,
  getPendingAction,
  setPendingAction,
  clearPendingAction,
  ensureConversationOwner,
} from "../services/conversationMemory.js";

import { buildClarificationContextMessage } from "../services/contextBuilder.js";
import { buildConfirmationSummary } from "../utils/confirmationSummary.js";
import { buildResultSummary } from "../utils/resultSummary.js";
import {
  computeMissingFields,
  mergeFormSubmission,
} from "../utils/recordFormHelper.js";
import { WRITE_INTENTS, INTENTS } from "../utils/intentTypes.js";
import TableMetadata from "../models/TableMetadata.js";
import { findMatchingRecords } from "../utils/recordMatcher.js";
import { resolveJoinColumns } from "../services/joinResolver.js";
import { checkIntentAuthorization } from "../services/authorizationService.js";
import { resolveTicketForUser } from "../services/ticketService.js";

const SINGULAR_RECORD_INTENTS = [
  INTENTS.GET_RECORD,
  INTENTS.UPDATE_RECORD,
  INTENTS.DELETE_RECORD,
];

const BULK_INTENT_FOR = {
  [INTENTS.UPDATE_RECORD]: INTENTS.BULK_UPDATE_RECORDS,
  [INTENTS.DELETE_RECORD]: INTENTS.BULK_DELETE_RECORDS,
};

const ALL_OF_THEM_PATTERN =
  /^(all( of them)?|every one|apply to all|yes,?\s*all)\b/i;

const CLARIFICATION_ATTEMPT_LIMIT = 3;

const respond = (res, sessionId, payload) => {
  sendSuccess(res, 200, "Request processed successfully.", {
    sessionId,
    ...payload,
  });
};

const askClarification = (
  res,
  sessionId,
  { subtype, intent, parameters, question, attempts = 0 }
) => {
  setPendingAction(sessionId, {
    type: "CLARIFICATION",
    subtype,
    intent,
    parameters,
    question,
    attempts,
  });

  addMessage(sessionId, "assistant", question);

  return respond(res, sessionId, {
    type: "clarification",
    question,
  });
};

const askConfirmation = (
  res,
  sessionId,
  parsedIntent,
  meta
) => {
  const summary = buildConfirmationSummary(
    parsedIntent,
    meta
  );

  setPendingAction(sessionId, {
    type: "CONFIRMATION",
    intent: parsedIntent.intent,
    parameters: parsedIntent.parameters,
    summary,
  });

  addMessage(sessionId, "assistant", summary);

  return respond(res, sessionId, {
    type: "confirmation_required",
    summary,
  });
};

// CREATE_TICKET gets a dynamic, per-field preview instead of a single
// summary line - the ticket has no fixed schema, so the review step
// needs to render whatever fields the sender actually named.
const askTicketPreview = (
  res,
  sessionId,
  parsedIntent
) => {
  const { assignedTo, mentions = [], fields = {} } =
    parsedIntent.parameters;

  setPendingAction(sessionId, {
    type: "CONFIRMATION",
    intent: parsedIntent.intent,
    parameters: parsedIntent.parameters,
    summary: buildConfirmationSummary(parsedIntent),
  });

  addMessage(
    sessionId,
    "assistant",
    `Reviewing a ticket for \`${assignedTo}\`.`
  );

  return respond(res, sessionId, {
    type: "ticket_preview",
    assignedTo,
    mentions,
    fields,
  });
};

const askForm = (
  res,
  sessionId,
  table,
  parsedIntent,
  missingFields
) => {
  setPendingAction(sessionId, {
    type: "FORM",
    tableName: table.tableName,
    intent: parsedIntent.intent,
    knownFields: parsedIntent.parameters.record || {},
    missingFields,
  });

  const message = `A few more details needed for \`${table.tableName}\`.`;

  addMessage(sessionId, "assistant", message);

  return respond(res, sessionId, {
    type: "form_required",
    table: table.tableName,
    knownFields: parsedIntent.parameters.record || {},
    missingFields,
  });
};

const dispatchAndRespond = async (
  res,
  sessionId,
  parsedIntent,
  user
) => {
  const validation = validateIntent(parsedIntent);

  if (!validation.valid) {
    clearPendingAction(sessionId);

    return respond(res, sessionId, {
      type: "error",
      message: validation.message,
    });
  }

  let result = await dispatchIntent(parsedIntent);

  // LIST_TABLES has no single tableName param to authorize against
  // (checkIntentAuthorization can't filter a result set) - so an
  // employee's table listing is filtered here, after dispatch,
  // exactly like the equivalent REST endpoint filters its response.
  if (
    parsedIntent.intent === INTENTS.LIST_TABLES &&
    user &&
    user.role !== "admin"
  ) {
    const allowed = new Set(
      (user.allowedTables || []).map((name) => name.toLowerCase())
    );

    result = (result || []).filter((table) =>
      allowed.has(table.tableName.toLowerCase())
    );
  }

  setLastIntent(sessionId, parsedIntent.intent);

  const affectedTable =
    parsedIntent.parameters?.newName ||
    parsedIntent.parameters?.tableName ||
    parsedIntent.parameters?.newTableName ||
    null;

  if (affectedTable) {
    setCurrentTable(sessionId, affectedTable);
  }

  clearPendingAction(sessionId);

  const message = buildResultSummary(
    parsedIntent,
    result
  );

  addMessage(sessionId, "assistant", message);

  return respond(res, sessionId, {
    type: "action_result",
    intent: parsedIntent.intent,
    confidence: parsedIntent.confidence,
    affectedTable,
    message,
    result,
  });
};

/**
 * Routes a fully-resolved (enriched) intent through the
 * clarification / form / confirmation gates, or dispatches
 * it immediately when it's a read intent.
 */
const routeResolvedIntent = async (
  res,
  sessionId,
  parsedIntent,
  attempts = 0,
  user
) => {
  const { intent, parameters = {} } = parsedIntent;

  if (intent === INTENTS.UNKNOWN) {
    clearPendingAction(sessionId);

    return respond(res, sessionId, {
      type: "error",
      message: "I couldn't understand that request.",
    });
  }

  // Authorization happens BEFORE any confirmation/clarification is ever
  // shown - a user should never be offered a "confirm?" prompt for
  // something they aren't allowed to do in the first place.
  const authError = checkIntentAuthorization(
    intent,
    parameters,
    user
  );

  if (authError) {
    clearPendingAction(sessionId);

    return respond(res, sessionId, {
      type: "error",
      message: authError,
    });
  }

  // A groupBy/metric/sortBy field name that couldn't be matched
  // (even fuzzily) to a real column - never silently run a
  // grouping/sort on the wrong field, ask instead.
  if (parameters.unresolvedFields?.length > 0) {
    const { unresolvedFields, ...cleanParameters } = parameters;

    return askClarification(res, sessionId, {
      subtype: "UNRESOLVED_FIELD",
      intent,
      parameters: cleanParameters,
      question: `I couldn't find a column matching ${unresolvedFields
        .map((field) => `\`${field}\``)
        .join(", ")} on \`${
        parameters.tableName
      }\`. Which column did you mean?`,
    });
  }

  // LIST_RECORDS where the model detected sort/order intent but
  // couldn't tell which column - "sortBy" is explicitly null (not
  // just absent, see systemPrompt.js) - ask instead of returning an
  // unsorted list that silently ignores what the user asked for.
  if (
    intent === INTENTS.LIST_RECORDS &&
    Object.prototype.hasOwnProperty.call(parameters, "sortBy") &&
    parameters.sortBy === null
  ) {
    return askClarification(res, sessionId, {
      subtype: "SORT_COLUMN",
      intent,
      parameters,
      question: `Which column should I sort \`${parameters.tableName}\` by?`,
    });
  }

  // CREATE_TABLE with no columns -> ask what columns to use.
  if (
    intent === INTENTS.CREATE_TABLE &&
    (!parameters.columns || parameters.columns.length === 0)
  ) {
    return askClarification(res, sessionId, {
      subtype: "CREATE_TABLE_COLUMNS",
      intent,
      parameters,
      question: `What columns should the \`${parameters.tableName}\` table have?`,
    });
  }

  // CREATE_RECORD with columns missing values -> render a form.
  if (intent === INTENTS.CREATE_RECORD && parameters.tableName) {
    const table = await TableMetadata.findOne({
      tableName: parameters.tableName.toLowerCase(),
    });

    if (table) {
      const missingFields = computeMissingFields(
        table,
        parameters.record || {}
      );

      if (missingFields.length > 0) {
        return askForm(
          res,
          sessionId,
          table,
          parsedIntent,
          missingFields
        );
      }
    }
  }

  // GET/UPDATE/DELETE_RECORD that didn't resolve to exactly
  // one row -> ask the user to clarify instead of guessing.
  if (
    SINGULAR_RECORD_INTENTS.includes(intent) &&
    !parameters.recordId &&
    parameters.filters &&
    typeof parameters.matchCount === "number" &&
    parameters.matchCount !== 1
  ) {
    if (attempts >= CLARIFICATION_ATTEMPT_LIMIT) {
      clearPendingAction(sessionId);

      const failMessage =
        "I still couldn't pin down a single row. Let's start over with a fresh request.";

      addMessage(sessionId, "assistant", failMessage);

      return respond(res, sessionId, {
        type: "error",
        message: failMessage,
      });
    }

    if (parameters.matchCount === 0) {
      return askClarification(res, sessionId, {
        subtype: "NO_MATCH",
        intent,
        parameters,
        question: `I couldn't find any row in \`${parameters.tableName}\` matching that. Can you give more detail?`,
        attempts,
      });
    }

    const bulkIntent = BULK_INTENT_FOR[intent] || null;

    return askClarification(res, sessionId, {
      subtype: "AMBIGUOUS_MATCH",
      intent,
      parameters: { ...parameters, bulkIntent },
      question: `That matches ${parameters.matchCount} rows in \`${parameters.tableName}\`.${
        bulkIntent
          ? ` Reply "all of them" to apply this to all ${parameters.matchCount}, or add more detail to narrow it to one.`
          : " Please narrow your filter to a single row."
      }`,
      attempts,
    });
  }

  // JOIN_QUERY / JOIN_CREATE_TABLE: resolve the join
  // condition up front, ask if ambiguous.
  if (
    intent === INTENTS.JOIN_QUERY ||
    intent === INTENTS.JOIN_CREATE_TABLE
  ) {
    const joinResolution = await resolveJoinColumns(parameters);

    if (!joinResolution.resolved) {
      if (attempts >= CLARIFICATION_ATTEMPT_LIMIT) {
        clearPendingAction(sessionId);

        const failMessage =
          "I still couldn't figure out the join columns. Let's start over - try describing the join again with the exact column names.";

        addMessage(sessionId, "assistant", failMessage);

        return respond(res, sessionId, {
          type: "error",
          message: failMessage,
        });
      }

      return askClarification(res, sessionId, {
        subtype: "JOIN_ON",
        intent,
        parameters,
        question: joinResolution.question,
        attempts,
      });
    }

    parameters.on = joinResolution.on;
  }

  // Bulk ops the AI chose directly (not via the ambiguity path
  // above) still need a real match count for the confirmation.
  if (
    (intent === INTENTS.BULK_UPDATE_RECORDS ||
      intent === INTENTS.BULK_DELETE_RECORDS) &&
    parameters.tableName &&
    parameters.filters &&
    typeof parameters.matchCount !== "number"
  ) {
    const matches = await findMatchingRecords(
      parameters.tableName,
      parameters.filters
    );

    parameters.matchCount = matches.length;
  }

  // CREATE_TICKET: attach the sender, then show a dynamic per-field
  // preview (not a generic Yes/No summary) before it's actually sent.
  if (intent === INTENTS.CREATE_TICKET) {
    parameters.createdBy = user.email;
    return askTicketPreview(res, sessionId, parsedIntent);
  }

  // UPDATE_TICKET_STATUS / ADD_TICKET_NOTE: resolve which ticket the
  // user means (against their own sent/received tickets) before asking
  // for confirmation - never guess silently.
  if (
    intent === INTENTS.UPDATE_TICKET_STATUS ||
    intent === INTENTS.ADD_TICKET_NOTE
  ) {
    const ticket = await resolveTicketForUser(
      user.email,
      parameters.ticketQuery
    );

    if (!ticket) {
      clearPendingAction(sessionId);

      return respond(res, sessionId, {
        type: "error",
        message: "I couldn't find a matching ticket of yours.",
      });
    }

    parameters.ticketId = ticket._id.toString();
    parameters.actorEmail = user.email;
  }

  // Any write intent requires explicit confirmation first.
  if (WRITE_INTENTS.includes(intent)) {
    return askConfirmation(res, sessionId, parsedIntent, {
      matchCount: parameters.matchCount,
    });
  }

  // Read intents execute immediately, no confirmation.
  return dispatchAndRespond(res, sessionId, parsedIntent, user);
};

export const chatController = async (
  req,
  res,
  next
) => {
  try {
    const {
      sessionId = "default",
      type = "message",
      message,
      confirm,
      values,
    } = req.body;

    const user = req.user;

    // A client-supplied sessionId is untrusted - tie it to whoever's
    // actually logged in this request, resetting it if it belonged to
    // a different user (see conversationMemory.ensureConversationOwner).
    ensureConversationOwner(sessionId, user.email);

    const pendingAction = getPendingAction(sessionId);

    // --- Confirmation response (Yes/No buttons) ---
    if (
      pendingAction?.type === "CONFIRMATION" &&
      type === "confirm"
    ) {
      if (!confirm) {
        clearPendingAction(sessionId);
        addMessage(sessionId, "assistant", "Cancelled.");

        return respond(res, sessionId, {
          type: "cancelled",
          message: "Cancelled.",
        });
      }

      // Re-check authorization fresh, right before dispatch - the
      // confirmation may have been asked in an earlier request, and
      // permissions can change in between (e.g. an admin revoking
      // table access while the Yes/No prompt is still on screen).
      const authError = checkIntentAuthorization(
        pendingAction.intent,
        pendingAction.parameters,
        user
      );

      if (authError) {
        clearPendingAction(sessionId);

        return respond(res, sessionId, {
          type: "error",
          message: authError,
        });
      }

      addMessage(sessionId, "user", "Confirmed.");

      return dispatchAndRespond(
        res,
        sessionId,
        {
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          confidence: 1,
        },
        user
      );
    }

    // --- Record form submission ---
    if (
      pendingAction?.type === "FORM" &&
      type === "form_submit"
    ) {
      addMessage(sessionId, "user", "Submitted form.");

      const mergedRecord = mergeFormSubmission(
        pendingAction.knownFields,
        values || {},
        pendingAction.missingFields
      );

      clearPendingAction(sessionId);

      return routeResolvedIntent(
        res,
        sessionId,
        {
          intent: pendingAction.intent,
          confidence: 1,
          parameters: {
            tableName: pendingAction.tableName,
            record: mergedRecord,
          },
        },
        0,
        user
      );
    }

    // --- Answer to a clarification question ---
    if (
      pendingAction?.type === "CLARIFICATION" &&
      type === "message" &&
      message
    ) {
      addMessage(sessionId, "user", message);

      const nextAttempts = (pendingAction.attempts || 0) + 1;

      // Deterministic "apply to all" shortcut - no LLM needed.
      if (
        pendingAction.subtype === "AMBIGUOUS_MATCH" &&
        pendingAction.parameters.bulkIntent &&
        ALL_OF_THEM_PATTERN.test(message.trim())
      ) {
        clearPendingAction(sessionId);

        const {
          bulkIntent,
          matchCount,
          recordId,
          ...bulkParameters
        } = pendingAction.parameters;

        return routeResolvedIntent(
          res,
          sessionId,
          {
            intent: bulkIntent,
            confidence: 1,
            parameters: bulkParameters,
          },
          0,
          user
        );
      }

      const contextualMessage =
        buildClarificationContextMessage(
          pendingAction,
          message
        );

      const parsedIntent = await parseIntentFromContext(
        contextualMessage
      );

      const stillIncomplete =
        pendingAction.subtype === "CREATE_TABLE_COLUMNS" &&
        (!parsedIntent.parameters?.columns ||
          parsedIntent.parameters.columns.length === 0);

      if (stillIncomplete) {
        if (nextAttempts >= CLARIFICATION_ATTEMPT_LIMIT) {
          clearPendingAction(sessionId);

          const failMessage =
            "I still couldn't figure out the columns. Let's start over — try describing the table again.";

          addMessage(sessionId, "assistant", failMessage);

          return respond(res, sessionId, {
            type: "error",
            message: failMessage,
          });
        }

        return askClarification(res, sessionId, {
          subtype: pendingAction.subtype,
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question: pendingAction.question,
          attempts: nextAttempts,
        });
      }

      clearPendingAction(sessionId);

      const enriched = await enrichIntent(
        sessionId,
        parsedIntent,
        user
      );

      return routeResolvedIntent(
        res,
        sessionId,
        enriched,
        nextAttempts,
        user
      );
    }

    // --- Fresh message, no relevant pending state ---
    if (type !== "message" || !message) {
      return respond(res, sessionId, {
        type: "error",
        message:
          "There's no pending action to resolve; send a plain message.",
      });
    }

    // A brand-new message abandons any stale pending flow.
    clearPendingAction(sessionId);

    addMessage(sessionId, "user", message);

    const parsedIntent = await enrichIntent(
      sessionId,
      await parseIntent(sessionId, message, user),
      user
    );

    return routeResolvedIntent(
      res,
      sessionId,
      parsedIntent,
      0,
      user
    );
  } catch (error) {
    next(error);
  }
};
