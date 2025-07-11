// task-manager-backend/routes/users.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using environment variables (you have this twice, keep one)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- NEW ROUTE FOR UPDATING USER PROFILE DATA (like phone number) ---
// @route   PUT /api/users/profile
// @desc    Update user profile information (e.g., phone number)
// @access  Private
router.put('/profile', protect, async (req, res) => {
  const { phoneNumber } = req.body; // Add other editable fields from req.body if you expand profile editing

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Apply updates - only update if provided in the request
    if (phoneNumber !== undefined) { // Check if phoneNumber is in the request body
      user.phoneNumber = phoneNumber;
    }
    // You could add other fields here if they become editable
    // if (req.body.username !== undefined) user.username = req.body.username;

    await user.save(); // Save changes to the database

    // Respond with a success message AND the updated user object (excluding sensitive data)
    res.json({
      message: 'Profile updated successfully!',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
        phoneNumber: user.phoneNumber,
        date: user.date, // Include relevant fields
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    // Check for Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    // Generic server error
    res.status(500).json({ message: 'Failed to update profile. Server error.' });
  }
});


// @route   PUT /api/users/profile-image
// @desc    Upload or update user profile image
// @access  Private
router.put('/profile-image', protect, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }

    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      {
        folder: 'taskforge_profiles',
        public_id: `user-${req.user._id}-profile`,
        overwrite: true,
      }
    );

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    user.profileImageUrl = result.secure_url;
    await user.save();

    res.json({ message: 'Profile image updated successfully', profileImageUrl: user.profileImageUrl });

  } catch (error) {
    console.error('Cloudinary upload or DB update error:', error);
    res.status(500).json({ message: 'Failed to upload image. Server error.' });
  }
});

// @route   DELETE /api/users/profile-image
// @desc    Remove user profile image
// @access  Private
router.delete('/profile-image', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.profileImageUrl) {
      const publicId = `taskforge_profiles/user-${req.user._id}-profile`;
      await cloudinary.uploader.destroy(publicId);
    }

    user.profileImageUrl = null;
    await user.save();

    res.json({ message: 'Profile image removed successfully.' });

  } catch (error) {
    console.error('Failed to remove profile image:', error);
    res.status(500).json({ message: 'Failed to remove image.' });
  }
});

module.exports = router;