const { createTask, getTasks, updateTask, deleteTask } = require('./tasks');
const Task = require('../models/Task');

// --- MOCK SETUP ---
// This is the most critical part. We are telling Jest how to mock the Task model.
jest.mock('../models/Task');

describe('Task Controller Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    // Clear all mock history and behavior before each test
    jest.clearAllMocks();

    req = {
      body: {},
      user: { _id: 'mockUserId123' },
      params: {},
      query: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    next = jest.fn();
  });

  // --- Test Suite for createTask ---
  describe('createTask', () => {
    it('should create a task and return 201 status with the new task', async () => {
      // Arrange:
      req.body = {
        title: 'New Task Title',
        description: 'New Task Description',
      };
      const mockSavedTask = { _id: 'mockTaskId1', ...req.body, user: req.user._id };

      // This is the key fix: We mock the instance's `save` method.
      const mockTaskInstance = {
        save: jest.fn().mockResolvedValue(mockSavedTask),
      };
      // We mock the Task constructor to return our mock instance.
      Task.mockImplementation(() => mockTaskInstance);

      // Act:
      await createTask(req, res, next);

      // Assert:
      // 1. Was the Task constructor called with the right data?
      expect(Task).toHaveBeenCalledTimes(1);
      expect(Task).toHaveBeenCalledWith({
        user: req.user._id,
        title: 'New Task Title',
        description: 'New Task Description',
        dueDate: null,
        status: 'pending',
      });

      // 2. Was the `save` method called on the instance?
      expect(mockTaskInstance.save).toHaveBeenCalledTimes(1);

      // 3. Was the response correct?
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSavedTask);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with a 400 error if title is missing', async () => {
      // Arrange:
      req.body = { description: 'Missing title' };

      // Act:
      await createTask(req, res, next);

      // Assert:
      expect(Task).not.toHaveBeenCalled(); // Constructor should not be called
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Title is required');
    });

    it('should call next with an error if task.save() fails', async () => {
      // Arrange:
      req.body = { title: 'A valid title' };
      const mockError = new Error('Database save error');
      const mockTaskInstance = {
        save: jest.fn().mockRejectedValue(mockError),
      };
      Task.mockImplementation(() => mockTaskInstance);

      // Act:
      await createTask(req, res, next);

      // Assert:
      expect(Task).toHaveBeenCalledTimes(1); // Constructor was called
      expect(mockTaskInstance.save).toHaveBeenCalledTimes(1); // .save() was called
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(mockError); // The error was passed to next
    });
  });

  // --- Test Suite for getTasks ---
  describe('getTasks', () => {
    it('should return all tasks for the authenticated user', async () => {
      // Arrange:
      const mockTasks = [{ _id: 't1', title: 'Task 1' }];
      Task.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTasks),
      });

      // Act:
      await getTasks(req, res, next);

      // Assert:
      expect(Task.find).toHaveBeenCalledWith({ user: req.user._id });
      expect(res.json).toHaveBeenCalledWith(mockTasks);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with an error if Task.find fails', async () => {
        const mockError = new Error('Database find error');
        Task.find.mockReturnValue({
            sort: jest.fn().mockRejectedValue(mockError),
        });
        await getTasks(req, res, next);
        expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  // --- Test Suite for updateTask ---
  describe('updateTask', () => {
    it('should update a task and return 200 status', async () => {
      // Arrange:
      req.params.id = 'taskIdToUpdate';
      req.body = { title: 'Updated Title' };
      const mockTaskInstance = {
        _id: 'taskIdToUpdate',
        user: 'mockUserId123',
        title: 'Original Title',
        description: 'Original Description', // Add other fields to be safe
        dueDate: null,
        status: 'pending',
        save: jest.fn(),
      };
      Task.findById.mockResolvedValue(mockTaskInstance);
      mockTaskInstance.save.mockResolvedValue({ ...mockTaskInstance, ...req.body });

      // Act:
      await updateTask(req, res, next);

      // Assert:
      expect(Task.findById).toHaveBeenCalledWith('taskIdToUpdate');
      expect(mockTaskInstance.save).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated Title' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with a 404 error if task not found', async () => {
        req.params.id = 'nonExistentId';
        Task.findById.mockResolvedValue(null);
        await updateTask(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe('Task not found');
    });
  });

  // --- Test Suite for deleteTask ---
  describe('deleteTask', () => {
    it('should delete a task and return a success message', async () => {
      // Arrange:
      req.params.id = 'taskToDeleteId';
      const mockTaskInstance = { _id: 'taskToDeleteId', user: 'mockUserId123' };
      Task.findById.mockResolvedValue(mockTaskInstance);
      Task.deleteOne.mockResolvedValue({ deletedCount: 1 });

      // Act:
      await deleteTask(req, res, next);

      // Assert:
      expect(Task.findById).toHaveBeenCalledWith('taskToDeleteId');
      expect(Task.deleteOne).toHaveBeenCalledWith({ _id: 'taskToDeleteId' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Task removed' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with a 401 error if user does not own the task', async () => {
        req.params.id = 'someId';
        const mockTaskInstance = { _id: 'someId', user: 'otherUser' };
        Task.findById.mockResolvedValue(mockTaskInstance);
        await deleteTask(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe('Not authorized to delete this task');
    });
  });
});