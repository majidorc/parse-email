const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const { sql } = require('@vercel/postgres');
const { convert } = require('html-to-text');
const configData = require('../config.json');

// Utility function to clean HTML and extract text content
function cleanupHtml(html) {
    if (!html) return '';
    return convert(html, {
        wordwrap: false,
        selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
        ]
    });
}

// All classes and managers removed for this test.
// Hardcoding the BokunParser logic directly in the handler.

// Helper to read the raw request body from the stream
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

class BaseEmailParser {
  constructor(content) {
    this.content = content;
  }
  extractAll() { throw new Error("Not implemented"); }
  formatBookingDetails() { throw new Error("Not implemented"); }
  _formatBaseBookingDetails(extractedInfo) {
    const adult = parseInt(extractedInfo.adult, 10) || 0;
    const child = parseInt(extractedInfo.child, 10) || 0;
    const infant = parseInt(extractedInfo.infant, 10) || 0;
    const parts = [];
    if (adult > 0) parts.push(`${adult} ${adult > 1 ? 'Adults' : 'Adult'}`);
    if (child > 0) parts.push(`${child} ${child > 1 ? 'Children' : 'Child'}`);
    if (infant > 0) parts.push(`${infant} ${infant > 1 ? 'Infants' : 'Infant'}`);
    let paxString = parts.join(' , ');
    if (!paxString) paxString = "0 Adults";
    const responseTemplate = `Please confirm the *pickup time* for this booking:\n\nBooking no : ${extractedInfo.bookingNumber}\nTour date : ${extractedInfo.tourDate}\nProgram : ${extractedInfo.program}\nName : ${extractedInfo.name}\nPax : ${paxString}\nHotel : ${extractedInfo.hotel}\nPhone Number : ${extractedInfo.phoneNumber}\nCash on tour : None\n\nPlease mentioned if there is any additional charge for transfer collect from customer`;
    return { responseTemplate, extractedInfo };
  }

