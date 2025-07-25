module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bookingNumber } = req.body;
  
  if (!bookingNumber) {
    return res.status(400).json({ error: 'Booking number is required' });
  }

  try {
    // Simulate a booking update notification
    console.log(`[TEST] Simulating booking update for: ${bookingNumber}`);
    
    // In a real implementation, this would send a message to connected SSE clients
    // For now, we'll just log it
    console.log(`[TEST] Notification sent for booking: ${bookingNumber}`);
    
    return res.status(200).json({ 
      success: true, 
      message: `Test notification sent for booking ${bookingNumber}` 
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
}; 