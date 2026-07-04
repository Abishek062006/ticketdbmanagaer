import { useEffect, useState } from "react";

import { listTables } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";
import TableView from "./TableView.jsx";

// Fullscreen stand-in for the table while a ticket is awaiting
// Send/Cancel in the chat - the table view comes back the moment the
// ticket is sent or cancelled.
function TicketPreviewPane({ ticket }) {
  const fieldEntries = Object.entries(ticket.fields || {});

  return (
    <div className="ticket-preview-pane">
      <h2>Ticket preview</h2>

      <p>
        To: <code>{ticket.assignedTo}</code>
      </p>

      {ticket.mentions?.length > 0 && (
        <p>
          cc:{" "}
          {ticket.mentions
            .map((name) => `@${name}`)
            .join(", ")}
        </p>
      )}

      {fieldEntries.length > 0 ? (
        <ul className="known-fields">
          {fieldEntries.map(([name, value]) => (
            <li key={name}>
              <strong>{name}:</strong> {String(value)}
            </li>
          ))}
        </ul>
      ) : (
        <p>(no additional fields)</p>
      )}

      <p className="ticket-preview-hint">
        Use Send / Cancel in the chat to finish.
      </p>
    </div>
  );
}

export default function TablePanel() {
  const {
    activeTable,
    setActiveTable,
    refreshVersion,
    ticketPreview,
  } = useSession();

  const [tables, setTables] = useState([]);

  useEffect(() => {
    let cancelled = false;

    listTables()
      .then(({ data }) => {
        if (cancelled) return;

        setTables(data);

        if (!activeTable && data.length > 0) {
          setActiveTable(data[0].tableName);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshVersion]);

  return (
    <div className="table-panel">
      <div className="table-panel-header">
        <select
          value={activeTable || ""}
          onChange={(event) =>
            setActiveTable(event.target.value)
          }
        >
          <option value="" disabled>
            Select a table
          </option>

          {tables.map((table) => (
            <option
              key={table.tableName}
              value={table.tableName}
            >
              {table.displayName}
            </option>
          ))}
        </select>
      </div>

      {ticketPreview ? (
        <TicketPreviewPane ticket={ticketPreview} />
      ) : activeTable ? (
        <TableView tableName={activeTable} />
      ) : (
        <div className="table-empty">
          No tables yet. Ask the chat to create one.
        </div>
      )}
    </div>
  );
}
