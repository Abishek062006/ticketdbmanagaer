const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://localhost:11434/api/chat";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen2.5:7b";

// Generous because the FIRST call after the model unloads or the
// prompt changes re-evaluates the whole ~6k-token prompt (tens of
// seconds); warm repeat calls reuse the cached prefix and take a
// few seconds.
const REQUEST_TIMEOUT = Number(
  process.env.OLLAMA_TIMEOUT || 180000
);

/**
 * Sends a chat request to Ollama.
 *
 * @param {Object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userMessage
 * @returns {Promise<string>}
 */
export async function chatWithOllama({
  systemPrompt,
  userMessage,
}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,

        stream: false,

        // Keep the model loaded in memory between requests - reloading
        // it cold adds several seconds to the first call after idle.
        keep_alive: "30m",

        // Force valid JSON output and a deterministic (greedy) decode -
        // this is a structured-intent-extraction task, not a creative
        // one, and the growing number of intents/few-shots makes a
        // higher default temperature increasingly likely to blend two
        // similar examples together (e.g. confusing CREATE_RECORD's
        // "record" key with CREATE_TICKET's "fields" key).
        format: "json",
        options: {
          temperature: 0,

          // Ollama's default context is 4096 tokens and silently
          // truncates from the TOP of the prompt when exceeded - the
          // model loses its earliest instructions/examples first. The
          // system prompt has grown past 7000 tokens, so 8192 started
          // clipping again (symptom: basic intents suddenly parsing as
          // UNKNOWN). Keep real headroom, and re-check this whenever
          // the prompt grows: prompt tokens ≈ SYSTEM_PROMPT.length/3.8.
          num_ctx: 12288,

          // The reply is one small JSON object - never let a runaway
          // generation burn seconds producing garbage past it.
          num_predict: 512,
        },

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed with status ${response.status}.`
      );
    }

    const data = await response.json();

    if (!data?.message?.content) {
      throw new Error(
        "Invalid response received from Ollama."
      );
    }

    return data.message.content.trim();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Ollama request timed out after ${REQUEST_TIMEOUT} ms.`
      );
    }

    throw new Error(
      `Unable to communicate with Ollama: ${error.message}`
    );
  } finally {
    clearTimeout(timeout);
  }
}