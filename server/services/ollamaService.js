const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://localhost:11434/api/chat";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen2.5:7b";

const REQUEST_TIMEOUT = Number(
  process.env.OLLAMA_TIMEOUT || 60000
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

        // Force valid JSON output and a deterministic (greedy) decode -
        // this is a structured-intent-extraction task, not a creative
        // one, and the growing number of intents/few-shots makes a
        // higher default temperature increasingly likely to blend two
        // similar examples together (e.g. confusing CREATE_RECORD's
        // "record" key with CREATE_TICKET's "fields" key).
        format: "json",
        options: {
          temperature: 0,
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