const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const config = require('../config.json');

// Base Parser Class (Interface)
class BaseEmailParser {
  constructor(content) {
    this.content = content;
  }

  extractAll() { throw new Error("Not implemented"); }
  formatBookingDetails() { throw new Error("Not implemented"); }

  _formatBaseBookingDetails(extractedInfo) {
    let paxString = `${extractedInfo.adult} adult`;
    if (extractedInfo.child && extractedInfo.child !== '0') {
      paxString += ` , ${extractedInfo.child} child`;
    }
    if (extractedInfo.infant && extractedInfo.infant !== '0') {
      paxString += ` , ${extractedInfo.infant} infant`;
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
        return productMatch && productMatch[1] ? productMatch[1].replace(/\s+/g, ' ').trim() : 'N/A';
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
        const paxMatch = this.text.match(/Adults\s\(\+(\d+)\)/);
        if (paxMatch) {
            pax.adult = paxMatch[1];
        }
        return pax;
    }
    
    extractName() {
        const addressBlockMatch = this.text.match(/Billing address\s+([\s\S]+?)Congratulations/);
        if (addressBlockMatch) {
            const lines = addressBlockMatch[1].trim().split(/\r?\n/);
            return lines[0].trim();
        }
        return 'N/A';
    }

    extractHotel() {
        const addressBlockMatch = this.text.match(/Billing address\s+([\s\S]+?)Congratulations/);
        if (addressBlockMatch) {
            const lines = addressBlockMatch[1].trim().split(/\r?\n/);
            // Join all lines except the first (name) and last (email)
            return lines.slice(1, -1).join(', ').trim();
        }
        return 'N/A';
    }
    
    extractPhone() {
        const addressBlockMatch = this.text.match(/Billing address\s+([\s\S]+?)Congratulations/);
        if (addressBlockMatch) {
            const phoneMatch = addressBlockMatch[1].match(/\+?\d+/g);
            if (phoneMatch) {
                // Find the longest number, which is likely the phone number
                return phoneMatch.reduce((a, b) => a.length > b.length ? a : b).replace(/\D/g, '');
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
    const responseTemplate = extractedInfo.responseTemplate;

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: 'o0dr.orc0o@gmail.com', // Your email address
      subject: `Booking Confirmation - ${extractedInfo.extractedInfo.bookingNumber}`,
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

    const emailSender = new EmailSender();
    const responseSent = await emailSender.sendResponse(extractedInfo);

    if (responseSent) {
      console.log('Automated response sent successfully.');
      return res.status(200).send('Automated response sent successfully.');
    } else {
      console.error('Error sending email:');
      return res.status(500).send('Error sending email.');
    }

  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).send('Error processing email.');
  }
};

module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser; 