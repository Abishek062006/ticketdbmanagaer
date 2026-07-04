export default function TicketPreviewBubble({
  message,
  onConfirm,
}) {
  const fieldEntries = Object.entries(message.fields || {});

  return (
    <div className="bubble assistant confirmation ticket-preview">
      <p>
        Ticket for <code>{message.assignedTo}</code>
        {message.mentions?.length > 0 && (
          <>
            {" "}
            (cc:{" "}
            {message.mentions.map((name) => `@${name}`).join(", ")})
          </>
        )}
        :
      </p>

      {fieldEntries.length > 0 ? (
        <ul className="known-fields">
          {fieldEntries.map(([name, value]) => (
            <li key={name}>
              <strong>{name}:</strong> {String(value)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="known-fields">(no additional fields)</p>
      )}

      {!message.resolved ? (
        <div className="confirmation-actions">
          <button
            type="button"
            className="btn btn-confirm"
            onClick={() => onConfirm(true)}
          >
            Send
          </button>

          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => onConfirm(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="confirmation-status">
          {message.confirm ? "Sent" : "Cancelled"}
        </p>
      )}
    </div>
  );
}
