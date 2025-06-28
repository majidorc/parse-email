export default async function handler(req, res) {
  const axios = require('axios');
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_TOKEN;
  try {
    const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: "This is a test notification from your Vercel app!"
    });
    res.status(200).json({ success: true, telegram: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
} 