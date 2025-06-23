const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const { sql } = require('@vercel/postgres');
const { convert } = require('html-to-text');
const configData = require('../config.json');
const NotificationManager = require('./notificationManager');

async function handleTelegramCallback(callbackQuery, res) {
    const { data, message } = callbackQuery;
    console.log('TELEGRAM CALLBACK DATA:', data);
    if (!data || !message) {
        console.error('Invalid callback query format');
        return res.status(400).send('Invalid callback query format');
    }

    const parts = data.split(':');
    const action = parts[0];
    const buttonType = parts[1];
    const bookingId = parts.slice(2).join(':');

    if (action !== 'toggle' || !['op', 'customer'].includes(buttonType)) {
        console.error('Invalid callback data:', data);
        return res.status(400).send('Invalid callback data');
    }

    try {
        const newKeyboard = JSON.parse(JSON.stringify(message.reply_markup.inline_keyboard));
        let buttonIndex = buttonType === 'op' ? 0 : 1;
        const button = newKeyboard[0][buttonIndex];
        if (button) {
            const isChecked = button.text.endsWith('✓');
            button.text = buttonType.charAt(0).toUpperCase() + buttonType.slice(1) + (isChecked ? ' X' : ' ✓');
            // Update the database
            let column;
            if (buttonType === 'op') column = 'op';
            else if (buttonType === 'customer') column = 'customer';
            else return res.status(400).send('Invalid column');
            console.log(`Preparing to update DB: booking_number=${bookingId} (type: ${typeof bookingId}), column=${column}, value=${!isChecked}`);
            try {
                if (buttonType === 'customer' && !isChecked) {
                    // Only allow setting customer to true if op is true
                    const { rows } = await sql.query('SELECT op FROM bookings WHERE booking_number = $1', [bookingId]);
                    if (!rows.length || !rows[0].op) {
                        // Send error to Telegram with a short message and log the response
                        const popupText = 'OP must be ✓ first.';
                        try {
                            const popupResp = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                                callback_query_id: callbackQuery.id,
                                text: popupText,
                                show_alert: true
                            });
                            console.log('Sent Telegram popup alert:', popupResp.data);
                        } catch (popupErr) {
                            console.error('Error sending Telegram popup alert:', popupErr.response ? popupErr.response.data : popupErr.message);
                        }
                        return res.status(200).send('OP not send yet');
                    }
                }
                const query = `UPDATE bookings SET ${column} = $1 WHERE booking_number = $2`;
                const result = await sql.query(query, [!isChecked, bookingId]);
                console.log('DB update result:', result);
                if (result.rowCount !== undefined) {
                  console.log('Rows affected:', result.rowCount);
                }
            } catch (sqlError) {
                console.error('DB update error:', sqlError);
            }
        } else {
            console.error(`Button at index ${buttonIndex} not found in keyboard.`);
        }

        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
            chat_id: message.chat.id,
            message_id: message.message_id,
            reply_markup: { inline_keyboard: newKeyboard }
        });

        // Send a blank answerCallbackQuery at the end for all other cases
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id
        });

        return res.status(200).send('OK');

    } catch (error) {
        console.error('Callback handler error:', error);
        return res.status(200).send('Error processing callback');
    }
}

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

