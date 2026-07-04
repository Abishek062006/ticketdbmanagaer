import { useRef, useState } from "react";

import { getMentionableEmployees } from "../../api/client.js";

const MENTION_PATTERN = /@([\w.-]*)$/;

export default function ChatInput({
  onSend,
  onCsvUpload,
  disabled,
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const employeesRef = useRef(null);

  const loadEmployees = async () => {
    if (employeesRef.current) {
      return employeesRef.current;
    }

    try {
      const { data } = await getMentionableEmployees();
      employeesRef.current = data;
      return data;
    } catch {
      return [];
    }
  };

  const handleChange = async (event) => {
    const value = event.target.value;
    setText(value);

    const caret = event.target.selectionStart ?? value.length;
    const match = MENTION_PATTERN.exec(value.slice(0, caret));

    if (!match) {
      setSuggestions([]);
      return;
    }

    const employees = await loadEmployees();
    const partial = match[1].toLowerCase();

    setSuggestions(
      employees
        .filter((employee) =>
          employee.email.toLowerCase().includes(partial)
        )
        .slice(0, 6)
    );
  };

  const selectSuggestion = (email) => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION_PATTERN, `@${email} `);
    const after = text.slice(caret);

    setText(before + after);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!text.trim() || disabled) {
      return;
    }

    onSend(text.trim());
    setText("");
    setSuggestions([]);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const defaultName = file.name
      .replace(/\.csv$/i, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .toLowerCase();

    const name = window.prompt(
      "Table name for this CSV?",
      defaultName
    );

    if (name) {
      onCsvUpload(file, name);
    }

    event.target.value = "";
  };

  return (
    <form className="chat-input-wrapper" onSubmit={handleSubmit}>
      {suggestions.length > 0 && (
        <ul className="mention-autocomplete">
          {suggestions.map((employee) => (
            <li key={employee.email}>
              <button
                type="button"
                onClick={() => selectSuggestion(employee.email)}
              >
                {employee.email}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="chat-input">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          placeholder="Ask me anything about your data... (use @ to mention an employee)"
          disabled={disabled}
        />

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          Upload CSV
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={disabled}
        >
          Send
        </button>
      </div>
    </form>
  );
}
