export default async function handler(req, res) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Hello, this is a test from /api/test-telegram"
      })
    });
    const data = await response.json();
    res.status(200).json({ success: true, telegram: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
} 