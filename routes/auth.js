// task-manager-backend/routes/auth.js

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Mongoose User model
const crypto = require("crypto"); // Node.js built-in for secure token generation
const nodemailer = require("nodemailer"); // For sending emails
const AfricasTalking = require("africastalking"); // Import Africa's Talking SDK
const { protect } = require("../middleware/auth"); // Import auth middleware for change-password route
const passport = require("passport"); // NEW: Import Passport.js

// Helper to generate JWT token (existing)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_TOKEN_EXPIRES_IN || "1h", // Token expires in 1 hour by default or from env
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

const sms = africastalkingClient.SMS;

// ----------------------------------------------------------------------
//                        STANDARD AUTH ROUTES
// ----------------------------------------------------------------------

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user exists by email or username
    // Also check if email exists and is linked to a Google account without a password
    let userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      if (userExists.email === email) {
        // If email matches an existing Google-only user, prompt them to use Google login
        if (userExists.googleId && !userExists.password) {
          return res.status(400).json({
            message:
              "This email is registered via Google. Please use 'Sign in with Google' or your existing password.",
          });
        }
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

    const token = generateToken(newUser._id);

    // --- UPDATED COOKIE OPTIONS ---
    const cookieOptions = {
      // Use JWT_COOKIE_EXPIRES_IN (e.g., in days) from .env, default to 1 hour
      expires: new Date(
        Date.now() +
          (process.env.JWT_COOKIE_EXPIRES_IN
            ? parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000
            : 60 * 60 * 1000)
      ),
      httpOnly: true,
      // Conditionally set secure and sameSite for production
      ...(process.env.NODE_ENV === "production"
        ? { secure: true, sameSite: "None" }
        : {}),
    };
    res.cookie("token", token, cookieOptions);

    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      message: "Registration successful and logged in!",
    });
  } catch (error) {
    console.error("Registration error:", error);
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
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // --- NEW: Handle users without a password (e.g., Google OAuth users) ---
    // If user has no password stored (meaning they registered via Google only),
    // they cannot log in via traditional means.
    if (!user.password) {
      return res.status(400).json({
        message:
          "This account is linked to Google. Please sign in with Google.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    // --- UPDATED COOKIE OPTIONS ---
    const cookieOptions = {
      // Use JWT_COOKIE_EXPIRES_IN (e.g., in days) from .env, default to 1 hour
      expires: new Date(
        Date.now() +
          (process.env.JWT_COOKIE_EXPIRES_IN
            ? parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000
            : 60 * 60 * 1000)
      ),
      httpOnly: true,
      // Conditionally set secure and sameSite for production
      ...(process.env.NODE_ENV === "production"
        ? { secure: true, sameSite: "None" }
        : {}),
    };
    res.cookie("token", token, cookieOptions);

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      phoneNumber: user.phoneNumber,
      date: user.date,
      message: "Logged in successfully!",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Server error during login.");
  }
});

// @route   GET /api/auth/logout
// @desc    Log out user by clearing the authentication cookie
// @access  Public
router.get("/logout", (req, res) => {
  // --- UPDATED COOKIE OPTIONS ---
  const cookieOptions = {
    httpOnly: true,
    path: "/", // Ensure the path matches where the cookie was set
    // Conditionally set secure and sameSite for production to ensure cookie is cleared correctly
    ...(process.env.NODE_ENV === "production"
      ? { secure: true, sameSite: "None" }
      : {}),
  };
  res.clearCookie("token", cookieOptions);
  res.status(200).json({ success: true, message: "Logged out successfully!" });
});

// @route   GET /api/auth/me
// @desc    Get logged in user data (for UI refresh / initial state)
// @access  Private (uses the 'protect' middleware)
router.get("/me", protect, async (req, res) => {
  try {
    const user = req.user;
    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
        phoneNumber: user.phoneNumber,
        date: user.date,
      },
    });
  } catch (error) {
    console.error("Error fetching /me route:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching user data." });
  }
});

