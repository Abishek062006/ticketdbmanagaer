import { useEffect, useRef, useState } from "react";

import { chatRequest, importCsv } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";
import MessageBubble from "./MessageBubble.jsx";
import ChatInput from "./ChatInput.jsx";

let nextId = 1;

export default function ChatPanel() {
  const { sessionId, notifyTableChanged } = useSession();

  const [messages, setMessages] = useState([
    {
      id: nextId++,
      kind: "assistant-text",
      text: "Hi! Ask me to create a table, add records, or query your data. You can also upload a CSV to create a table from it.",
    },
  ]);

  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
    });
  }, [messages]);

  const pushMessage = (msg) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId++, ...msg },
    ]);
  };

  const resolveMessage = (id, patch) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id ? { ...msg, ...patch } : msg
      )
    );
  };

  const handleResponse = (data) => {
    switch (data.type) {
      case "clarification":
        pushMessage({
          kind: "assistant-text",
          text: data.question,
        });
        break;

      case "form_required":
        pushMessage({
          kind: "form",
          table: data.table,
          knownFields: data.knownFields,
          missingFields: data.missingFields,
          resolved: false,
        });
        break;

      case "confirmation_required":
        pushMessage({
          kind: "confirmation",
          summary: data.summary,
          resolved: false,
        });
        break;

      case "ticket_preview":
        pushMessage({
          kind: "ticket_preview",
          assignedTo: data.assignedTo,
          mentions: data.mentions,
          fields: data.fields,
          resolved: false,
        });
        break;

      case "action_result":
        pushMessage({
          kind: "assistant-text",
          text: data.message,
        });

        if (data.affectedTable) {
          notifyTableChanged(data.affectedTable);
        }
        break;

      case "cancelled":
        pushMessage({
          kind: "assistant-text",
          text: data.message,
        });
        break;

      case "error":
        pushMessage({
          kind: "assistant-error",
          text: data.message,
        });
        break;

      default:
        break;
    }
  };

  const runRequest = async (payload) => {
    setBusy(true);

    try {
      const { data } = await chatRequest(payload);
      handleResponse(data);
    } catch (error) {
      pushMessage({
        kind: "assistant-error",
        text: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = (text) => {
    pushMessage({ kind: "user", text });
    runRequest({ sessionId, type: "message", message: text });
  };

  const sendConfirm = (id, confirm) => {
    resolveMessage(id, { resolved: true, confirm });
    runRequest({ sessionId, type: "confirm", confirm });
  };

  const sendForm = (id, values) => {
    resolveMessage(id, { resolved: true, values });
    runRequest({ sessionId, type: "form_submit", values });
  };

  const handleCsvUpload = async (file, tableName) => {
    pushMessage({
      kind: "user",
      text: `Uploading CSV as \`${tableName}\`...`,
    });

    setBusy(true);

    try {
      const { data } = await importCsv(file, {
        tableName,
        sessionId,
      });

      pushMessage({
        kind: "assistant-text",
        text: `Imported \`${data.table}\` (${
          data.insertedCount
        } row(s)${
          data.skippedCount
            ? `, ${data.skippedCount} skipped`
            : ""
        }).`,
      });

      notifyTableChanged(data.table);
    } catch (error) {
      pushMessage({
        kind: "assistant-error",
        text: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onConfirm={(confirm) =>
              sendConfirm(message.id, confirm)
            }
            onFormSubmit={(values) =>
              sendForm(message.id, values)
            }
          />
        ))}
      </div>

      <ChatInput
        onSend={sendMessage}
        onCsvUpload={handleCsvUpload}
        disabled={busy}
      />
    </div>
  );
}
