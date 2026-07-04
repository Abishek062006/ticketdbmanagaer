import { env } from "../config/env.js";

export const errorHandler = (
  err,
  req,
  res,
  next
) => {
  if (env.NODE_ENV === "production") {
    console.error(err.message);
  } else {
    console.error(err);
  }

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};