// task-manager-backend/routes/auth.js

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Mongoose User model
const crypto = require("crypto"); // Node.js built-in for secure token generation
const nodemailer = require("nodemailer"); // For sending emails
const AfricasTalking = require("africastalking"); // Import Africa's Talking SDK
const { protect } = require("../middleware/auth"); // Import auth middleware for change-password route

// Helper to generate JWT token (existing)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1h", // Token expires in 1 hour
  });
};

// --- NODEMAILER Transport (for email reset) ---
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE, // e.g., 'gmail', 'SendGrid'
  auth: {
    user: process.env.EMAIL_USERNAME, // Your email address
    pass: process.env.EMAIL_PASSWORD, // Your email password or API key
  },
});

// --- AFRICA'S TALKING Client ---
// Add console.log statements to verify credentials are read from .env on backend startup
console.log(
  "DEBUG: AT API_KEY from .env:",
  process.env.AT_API_KEY
    ? process.env.AT_API_KEY.substring(0, 5) + "..."
    : "NOT SET"
);
console.log(
  "DEBUG: AT USERNAME from .env:",
  process.env.AT_USERNAME || "NOT SET"
);
console.log(
  "DEBUG: AT SENDER_ID from .env:",
  process.env.AT_SENDER_ID || "NOT SET"
);

const africastalkingClient = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

// Get the SMS service
const sms = africastalkingClient.SMS;

// ----------------------------------------------------------------------
//                        EXISTING AUTH ROUTES
// ----------------------------------------------------------------------

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user exists by email or username
    let userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      if (userExists.email === email) {
        return res
          .status(400)
          .json({ message: "User with that email already exists" });
      }
      if (userExists.username === username) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    // Create new user (password will be hashed by pre-save middleware in User.js)
    const newUser = new User({
      username,
      email,
      password,
    });

    await newUser.save();

    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      token: generateToken(newUser._id),
    });
  } catch (error) {
    console.error("Registration error:", error);
    // Mongoose validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).send("Server error during registration.");
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profileImageUrl: user.profileImageUrl, // Include if exists
      phoneNumber: user.phoneNumber, // Include if exists
      date: user.date, // Include if exists
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Server error during login.");
  }
});

// ----------------------------------------------------------------------
//                        PASSWORD MANAGEMENT ROUTES
// ----------------------------------------------------------------------

