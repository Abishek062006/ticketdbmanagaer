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

  // Grow the box with its content, up to a cap (CSS max-height).
  const autoResize = () => {
    const el = inputRef.current;

    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleChange = async (event) => {
    const value = event.target.value;
    setText(value);
    autoResize();

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

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  // Enter sends; Shift+Enter inserts a newline.
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
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
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
