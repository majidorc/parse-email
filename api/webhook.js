const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const { sql } = require('@vercel/postgres');
const configData = require('../config.json');

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
        this.text = textContent.replace(/=\s*\r?\n/g, '').replace(/=3D/g, '=');
    }
    
    _findValue(regex) {
        const match = this.text.match(regex);
        return match?.[1]?.trim() ?? 'N/A';
    }

    extractBookingNumber() {
        return this._findValue(/Order number:\s*(\d+)/);
    }

    extractProgram() {
        const match = this.text.match(/Product Price\s+\*([^\*]+)\*/);
        return match ? match[1].trim() : 'N/A';
    }

    extractTourDate() {
        const match = this.text.match(/Booking #\d+ Paid\s+\*\s+-\s+([A-Za-z]+\s\d{1,2},\s\d{4})/i);
        if (match && match[1]) {
            const date = new Date(match[1]);
            // Format to dd.Mmm 'yy
            return `${date.getDate()}.${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().slice(-2)}`;
        }
        return 'N/A';
    }

    extractPassengers() {
        const pax = { adult: '0', child: '0', infant: '0' };
        const paxMatch = this.text.match(/Adults \(\+\d+\):\s*(\d+)/i);
        if (paxMatch) {
            pax.adult = paxMatch[1];
        }
        return pax;
    }

    _getBillingAddressBlock() {
        const match = this.text.match(/Billing address\s+([\s\S]+?)Congratulations/);
        return match ? match[1].trim().split(/\r?\n/).map(l => l.trim()) : [];
    }

    extractName() {
        return this._getBillingAddressBlock()[0] || 'N/A';
    }

    extractHotel() {
        const lines = this._getBillingAddressBlock();
        // The hotel is likely the line after the name and before "Thailand"
        if (lines.length > 2 && lines[2].toLowerCase() === 'thailand') {
            return lines[1];
        }
        return 'N/A';
    }

    extractPhone() {
        const block = this._getBillingAddressBlock().join('\n');
        const phoneMatch = block.match(/(\+?\d[\d\s-]{5,})/);
        return phoneMatch ? phoneMatch[1].replace(/\D/g, '') : 'N/A';
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
}

class EmailParserFactory {
  static create(parsedEmail) {
    const fromAddress = parsedEmail.from.value[0].address.toLowerCase();
    const subject = parsedEmail.subject.toLowerCase();
    const htmlContent = parsedEmail.html;
    const textContent = parsedEmail.text;

    console.log(`Attempting to find parser for email from: ${fromAddress} with subject: ${subject}`);

    if (fromAddress.includes('bokun.io') && subject.includes('booking')) {
      console.log('Selected BokunParser.');
      return new BokunParser(htmlContent);
    }
    
    if (fromAddress.includes('tours.co.th')) {
        console.log('Selected ThailandToursParser.');
        return new ThailandToursParser(textContent);
    }
    
    console.log('No suitable parser found.');
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawBody = await getRawBody(req);
    if (rawBody.length === 0) {
      console.log('Received request with empty body.');
      return res.status(400).send('Bad Request: Empty body.');
    }
    
    const parsedEmail = await simpleParser(rawBody);
    console.log('Successfully parsed email. Subject:', parsedEmail.subject);
    console.log('Email text content snippet:', parsedEmail.text?.substring(0, 500));

    const parser = EmailParserFactory.create(parsedEmail);

    if (!parser) {
      console.error('Could not find a suitable parser for the email.');
      return res.status(400).send('Email format not supported.');
    }

    const extractedInfo = parser.extractAll();
    console.log('Extracted Info:', JSON.stringify(extractedInfo, null, 2));

    // --- Save to Database ---
    if (extractedInfo && extractedInfo.bookingNumber) {
      try {
        console.log(`Attempting to save booking ${extractedInfo.bookingNumber} to the database...`);
        const adult = parseInt(extractedInfo.adult, 10) || 0;
        const child = parseInt(extractedInfo.child, 10) || 0;
        const infant = parseInt(extractedInfo.infant, 10) || 0;
        let paxString = [
            adult > 0 ? `${adult} Adult${adult > 1 ? 's' : ''}` : null,
            child > 0 ? `${child} Child${child > 1 ? 'ren' : ''}` : null,
            infant > 0 ? `${infant} Infant${infant > 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' , ');
        if (!paxString) paxString = "N/A";

        await sql`
          INSERT INTO bookings (booking_number, tour_date, program, customer_name, pax, hotel, phone_number)
          VALUES (${extractedInfo.bookingNumber}, ${extractedInfo.isoDate}, ${extractedInfo.program}, ${extractedInfo.name}, ${paxString}, ${extractedInfo.hotel}, ${extractedInfo.phoneNumber});
        `;
        console.log(`Successfully saved booking ${extractedInfo.bookingNumber} to the database.`);
      } catch (dbError) {
        console.error(`Database error while saving booking ${extractedInfo.bookingNumber}:`, dbError);
        // We will still try to send a notification, so we don't block the flow.
        // But we won't mark it as complete, so we know it failed to save.
      }
    } else {
      console.log('No valid booking number found, skipping database insert.');
    }

    res.status(200).send('Webhook processed.');

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