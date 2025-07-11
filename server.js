// task-manager-backend/server.js (updated)
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Import your route files
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const userRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Body parser for JSON requests
app.use("/api/users", userRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error(err));

// API Routes - Mount them under specific paths
app.use("/api/auth", authRoutes); // All auth routes will start with /api/auth
app.use("/api/tasks", taskRoutes); // All task routes will start with /api/tasks

// Basic route
app.get("/", (req, res) => {
  res.send("Task Manager API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});