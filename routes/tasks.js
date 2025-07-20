// task-manager-backend/routes/tasks.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth"); // Assuming protect middleware path
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/tasks"); // Import your controller functions

// @route   GET /api/tasks
// @desc    Get all tasks for the authenticated user (with filters)
// @access  Private
router.get("/", protect, getTasks);

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post("/", protect, createTask);

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put("/:id", protect, updateTask);

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete("/:id", protect, deleteTask);

module.exports = router;