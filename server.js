// task-manager-backend/server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// Import your route files
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const userRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORRECT CORS CONFIGURATION ---
const corsOptions = {
  // This must be the EXACT origin of your frontend.
  // Using an environment variable is best practice.
  origin: process.env.FRONTEND_URL || "http://localhost:5173",

  // This is the crucial part that allows cookies to be sent and received.
  credentials: true,
};

app.use(cors(corsOptions)); // Apply CORS with the correct options

// Middleware
app.use(express.json());
app.use(cookieParser());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);

// Basic route
app.get("/", (req, res) => {
  res.send("Task Manager API is running!");
});

// Error Handling Middleware
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Something went wrong!",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
