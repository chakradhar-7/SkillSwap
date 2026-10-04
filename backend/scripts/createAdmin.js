require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');
const escapeRegex = require('../utils/escapeRegex');

// Usage: node scripts/createAdmin.js <email> <password>
// Promotes an existing account to admin, or creates a new admin account.
const createAdmin = async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.log('Usage: node scripts/createAdmin.js <email> <password>');
    console.log('Example: node scripts/createAdmin.js admin@skillswap.com a-strong-password');
    process.exit(1);
  }

  await connectDB();

  try {
    const existing = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });
    if (existing) {
      existing.role = 'admin';
      await existing.save();
      console.log(`User ${existing.email} is now an admin.`);
    } else {
      if (password.length < 8) {
        console.log('Please use a password of at least 8 characters for an admin account.');
        process.exit(1);
      }

      // Pick a username that is not taken yet
      let username = 'admin';
      for (let i = 2; await User.exists({ username }); i++) {
        username = `admin${i}`;
      }

      const salt = await bcrypt.genSalt(10);
      await new User({
        username,
        email,
        password: await bcrypt.hash(password, salt),
        role: 'admin',
        skillsToTeach: ['Platform Administration'],
      }).save();

      console.log(`Admin user "${username}" created for ${email}.`);
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  }
};

createAdmin();
