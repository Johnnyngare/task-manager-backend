// task-manager-backend/controllers/tasks.js
const Task = require("../models/Task"); // Import your Mongoose Task model

// Centralized error handling for controllers. This is a good practice.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// @desc    Get all tasks for the authenticated user (with filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const { status, search } = req.query; // Extract query parameters
  let filter = { user: req.user._id }; // Base filter: always by authenticated user

  if (status && (status === "pending" || status === "completed")) {
    filter.status = status; // Add status filter if provided
  }

  if (search) {
    // Add search filter for title or description (case-insensitive regex)
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const tasks = await Task.find(filter).sort({
    createdAt: -1,
  });
  // FIX/IMPROVEMENT: Return tasks within a consistent structure
  // res.json() defaults to a 200 status.
  res.json({
    message: "Tasks fetched successfully", // Optional: provide a message
    tasks: tasks, // Ensure tasks array is under 'tasks' key
  });
});

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  const newTask = new Task({
    user: req.user._id,
    title,
    description,
    dueDate: dueDate ? new Date(dueDate) : null, // FIX: Ensure dueDate is a Date object or null
    status: status || "pending",
  });

  try {
    const task = await newTask.save();
    // FIX: Return the task object nested under 'task' key
    res.status(201).json({
      message: "Task created successfully!",
      task: task, // This matches frontend's expected response.data.task
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      res.status(400); // Set status before throwing error for asyncHandler
      throw new Error(messages.join(", "));
    }
    throw error; // Re-throw for the asyncHandler to catch
  }
});

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = asyncHandler(async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  let task = await Task.findById(req.params.id);

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  // Make sure user owns the task
  if (task.user.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error("Not authorized to update this task");
  }

  // FIX/IMPROVEMENT: Only update if the field is provided in req.body
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  // FIX: Convert dueDate to Date object or null only if provided and not an empty string
  if (dueDate !== undefined) {
    task.dueDate = dueDate ? new Date(dueDate) : null;
  }
  if (status !== undefined) task.status = status;

  try {
    const updatedTask = await task.save();

    res.status(200).json({
      message: "Task updated successfully!",
      task: updatedTask, // Ensure updated task is under 'task' key
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      res.status(400); // Set status before throwing error for asyncHandler
      throw new Error(messages.join(", "));
    }
    throw error; // Re-throw for the asyncHandler to catch
  }
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  // Make sure user owns the task
  if (task.user.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error("Not authorized to delete this task");
  }

  await Task.deleteOne({ _id: req.params.id });

  res.status(200).json({ message: "Task removed successfully!" });
});

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};