// @route   POST /api/auth/forgot-password
// @desc    Request password reset link (email or SMS)
// @access  Public
router.post("/forgot-password", async (req, res) => {
  const { email, phoneNumber, method } = req.body;

  let user; // Declared here so it's accessible in outer catch block
  console.log(
    "DEBUG: Forgot password request received. Method:",
    method,
    "Contact:",
    email || phoneNumber
  );

  try {
    if (method === "email" && email) {
      user = await User.findOne({ email });
    } else if (method === "sms" && phoneNumber) {
      user = await User.findOne({ phoneNumber });
    } else {
      console.log("DEBUG: Invalid method/contact provided.");
      return res
        .status(400)
        .json({
          message:
            "Email or phone number, and a valid method (email/sms) are required.",
        });
    }

    if (!user) {
      console.log(
        "DEBUG: User not found for contact. Sending generic success."
      );
      return res
        .status(200)
        .json({
          message: `If an account with that ${method} exists, a password reset ${
            method === "email" ? "link" : "code"
          } has been sent.`,
        });
    }

    console.log("DEBUG: User found:", user.email || user.phoneNumber);

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); // Always generate resetCode for SMS method
    let hexResetToken; // Declare for email method

    // Assign reset token/code based on method
    if (method === "email") {
      hexResetToken = crypto.randomBytes(20).toString("hex"); // Generate hex token only if email method
      user.resetPasswordToken = hexResetToken; // Store the hex token for email
    } else if (method === "sms") {
      user.resetPasswordToken = resetCode; // Store the 6-digit code for SMS
    } else {
      // This case should be caught by the initial validation, but for safety
      console.log(
        "DEBUG: Method not recognized after user found. This is unexpected."
      );
      return res
        .status(400)
        .json({ message: "Invalid reset method specified." });
    }

    user.resetPasswordExpire = Date.now() + 3600000; // Token/code expires in 1 hour

    console.log("DEBUG: Attempting to save user with reset token/code.");
    await user.save(); // Save user with token/code
    console.log("DEBUG: User saved successfully with reset token/code.");

    if (method === "email") {
      const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${hexResetToken}`; // Use hexResetToken here
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: user.email,
        subject: "Password Reset Request for TaskForge",
        html: `<p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
               <p>Please click on the following link, or paste this into your browser to complete the process:</p>
               <p><a href="${resetURL}">${resetURL}</a></p>
               <p>This link will expire in 1 hour.</p>
               <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`,
      };
      console.log("DEBUG: Attempting to send email via Nodemailer.");
      await transporter.sendMail(mailOptions);
      console.log("DEBUG: Email sent successfully.");
      res
        .status(200)
        .json({ message: "Reset link sent successfully to your email." });
    } else if (method === "sms") {
      console.log(
        "DEBUG: Entered SMS sending block. User Phone:",
        user.phoneNumber
      );

      if (!user.phoneNumber) {
        console.error("DEBUG: User has no phone number for SMS.");
        return res
          .status(400)
          .json({
            message: "User has no phone number registered for SMS reset.",
          });
      }

      const smsMessage = `Your TaskForge password reset code is: ${resetCode}. It is valid for 1 hour.`;

      console.log(
        `DEBUG: Preparing to send SMS to ${user.phoneNumber} with message: "${smsMessage}" via Africa's Talking`
      );

      try {
        const options = {
          to: user.phoneNumber, // Recipient's phone number from DB (must be E.164 format)
          message: smsMessage,
          from: process.env.AT_SENDER_ID || undefined, // Use Sender ID if provided, otherwise AT default
        };
        const response = await sms.send(options); // Use the sms service
        console.log("DEBUG: Africa's Talking message sent response:", response);
        res
          .status(200)
          .json({
            message: "Reset code sent successfully to your phone number.",
          });
      } catch (atError) {
        console.error(
          "DEBUG: Africa's Talking API call failed specifically:",
          atError.message
        );
        console.error("DEBUG: Africa's Talking error object:", atError);
        throw atError; // Re-throw to main catch block
      }
    } else {
      console.log("DEBUG: Method not recognized.");
      return res
        .status(400)
        .json({ message: "Invalid reset method specified." });
    }
  } catch (error) {
    // This catch block handles errors from DB queries, save, or re-thrown AT errors
    console.error(`Forgot password (${method}) FULL ERROR IN CATCH:`, error);

    // Attempt to clear token/expire date ONLY if user was successfully retrieved AND error occurred during send
    if (user && user.resetPasswordToken) {
      // Safely check if 'user' object exists and has a token to clear
      console.log("DEBUG: Attempting to clear user token due to error.");
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      // Add error handling for save if it fails here
      await user
        .save()
        .catch((e) =>
          console.error("Failed to clear token on user after send error:", e)
        );
    }

    // Distinguish errors for frontend message
    if (error.code === "EAUTH" || error.code === "EENVELOPE") {
      // Nodemailer errors
      return res
        .status(500)
        .json({ message: `Failed to send reset email: ${error.message}` });
    } else if (
      error.message.includes("SMS send failed") ||
      error.code === 400 ||
      error.code === 401 ||
      error.code === 403
    ) {
      // Generic AT error check (can be more specific based on AT errors)
      // Note: Africa's Talking errors might not always have a 'code' property, sometimes it's in message
      return res
        .status(500)
        .json({
          message: `Failed to send reset SMS. Please check backend logs for Africa's Talking error details.`,
        });
    } else if (error.code) {
      // Other specific error codes
      return res
        .status(500)
        .json({
          message: `Failed to send reset ${
            method === "email" ? "email" : "SMS"
          } (Error Code: ${
            error.code
          }). Please check backend logs for details.`,
        });
    }
    res
      .status(500)
      .json({
        message: `Failed to send reset ${
          method === "email" ? "email" : "SMS"
        }. Server error.`,
      });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token/code
// @access  Public
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body; // 'token' here is the actual token/code received

  try {
    // Find user by token/code and check if it's expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() }, // Token/code not expired (greater than now)
    });

    if (!user) {
      return res
        .status(400)
        .json({
          message: "Password reset token/code is invalid or has expired.",
        });
    }

    // Update password (User model pre-save hook will hash this new password)
    user.password = newPassword;

    // Clear token fields after successful reset
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save(); // This will trigger the pre-save hook to hash the new password

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    // Mongoose validation errors during save (e.g. password minlength)
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res
      .status(500)
      .json({ message: "Failed to reset password. Server error." });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user's password when logged in
// @access  Private
router.put("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id); // req.user._id comes from 'protect' middleware
    if (!user) {
      return res.status(404).json({ message: "User not found." }); // Should not happen if protect works
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    // Update password (pre-save hook will hash newPassword)
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    // Mongoose validation errors during save (e.g. newPassword minlength)
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res
      .status(500)
      .json({ message: "Failed to change password. Server error." });
  }
});

module.exports = router;
