// task-manager-backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  // 1. --- NEW: Check for token in the 'token' cookie first ---
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    console.log(
      "DEBUG: Token found in cookie:",
      token ? token.substring(0, 10) + "..." : "none"
    );
  }
  // 2. Fallback: Check for token in the 'Authorization' header (Bearer Token)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
    console.log("DEBUG: Token found in Authorization header.");
  }

  // Make sure token exists
  if (!token) {
    console.log("DEBUG: No token found in cookie or header.");
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("DEBUG: Token successfully decoded. User ID:", decoded.id);

    // Get user from the token (excluding password)
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      console.log("DEBUG: User not found for decoded token ID.");
      return res
        .status(401)
        .json({ message: "Not authorized, user not found" });
    }
    console.log("DEBUG: User attached to request:", req.user.username);

    next(); // Move to the next middleware or route handler
  } catch (error) {
    console.error("Token verification error:", error);
    // You might want to clear the cookie here if the token is invalid/expired
    // (though the browser will often handle expired cookies automatically,
    // this can explicitly remove invalid ones)
    res.clearCookie("token"); // Clear the 'token' cookie explicitly

    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

module.exports = { protect };
