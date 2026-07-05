const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:5001/api";

let authToken = null;
let onUnauthorized = null;

export const setAuthToken = (token) => {
  authToken = token;
};

export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    onUnauthorized?.();
  }

  const body = await response.json();

  if (!response.ok || body.success === false) {
    throw new Error(body.message || "Request failed.");
  }

  return body;
}

export const login = (email, password) =>
  request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const chatRequest = (payload) =>
  request("/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listTables = () => request("/tables");

export const getTable = (tableName) =>
  request(`/tables/${encodeURIComponent(tableName)}`);

export const getMentionableEmployees = () =>
  request("/employees/mentionable");

export const listTickets = (scope = "assignedToMe") =>
  request(`/tickets?scope=${encodeURIComponent(scope)}`);

export const updateTicketStatus = (ticketId, status) =>
  request(`/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const listMeetings = () => request("/meetings");

export const listRecords = (tableName, params = {}) => {
  const query = new URLSearchParams(params).toString();

  return request(
    `/tables/${encodeURIComponent(tableName)}/records${
      query ? `?${query}` : ""
    }`
  );
};

export const importCsv = async (
  file,
  { tableName, sessionId }
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tableName", tableName);

  if (sessionId) {
    formData.append("sessionId", sessionId);
  }

  const headers = {};

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(
    `${API_BASE}/tables/import-csv`,
    {
      method: "POST",
      headers,
      body: formData,
    }
  );

  if (response.status === 401) {
    onUnauthorized?.();
  }

  const body = await response.json();

  if (!response.ok || body.success === false) {
    throw new Error(body.message || "Import failed.");
  }

  return body;
};
