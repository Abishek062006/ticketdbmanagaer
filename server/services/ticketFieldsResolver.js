import { INTENTS } from "../utils/intentTypes.js";

const normalize = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[_\s]/g, "");

/**
 * CREATE_TICKET has no fixed schema - a ticket should only ever carry
 * the exact fields the user actually named. In practice the model
 * keeps copying a field name (e.g. "urgency") from its own one-shot
 * example into every ticket, even when the user's message never
 * mentions it at all. Prompt wording alone doesn't reliably stop this
 * (same failure mode as the ORDER_RECORDS hallucination), so this
 * deterministically drops any field whose name doesn't literally
 * appear anywhere in the user's raw message.
 */
export const filterTicketFieldsToMentioned = (
  parsedIntent,
  rawMessage = ""
) => {
  if (parsedIntent?.intent !== INTENTS.CREATE_TICKET) {
    return parsedIntent;
  }

  const fields = parsedIntent.parameters?.fields || {};
  const haystack = normalize(rawMessage);

  const keptFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (haystack.includes(normalize(key))) {
      keptFields[key] = value;
    }
  }

  return {
    ...parsedIntent,
    parameters: {
      ...parsedIntent.parameters,
      fields: keptFields,
    },
  };
};
