// task-manager-backend/models/User.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Ensure bcryptjs is installed: npm install bcryptjs

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, // Ensures usernames are unique
    trim: true, // Remove whitespace from both ends of a string
    minlength: 3, // Optional: add min length for username
  },
  email: {
    type: String,
    required: true,
    unique: true, // Ensures emails are unique
    trim: true,
    lowercase: true, // Store emails in lowercase for consistency
    match: [/.+@.+\..+/, "Please fill a valid email address"], // Basic email regex validation
  },
  password: {
    type: String,
    required: true,
    minlength: 6, // Optional: add min length for password
  },
  phoneNumber: {
    type: String,
    default: null, // Null if not provided
    // match: [/^\+?\d{1,3}?\s?\d{7,14}$/, 'Please fill a valid phone number'] // Optional: Basic phone number regex
  },
  profileImageUrl: {
    type: String,
    default: null, // Null if no image
  },
  // Fields for password reset mechanism
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // --- NEW FIELDS FOR SMS VERIFICATION CODE ---
  verificationCode: String, // Stores the 6-digit SMS code
  verificationCodeExpire: Date, // Stores the expiration date for the SMS code
  date: {
    type: Date,
    default: Date.now,
  },
});

// --- IMPORTANT MODIFICATION TO pre('save') HOOK ---
// This hook runs BEFORE a document is saved.
// It will hash the password ONLY if it's new OR if it has been modified AND it's a plain-text password.
UserSchema.pre("save", async function (next) {
  // Check if the password field was modified (e.g., during registration, or password change/reset)
  if (!this.isModified("password")) {
    return next(); // If password was not modified, move to the next middleware/save operation
  }

  // If password was modified, ensure it's a plaintext password before hashing.
  // This check prevents re-hashing an already hashed password, which would break authentication.
  // We assume a plaintext password will not look like a bcrypt hash (which starts with $2a$, $2b$, or $2y$)
  if (
    this.password &&
    !this.password.startsWith("$2a$") &&
    !this.password.startsWith("$2b$") &&
    !this.password.startsWith("$2y$")
  ) {
    const salt = await bcrypt.genSalt(10); // Generate a salt
    this.password = await bcrypt.hash(this.password, salt); // Hash the password
  } else if (!this.password) {
    // If password was modified but set to null/empty string, handle as needed
    // For 'required' fields, this branch might not be hit or might lead to validation error.
    // If you allow optional passwords, you'd handle it here.
  }
  next(); // Move to the next middleware/save operation
});

// Method to compare entered password with hashed password in the database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  // Use bcrypt.compare to compare the plaintext enteredPassword with the hashed 'this.password'
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
