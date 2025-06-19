const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

// Email parser utility for Bokun.io notifications
class EmailParser {
  constructor(emailContent) {
    this.content = emailContent;
  }

  extractBookingNumber() {
    // Get external booking reference
    const extMatch = this.content.match(/Ext\.\s*booking\s*ref\s*(\d+)/i);
    if (extMatch) return extMatch[1];
    return 'N/A';
  }

  extractTourDate() {
    // First try to get date from subject
    const subjectMatch = this.content.match(/Subject:.*?(\d{1,2}\.?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'\d{2})/i);
    if (subjectMatch) {
      return subjectMatch[1].trim();
    }

    // Then try to get from Date field
    const dateMatch = this.content.match(/Date\s*(\d{1,2}\.?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'\d{2})/i);
    if (dateMatch) {
      return dateMatch[1].trim();
    }
    return 'N/A';
  }

  extractProgram() {
    const productMatch = this.content.match(/Product\s+[A-Z0-9]+\s*-\s*([^\n]+)/i);
    if (productMatch) {
      return productMatch[1].trim();
    }
    return 'N/A';
  }

  extractName() {
    const customerMatch = this.content.match(/Customer\s*([^\n]+)/i);
    if (customerMatch) return customerMatch[1].trim();
    return 'N/A';
  }

  extractPassengers() {
    const paxMatch = this.content.match(/PAX\s*([^\n]+)/i);
    if (paxMatch) {
      const paxText = paxMatch[1].toLowerCase();
      const adultMatch = paxText.match(/(\d+)\s*adult/i);
      return {
        adult: adultMatch ? adultMatch[1] : '0',
        child: '0',
        infant: '0'
      };
    }
    return { adult: '0', child: '0', infant: '0' };
  }

  extractHotel() {
    const pickupMatch = this.content.match(/Pick-up\s+([^\n]+)/i);
    if (pickupMatch) return pickupMatch[1].trim();
    return 'N/A';
  }

  extractPhone() {
    const phoneMatch = this.content.match(/Customer phone\s*([^\n]+)/i);
    if (phoneMatch) return phoneMatch[1].trim();
    return 'N/A';
  }

  extractAll() {
    const passengers = this.extractPassengers();
    return {
      bookingNumber: this.extractBookingNumber(),
      tourDate: this.extractTourDate(),
      program: this.extractProgram(),
      name: this.extractName(),
      adult: passengers.adult,
      child: passengers.child,
      infant: passengers.infant,
      hotel: this.extractHotel(),
      phoneNumber: this.extractPhone()
    };
  }
}

// Email sender utility
class EmailSender {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendResponse(extractedInfo) {
    const responseTemplate = `Please confirm the *pickup time* for this booking:

Booking no : ${extractedInfo.bookingNumber}
Tour date : ${extractedInfo.tourDate}
Program : ${extractedInfo.program}
Name : ${extractedInfo.name}
Pax : ${extractedInfo.adult} adult , ${extractedInfo.child} child , ${extractedInfo.infant} infant
Hotel : ${extractedInfo.hotel}
Phone Number : ${extractedInfo.phoneNumber}
Cash on tour : None

Please mentioned if there is any additional charge for transfer collect from customer`;

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: 'o0dr.orc0o@gmail.com', // Your email address
      subject: `Booking Confirmation - ${extractedInfo.bookingNumber}`,
      text: responseTemplate,
      html: responseTemplate.replace(/\n/g, '<br>')
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

// Main webhook handler
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email content is required' });
    }

    // Parse the email content
    const parsed = await simpleParser(email);
    
    // Check if sender is Bokun.io
    const senderEmail = parsed.from?.value?.[0]?.address;
    if (senderEmail !== 'no-reply@bokun.io') {
      return res.status(403).json({ error: 'Unauthorized sender' });
    }

    // Extract information from email
    const emailParser = new EmailParser(parsed.text || parsed.html || '');
    const extractedInfo = emailParser.extractAll();

    // Send automated response
    const emailSender = new EmailSender();
    const responseSent = await emailSender.sendResponse(extractedInfo);

    if (responseSent) {
      return res.status(200).json({
        success: true,
        message: 'Automated response sent successfully',
        extractedInfo
      });
    } else {
      return res.status(500).json({
        error: 'Failed to send automated response'
      });
    }

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}; 