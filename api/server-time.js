export default function handler(req, res) {
  const now = new Date();
  res.status(200).json({
    serverTime: now.toString(),
    serverISOString: now.toISOString(),
    processEnvTZ: process.env.TZ || 'not set',
    detectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
} 