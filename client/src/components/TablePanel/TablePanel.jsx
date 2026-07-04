import { useEffect, useState } from "react";

import { listTables } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";
import TableView from "./TableView.jsx";

export default function TablePanel() {
  const { activeTable, setActiveTable, refreshVersion } =
    useSession();

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

      {activeTable ? (
        <TableView tableName={activeTable} />
      ) : (
        <div className="table-empty">
          No tables yet. Ask the chat to create one.
        </div>
      )}
    </div>
  );
}
