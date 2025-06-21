const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const config = require('../config.json');

// Base Parser Class (Interface)
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
    if (adult > 0) {
        parts.push(`${adult} ${adult > 1 ? 'Adults' : 'Adult'}`);
    }
    if (child > 0) {
        parts.push(`${child} ${child > 1 ? 'Children' : 'Child'}`);
    }
    if (infant > 0) {
        parts.push(`${infant} ${infant > 1 ? 'Infants' : 'Infant'}`);
    }

    let paxString = parts.join(' , ');
    if (!paxString) {
      paxString = "0 Adults"; // Fallback if all are 0
    }

    const responseTemplate = `Please confirm the *pickup time* for this booking:

Booking no : ${extractedInfo.bookingNumber}
Tour date : ${extractedInfo.tourDate}
Program : ${extractedInfo.program}
Name : ${extractedInfo.name}
Pax : ${paxString}
Hotel : ${extractedInfo.hotel}
Phone Number : ${extractedInfo.phoneNumber}
Cash on tour : None

Please mentioned if there is any additional charge for transfer collect from customer`;

    return {
      responseTemplate,
      extractedInfo
    };
  }
}

// Notification Manager
class NotificationManager {
  constructor() {
    this.notificationConfig = config.notifications;
  }

  async sendEmail(extractedInfo) {
    if (!this.notificationConfig.email || !this.notificationConfig.email.enabled) {
      console.log('Email notifications are disabled.');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
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
      console.error('Error sending email notification:', error);
    }
  }

  async sendTelegram(extractedInfo) {
    if (!this.notificationConfig.telegram || !this.notificationConfig.telegram.enabled) {
      console.log('Telegram notifications are disabled.');
      return;
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram bot token or chat ID is missing from environment variables.');
      return;
    }
    
    // Telegram's markdown parser is picky, so we escape a few special characters.
    const message = extractedInfo.responseTemplate
        .replace(/\*/g, '\\*') // Escape asterisks
        .replace(/_/g, '\\_'); // Escape underscores

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
      });
      console.log('Telegram notification sent successfully.');
    } catch (error) {
      console.error('Error sending Telegram notification:', error.response ? error.response.data : error.message);
    }
  }

  async sendAll(extractedInfo) {
    await this.sendEmail(extractedInfo);
    await this.sendTelegram(extractedInfo);
  }
}

// Email parser utility for Bokun.io notifications
class BokunParser extends BaseEmailParser {
  constructor(htmlContent) {
    super(htmlContent);
    // Pre-clean the HTML to remove weird encoding artifacts that cheerio might not handle well.
    const cleanedHtml = htmlContent.replace(/=\s*\r?\n/g, '').replace(/=3D/g, '=');
    this.$ = cheerio.load(cleanedHtml);
  }

  findValueByLabel(label) {
    let value = '';
    const self = this;

    this.$('td').each(function () {
      const currentElement = self.$(this);
      
      // Look inside strong tags within the td for an exact match
      const strongTag = currentElement.find('strong');
      if (strongTag.length) {
          const strongText = strongTag.text().trim();
          if (strongText.toLowerCase() === label.toLowerCase()) {
              value = currentElement.next('td').text().trim();
              if (value) {
                return false; // Found it, stop searching
              }
          }
      }
    });

    return value.replace(/\s{2,}/g, ' ').trim();
  }
  
  extractBookingNumber() {
    return this.findValueByLabel('Ext. booking ref');
  }

