// task-manager-backend/server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const passport = require("passport");
require("./config/passport-setup"); // Ensure this setup is for JWT, not sessions

// Import your route files
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const userRoutes = require("./routes/users");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;

// --- CORRECT CORS CONFIGURATION ---
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware Order ---
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize()); // Initialize Passport middleware
// IMPORTANT: For stateless JWT, you do NOT use passport.session()
// passport.session() is only for traditional session-based authentication.

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