// ----------------------------------------------------------------------
//                        GOOGLE OAUTH ROUTES (NEW)
// ----------------------------------------------------------------------

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth login flow
// @access  Public
router.get(
  "/google",
  // Passport middleware to start the Google authentication flow
  passport.authenticate("google", {
    scope: ["profile", "email"], // Request user's profile and email
    session: false, // Tell Passport not to use traditional sessions; we use JWTs
  })
);

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback URL
// @access  Public
router.get(
  "/google/callback",
  // Passport middleware to handle the callback from Google
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`, // Redirect to login page on failure
    session: false, // Tell Passport not to use traditional sessions
  }),
  // This function executes only if Google authentication was successful.
  // Passport attaches the authenticated user (from your database, resolved by `passport-setup.js`) to `req.user`.
  (req, res) => {
    console.log(
      "DEBUG: Successfully authenticated with Google, user in req.user:",
      req.user.email || req.user.username
    );

    // Generate YOUR app's JWT for this user (same as standard login)
    const token = generateToken(req.user._id);

    // --- UPDATED COOKIE OPTIONS ---
    const cookieOptions = {
      // Use JWT_COOKIE_EXPIRES_IN (e.g., in days) from .env, default to 1 hour
      expires: new Date(
        Date.now() +
          (process.env.JWT_COOKIE_EXPIRES_IN
            ? parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000
            : 60 * 60 * 1000)
      ),
      httpOnly: true,
      // Conditionally set secure and sameSite for production
      ...(process.env.NODE_ENV === "production"
        ? { secure: true, sameSite: "None" }
        : {}),
    };
    res.cookie("token", token, cookieOptions);
    console.log(
      "DEBUG: JWT cookie set for Google user, redirecting to frontend."
    );

    // Redirect the user back to your frontend's main dashboard
    res.redirect(`${process.env.FRONTEND_URL}/tasks`);
  }
);

// ----------------------------------------------------------------------
//                        PASSWORD MANAGEMENT ROUTES
// ----------------------------------------------------------------------

// @route   POST /api/auth/forgot-password
// @desc    Request password reset link (email or SMS)
// @access  Public
router.post("/forgot-password", async (req, res) => {
  const { email, phoneNumber, method } = req.body;
  let user;
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
      return res.status(400).json({
        message:
          "Email or phone number, and a valid method (email/sms) are required.",
      });
    }

    if (!user) {
      console.log(
        "DEBUG: User not found for contact. Sending generic success to prevent enumeration."
      );
      return res.status(200).json({
        message: `If an account with that ${method} exists, a password reset ${
          method === "email" ? "link" : "code"
        } has been sent.`,
      });
    }

    // --- NEW: Prevent password reset for Google-only accounts ---
    // If user has a googleId but no local password, they can't reset it traditionally.
    if (user.googleId && !user.password) {
      console.log(
        `DEBUG: Password reset attempted for Google-only account ${user.email}. Denying.`
      );
      return res.status(400).json({
        message:
          "This account is linked to Google. Please sign in with Google.",
      });
    }

    console.log("DEBUG: User found:", user.email || user.phoneNumber);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;

    if (method === "email") {
      const hexResetToken = crypto.randomBytes(20).toString("hex");
      user.resetPasswordToken = hexResetToken;
      user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
      console.log("DEBUG: Email reset token generated.");

      const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${hexResetToken}`;
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
      const smsVerificationCode = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      user.verificationCode = smsVerificationCode;
      user.verificationCodeExpire = Date.now() + 15 * 60 * 1000;
      console.log("DEBUG: SMS verification code generated.");

      if (!user.phoneNumber) {
        console.error("DEBUG: User has no phone number for SMS.");
        return res.status(400).json({
          message: "User has no phone number registered for SMS reset.",
        });
      }

      const smsMessage = `Your TaskForge password reset code is: ${smsVerificationCode}. It is valid for 15 minutes.`;
      console.log(
        `DEBUG: Preparing to send SMS to ${user.phoneNumber} with message: "${smsMessage}" via Africa's Talking`
      );

      try {
        const options = {
          to: user.phoneNumber,
          message: smsMessage,
          from: process.env.AT_SENDER_ID || undefined,
        };
        const response = await sms.send(options);
        console.log("DEBUG: Africa's Talking message sent response:", response);
        res.status(200).json({
          message: "Reset code sent successfully to your phone number.",
        });
      } catch (atError) {
        console.error(
          "DEBUG: Africa's Talking API call failed specifically:",
          atError.message
        );
        console.error("DEBUG: Africa's Talking error object:", atError);
        throw atError;
      }
    } else {
      console.log("DEBUG: Method not recognized.");
      return res
        .status(400)
        .json({ message: "Invalid reset method specified." });
    }

    await user.save({ validateBeforeSave: false });
    console.log("DEBUG: User saved successfully with reset token/code.");
  } catch (error) {
    console.error(`Forgot password (${method}) FULL ERROR IN CATCH:`, error);

    if (user) {
      console.log("DEBUG: Attempting to clear user token/code due to error.");
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      user.verificationCode = undefined;
      user.verificationCodeExpire = undefined;
      await user
        .save({ validateBeforeSave: false })
        .catch((e) =>
          console.error(
            "Failed to clear token/code on user after send error:",
            e
          )
        );
    }

    if (error.code === "EAUTH" || error.code === "EENVELOPE") {
      return res
        .status(500)
        .json({ message: `Failed to send reset email: ${error.message}` });
    } else if (
      (error.message && error.message.includes("SMS send failed")) ||
      (error.response &&
        error.response.status >= 400 &&
        error.response.status < 500)
    ) {
      return res.status(500).json({
        message: `Failed to send reset SMS. Please check your phone number format (e.g., +254XXXXXXXXX) or backend logs.`,
      });
    } else if (error.code) {
      return res.status(500).json({
        message: `Failed to send reset ${
          method === "email" ? "email" : "SMS"
        } (Error Code: ${error.code}). Please check backend logs for details.`,
      });
    }
    res.status(500).json({
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
  const { token, newPassword } = req.body;

  try {
    let user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      user = await User.findOne({
        verificationCode: token,
        verificationCodeExpire: { $gt: Date.now() },
      });
    }

    if (!user) {
      return res.status(400).json({
        message: "Password reset token/code is invalid or has expired.",
      });
    }

    // --- NEW: Prevent resetting password for Google-only accounts ---
    // If user has a googleId but no local password, they cannot set a password this way.
    if (user.googleId && !user.password) {
      console.log(
        `DEBUG: Password reset attempted for Google-only account via token/code. Denying.`
      );
      // To be safe, also clear any tokens if this was an attempt on a Google-only account
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      user.verificationCode = undefined;
      user.verificationCodeExpire = undefined;
      await user.save({ validateBeforeSave: false }); // Save to clear tokens
      return res.status(400).json({
        message:
          "This account is linked to Google. You cannot reset its password this way. Please sign in with Google.",
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;

    await user.save();

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
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
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // --- NEW: Prevent changing password for Google-only accounts ---
    // If user has a googleId but no local password, they cannot change a non-existent password.
    if (user.googleId && !user.password) {
      return res.status(400).json({
        message:
          "This account is linked to Google and does not have a local password. Please sign in with Google.",
      });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
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
