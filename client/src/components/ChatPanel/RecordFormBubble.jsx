import { useState } from "react";

const inputTypeFor = (type) => {
  if (type === "Number") return "number";
  if (type === "Date") return "date";
  return "text";
};

export default function RecordFormBubble({
  message,
  onSubmit,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      message.missingFields.map((field) => [
        field.name,
        "",
      ])
    )
  );

  const [error, setError] = useState(null);

  const handleChange = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    for (const field of message.missingFields) {
      if (!field.nullable && !values[field.name]) {
        setError(`${field.name} is required.`);
        return;
      }
    }

    setError(null);
    onSubmit(values);
  };

  const knownEntries = Object.entries(
    message.knownFields || {}
  );

  return (
    <div className="bubble assistant form">
      <p>
        A few more details for <code>{message.table}</code>:
      </p>

      {message.resolved && knownEntries.length > 0 && (
        <ul className="known-fields">
          {knownEntries.map(([name, value]) => (
            <li key={name}>
              <strong>{name}:</strong> {String(value)}
            </li>
          ))}
        </ul>
      )}

      {!message.resolved ? (
        <form onSubmit={handleSubmit}>
          {knownEntries.map(([name, value]) => (
            <label key={name} className="form-field">
              <span>{name}</span>
              <input
                type="text"
                value={String(value)}
                disabled
                readOnly
              />
            </label>
          ))}

          {message.missingFields.map((field) => (
            <label key={field.name} className="form-field">
              <span>
                {field.name}
                {!field.nullable && (
                  <span className="required"> *</span>
                )}
              </span>

              {field.type === "Boolean" ? (
                <select
                  value={values[field.name]}
                  onChange={(event) =>
                    handleChange(
                      field.name,
                      event.target.value
                    )
                  }
                >
                  <option value="">(blank)</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={inputTypeFor(field.type)}
                  value={values[field.name]}
                  onChange={(event) =>
                    handleChange(
                      field.name,
                      event.target.value
                    )
                  }
                />
              )}
            </label>
          ))}

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-confirm">
            Submit
          </button>
        </form>
      ) : (
        <p className="confirmation-status">Submitted</p>
      )}
    </div>
  );
}
