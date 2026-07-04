import ConfirmationBubble from "./ConfirmationBubble.jsx";
import RecordFormBubble from "./RecordFormBubble.jsx";
import TicketPreviewBubble from "./TicketPreviewBubble.jsx";

export default function MessageBubble({
  message,
  onConfirm,
  onFormSubmit,
}) {
  if (message.kind === "confirmation") {
    return (
      <ConfirmationBubble
        message={message}
        onConfirm={onConfirm}
      />
    );
  }

  if (message.kind === "ticket_preview") {
    return (
      <TicketPreviewBubble
        message={message}
        onConfirm={onConfirm}
      />
    );
  }

  if (message.kind === "form") {
    return (
      <RecordFormBubble
        message={message}
        onSubmit={onFormSubmit}
      />
    );
  }

  const alignment =
    message.kind === "user" ? "user" : "assistant";

  const errorClass =
    message.kind === "assistant-error" ? " error" : "";

  return (
    <div className={`bubble ${alignment}${errorClass}`}>
      {message.text}
    </div>
  );
}
