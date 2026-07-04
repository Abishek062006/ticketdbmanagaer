import { resolveIntentContext } from "./intentContextResolver.js";
import { resolveTable } from "./entityResolver.js";
import { resolveColumns } from "./columnResolver.js";
import { resolveRecord } from "./recordResolver.js";

export const enrichIntent = async (
  sessionId,
  parsedIntent,
  user
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

  enriched =
    await resolveRecord(enriched);

  return enriched;
};