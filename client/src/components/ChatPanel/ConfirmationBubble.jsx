export default function ConfirmationBubble({
  message,
  onConfirm,
}) {
  return (
    <div className="bubble assistant confirmation">
      <p>{message.summary}</p>

      {!message.resolved ? (
        <div className="confirmation-actions">
          <button
            type="button"
            className="btn btn-confirm"
            onClick={() => onConfirm(true)}
          >
            Yes
          </button>

          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => onConfirm(false)}
          >
            No
          </button>
        </div>
      ) : (
        <p className="confirmation-status">
          {message.confirm ? "Confirmed" : "Cancelled"}
        </p>
      )}
    </div>
  );
}
