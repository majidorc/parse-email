function forwardBokunEmails() {
  // Search for emails from Bokun.io that are unread
  var threads = GmailApp.search('from:no-reply@bokun.io is:unread');
  
  // Your Vercel webhook URL
  var webhookUrl = 'https://parse-email-1nkoosjye-majidorcs-projects.vercel.app/api/webhook';
  
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      
      // Get the raw email content
      var raw = message.getRawContent();
      
      // Send to webhook
      try {
        var options = {
          'method': 'post',
          'contentType': 'application/json',
          'payload': JSON.stringify({
            'email': raw
          })
        };
        
        UrlFetchApp.fetch(webhookUrl, options);
        
        // Mark as read after successful processing
        message.markRead();
        
      } catch (error) {
        console.error('Error processing email:', error);
      }
    }
  }
} 