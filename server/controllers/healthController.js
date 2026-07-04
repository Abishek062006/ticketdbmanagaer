import mongoose from "mongoose";

export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    application: "Conversational Database Manager API",
    environment: process.env.NODE_ENV,
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name,
    },
    timestamp: new Date().toISOString(),
  });
};