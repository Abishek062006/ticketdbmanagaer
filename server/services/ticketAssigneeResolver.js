import { getDynamicModel } from "../utils/dynamicModel.js";
import { IDENTITY_TABLE_NAME } from "../utils/identityTable.js";
import { INTENTS } from "../utils/intentTypes.js";

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// An @ only counts as a mention when it starts a token - "@ABISHEK"
// yes, the @ inside "abi@test.com" no.
const RAW_MENTION_PATTERN = /(^|\s)@([\w.\-]+)/g;

const extractRawMentions = (text = "") => [
  ...new Set(
    [...text.matchAll(RAW_MENTION_PATTERN)].map(
      (match) => match[2]
    )
  ),
];

const findByEmailOrName = async (Model, raw) => {
  const needle = (raw || "")
    .trim()
    .replace(/^(to|for)\s+/i, "")
    .replace(/^@+/, "");

  if (!needle) {
    return { status: "not_found" };
  }

  const byEmail = await Model.findOne({
    email: new RegExp(`^${escapeRegex(needle)}$`, "i"),
  });

  if (byEmail) {
    return { status: "resolved", email: byEmail.email };
  }

  const matches = await Model.find({
    fullName: new RegExp(escapeRegex(needle), "i"),
  });

  // Plenty of employee rows are plain records with no email/account
  // (e.g. "Ravi" - fullName only, no login) - a ticket can't reach
  // someone who has no address to send it to, so those don't count as
  // a usable match even though the name itself matched.
  const withEmail = matches.filter((employee) => employee.email);

  if (withEmail.length === 1) {
    return { status: "resolved", email: withEmail[0].email };
  }

  if (withEmail.length > 1) {
    return {
      status: "ambiguous",
      matches: withEmail.map((employee) => employee.email),
    };
  }

  if (matches.length > 0) {
    return { status: "no_email", name: matches[0].fullName };
  }

  return { status: "not_found" };
};

/**
 * Resolves who a CREATE_TICKET actually goes to, trusting sources in
 * this order:
 *
 *   1. A literal "@name" token in the user's raw message - the model
 *      routinely invents emails ("@ABISHEK" became abishek@gmail.com,
 *      borrowed from unrelated history), but the real recipient is
 *      sitting right there in the text, extractable with zero AI.
 *   2. The model's "assignedTo" - only when the message contains no
 *      @tokens at all (e.g. "send a ticket to abi@test.com").
 *
 * Every candidate is verified against the real employees table; a
 * ticket can only ever be addressed to a real employee's real email.
 * The cc list is rebuilt the same way, deduped, @-stripped, and never
 * repeats the assignee.
 */
export const resolveTicketAssignee = async (
  parsedIntent,
  rawMessage = ""
) => {
  if (parsedIntent?.intent !== INTENTS.CREATE_TICKET) {
    return parsedIntent;
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);
  const { assignedTo, mentions = [] } =
    parsedIntent.parameters;

  const rawMentions = extractRawMentions(rawMessage);

  // Pick the assignee: first resolvable raw @token wins; the model's
  // assignedTo is only consulted when the message has no @tokens.
  let result = { status: "not_found" };
  let attempted = assignedTo;

  if (rawMentions.length > 0) {
    attempted = `@${rawMentions[0]}`;

    for (const token of rawMentions) {
      const candidate = await findByEmailOrName(
        Model,
        token
      );

      if (candidate.status === "resolved") {
        result = candidate;
        break;
      }

      // Keep the most informative failure (no_email/ambiguous beats
      // a plain not_found) for the clarification question.
      if (result.status === "not_found") {
        result = candidate;
        attempted = `@${token}`;
      }
    }
  } else {
    result = await findByEmailOrName(Model, assignedTo);
  }

  // The cc pool: whatever the model collected plus every raw @token,
  // all looked up for their real email where possible.
  const ccPool = [
    ...new Set([...mentions, ...rawMentions]),
  ];

  const resolvedMentions = await Promise.all(
    ccPool.map(async (mention) => {
      const mentionResult = await findByEmailOrName(
        Model,
        mention
      );

      return mentionResult.status === "resolved"
        ? mentionResult.email
        : String(mention).replace(/^@+/, "");
    })
  );

  if (result.status === "resolved") {
    const uniqueMentions = [
      ...new Set(
        resolvedMentions.filter(
          (mention) =>
            mention.toLowerCase() !==
            result.email.toLowerCase()
        )
      ),
    ];

    return {
      ...parsedIntent,
      parameters: {
        ...parsedIntent.parameters,
        assignedTo: result.email,
        mentions: uniqueMentions,
      },
    };
  }

  const baseParameters = {
    ...parsedIntent.parameters,
    mentions: [...new Set(resolvedMentions)],
  };

  if (result.status === "ambiguous") {
    return {
      ...parsedIntent,
      parameters: {
        ...baseParameters,
        assigneeAmbiguous: result.matches,
      },
    };
  }

  if (result.status === "no_email") {
    return {
      ...parsedIntent,
      parameters: {
        ...baseParameters,
        assigneeNoEmail: result.name,
      },
    };
  }

  return {
    ...parsedIntent,
    parameters: {
      ...baseParameters,
      assigneeNotFound: attempted,
    },
  };
};
