// task-manager-backend/models/User.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, "Please fill a valid email address"],
  },
  // --- UPDATED: Make password optional for OAuth users ---
  password: {
    type: String,
    required: false, // Set to false to allow users without a traditional password (e.g., Google OAuth)
    minlength: 6, // Still enforce minlength if a password IS provided
  },
  phoneNumber: {
    type: String,
    default: null,
  },
  profileImageUrl: {
    type: String,
    default: null,
  },
  // Fields for password reset mechanism
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // --- NEW FIELDS FOR SMS VERIFICATION CODE ---
  verificationCode: String,
  verificationCodeExpire: Date,

  date: {
    type: Date,
    default: Date.now,
  },
  // --- NEW FIELD FOR GOOGLE OAUTH ---
  googleId: {
    type: String,
    unique: true, // Ensures each Google ID is unique
    sparse: true, // Allows multiple documents to have a null value for this field (for non-Google users)
  },
});

// --- UPDATED: Simplified and more robust pre('save') hook ---
UserSchema.pre("save", async function (next) {
  // Only hash the password if it's new OR has been modified, AND it's a non-empty string.
  // This prevents hashing empty/null passwords for OAuth users, while ensuring regular passwords are hashed.
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Method to compare entered password with hashed password in the database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  // If the user has no password (e.g., they're a Google OAuth user), it cannot match.
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
