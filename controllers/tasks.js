const Task = require('../models/Task'); // Import your Mongoose Task model

// Centralized error handling for controllers. This is a good practice.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// @desc    Get all tasks for the authenticated user (with filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
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
  // res.json() defaults to a 200 status, which is fine for GET requests.
  res.json(tasks);
});


// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  if (!title) { // Basic validation
    res.status(400); // Set status, then throw error for asyncHandler to catch
    throw new Error('Title is required');
  }

  const newTask = new Task({
    user: req.user._id,
    title,
    description,
    dueDate: dueDate || null,
    status: status || "pending",
  });

  const task = await newTask.save();
  // Explicitly set 201 Created status for POST requests
  res.status(201).json(task);
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

  task.title = title || task.title;
  task.description = description || task.description;
  task.dueDate = dueDate || task.dueDate;
  task.status = status || task.status;

  const updatedTask = await task.save();

  // **FIX APPLIED HERE:** Explicitly set the 200 OK status code.
  res.status(200).json(updatedTask);
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

  // Using deleteOne with a query ensures Mongoose hooks run if defined on model
  await Task.deleteOne({ _id: req.params.id });

  // **FIX APPLIED HERE:** Explicitly set the 200 OK status code.
  res.status(200).json({ message: "Task removed" });
});

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};