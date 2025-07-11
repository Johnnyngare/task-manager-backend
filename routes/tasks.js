// task-manager-backend/routes/tasks.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Task = require("../models/Task");

// @route   GET /api/tasks
// @desc    Get all tasks for the authenticated user
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const { status, search } = req.query; // Extract query parameters
    let filter = { user: req.user._id }; // Base filter: always by authenticated user

    if (status && (status === 'pending' || status === 'completed')) {
      filter.status = status; // Add status filter if provided
    }

    if (search) {
      // Add search filter for title or description (case-insensitive regex)
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tasks = await Task.find(filter).sort({
      createdAt: -1,
    });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
router.get("/", protect, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post("/", protect, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  try {
    const newTask = new Task({
      user: req.user._id,
      title,
      description,
      dueDate: dueDate || null,
      status: status || "pending",
    });

    const task = await newTask.save();
    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put("/:id", protect, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  try {
    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Make sure user owns the task
    if (task.user.toString() !== req.user._id.toString()) {
      return res
        .status(401)
        .json({ message: "Not authorized to update this task" });
    }

    task.title = title || task.title;
    task.description = description || task.description;
    task.dueDate = dueDate || task.dueDate;
    task.status = status || task.status;

    const updatedTask = await task.save();
    res.json(updatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Make sure user owns the task
    if (task.user.toString() !== req.user._id.toString()) {
      return res
        .status(401)
        .json({ message: "Not authorized to delete this task" });
    }

    await Task.deleteOne({ _id: req.params.id });
    res.json({ message: "Task removed" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

module.exports = router;