  extractTourDate() {
    const dateText = this.findValueByLabel('Date');
    // Extract only the date part, remove day of week and time
    // Matches "21 Jun '25" from "Sat 21 Jun '25 @ 09:00"
    const dateMatch = dateText.match(/(\d{1,2}\s[A-Za-z]{3}\s'\d{2})/);
    if (dateMatch && dateMatch[1]) {
        // Format to "21.Jun '25" by replacing only the first space
        return dateMatch[1].replace(' ', '.');
    }
    return 'N/A';
  }

  extractProgram() {
    let programText = this.findValueByLabel('Product');
    // Remove product code and clean up text
    programText = programText.replace(/^[A-Z0-9]+\s*-\s*/, '');
    return programText.replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  extractName() {
    return this.findValueByLabel('Customer');
  }

  extractPassengers() {
    const pax = { adult: '0', child: '0', infant: '0' };
    const paxHeader = this.$('strong').filter((i, el) => this.$(el).text().trim().toLowerCase() === 'pax').first();

    if (paxHeader.length) {
      const paxCell = paxHeader.closest('td').next('td');
      const paxHtml = paxCell.html();

      // Handle multi-line pax info first (Viator style)
      if (paxHtml && paxHtml.includes('<br')) {
        const lines = paxHtml.split(/<br\s*\/?>/i);
        lines.forEach(line => {
          const text = this.$(`<div>${line}</div>`).text().trim();
          if (text) {
            const parts = text.match(/(\d+)\s*(\w+)/);
            if (parts) {
              const quantity = parts[1];
              const type = parts[2].toLowerCase();
              if (type.includes('adult')) {
                pax.adult = quantity;
              } else if (type.includes('child')) {
                pax.child = quantity;
              } else if (type.includes('infant')) {
                pax.infant = quantity;
              }
            }
          }
        });
      } else if (paxCell.find('table').length) { // Handle table format
        paxCell.find('table').find('tr').each((i, row) => {
          const cells = this.$(row).find('td');
          if (cells.length >= 2) {
            const quantity = this.$(cells[0]).text().trim();
            const type = this.$(cells[1]).text().trim().toLowerCase();
            if (type.includes('adult')) {
              pax.adult = quantity;
            } else if (type.includes('child')) {
              pax.child = quantity;
            } else if (type.includes('infant')) {
              pax.infant = quantity;
            }
          }
        });
      } else { // Handle simple text like "4 Adult"
        const simpleText = paxCell.text().trim();
        const match = simpleText.match(/(\d+)\s*Adult/i);
        if (match) {
          pax.adult = match[1];
        }
      }
    }
    return pax;
  }

  extractHotel() {
    let hotelText = this.findValueByLabel('Pick-up');
    return hotelText.replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  extractPhone() {
    const phoneText = this.findValueByLabel('Customer phone');
    return phoneText.replace(/\D/g, '');
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

  formatBookingDetails() {
    const extractedInfo = this.extractAll();
    return this._formatBaseBookingDetails(extractedInfo);
  }
}

class ThailandToursParser extends BaseEmailParser {
    constructor(textContent) {
        super(textContent);
        this.text = textContent;
    }

    _findValue(regex) {
        const match = this.text.match(regex);
        return match && match[1] ? match[1].trim() : 'N/A';
    }

    extractBookingNumber() {
        return this._findValue(/Order number:\s*(\w+)/);
    }
    
    extractProgram() {
        const productMatch = this.text.match(/Product\s+Price\s+([\s\S]+?)\s+Booking/);
        if (productMatch && productMatch[1]) {
            // Take only the first line as the product name
            return productMatch[1].trim().split(/\r?\n/)[0].trim();
        }
        return 'N/A';
    }

    extractTourDate() {
        // Find date under "Booking #... Paid"
        const bookingBlockMatch = this.text.match(/Booking #\d+ Paid\s+-\s*([A-Z]+\s\d{1,2},\s\d{4})/i);
        if (bookingBlockMatch && bookingBlockMatch[1]) {
            const dateStr = bookingBlockMatch[1];
            const date = new Date(dateStr);
            // Format to dd.Mmm 'yy
            return `${date.getDate()}.${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().substr(-2)}`;
        }

        // Fallback to original method if new one fails
        const dateStr = this._findValue(/Order date:\s*(.+)/);
        if (dateStr === 'N/A') return 'N/A';
        const date = new Date(dateStr);
        return `${date.getDate()}.${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().substr(-2)}`;
    }

    extractPassengers() {
        const pax = { adult: '0', child: '0', infant: '0' };

        // Try "Adults (+6): 1" format
        let paxMatch = this.text.match(/Adults\s\(\+\d+\):\s*(\d+)/i);
        if (paxMatch && paxMatch[1]) {
            pax.adult = paxMatch[1];
            return pax;
        }

        // Try "Person: 7" format
        paxMatch = this.text.match(/Person:\s*(\d+)/i);
        if (paxMatch && paxMatch[1]) {
            pax.adult = paxMatch[1];
            return pax;
        }

        // Fallback to "Adults (+1)" format
        paxMatch = this.text.match(/Adults\s\(\+(\d+)\)/);
        if (paxMatch && paxMatch[1]) {
            pax.adult = paxMatch[1];
        }
        return pax;
    }

    _getBillingAddressLines() {
        const addressBlockMatch = this.text.match(/Billing address\s+([\s\S]+?)Congratulations/);
        if (addressBlockMatch && addressBlockMatch[1]) {
            return addressBlockMatch[1].trim().split(/\r?\n/).map(l => l.trim());
        }
        return [];
    }

    extractName() {
        const lines = this._getBillingAddressLines();
        return lines.length > 0 ? lines[0] : 'N/A';
    }

    extractHotel() {
        const lines = this._getBillingAddressLines();
        if (lines.length > 1) {
            // Take all lines except the first (name)
            const addressLines = lines.slice(1);
            // Filter out lines that are emails or phone numbers
            const filteredLines = addressLines.filter(line => {
                const isEmail = line.includes('@');
                const isPhone = /^\+?\d[\d\s-]{5,}/.test(line); // Simple check for a phone-like pattern
                return !isEmail && !isPhone;
            });
            return filteredLines.join(', ');
        }
        return 'N/A';
    }

    extractPhone() {
        const lines = this._getBillingAddressLines();
        if (lines.length > 0) {
            const phoneLine = lines.find(line => /^\+?\d[\d\s-]{5,}/.test(line));
            if (phoneLine) {
                return phoneLine.replace(/\D/g, '');
            }
        }
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

    formatBookingDetails() {
        const extractedInfo = this.extractAll();
        return this._formatBaseBookingDetails(extractedInfo);
    }
}

class EmailParserFactory {
  static create(fromAddress, subject, content) {
    const parsers = {
        BokunParser,
        ThailandToursParser
    };

    for (const rule of config) {
        if (fromAddress === rule.fromAddress) {
            const ParserClass = parsers[rule.parserName];
            if (ParserClass) {
                 // Additional check for ThailandToursParser which relies on text content
                if (rule.parserName === 'ThailandToursParser') {
                    const textContent = cheerio.load(content).text();
                     if (textContent.includes('Order number:')) {
                        return new ParserClass(textContent);
                    }
                } else {
                    return new ParserClass(content);
                }
            }
        }
    }
    
    // Fallback for original Thailand Tours subject-based logic if needed
    if (subject && subject.toLowerCase().includes('new booking')) {
        const textContent = cheerio.load(content).text();
        if (textContent.includes('Order number:')) {
             return new ThailandToursParser(textContent);
        }
    }

    return null;
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
    const emailContent = req.body.toString();
    const parsedEmail = await simpleParser(emailContent);

    const fromAddress = parsedEmail.from.value[0].address;
    const subject = parsedEmail.subject;
    const contentToParse = parsedEmail.html || parsedEmail.textAsHtml || parsedEmail.text || '';

    const parser = EmailParserFactory.create(fromAddress, subject, contentToParse);
    
    if (!parser) {
        let reason = `No suitable parser found for email from ${fromAddress} with subject "${subject}" based on config.`;
        console.log(`Email ignored - ${reason}`);
        return res.status(200).send(`Email ignored: ${reason}`);
    }

    const extractedInfo = parser.formatBookingDetails();
    
    const notificationManager = new NotificationManager();
    await notificationManager.sendAll(extractedInfo);

    console.log('All notifications processed.');
    return res.status(200).send('Notifications processed.');
  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).send('Error processing email.');
  }
};

module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser; 