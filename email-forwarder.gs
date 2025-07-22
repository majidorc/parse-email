function forwardEmails() {
  // Search for unread emails from either of our booking providers
  var searchQuery = 'is:unread (from:no-reply@bokun.io OR from:info@tours.co.th)';
  var threads = GmailApp.search(searchQuery);
  
  // Your Vercel webhook URL
  var webhookUrl = 'https://xxxxxx.vercel.app/api/webhook';
  
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      
      // Check if the message is unread before processing
      if (message.isUnread()) {
        
        // Get the raw email content
        var rawContent = message.getRawContent();
        
        // Send to webhook
        try {
          var payload = {
            raw: rawContent,
            source: Session.getActiveUser().getEmail()
          };
          var options = {
            'method': 'post',
            'contentType': 'application/json',
            'payload': JSON.stringify(payload)
          };
          UrlFetchApp.fetch(webhookUrl, options);
          message.markRead(); // Mark email as read after forwarding
          
        } catch (error) {
          // Log the error to the Apps Script console for debugging
          console.error('Failed to forward email. Error: ' + error.toString());
        }
      }
    }
  }
}