  // New method to convert parsed date to YYYY-MM-DD format for DB
  _getISODate(dateString) {
      if (!dateString || dateString === 'N/A') return null;

      // Handle "dd.Mmm 'yy" format (e.g., 21.Jun '25)
      const dotMatch = dateString.match(/(\d{1,2})\.([A-Za-z]{3})\s'(\d{2})/);
      if (dotMatch) {
          const day = dotMatch[1];
          const month = dotMatch[2];
          const year = `20${dotMatch[3]}`;
          // new Date() can parse "21 Jun 2025"
          return new Date(`${day} ${month} ${year}`).toISOString().split('T')[0];
      }

      // Handle "Month Day, Year" format (e.g., May 6, 2026)
      const commaMatch = new Date(dateString);
      if (!isNaN(commaMatch.getTime())) {
          return commaMatch.toISOString().split('T')[0];
      }
      
      return null;
  }
}

class NotificationManager {
  constructor() {
    this.notificationConfig = configData.notifications;
  }
  async sendEmail(extractedInfo) {
    if (!this.notificationConfig.email?.enabled) {
      console.log('Email notifications are disabled.');
      return;
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: 'o0dr.orc0o@gmail.com',
      subject: `Booking Confirmation - ${extractedInfo.extractedInfo.bookingNumber}`,
      text: extractedInfo.responseTemplate,
      html: extractedInfo.responseTemplate.replace(/\n/g, '<br>'),
    };
    try {
      await transporter.sendMail(mailOptions);
      console.log('Email notification sent successfully.');
    } catch (error) {
      console.error('Error sending email notification:', error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
  async sendTelegram(extractedInfo) {
    if (!this.notificationConfig.telegram?.enabled) {
      console.log('Telegram notifications are disabled.');
      return;
    }
    const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_CHAT_ID: chatId } = process.env;
    if (!botToken || !chatId) {
      console.error('Telegram bot token or chat ID is missing from environment variables.');
      return;
    }
    
    // To make the text easy to copy, we'll format it as a code block.
    // The text inside the block doesn't need markdown escaping.
    const plainTextForCopy = extractedInfo.responseTemplate.replace(/\*/g, ''); // Remove our own markdown
    
    const message = "Please confirm the pickup time for this booking\\. Details to copy are below:\n\n" +
                    "```\n" +
                    plainTextForCopy +
                    "\n```";

    const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2'
    };

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      await axios.post(url, payload);
      console.log('Telegram notification sent successfully.');
    } catch (error) {
      const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error('Error sending Telegram notification:', errorMessage);
      throw new Error(`Failed to send Telegram: ${errorMessage}`);
    }
  }
  async sendAll(extractedInfo) {
    await this.sendEmail(extractedInfo);
    await this.sendTelegram(extractedInfo);
  }
}

class BokunParser extends BaseEmailParser {
  constructor(htmlContent) {
    super(htmlContent);
    const cleanedHtml = htmlContent.replace(/=\s*\r?\n/g, '').replace(/=3D/g, '=');
    this.$ = cheerio.load(cleanedHtml);
  }
  findValueByLabel(label) {
    let value = '';
    this.$('td').each((i, el) => {
      const strongText = this.$(el).find('strong').text().trim();
      if (strongText.toLowerCase() === label.toLowerCase()) {
        value = this.$(el).next('td').text().trim();
        if (value) return false;
      }
    });
    return value.replace(/\s{2,}/g, ' ').trim();
  }
  extractBookingNumber() { return this.findValueByLabel('Ext. booking ref'); }
  extractTourDate() {
    const dateText = this.findValueByLabel('Date');
    // More robust regex: handles optional day of week, and space or period after the day number.
    const dateMatch = dateText.match(/(\d{1,2})[\.\s]([A-Za-z]{3}\s'\d{2})/);
    if (dateMatch && dateMatch[1] && dateMatch[2]) {
        // Reconstruct to "DD.Mmm 'YY" format for consistency.
        return `${dateMatch[1]}.${dateMatch[2]}`;
    }
    return 'N/A';
  }
  extractProgram() {
    return this.findValueByLabel('Product').replace(/^[A-Z0-9]+\s*-\s*/, '').replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  extractName() { return this.findValueByLabel('Customer'); }
  extractPassengers() {
    const pax = { adult: '0', child: '0', infant: '0' };
    const paxCell = this.$('strong').filter((i, el) => this.$(el).text().trim().toLowerCase() === 'pax').first().closest('td').next('td');
    const paxHtml = paxCell.html();
    if (paxHtml?.includes('<br')) {
      paxHtml.split(/<br\s*\/?>/i).forEach(line => {
        const parts = this.$(`<div>${line}</div>`).text().trim().match(/(\d+)\s*(\w+)/);
        if (parts) {
          if (parts[2].toLowerCase().includes('adult')) pax.adult = parts[1];
          else if (parts[2].toLowerCase().includes('child')) pax.child = parts[1];
          else if (parts[2].toLowerCase().includes('infant')) pax.infant = parts[1];
        }
      });
    } else if (paxCell.find('table').length) {
      paxCell.find('tr').each((i, row) => {
        const cells = this.$(row).find('td');
        if (cells.length >= 2) {
          const type = this.$(cells[1]).text().trim().toLowerCase();
          if (type.includes('adult')) pax.adult = this.$(cells[0]).text().trim();
          else if (type.includes('child')) pax.child = this.$(cells[0]).text().trim();
          else if (type.includes('infant')) pax.infant = this.$(cells[0]).text().trim();
        }
      });
    } else {
      const match = paxCell.text().trim().match(/(\d+)\s*Adult/i);
      if (match) pax.adult = match[1];
    }
    return pax;
  }
  extractHotel() { return this.findValueByLabel('Pick-up').replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  extractPhone() { return this.findValueByLabel('Customer phone').replace(/\D/g, ''); }
  extractAll() {
    const passengers = this.extractPassengers();
    const tourDate = this.extractTourDate();
    return {
      bookingNumber: this.extractBookingNumber(), tourDate: tourDate,
      program: this.extractProgram(), name: this.extractName(),
      adult: passengers.adult, child: passengers.child, infant: passengers.infant,
      hotel: this.extractHotel(), phoneNumber: this.extractPhone(),
      isoDate: this._getISODate(tourDate)
    };
  }
  formatBookingDetails() {
    return this._formatBaseBookingDetails(this.extractAll());
  }
}

class ThailandToursParser extends BaseEmailParser {
    constructor(textContent) {
        super(textContent);
        this.lines = textContent.split('\\n').map(line => line.trim());
    }

    _findLineValue(label) {
        const line = this.lines.find(l => l.toLowerCase().startsWith(label.toLowerCase()));
        return line ? line.substring(label.length).trim() : 'N/A';
    }
    
    extractBookingNumber() {
        return this._findLineValue('Order number:');
    }

    extractProgram() {
        // Find the line containing a product code like (#...some code...)
        const programLine = this.lines.find(line => /\\(#[A-Z0-9]+\\)/.test(line));
        return programLine ? programLine.trim() : 'N/A';
    }

    extractTourDate() {
        // The date is on a line like "Order date: June 21, 2025"
        return this._findLineValue('Order date:');
    }

    extractPassengers() {
        const pax = { adult: '0', child: '0', infant: '0' };
        const adultLine = this.lines.find(line => line.toLowerCase().includes('adults'));
        if (adultLine) {
            const match = adultLine.match(/(\\d+)/);
            if (match) pax.adult = match[1];
        }
        return pax;
    }

    extractName() {
        // Name is usually the first line under "Billing address"
        const billingIndex = this.lines.findIndex(line => line.toLowerCase().startsWith('billing address'));
        if (billingIndex !== -1 && this.lines[billingIndex + 1]) {
            return this.lines[billingIndex + 1].trim();
        }
        return 'N/A';
    }
    
    extractHotel() {
        // Hotel is usually the second line under "Billing address"
        const billingIndex = this.lines.findIndex(line => line.toLowerCase().startsWith('billing address'));
        if (billingIndex !== -1 && this.lines[billingIndex + 2]) {
            // Check if it's not the phone/email line
            if (!this.lines[billingIndex + 2].includes('@') && !/\\+\\d+/.test(this.lines[billingIndex + 2])) {
                 return this.lines[billingIndex + 2].trim();
            }
        }
        return 'N/A';
    }

    extractPhone() {
        const phoneLine = this.lines.find(line => /\\+\\d+/.test(line));
        return phoneLine ? phoneLine.replace(/\\D/g, '') : 'N/A';
    }

    extractAll() {
        const passengers = this.extractPassengers();
        const tourDate = this.extractTourDate();
        return {
            bookingNumber: this.extractBookingNumber(),
            tourDate: tourDate,
            program: this.extractProgram(),
            name: this.extractName(),
            adult: passengers.adult,
            child: passengers.child,
            infant: passengers.infant,
            hotel: this.extractHotel(),
            phoneNumber: this.extractPhone(),
            isoDate: this._getISODate(tourDate)
        };
    }

    formatBookingDetails() {
        const extractedInfo = this.extractAll();

        // Final validation to ensure a date was actually found
        if (extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
            throw new Error(`Could not extract a valid tour date for booking ${extractedInfo.bookingNumber}. Aborting.`);
        }
        
        return this._formatBaseBookingDetails(extractedInfo);
    }
}

class EmailParserFactory {
  static create(parsedEmail) {
    const { subject, html, text, from } = parsedEmail;
    const fromAddress = from?.value?.[0]?.address?.toLowerCase();

    console.log(`--- New Email Received for Parsing ---`);
    console.log(`Subject: "${subject}"`);
    console.log(`From: ${fromAddress}`);

    // Filter out emails that are not new booking notifications
    if (!subject || !subject.toLowerCase().includes('new booking')) {
      console.log('Email subject does not indicate a new booking. Skipping.');
      return null;
    }

    // Give preference to HTML content if it exists, otherwise use plain text.
    const content = html || text;
    
    console.log(`Attempting to find parser for email from: ${fromAddress}`);

    if (fromAddress && fromAddress.includes('bokun.io')) {
      console.log('Selected BokunParser.');
      // BokunParser is designed to handle the full HTML
      return new BokunParser(content);
    }
    
    if (fromAddress && fromAddress.includes('tours.co.th')) {
        console.log('Selected ThailandToursParser.');
        // This parser expects cleaned text
        const textContent = cleanupHtml(content);
        console.log('--- Cleaned Email Body for ThailandToursParser ---');
        console.log(textContent);
        console.log('--------------------------------------------------');
        return new ThailandToursParser(textContent);
    }
    
    // If sender is not recognized, use the general-purpose parser
    console.log("Using Fallback Text Parser as sender was not recognized.");
    const textContent = cleanupHtml(content);
    return new FallbackParser(textContent);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('Webhook invoked.');

    const rawBody = await getRawBody(req);
    const parsedEmail = await simpleParser(rawBody);

    const parser = EmailParserFactory.create(parsedEmail);

    if (!parser) {
        console.log('No suitable parser found or email did not meet criteria. Skipping.');
        return res.status(200).send('Email skipped: No suitable parser found or subject incorrect.');
    }

    const { responseTemplate, extractedInfo } = parser.formatBookingDetails();
    console.log('Extracted Info:', JSON.stringify(extractedInfo, null, 2));

    // Explicitly check for a valid tour date before attempting to save.
    if (!extractedInfo || extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
        console.log(`Skipping database insertion for booking ${extractedInfo.bookingNumber} due to missing or invalid tour date.`);
    } else {
        console.log(`Attempting to save booking ${extractedInfo.bookingNumber} to the database...`);
        try {
            await sql`
              INSERT INTO bookings (booking_number, tour_date, program, customer_name, pax, hotel, phone_number, notification_sent, iso_date)
              VALUES (${extractedInfo.bookingNumber}, ${extractedInfo.tourDate}, ${extractedInfo.program}, ${extractedInfo.name}, ${extractedInfo.pax}, ${extractedInfo.hotel}, ${extractedInfo.phoneNumber}, FALSE, ${extractedInfo.isoDate});
            `;
            console.log(`Booking ${extractedInfo.bookingNumber} saved successfully.`);
        } catch (error) {
            console.error(`Database error while saving booking ${extractedInfo.bookingNumber}:`, error);
            // Return a 500 error but don't re-throw, so the email forwarder doesn't retry
            return res.status(500).send('Database insertion failed.');
        }
    }

    // Only send a response if a valid booking was processed
    if (responseTemplate && responseTemplate !== 'Skipping: Missing Tour Date') {
        res.status(200).send('Webhook processed.');
    } else {
        res.status(200).send('Webhook processed.');
    }

  } catch (error) {
    console.error('Error in webhook processing:', error);
    return res.status(500).json({ error: 'Error processing email.', details: error.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser;

async function sendDailyReminders() {
  const notificationManager = new NotificationManager();
  const todayInAsia = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  console.log(`Running daily reminder job for date: ${todayInAsia}`);

  try {
    const { rows: bookings } = await sql`
      SELECT * FROM bookings 
      WHERE DATE(tour_date AT TIME ZONE 'Asia/Bangkok') = ${todayInAsia}
      AND notification_sent = FALSE;
    `;

    if (bookings.length === 0) {
      console.log('No bookings found for today that need a reminder.');
      return;
    }

    for (const booking of bookings) {
      const extractedInfo = {
        bookingNumber: booking.booking_number,
        tourDate: booking.tour_date,
        program: booking.program,
        name: booking.customer_name,
        adult: booking.adult,
        child: booking.child,
        infant: booking.infant,
        hotel: booking.hotel,
        phoneNumber: booking.phone_number,
        isoDate: booking.tour_date
      };

      await notificationManager.sendAll(extractedInfo);

      // Mark the booking as notified
      await sql`
        UPDATE bookings
        SET notification_sent = TRUE
        WHERE booking_number = ${booking.booking_number};
      `;
    }

    console.log('All reminders sent successfully.');
  } catch (error) {
    console.error('Error in sendDailyReminders:', error);
  }
} 