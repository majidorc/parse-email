const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type": "connected", "message": "SSE connection established"}\n\n');

  // Keep connection alive with periodic heartbeats
  const heartbeat = setInterval(() => {
    res.write('data: {"type": "heartbeat", "timestamp": "' + new Date().toISOString() + '"}\n\n');
  }, 30000); // Every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    res.end();
  });

  // Keep the connection open
  req.on('error', () => {
    clearInterval(heartbeat);
    res.end();
  });
}; 