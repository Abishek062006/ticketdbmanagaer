import { useEffect, useState } from "react";

import { getTable, listRecords } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";

const formatValue = (value) => {
  if (value === null || value === undefined) {
    return <span className="null-value">null</span>;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
};

export default function TableView({ tableName }) {
  const { refreshVersion } = useSession();

  const [columns, setColumns] = useState([]);
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getTable(tableName),
      listRecords(tableName, { limit: 50 }),
    ])
      .then(([tableRes, recordsRes]) => {
        if (cancelled) return;

        setColumns(tableRes.data.columns);
        setRecords(recordsRes.data.records);
        setPagination(recordsRes.data.pagination);
      })
      .catch((err) => {
        if (cancelled) return;

        setColumns([]);
        setRecords([]);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tableName, refreshVersion]);

  if (loading) {
    return (
      <div className="table-skeleton" aria-label="Loading table">
        <div className="skeleton-bar header" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className="skeleton-bar"
            style={{ "--row-index": index }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="table-empty">{error}</div>;
  }

  return (
    <div className="table-view">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.name}>{column.name}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {records.map((record, index) => (
              // Keying on refreshVersion remounts the rows whenever the
              // data changes, replaying the staggered build-in animation.
              <tr
                key={`${refreshVersion}-${record._id}`}
                className="row-animate"
                style={{ "--row-index": index }}
              >
                {columns.map((column) => (
                  <td key={column.name}>
                    {formatValue(record[column.name])}
                  </td>
                ))}
              </tr>
            ))}

            {records.length === 0 && (
              <tr>
                <td
                  className="table-empty-row"
                  colSpan={columns.length || 1}
                >
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="table-footer">
          {pagination.total} row(s)
        </div>
      )}
    </div>
  );
}
