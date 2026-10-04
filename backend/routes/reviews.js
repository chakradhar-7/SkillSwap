const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Review = require('../models/Review');

// Reviews are submitted through POST api/sessions/reviews.

// @route   GET api/reviews/user/:userId
// @desc    Get all reviews for a specific user
router.get('/user/:userId', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.json([]);
  }
  try {
    const reviews = await Review.find({ revieweeId: req.params.userId })
      .populate('reviewerId', 'username')
      .sort({ date: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/reviews/my
// @desc    Get all reviews submitted by the logged-in user
router.get('/my', auth, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewerId: req.user.id })
      .populate('revieweeId', 'username')
      .populate('sessionId', 'skill')
      .sort({ date: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
