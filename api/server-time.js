export default function handler(req, res) {
  const now = new Date();
  const bangkokTime = now.toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'long'
  });
  res.status(200).json({
    serverTime: now.toString(),
    serverISOString: now.toISOString(),
    bangkokTime,
    processEnvTZ: process.env.TZ || 'not set',
    detectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
} 