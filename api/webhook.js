const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

// Email parser utility
class EmailParser {
  constructor(emailContent) {
    this.content = emailContent;
  }

  // Extract booking number
  extractBookingNumber() {
    const patterns = [
      /booking\s*(?:no|number|#)?\s*:?\s*([A-Z0-9\-]{3,})/i,
      /booking\s*([A-Z0-9\-]{3,})/i,
      /confirmation\s*(?:no|number|#)?\s*:?\s*([A-Z0-9\-]{3,})/i,
      /(?:booking|confirmation)\s*(?:id|reference)?\s*:?\s*([A-Z0-9\-]{3,})/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1];
    }
    return 'N/A';
  }

  // Extract tour date
  extractTourDate() {
    const patterns = [
      /tour\s*date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1];
    }
    return 'N/A';
  }

  // Extract program/tour name
  extractProgram() {
    const patterns = [
      /program\s*:?\s*([^\n\r]+)/i,
      /tour\s*:?\s*([^\n\r]+)/i,
      /package\s*:?\s*([^\n\r]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1].trim();
    }
    return 'N/A';
  }

  // Extract customer name
  extractName() {
    const patterns = [
      /name\s*:?\s*([^\n\r]+)/i,
      /customer\s*name\s*:?\s*([^\n\r]+)/i,
      /guest\s*name\s*:?\s*([^\n\r]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1].trim();
    }
    return 'N/A';
  }

  // Extract passenger counts
  extractPassengers() {
    const adultMatch = this.content.match(/(\d+)\s*adult/i);
    const childMatch = this.content.match(/(\d+)\s*child/i);
    const infantMatch = this.content.match(/(\d+)\s*infant/i);
    
    return {
      adult: adultMatch ? adultMatch[1] : '0',
      child: childMatch ? childMatch[1] : '0',
      infant: infantMatch ? infantMatch[1] : '0'
    };
  }

  // Extract hotel information
  extractHotel() {
    const patterns = [
      /hotel\s*:?\s*([^\n\r]+)/i,
      /accommodation\s*:?\s*([^\n\r]+)/i,
      /pickup\s*from\s*:?\s*([^\n\r]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1].trim();
    }
    return 'N/A';
  }

  // Extract phone number
  extractPhone() {
    const patterns = [
      /phone\s*(?:number)?\s*:?\s*([+\d\s\-\(\)]+)/i,
      /contact\s*(?:number)?\s*:?\s*([+\d\s\-\(\)]+)/i,
      /tel\s*:?\s*([+\d\s\-\(\)]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = this.content.match(pattern);
      if (match) return match[1].trim();
    }
    return 'N/A';
  }

  // Extract all information
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
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendResponse(toEmail, extractedInfo) {
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
      to: toEmail,
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
    
    // Check if sender is allowed
    const allowedSenders = process.env.ALLOWED_SENDERS?.split(',').map(s => s.trim()) || [];
    const senderEmail = parsed.from?.value?.[0]?.address;
    
    if (allowedSenders.length > 0 && !allowedSenders.includes(senderEmail)) {
      return res.status(403).json({ error: 'Sender not authorized' });
    }

    // Extract information from email
    const emailParser = new EmailParser(parsed.text || parsed.html || '');
    const extractedInfo = emailParser.extractAll();

    // Send automated response
    const emailSender = new EmailSender();
    const responseSent = await emailSender.sendResponse(senderEmail, extractedInfo);

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