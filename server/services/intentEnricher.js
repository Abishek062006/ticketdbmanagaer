import { resolveIntentContext } from "./intentContextResolver.js";
import { resolveTable } from "./entityResolver.js";
import { resolveColumns } from "./columnResolver.js";
import { resolveRecord } from "./recordResolver.js";
import { resolveTicketAssignee } from "./ticketAssigneeResolver.js";
import { filterTicketFieldsToMentioned } from "./ticketFieldsResolver.js";
import { repairUpdateShape } from "./updateShapeRepair.js";
import {
  resolveTicketDeadline,
  resolveMeeting,
  resolveMeetingCodeShare,
} from "./meetingResolver.js";

export const enrichIntent = async (
  sessionId,
  parsedIntent,
  user,
  rawMessage = ""
) => {
  let enriched =
    resolveIntentContext(
      sessionId,
      parsedIntent
    );

  enriched =
    await resolveTable(enriched, user);

  enriched =
    await resolveColumns(enriched);

  // Must run before resolveRecord: it needs correct filters to
  // compute the match count from.
  enriched =
    await repairUpdateShape(enriched);

  enriched =
    await resolveRecord(enriched);

  enriched =
    await resolveTicketAssignee(enriched, rawMessage);

  enriched = filterTicketFieldsToMentioned(
    enriched,
    rawMessage
  );

  enriched = resolveTicketDeadline(enriched, rawMessage);

  enriched = await resolveMeeting(enriched, rawMessage);

  enriched = await resolveMeetingCodeShare(
    enriched,
    rawMessage,
    user
  );

  return enriched;
};