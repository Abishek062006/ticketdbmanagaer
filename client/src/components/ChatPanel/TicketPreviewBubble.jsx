export default function TicketPreviewBubble({
  message,
  onConfirm,
}) {
  const fieldEntries = Object.entries(message.fields || {});

  return (
    <div className="bubble assistant confirmation ticket-preview">
      <div className="ticket-form ticket-form-compact">
        <div className="ticket-form-header">
          <h2>New Ticket</h2>
          <span className="ticket-form-badge">Preview</span>
        </div>

        <div className="ticket-form-body">
          <div className="tf-row">
            <span className="tf-label">Assigned to</span>
            <div className="tf-value tf-mono">
              {message.assignedTo}
            </div>
          </div>

          {message.mentions?.length > 0 && (
            <div className="tf-row">
              <span className="tf-label">CC</span>
              <div className="tf-value tf-mono">
                {message.mentions.join(", ")}
              </div>
            </div>
          )}

          {fieldEntries.map(([name, value]) => (
            <div className="tf-row" key={name}>
              <span className="tf-label">{name}</span>
              <div className="tf-value">{String(value)}</div>
            </div>
          ))}

          {message.deadline && (
            <div className="tf-row">
              <span className="tf-label">Due date</span>
              <div className="tf-value tf-due">
                {new Date(
                  message.deadline
                ).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          )}
        </div>
      </div>

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
