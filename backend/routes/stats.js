const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Session = require('../models/Session');

// @route   GET api/stats
// @desc    Get user's dashboard stats
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const hoursExchanged = (user.hoursTaught || 0) + (user.hoursLearned || 0);

    // Calculate hours this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0);
    
    const sessionsThisWeek = await Session.find({
      $or: [{ learner: req.user.id }, { teacher: req.user.id }],
      status: 'completed',
      scheduledTime: { $gte: startOfWeek, $lte: now }
    });
    
    const hoursThisWeek = sessionsThisWeek.reduce((total, session) => {
      return total + (session.durationHours || 0);
    }, 0);

    const activeSessions = await Session.countDocuments({
      $or: [{ learner: req.user.id }, { teacher: req.user.id }],
      status: { $in: ['pending', 'confirmed'] },
      scheduledTime: { $gte: new Date() },
    });

    const learningStreak = user.currentStreak || 0;

    // Define "mastered" as teaching a skill for more than 5 hours
    // Exclude cancelled sessions
    const taughtSessions = await Session.find({ 
      teacher: req.user.id, 
      status: 'completed' 
    });
    const skillsMastered = taughtSessions.reduce((acc, session) => {
        const hours = session.durationHours || 0; // Use durationHours directly
        if(acc[session.skill]) {
            acc[session.skill] += hours;
        } else {
            acc[session.skill] = hours;
        }
        return acc;
    }, {});

    const masteredCount = Object.values(skillsMastered).filter(hours => hours >= 5).length;

    // Calculate skills in progress (skills being learned but not yet mastered)
    // Exclude cancelled sessions
    const learningSessions = await Session.find({ 
      learner: req.user.id, 
      status: { $in: ['confirmed', 'pending'] }
    });
    const skillsInProgress = new Set(learningSessions.map(s => s.skill)).size;

    res.json({
      hoursExchanged,
      hoursThisWeek,
      activeSessions,
      learningStreak,
      skillsMastered: masteredCount,
      skillsInProgress,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/stats/skills
// @desc    Get learning skill progress for dashboard
router.get('/skills', auth, async (req, res) => {
  try {
    // Get all learning sessions (completed, confirmed, pending) for total hours
    // Exclude cancelled sessions
    const allLearningSessions = await Session.find({
      learner: req.user.id,
      status: { $in: ['completed', 'confirmed', 'pending'] }
    }).where('status').ne('cancelled');

    // Get only completed sessions for hours completed
    const completedLearningSessions = allLearningSessions.filter(s => s.status === 'completed');

    // Calculate hours per skill
    const skillProgress = {};

    // Calculate total hours from all scheduled sessions
    allLearningSessions.forEach(session => {
      const skill = session.skill;
      const hours = session.durationHours || 0;

      if (!skillProgress[skill]) {
        skillProgress[skill] = {
          skill,
          hoursCompleted: 0,
          totalHours: 0,
        };
      }
      skillProgress[skill].totalHours += hours;
    });

    // Calculate completed hours from completed sessions only
    completedLearningSessions.forEach(session => {
      const skill = session.skill;
      const hours = session.durationHours || 0;
      skillProgress[skill].hoursCompleted += hours;
    });

    // Convert to array and calculate progress percentage
    const skillsArray = Object.values(skillProgress).map(skill => ({
      ...skill,
      progress: skill.totalHours > 0
        ? Math.min((skill.hoursCompleted / skill.totalHours) * 100, 100)
        : 0,
    }));

    res.json(skillsArray);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/stats/summary
// @desc    Get plain-English summary of completed sessions and milestones
router.get('/summary', auth, async (req, res) => {
  try {
    // Get all completed sessions
    const completedSessions = await Session.find({
      $or: [{ learner: req.user.id }, { teacher: req.user.id }],
      status: 'completed'
    })
      .populate('learner', 'username')
      .populate('teacher', 'username')
      .sort({ scheduledTime: -1 })
      .limit(100); // Last 100 completed sessions

    // Group by user and skill
    const teachingSummary = {};
    const learningSummary = {};

    completedSessions.forEach(session => {
      if (!session.teacher || !session.learner) return;
      const isTeaching = session.teacher._id.toString() === req.user.id;
      const otherUser = isTeaching ? session.learner : session.teacher;
      const skill = session.skill;
      const hours = session.durationHours || 1;

      if (isTeaching) {
        if (!teachingSummary[otherUser._id]) {
          teachingSummary[otherUser._id] = {
            username: otherUser.username,
            skills: {}
          };
        }
        if (!teachingSummary[otherUser._id].skills[skill]) {
          teachingSummary[otherUser._id].skills[skill] = 0;
        }
        teachingSummary[otherUser._id].skills[skill] += hours;
      } else {
        if (!learningSummary[otherUser._id]) {
          learningSummary[otherUser._id] = {
            username: otherUser.username,
            skills: {}
          };
        }
        if (!learningSummary[otherUser._id].skills[skill]) {
          learningSummary[otherUser._id].skills[skill] = 0;
        }
        learningSummary[otherUser._id].skills[skill] += hours;
      }
    });

    // Generate combined summary text (plain-English format)
    const summaryParts = [];
    const user = await User.findById(req.user.id);

    // Combine teaching and learning for each user to create barter summaries
    const allUsers = new Set([
      ...Object.keys(teachingSummary),
      ...Object.keys(learningSummary)
    ]);

    allUsers.forEach(userId => {
      const teaching = teachingSummary[userId];
      const learning = learningSummary[userId];
      
      if (teaching && learning) {
        // Both teaching and learning with this user - create combined summary
        const teachingSkills = Object.entries(teaching.skills).map(([skill, hours]) => ({
          skill,
          hours,
          count: Math.round(hours)
        }));
        const learningSkills = Object.entries(learning.skills).map(([skill, hours]) => ({
          skill,
          hours,
          count: Math.round(hours)
        }));

        // Create combined text
        const teachingText = teachingSkills.map(t => 
          `${t.count} ${t.skill} lesson${t.count !== 1 ? 's' : ''}`
        ).join(', ');
        const learningText = learningSkills.map(l => 
          `${l.count} ${l.skill} lesson${l.count !== 1 ? 's' : ''}`
        ).join(', ');

        summaryParts.push({
          type: 'barter',
          text: `${user.username} completed ${teachingText} with ${teaching.username} and learned ${learningText} from them.`,
          username: teaching.username,
          teachingSkills,
          learningSkills,
          totalTeachingHours: teachingSkills.reduce((sum, t) => sum + t.hours, 0),
          totalLearningHours: learningSkills.reduce((sum, l) => sum + l.hours, 0)
        });
      } else if (teaching) {
        // Only teaching
        Object.keys(teaching.skills).forEach(skill => {
          const hours = teaching.skills[skill];
          const sessionCount = Math.round(hours);
          summaryParts.push({
            type: 'teaching',
            text: `${user.username} completed ${sessionCount} ${skill} lesson${sessionCount !== 1 ? 's' : ''} with ${teaching.username}`,
            skill,
            username: teaching.username,
            hours
          });
        });
      } else if (learning) {
        // Only learning
        Object.keys(learning.skills).forEach(skill => {
          const hours = learning.skills[skill];
          const sessionCount = Math.round(hours);
          summaryParts.push({
            type: 'learning',
            text: `${user.username} completed ${sessionCount} ${skill} lesson${sessionCount !== 1 ? 's' : ''} with ${learning.username}`,
            skill,
            username: learning.username,
            hours
          });
        });
      }
    });

    // Sort by most recent activity (approximate - by total hours)
    summaryParts.sort((a, b) => {
      const aTotal = (a.totalTeachingHours || a.hours || 0) + (a.totalLearningHours || 0);
      const bTotal = (b.totalTeachingHours || b.hours || 0) + (b.totalLearningHours || 0);
      return bTotal - aTotal;
    });

    res.json({
      summary: summaryParts,
      totalTeaching: Object.values(teachingSummary).reduce((sum, entry) => 
        sum + Object.values(entry.skills).reduce((s, h) => s + h, 0), 0
      ),
      totalLearning: Object.values(learningSummary).reduce((sum, entry) => 
        sum + Object.values(entry.skills).reduce((s, h) => s + h, 0), 0
      ),
    });
  } catch (err) {
    console.error('Error generating summary:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