class BokunParser extends BaseEmailParser {
  constructor(htmlContent) {
    super(htmlContent);
    try {
        const cleanedHtml = htmlContent.replace(/=\s*\r?\n/g, '').replace(/=3D/g, '=');
        this.$ = cheerio.load(cleanedHtml);
    } catch (error) {
        throw new Error('BokunParser failed to load HTML.');
    }
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
  extractSKU() {
    // Product field: e.g., 'HKT0041 - ...'
    const product = this.findValueByLabel('Product');
    const match = product.match(/^([A-Z0-9]+)\s*-/);
    return match ? match[1] : '';
  }
  extractAll() {
    const passengers = this.extractPassengers();
    const tourDate = this.extractTourDate();
    return {
      bookingNumber: this.extractBookingNumber(),
      tourDate: tourDate,
      sku: this.extractSKU(),
      program: this.extractProgram(),
      name: this.extractName(),
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
        this.lines = textContent.split('\n').map(line => line.trim());
    }

    _findLineValue(label) {
        const line = this.lines.find(l => l.toLowerCase().startsWith(label.toLowerCase()));
        return line ? line.substring(label.length).trim() : 'N/A';
    }
    
    extractBookingNumber() {
        return this._findLineValue('ORDER NUMBER:');
    }

    extractProgram() {
        // The program name is the line right before the line with the product code, e.g., "(#HKT0022)"
        const codeIndex = this.lines.findIndex(line => /\(#([A-Z0-9]+)\)/.test(line));
        if (codeIndex > 0) {
            // Check the line immediately before the code; it might be blank.
            const lineBefore = this.lines[codeIndex - 1].trim();
            if (lineBefore) {
                return lineBefore;
            }
            // If the line before was blank, check the one before that.
            if (codeIndex > 1 && this.lines[codeIndex - 2]) {
                return this.lines[codeIndex - 2].trim();
            }
        }
        return 'N/A';
    }

    extractTourDate() {
        // The tour date is on a line like "* June 22, 2025"
        const dateLine = this.lines.find(line => line.trim().startsWith('*') && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line));
        if (dateLine) {
            const dateMatch = dateLine.match(/[A-Za-z]+ \d{1,2}, \d{4}/);
            if (dateMatch) return dateMatch[0];
        }
        return 'N/A';
    }

    extractPassengers() {
        const pax = { adult: '0', child: '0', infant: '0' };
        
        // Find and parse the adult line
        const adultLine = this.lines.find(line => line.toLowerCase().includes('adults'));
        if (adultLine) {
            const adultMatch = adultLine.match(/adults(?: \(.+\))?:\s*(\d+)/i);
            if (adultMatch && adultMatch[1]) {
                pax.adult = adultMatch[1];
            }
        }

        // Find and parse the child line
        const childLine = this.lines.find(line => line.toLowerCase().includes('childs'));
        if (childLine) {
            const childMatch = childLine.match(/childs(?: \(.+\))?:\s*(\d+)/i);
            if (childMatch && childMatch[1]) {
                pax.child = childMatch[1];
            }
        }
        
        return pax;
    }

    extractName() {
        // The customer name is two lines after "BILLING ADDRESS" because of a blank line
        const billingIndex = this.lines.findIndex(line => line.toLowerCase() === 'billing address');
        if (billingIndex !== -1 && this.lines.length > billingIndex + 2) {
            return this.lines[billingIndex + 2].trim();
        }
        return 'N/A';
    }
    
    extractHotel() {
        // The hotel name is three lines after "BILLING ADDRESS"
        const billingIndex = this.lines.findIndex(line => line.toLowerCase() === 'billing address');
        if (billingIndex !== -1 && this.lines.length > billingIndex + 3) {
            const line3 = this.lines[billingIndex + 3].trim();
            const line4 = this.lines.length > billingIndex + 4 ? this.lines[billingIndex + 4].trim() : null;
            
            let hotel = line3;
            if (line4 && !line4.startsWith('+') && !line4.includes('@')) {
                hotel += `, ${line4}`;
            }
            return hotel;
        }
        return 'N/A';
    }

    extractPhone() {
        // The phone number is on a line that starts with a plus, and is inside the address block
        const billingIndex = this.lines.findIndex(line => line.toLowerCase() === 'billing address');
        if (billingIndex !== -1) {
            const addressBlock = this.lines.slice(billingIndex);
            const phoneLine = addressBlock.find(line => line.startsWith('+'));
            return phoneLine ? phoneLine.replace(/\D/g, '') : 'N/A';
        }
        return 'N/A';
    }

    extractSKU() {
        // Find a line with (#CODE) and extract CODE
        const line = this.lines.find(l => /\(#([A-Z0-9]+)\)/.test(l));
        if (line) {
          const match = line.match(/\(#([A-Z0-9]+)\)/);
          return match ? match[1] : '';
        }
        // Fallback: first #CODE in the email
        const hashLine = this.lines.find(l => /#([A-Z0-9]+)/.test(l));
        if (hashLine) {
          const match = hashLine.match(/#([A-Z0-9]+)/);
          return match ? match[1] : '';
        }
        return '';
    }

    extractAll() {
        const passengers = this.extractPassengers();
        const tourDate = this.extractTourDate();
        return {
            bookingNumber: this.extractBookingNumber(),
            tourDate: tourDate,
            sku: this.extractSKU(),
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

        if (extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
            console.error(`Could not extract a valid tour date for booking ${extractedInfo.bookingNumber}. Aborting.`);
        }
        
        return this._formatBaseBookingDetails(extractedInfo);
    }
}

class EmailParserFactory {
  static create(parsedEmail) {
    const { subject, html, text, from } = parsedEmail;
    const fromAddress = from?.value?.[0]?.address?.toLowerCase();

    if (!subject || !subject.toLowerCase().includes('new booking')) {
      return null;
    }

    const content = html || text;
    
    if (fromAddress && fromAddress.includes('bokun.io')) {
      return new BokunParser(content);
    }
    
    if (fromAddress && fromAddress.includes('tours.co.th')) {
        const textContent = cleanupHtml(content);
        return new ThailandToursParser(textContent);
    }
    
    const textContent = cleanupHtml(content);
    return new FallbackParser(textContent);
  }
}

class FallbackParser extends BaseEmailParser {
    constructor(textContent) {
        super(textContent);
        this.lines = textContent.split('\n').map(line => line.trim());
    }

    _findLineValue(label) {
        const line = this.lines.find(l => l.toLowerCase().startsWith(label.toLowerCase()));
        return line ? line.substring(label.length).trim() : 'N/A';
    }
    
    extractBookingNumber() { return this._findLineValue('booking no :'); }
    extractTourDate() { return this._findLineValue('tour date :'); }
    extractProgram() { return this._findLineValue('program :'); }
    extractName() { return this._findLineValue('name :'); }
    extractPassengers() {
      const paxLine = this._findLineValue('pax :');
      const adults = paxLine.match(/(\d+)\s*Adult/i);
      const children = paxLine.match(/(\d+)\s*Child/i);
      const infants = paxLine.match(/(\d+)\s*Infant/i);
      return {
        adult: adults ? adults[1] : '0',
        child: children ? children[1] : '0',
        infant: infants ? infants[1] : '0'
      };
    }
    extractHotel() { return this._findLineValue('hotel :'); }
    extractPhone() { return this._findLineValue('phone number :'); }

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
        return this._formatBaseBookingDetails(this.extractAll());
    }
}

async function handler(req, res) {
    console.log('WEBHOOK REQUEST RECEIVED:', req.method, new Date().toISOString());
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const rawBody = await getRawBody(req);
        let jsonData;
        try {
            jsonData = JSON.parse(rawBody.toString('utf-8'));
        } catch (error) {
            jsonData = null;
        }

        if (jsonData && jsonData.callback_query) {
            return handleTelegramCallback(jsonData.callback_query, res);
        }
        
        const parsedEmail = await simpleParser(rawBody);

        const parser = EmailParserFactory.create(parsedEmail);

        if (!parser) {
            return res.status(200).send('Email skipped: No suitable parser found or subject incorrect.');
        }

        const { responseTemplate, extractedInfo } = parser.formatBookingDetails();

        if (!extractedInfo || extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
            return res.status(200).send('Webhook processed: Skipped due to invalid date.');
        }

        try {
            const { rows: existingBookings } = await sql`
                SELECT id FROM bookings WHERE booking_number = ${extractedInfo.bookingNumber};
            `;

            if (existingBookings.length > 0) {
                return res.status(200).send('Webhook processed: Booking already exists.');
            }

            const adult = parseInt(extractedInfo.adult, 10) || 0;
            const child = parseInt(extractedInfo.child, 10) || 0;
            const infant = parseInt(extractedInfo.infant, 10) || 0;

            const { rows: [newBooking] } = await sql`
                INSERT INTO bookings (booking_number, tour_date, sku, program, customer_name, adult, child, infant, hotel, phone_number, notification_sent, raw_tour_date)
                VALUES (${extractedInfo.bookingNumber}, ${extractedInfo.isoDate}, ${extractedInfo.sku}, ${extractedInfo.program}, ${extractedInfo.name}, ${adult}, ${child}, ${infant}, ${extractedInfo.hotel}, ${extractedInfo.phoneNumber}, FALSE, ${extractedInfo.tourDate})
                RETURNING *;
            `;
            
            return res.status(200).send('Webhook processed: Booking saved.');

        } catch (error) {
            console.error(`Database error while processing booking ${extractedInfo.bookingNumber}:`, error);
            return res.status(500).send({ error: 'Database processing failed.', details: error.message });
        }

    } catch (error) {
        console.error('Error in webhook processing:', error);
        return res.status(500).json({ error: 'Error processing email.', details: error.message });
    }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser; 