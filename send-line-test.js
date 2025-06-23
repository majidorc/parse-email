const axios = require('axios');

const LINE_USER_ID = 'U5d57de50c697ac14bd16102d69ea8827';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function sendLineNotification(to, message) {
  await axios.post('https://api.line.me/v2/bot/message/push', {
    to,
    messages: [{ type: 'text', text: message }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`
    }
  });
}

(async () => {
  try {
    await sendLineNotification(LINE_USER_ID, 'This is a test notification from your booking system!');
    console.log('Test LINE notification sent!');
  } catch (err) {
    console.error('Failed to send LINE notification:', err.response ? err.response.data : err.message);
  }
})(); 