module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple endpoint that just confirms the connection
  // Real-time updates are handled by automatic refresh
  res.status(200).json({ 
    status: 'connected',
    message: 'Notifications endpoint active - real-time updates via auto-refresh',
    timestamp: new Date().toISOString()
  });
}; 