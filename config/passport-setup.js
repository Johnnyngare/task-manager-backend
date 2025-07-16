// config/passport-setup.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const crypto = require("crypto"); // We need crypto for generating unique usernames

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("--- Google OAuth Callback Triggered ---");
      console.log("Google Profile ID:", profile.id);
      console.log("Google Display Name:", profile.displayName);
      console.log(
        "Google Email:",
        profile.emails && profile.emails[0] ? profile.emails[0].value : "N/A"
      );

      try {
        // 1. Check if a user with this Google ID already exists
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          console.log("Existing user found with Google ID:", user.email);
          return done(null, user);
        }

        // 2. If no user with Google ID, check if their email is already in use
        user = await User.findOne({ email: profile.emails[0].value });
        if (user) {
          console.log(
            "Existing user found with matching email. Linking Google ID:",
            user.email
          );
          user.googleId = profile.id;
          user.profileImageUrl =
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : user.profileImageUrl;
          await user.save();
          return done(null, user);
        }

        // 3. If no user found, create a new one, ensuring the username is unique.
        console.log("Creating new user from Google profile.");

        let newUsername =
          profile.displayName.replace(/\s/g, "") || `user${Date.now()}`; // Remove spaces or create a default
        let existingUsername = await User.findOne({ username: newUsername });

        // --- NEW: Handle username collision ---
        while (existingUsername) {
          console.log(
            `Username '${newUsername}' already exists. Generating a new one.`
          );
          // Append a random 4-character string to make it unique
          const randomSuffix = crypto.randomBytes(2).toString("hex");
          newUsername = `${newUsername}${randomSuffix}`;
          existingUsername = await User.findOne({ username: newUsername });
        }
        console.log(`Final unique username will be: '${newUsername}'`);

        const newUser = new User({
          googleId: profile.id,
          username: newUsername, // Use the guaranteed unique username
          email: profile.emails[0].value,
          profileImageUrl:
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : null,
        });

        await newUser.save();
        console.log("New Google OAuth user created:", newUser.email);
        return done(null, newUser);
      } catch (error) {
        console.error("Error in Google OAuth strategy callback:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});
