const axios = require('axios');

// This is a full, valid email content string for testing.
// NOTE: We manually construct the raw email format that `simpleParser` expects.
const testEmailContent = `
MIME-Version: 1.0
From: "Bókun Notifications" <no-reply@bokun.io>
Subject: New booking: Sat 21 Jun '25 @ 09:00 (TT-T99002050) Ext. booking ref: GYGVN3W8ZKMV
Content-Type: text/html; charset=UTF-8

<!DOCTYPE html><html><body>
<div style="font-size: 14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">The following booking was just created.</div>
<table style="border-collapse: collapse;width: auto;display: inline-block;border: 1px solid black;">
    <tbody>
        <tr><td><strong>Ext. booking ref</strong></td><td>GYGVN3W8ZKMV</td></tr>
        <tr><td><strong>Product</strong></td><td>194613P46 - Koh Samui Private Longtail Boat To Koh Tan, Koh Madsum and Koh Rap</td></tr>
        <tr><td><strong>Customer</strong></td><td>Teng, Joel</td></tr>
        <tr><td><strong>Customer phone</strong></td><td>+6583333918</td></tr>
        <tr><td><strong>Date</strong></td><td>Sat 21 Jun '25 @ 09:00</td></tr>
        <tr><td><strong>PAX</strong></td><td>4 Adult</td></tr>
        <tr><td><strong>Pick-up</strong></td><td>Rocky's Boutique Resort - Veranda Collection Samui, 438, T. 1, Tambon Maret, Amphoe Ko Samui, Chang Wat Surat Thani 84310, Thailand</td></tr>
    </tbody>
</table>
</body></html>
`;

async function sendTestNotification() {
  const webhookUrl = process.argv[2];

  if (!webhookUrl) {
    console.error('ERROR: Please provide your full Vercel webhook URL as an argument.');
    console.log('\nExample:');
    console.log('node send-test-notification.js https://your-project-name.vercel.app/api/webhook');
    return;
  }

  console.log(`Sending test notification to: ${webhookUrl}`);

  try {
    const response = await axios.post(webhookUrl, testEmailContent, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    console.log('\n---- Test Notification Sent Successfully ----');
    console.log(`Status: ${response.status}`);
    console.log(`Response Data: ${response.data}`);

  } catch (error) {
    console.error('\n---- Error Sending Test Notification ----');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

sendTestNotification(); 