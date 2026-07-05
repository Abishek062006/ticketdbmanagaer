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
import {
  findMatchingRecords,
  resolveRowByFreeText,
} from "../utils/recordMatcher.js";
import { resolveJoinColumns } from "../services/joinResolver.js";
import { resolveTicketAssignee } from "../services/ticketAssigneeResolver.js";
import {
  resolveAttendeeList,
  extractMeetCode,
} from "../services/meetingResolver.js";
import {
  parseDeadline,
  parseNaturalDateTime,
} from "../utils/dateParser.js";
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

// A pending clarification's answer is normally merged back into the
// original intent - but a message that reads like a brand-new command
// ("add ...", "create a ticket for ...") is a new request, not an
// answer. Without this escape, the old pending intent hijacks the new
// message: its stale parameters (e.g. a failed ticket's mentions) leak
// into the new action, and genuinely different requests ("add a email
// for ravi") get force-fitted into the old intent and lost.
const NEW_COMMAND_PATTERN =
  /^(add|create|insert|make|update|change|set|delete|remove|drop|rename|show|list|display|give|grant|revoke|upload|send|mark)\s+\S+/i;

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
    deadline: parsedIntent.parameters.deadline || null,
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

  // Batches execute sequentially; one failing action doesn't abort
  // the rest, and every line gets its own result in the summary.
  if (parsedIntent.intent === INTENTS.MULTI_ACTION) {
    const actions = parsedIntent.parameters.actions || [];
    const lines = [];
    let lastTable = null;

    for (let index = 0; index < actions.length; index++) {
      const sub = actions[index];

      try {
        let subResult = await dispatchIntent(sub);

        // Same post-dispatch filtering LIST_TABLES gets on the
        // single-intent path - an employee's batch must not leak
        // tables they can't see.
        if (
          sub.intent === INTENTS.LIST_TABLES &&
          user &&
          user.role !== "admin"
        ) {
          const allowed = new Set(
            (user.allowedTables || []).map((name) =>
              name.toLowerCase()
            )
          );

          subResult = (subResult || []).filter((table) =>
            allowed.has(table.tableName.toLowerCase())
          );
        }

        lines.push(
          `${index + 1}. ${buildResultSummary(sub, subResult)}`
        );

        lastTable =
          sub.parameters?.newName ||
          sub.parameters?.tableName ||
          sub.parameters?.newTableName ||
          lastTable;
      } catch (error) {
        lines.push(`${index + 1}. Failed: ${error.message}`);
      }
    }

    setLastIntent(sessionId, INTENTS.MULTI_ACTION);

    if (lastTable) {
      setCurrentTable(sessionId, lastTable);
    }

    clearPendingAction(sessionId);

    const message = `Ran ${actions.length} action(s):\n${lines.join(
      "\n"
    )}`;

    addMessage(sessionId, "assistant", message);

    return respond(res, sessionId, {
      type: "action_result",
      intent: INTENTS.MULTI_ACTION,
      confidence: 1,
      affectedTable: lastTable,
      message,
      result: null,
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
const SELF_SERVICE_INTENTS = [
  INTENTS.LIST_MY_TICKETS,
  INTENTS.LIST_MY_MEETINGS,
  INTENTS.MY_INFO,
];

// Tickets and meetings are interactive flows (assignee resolution,
// deadline questions, previews) that depend on the raw message - they
// can't run as one line of a batch.
const BATCH_EXCLUDED_INTENTS = [
  INTENTS.CREATE_TICKET,
  INTENTS.UPDATE_TICKET_STATUS,
  INTENTS.ADD_TICKET_NOTE,
  INTENTS.SCHEDULE_MEETING,
  INTENTS.SHARE_MEETING_CODE,
];

// Why a batch line can't run: returns a human-readable reason, or
// null when the sub-action is fully resolved and safe to execute.
// Anything that would normally trigger a clarification/form gets
// skipped with advice to run it alone - a batch never half-asks.
const batchBlockerReason = async (sub, user) => {
  const { intent, parameters = {} } = sub;

  const authError = checkIntentAuthorization(
    intent,
    parameters,
    user
  );

  if (authError) return authError;

  if (parameters.unresolvedFields?.length > 0) {
    return `no column matching ${parameters.unresolvedFields.join(", ")}`;
  }

  if (
    intent === INTENTS.CREATE_TABLE &&
    (!parameters.columns || parameters.columns.length === 0)
  ) {
    return "no columns specified - create this table in its own message";
  }

  if (intent === INTENTS.CREATE_RECORD && parameters.tableName) {
    const table = await TableMetadata.findOne({
      tableName: parameters.tableName.toLowerCase(),
    });

    if (table) {
      const missing = computeMissingFields(
        table,
        parameters.record || {}
      );

      if (missing.length > 0) {
        return `missing values for ${missing
          .map((field) => field.name)
          .join(", ")} - add this row in its own message to get the form`;
      }
    }
  }

  if (
    SINGULAR_RECORD_INTENTS.includes(intent) &&
    !parameters.recordId
  ) {
    if (
      !parameters.filters ||
      Object.keys(parameters.filters).length === 0
    ) {
      return "couldn't tell which row this applies to";
    }

    if (
      typeof parameters.matchCount === "number" &&
      parameters.matchCount !== 1
    ) {
      return parameters.matchCount === 0
        ? "no row matches"
        : `matches ${parameters.matchCount} rows - narrow it in its own message`;
    }
  }

  if (
    intent === INTENTS.JOIN_QUERY ||
    intent === INTENTS.JOIN_CREATE_TABLE
  ) {
    const joinResolution = await resolveJoinColumns(parameters);

    if (!joinResolution.resolved) {
      return "couldn't determine the join columns";
    }

    parameters.on = joinResolution.on;
  }

  const validation = validateIntent(sub);

  if (!validation.valid) return validation.message;

  return null;
};

const describeBatchAction = (sub) => {
  const table =
    sub.parameters?.tableName ||
    sub.parameters?.baseTable ||
    sub.parameters?.oldName;

  return `${sub.intent}${table ? ` on \`${table}\`` : ""}`;
};

// "tickets" and "meetings" aren't database tables - when the model
// routes "show my tickets" to LIST_RECORDS anyway, remap it to the
// self-service intent instead of letting the table-access check
// reject it. Only when no REAL user table shadows the name.
const VIRTUAL_TABLE_INTENTS = {
  ticket: INTENTS.LIST_MY_TICKETS,
  tickets: INTENTS.LIST_MY_TICKETS,
  meeting: INTENTS.LIST_MY_MEETINGS,
  meetings: INTENTS.LIST_MY_MEETINGS,
};

const remapVirtualTables = async (parsedIntent) => {
  const { intent, parameters = {} } = parsedIntent;

  if (
    intent !== INTENTS.LIST_RECORDS &&
    intent !== INTENTS.GET_RECORD
  ) {
    return parsedIntent;
  }

  const normalized = (parameters.tableName || "")
    .toLowerCase()
    .replace(/^my\s+/, "")
    .trim();

  const mappedIntent = VIRTUAL_TABLE_INTENTS[normalized];

  if (!mappedIntent) {
    return parsedIntent;
  }

  const realTable = await TableMetadata.findOne({
    tableName: normalized,
  });

  if (realTable) {
    return parsedIntent;
  }

  return {
    ...parsedIntent,
    intent: mappedIntent,
    parameters: {},
  };
};

const routeResolvedIntent = async (
  res,
  sessionId,
  parsedIntent,
  attempts = 0,
  user
) => {
  parsedIntent = await remapVirtualTables(parsedIntent);

  const { intent, parameters = {} } = parsedIntent;

  // Self-service intents always answer about the CALLER - identity
  // comes from the authenticated request, never from the model.
  if (SELF_SERVICE_INTENTS.includes(intent)) {
    parameters.userEmail = user.email;
    parameters.userRole = user.role;

    if (parameters.scope === "all" && user.role !== "admin") {
      delete parameters.scope;
    }

    if (intent === INTENTS.MY_INFO) {
      parameters.userAllowedTables = user.allowedTables;
      parameters.userAllowedAssignees = user.allowedAssignees;
    }
  }

  if (intent === INTENTS.UNKNOWN) {
    clearPendingAction(sessionId);

    return respond(res, sessionId, {
      type: "error",
      message: "I couldn't understand that request.",
    });
  }

  // A batch: enrich and gate every sub-action individually, then run
  // the runnable ones behind ONE combined confirmation. Sub-actions
  // that would need a follow-up question are skipped with a reason -
  // a batch executes cleanly or not at all, it never half-asks.
  if (intent === INTENTS.MULTI_ACTION) {
    const rawActions = parameters.actions || [];
    const valid = [];
    const skipped = [];

    for (const rawAction of rawActions) {
      let sub = {
        intent: rawAction.intent,
        confidence: 1,
        parameters: rawAction.parameters || {},
      };

      if (BATCH_EXCLUDED_INTENTS.includes(sub.intent)) {
        skipped.push({
          label: describeBatchAction(sub),
          reason:
            "tickets and meetings need their own message",
        });
        continue;
      }

      sub = await enrichIntent(sessionId, sub, user, "");

      if (
        Object.prototype.hasOwnProperty.call(
          sub.parameters,
          "sortBy"
        ) &&
        sub.parameters.sortBy === null
      ) {
        delete sub.parameters.sortBy;
      }

      if (SELF_SERVICE_INTENTS.includes(sub.intent)) {
        sub.parameters.userEmail = user.email;
        sub.parameters.userRole = user.role;

        if (sub.intent === INTENTS.MY_INFO) {
          sub.parameters.userAllowedTables = user.allowedTables;
          sub.parameters.userAllowedAssignees =
            user.allowedAssignees;
        }
      }

      const reason = await batchBlockerReason(sub, user);

      if (reason) {
        skipped.push({
          label: describeBatchAction(sub),
          reason,
        });
        continue;
      }

      valid.push(sub);
    }

    if (valid.length === 0) {
      clearPendingAction(sessionId);

      const message = `I couldn't run any of those:\n${skipped
        .map((s) => `- ${s.label}: ${s.reason}`)
        .join("\n")}`;

      addMessage(sessionId, "assistant", message);

      return respond(res, sessionId, {
        type: "error",
        message,
      });
    }

    const multiIntent = {
      intent: INTENTS.MULTI_ACTION,
      confidence: 1,
      parameters: { actions: valid },
    };

    const hasWrite = valid.some((action) =>
      WRITE_INTENTS.includes(action.intent)
    );

    if (!hasWrite) {
      return dispatchAndRespond(
        res,
        sessionId,
        multiIntent,
        user
      );
    }

    const lines = valid.map(
      (action, index) =>
        `${index + 1}. ${buildConfirmationSummary(action, {
          matchCount: action.parameters.matchCount,
        }).replace(/\s*Confirm\?$/, "")}`
    );

    let summary = `This will run ${valid.length} action(s):\n${lines.join(
      "\n"
    )}`;

    if (skipped.length > 0) {
      summary += `\nSkipped: ${skipped
        .map((s) => `${s.label} (${s.reason})`)
        .join("; ")}`;
    }

    summary += `\nConfirm?`;

    setPendingAction(sessionId, {
      type: "CONFIRMATION",
      intent: INTENTS.MULTI_ACTION,
      parameters: { actions: valid },
      summary,
    });

    addMessage(sessionId, "assistant", summary);

    return respond(res, sessionId, {
      type: "confirmation_required",
      summary,
    });
  }

  // CREATE_TICKET's assignee is resolved against the real employees
  // table by resolveTicketAssignee() (in enrichIntent) BEFORE this
  // point - never let a guessed/invented email reach the permission
  // check below, since that check only means anything against a real
  // employee's real address.
  if (intent === INTENTS.CREATE_TICKET) {
    if (parameters.assigneeNotFound) {
      const { assigneeNotFound, ...cleanParameters } = parameters;

      return askClarification(res, sessionId, {
        subtype: "TICKET_ASSIGNEE",
        intent,
        parameters: cleanParameters,
        question: `I couldn't find an employee matching \`${assigneeNotFound}\`. Who should this ticket go to? (name or email)`,
      });
    }

    if (parameters.assigneeAmbiguous) {
      const { assigneeAmbiguous, ...cleanParameters } = parameters;

      return askClarification(res, sessionId, {
        subtype: "TICKET_ASSIGNEE",
        intent,
        parameters: cleanParameters,
        question: `\`${parameters.assignedTo}\` matches more than one employee (${assigneeAmbiguous.join(
          ", "
        )}). Which email did you mean?`,
      });
    }

    if (parameters.assigneeNoEmail) {
      const { assigneeNoEmail, ...cleanParameters } = parameters;

      return askClarification(res, sessionId, {
        subtype: "TICKET_ASSIGNEE",
        intent,
        parameters: cleanParameters,
        question: `\`${assigneeNoEmail}\` doesn't have an email on file, so I can't send them a ticket. Who should this go to instead?`,
      });
    }

    // Deadline is compulsory - a ticket without one never lands on
    // anyone's calendar, so ask rather than defaulting silently.
    if (!parameters.deadline) {
      return askClarification(res, sessionId, {
        subtype: "TICKET_DEADLINE",
        intent,
        parameters,
        question:
          'When is this ticket due? (e.g. "May 20", "tomorrow", or "in 5 days")',
      });
    }
  }

  // SCHEDULE_MEETING: attendees and a concrete date+time are resolved
  // from the literal message (see meetingResolver); anything missing
  // gets asked for before the confirmation step.
  if (intent === INTENTS.SCHEDULE_MEETING) {
    parameters.organizer = user.email;

    if (parameters.attendeesUnresolved?.length > 0) {
      const { attendeesUnresolved, ...cleanParameters } = parameters;

      return askClarification(res, sessionId, {
        subtype: "MEETING_ATTENDEES",
        intent,
        parameters: cleanParameters,
        question: `I couldn't match ${attendeesUnresolved
          .map((name) => `\`${name}\``)
          .join(", ")} to any employee. Who should be invited? (@name or email)`,
      });
    }

    if (!parameters.attendees || parameters.attendees.length === 0) {
      return askClarification(res, sessionId, {
        subtype: "MEETING_ATTENDEES",
        intent,
        parameters,
        question:
          "Who should be invited to this meeting? (@name or email, e.g. \"@ravi and @sana\")",
      });
    }

    if (!parameters.scheduledFor) {
      return askClarification(res, sessionId, {
        subtype: "MEETING_TIME",
        intent,
        parameters,
        question:
          'When should the meeting be? Give a date and time (e.g. "tomorrow at 3pm" or "May 20 at 15:00").',
      });
    }
  }

  // SHARE_MEETING_CODE: the meeting and code were resolved from the
  // literal message (meetingResolver); ask for whichever is missing.
  if (intent === INTENTS.SHARE_MEETING_CODE) {
    if (parameters.meetingNotFound) {
      clearPendingAction(sessionId);

      return respond(res, sessionId, {
        type: "error",
        message: parameters.meetingQuery
          ? `I couldn't find a meeting of yours named anything like \`${parameters.meetingQuery}\`.`
          : "You haven't organized any meetings yet, so there's nothing to share a code for.",
      });
    }

    if (!parameters.code) {
      return askClarification(res, sessionId, {
        subtype: "MEETING_CODE",
        intent,
        parameters,
        question: `What's the Meet code for "${parameters.meetingTitle}"? (e.g. \`abc-defg-hij\` or the full meet.google.com link)`,
      });
    }
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

  // GET/UPDATE/DELETE_RECORD whose filters resolved to NOTHING match
  // every row in the table. That's never what a single-row request
  // meant (it usually means the model dropped or mangled the "which
  // row" part) - ask for the row instead of offering a table-wide
  // "apply to all", which here would be a disaster (e.g. setting
  // every employee's email to the same address).
  if (
    SINGULAR_RECORD_INTENTS.includes(intent) &&
    !parameters.recordId &&
    parameters.filters &&
    Object.keys(parameters.filters).length === 0
  ) {
    return askClarification(res, sessionId, {
      subtype: "NO_FILTER",
      intent,
      parameters,
      question: `Which row in \`${parameters.tableName}\` should this apply to? Give a name or another identifying detail.`,
    });
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
      message &&
      !NEW_COMMAND_PATTERN.test(message.trim())
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

      // "Who should this ticket go to?" answers are re-resolved
      // directly against the employees table - routing them through
      // the LLM merge both risks another invented email and (worse)
      // was dropping the ticket's already-collected fields, because
      // the fields-must-appear-in-message filter ran against the
      // one-word answer instead of the original request.
      if (pendingAction.subtype === "TICKET_ASSIGNEE") {
        const retried = await resolveTicketAssignee(
          {
            intent: pendingAction.intent,
            confidence: 1,
            parameters: {
              ...pendingAction.parameters,
              assignedTo: message.trim(),
            },
          },
          message
        );

        clearPendingAction(sessionId);

        return routeResolvedIntent(
          res,
          sessionId,
          retried,
          nextAttempts,
          user
        );
      }

      // Deadline answers ("may 20", "in 5 days") parse in code - the
      // date parser is the single source of truth for dates.
      if (pendingAction.subtype === "TICKET_DEADLINE") {
        const deadline = parseDeadline(message);

        if (deadline) {
          clearPendingAction(sessionId);

          return routeResolvedIntent(
            res,
            sessionId,
            {
              intent: pendingAction.intent,
              confidence: 1,
              parameters: {
                ...pendingAction.parameters,
                deadline: deadline.toISOString(),
              },
            },
            nextAttempts,
            user
          );
        }

        return askClarification(res, sessionId, {
          subtype: "TICKET_DEADLINE",
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question:
            'I couldn\'t read that as a date. Try "May 20", "tomorrow", or "in 5 days".',
          attempts: nextAttempts,
        });
      }

      // Attendee answers resolve against the employees table in code.
      if (pendingAction.subtype === "MEETING_ATTENDEES") {
        const attendees = await resolveAttendeeList(message);

        if (attendees.length > 0) {
          clearPendingAction(sessionId);

          const merged = [
            ...new Set([
              ...(pendingAction.parameters.attendees || []),
              ...attendees,
            ]),
          ];

          return routeResolvedIntent(
            res,
            sessionId,
            {
              intent: pendingAction.intent,
              confidence: 1,
              parameters: {
                ...pendingAction.parameters,
                attendees: merged,
              },
            },
            nextAttempts,
            user
          );
        }

        return askClarification(res, sessionId, {
          subtype: "MEETING_ATTENDEES",
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question:
            "I couldn't match anyone there to an employee. Give a name or email from the employees table.",
          attempts: nextAttempts,
        });
      }

      // Meet-code answers parse in code too.
      if (pendingAction.subtype === "MEETING_CODE") {
        const code = extractMeetCode(message);

        if (code) {
          clearPendingAction(sessionId);

          return routeResolvedIntent(
            res,
            sessionId,
            {
              intent: pendingAction.intent,
              confidence: 1,
              parameters: {
                ...pendingAction.parameters,
                code,
              },
            },
            nextAttempts,
            user
          );
        }

        return askClarification(res, sessionId, {
          subtype: "MEETING_CODE",
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question:
            "That doesn't look like a Meet code. Paste the code (e.g. `abc-defg-hij`) or the full meet.google.com link.",
          attempts: nextAttempts,
        });
      }

      // Meeting time answers parse in code too.
      if (pendingAction.subtype === "MEETING_TIME") {
        const scheduledFor = parseNaturalDateTime(message);

        if (scheduledFor) {
          clearPendingAction(sessionId);

          return routeResolvedIntent(
            res,
            sessionId,
            {
              intent: pendingAction.intent,
              confidence: 1,
              parameters: {
                ...pendingAction.parameters,
                scheduledFor: scheduledFor.toISOString(),
              },
            },
            nextAttempts,
            user
          );
        }

        return askClarification(res, sessionId, {
          subtype: "MEETING_TIME",
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question:
            'I need both a date and a time - e.g. "tomorrow at 3pm" or "May 20 at 15:00".',
          attempts: nextAttempts,
        });
      }

      // "Which row?" answers are matched directly against the table's
      // own rows in code - the LLM repeatedly fails to merge a bare
      // name like "to ravi" back into the intent, and a row lookup
      // needs zero language understanding anyway.
      if (pendingAction.subtype === "NO_FILTER") {
        const { filters, matches } =
          await resolveRowByFreeText(
            pendingAction.parameters.tableName,
            message
          );

        if (filters) {
          clearPendingAction(sessionId);

          return routeResolvedIntent(
            res,
            sessionId,
            {
              intent: pendingAction.intent,
              confidence: 1,
              parameters: {
                ...pendingAction.parameters,
                filters,
                ...(matches.length === 1
                  ? { recordId: matches[0]._id.toString() }
                  : { matchCount: matches.length }),
              },
            },
            nextAttempts,
            user
          );
        }

        if (nextAttempts >= CLARIFICATION_ATTEMPT_LIMIT) {
          clearPendingAction(sessionId);

          const failMessage =
            "I still couldn't find that row. Let's start over with a fresh request.";

          addMessage(sessionId, "assistant", failMessage);

          return respond(res, sessionId, {
            type: "error",
            message: failMessage,
          });
        }

        return askClarification(res, sessionId, {
          subtype: "NO_FILTER",
          intent: pendingAction.intent,
          parameters: pendingAction.parameters,
          question: `I couldn't find a matching row in \`${pendingAction.parameters.tableName}\`. Give a value from the table, like a name or id.`,
          attempts: nextAttempts,
        });
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
        user,
        message
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
      user,
      message
    );

    console.log(
      "[intent-enriched]",
      JSON.stringify(parsedIntent)
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
