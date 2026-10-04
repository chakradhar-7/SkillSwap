const axios = require('axios');
require('dotenv').config();

const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID } = process.env;

let accessToken = null;
let tokenExpiresAt = 0;

// 1. Get a new Access Token from Zoom
const getZoomAccessToken = async () => {
  // If we have a valid token, reuse it
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  try {
    const authString = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
      {},
      {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    accessToken = response.data.access_token;
    // Set expiry 5 minutes before it actually expires, just to be safe
    tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
    
    console.log('New Zoom Access Token obtained');
    return accessToken;

  } catch (err) {
    console.error('Error getting Zoom access token:', err.response ? err.response.data : err.message);
    throw new Error('Could not authenticate with Zoom');
  }
};

// 2. Create a new Zoom meeting (scheduled)
const createZoomMeeting = async (topic, startTime, durationMinutes = 60) => {
  try {
    const token = await getZoomAccessToken();
    
    const response = await axios.post(
      'https://api.zoom.us/v2/users/me/meetings',
      {
        topic: topic || 'SkillSwap Session', // e.g., "SkillSwap: SQL Basics with Rahul"
        type: 2, // Scheduled meeting
        start_time: startTime, // ISO Date string
        duration: durationMinutes,
        timezone: 'UTC',
        settings: {
          join_before_host: true,
          mute_upon_entry: true,
          participant_video: true,
          host_video: true,
          waiting_room: false,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Return the two most important links
    return {
      join_url: response.data.join_url,
      start_url: response.data.start_url, // For the host
    };

  } catch (err) {
    console.error('Error creating Zoom meeting:', err.response ? err.response.data : err.message);
    throw new Error('Could not create Zoom meeting');
  }
};

// 3. Create an instant Zoom meeting (starts immediately)
const createInstantZoomMeeting = async (topic) => {
  try {
    const token = await getZoomAccessToken();
    
    const response = await axios.post(
      'https://api.zoom.us/v2/users/me/meetings',
      {
        topic: topic || 'SkillSwap Instant Session',
        type: 1, // Instant meeting
        settings: {
          join_before_host: true,
          mute_upon_entry: false,
          participant_video: true,
          host_video: true,
          waiting_room: false,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Return the two most important links
    return {
      join_url: response.data.join_url,
      start_url: response.data.start_url, // For the host
    };

  } catch (err) {
    console.error('Error creating instant Zoom meeting:', err.response ? err.response.data : err.message);
    throw new Error('Could not create instant Zoom meeting');
  }
};

module.exports = { createZoomMeeting, createInstantZoomMeeting };