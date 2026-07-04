import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || "development",

  MONGODB_URI: process.env.MONGODB_URI,

  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434/api/chat",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "qwen2.5:7b",
  OLLAMA_TIMEOUT: Number(process.env.OLLAMA_TIMEOUT) || 60000,

  JWT_SECRET: process.env.JWT_SECRET || "dev-only-insecure-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "12h",

  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
};