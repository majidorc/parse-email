 const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const { sql } = require('@vercel/postgres');
const { convert } = require('html-to-text');
const configData = require('../config.json');
const NotificationManager = require('../notificationManager');

async function handleTelegramCallback(callbackQuery, res) {
    const { data, message } = callbackQuery;

    if (!data || !message) {
        console.error('Invalid callback query format');
        return res.status(400).send('Invalid callback query format');
    }

    const parts = data.split(':');
    const action = parts[0];
    const buttonType = parts[1];
    const bookingId = parts.slice(2).join(':');



    // Accept op, ri, customer, parkfee, transfer
    if (action !== 'toggle' || !['op', 'ri', 'customer', 'parkfee', 'transfer'].includes(buttonType)) {
        console.error('Invalid callback data:', data);
        return res.status(400).send('Invalid callback data');
    }

    try {
        // Fetch the latest booking state
        const { rows } = await sql.query('SELECT * FROM bookings WHERE booking_number = $1', [bookingId]);
        if (!rows.length) {
            console.error('Booking not found for callback:', bookingId);
            return res.status(404).send('Booking not found');
        }
        const booking = rows[0];
    
        let update = {};
        if (buttonType === 'op') {
            update.op = !booking.op;
            // If OP is turned off, also turn off Customer
            if (!update.op) update.customer = false;

        } else if (buttonType === 'ri') {
            update.ri = !booking.ri;

        } else if (buttonType === 'customer') {
                // Only allow setting customer to true if op is true
            if (!booking.op) {
                    // Send error to Telegram with a short message and log the response
                    const popupText = 'OP must be ✓ first.';
                    try {
                    const token = await getTelegramBotToken();
                    await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                            callback_query_id: callbackQuery.id,
                            text: popupText,
                            show_alert: true
                        });
                    } catch (popupErr) {
                        console.error('Error sending Telegram popup alert:', popupErr.response ? popupErr.response.data : popupErr.message);
                    }
                console.warn('Tried to toggle Customer but OP is not enabled.');
                    return res.status(200).send('OP not send yet');
                }
            update.customer = !booking.customer;

        } else if (buttonType === 'parkfee') {
            // Check if national_park_fee column exists before trying to update it
            try {
                const columnCheck = await sql.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'bookings' AND column_name = 'national_park_fee'
                `);
                
                if (columnCheck.rows.length > 0) {
                    update.national_park_fee = !booking.national_park_fee;
                } else {
                    // Send a message to the user that this feature is not available
                    try {
                        const token = await getTelegramBotToken();
                        await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                            callback_query_id: callbackQuery.id,
                            text: 'National Park Fee feature not available in this database',
                            show_alert: true
                        });
                    } catch (popupErr) {
                        console.error('Error sending Telegram popup alert:', popupErr.response ? popupErr.response.data : popupErr.message);
                    }
                    return res.status(200).send('Column not found');
                }
            } catch (err) {
                console.error('Error checking column existence:', err.message);
                return res.status(200).send('Error checking column');
            }
    } else if (buttonType === 'transfer') {
        // Check if no_transfer column exists before trying to update it
        try {
            const columnCheck = await sql.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'bookings' AND column_name = 'no_transfer'
            `);
            
            if (columnCheck.rows.length > 0) {
                update.no_transfer = !booking.no_transfer;
            } else {
                // Send a message to the user that this feature is not available
                try {
                    const token = await getTelegramBotToken();
                    await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                        callback_query_id: callbackQuery.id,
                        text: 'No Transfer feature not available in this database',
                        show_alert: true
                    });
                } catch (popupErr) {
                    console.error('Error sending Telegram popup alert:', popupErr.response ? popupErr.response.data : popupErr.message);
                }
                return res.status(200).send('Column not found');
            }
        } catch (err) {
            console.error('Error checking column existence:', err.message);
            return res.status(200).send('Error checking column');
        }
    }
        // Build the update query with proper validation
        const validUpdates = {};
        for (const [key, value] of Object.entries(update)) {
            if (value !== undefined && value !== null && key.trim() !== '') {
                validUpdates[key] = value;
            }
        }
        
        if (Object.keys(validUpdates).length > 0) {
            const setClauses = Object.keys(validUpdates).map((col, i) => `${col} = $${i + 2}`);
            const values = [bookingId, ...Object.values(validUpdates)];
            
            // Log the query for debugging
            console.log('Update query:', `UPDATE bookings SET ${setClauses.join(', ')} WHERE booking_number = $1`);
            console.log('Values:', values);
            
            await sql.query(`UPDATE bookings SET ${setClauses.join(', ')} WHERE booking_number = $1`, values);
        }
        // Fetch the updated booking
        const { rows: updatedRows } = await sql.query('SELECT * FROM bookings WHERE booking_number = $1', [bookingId]);
        const updatedBooking = updatedRows[0];

        // Rebuild the message and keyboard
        const nm = new NotificationManager();
        const newMessage = nm.constructNotificationMessage(updatedBooking);
        const opText = `OP${updatedBooking.op ? ' ✓' : ' X'}`;
        const riText = `RI${updatedBooking.ri ? ' ✓' : ' X'}`;
        const customerText = `Customer${updatedBooking.customer ? ' ✓' : ' X'}`;
        const cashOnTourText = updatedBooking.national_park_fee ? 'National Park Fee' : 'None';
        const parkFeeText = `Cash on tour : ${cashOnTourText} ${updatedBooking.national_park_fee ? '✅' : '❌'}`;
        
        // Format tour date label
        const tourDateLabel = nm.getTourDateLabel(updatedBooking.tour_date);
        
        // Create formatted message with HTML formatting (same as initial message)
        const formattedMessage = `<b>${tourDateLabel}</b>\n<code>${newMessage}</code>`;
        
        const newKeyboard = {
            inline_keyboard: [
                [
                    { text: opText, callback_data: `toggle:op:${bookingId}` },
                    { text: riText, callback_data: `toggle:ri:${bookingId}` },
                    { text: customerText, callback_data: `toggle:customer:${bookingId}` }
                ],
                [
                    { text: parkFeeText, callback_data: `toggle:parkfee:${bookingId}` }
                ],
                [
                    { text: `${updatedBooking.no_transfer ? 'Transfer' : 'No Transfer'}`, callback_data: `toggle:transfer:${bookingId}` }
                ]
            ]
        };
        // Edit the message with HTML formatting
        try {
            const token = await getTelegramBotToken();
            const editResp = await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
            chat_id: message.chat.id,
            message_id: message.message_id,
                text: formattedMessage,
                parse_mode: 'HTML',
                reply_markup: newKeyboard
        });
            console.log('editMessageText response:', editResp.data);
        } catch (editErr) {
            console.error('Error editing Telegram message:', editErr.response ? editErr.response.data : editErr.message);
        }
        // Answer the callback query to remove the loading state
        try {
            const token = await getTelegramBotToken();
            await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                callback_query_id: callbackQuery.id
            });
        } catch (answerErr) {
            console.error('Error answering callback query:', answerErr.response ? answerErr.response.data : answerErr.message);
        }
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
    const totalPax = adult + child + infant;
    const bookingNumber = extractedInfo.bookingNumber;
    const program = extractedInfo.program;
    const customerName = extractedInfo.name;
    const hotel = extractedInfo.hotel;
    const phoneNumber = extractedInfo.phoneNumber;
    
    // Clean hotel name - extract just the hotel name (first part before comma or address details)
    const cleanHotel = hotel ? hotel
        .split(',')[0] // Take only the part before the first comma
        .replace(/\s*THAILAND\s*$/i, '') // Remove "THAILAND" if present
        .trim() : '';
    
    // For webhook, we'll use the transfer version (full format) as default
    const responseTemplate = `🆕 Please confirm the *pickup time* for this booking:\n\n📋 Booking no : ${extractedInfo.bookingNumber}\n📅 Tour date : ${extractedInfo.tourDate}\nProgram : ${extractedInfo.program}\n👤 Name : ${extractedInfo.name}\n👥 Pax : ${adult} Adults (Total: ${totalPax})\n🏨 Hotel : ${cleanHotel}\n📞 Phone Number : ${extractedInfo.phoneNumber}\n💵 Cash on tour : None\n\n💡 Please mentioned if there is any additional charge for transfer collect from customer`;
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
        this.textContent = cleanupHtml(htmlContent); // For text search
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
    let program = this.findValueByLabel('Product').replace(/^[A-Z0-9]+\s*-\s*/, '').replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Extract start time from the date field and append to program
    const startTime = this.extractStartTime();
    if (startTime && startTime !== 'N/A') {
      program += ` - [${startTime}]`;
    }
    
    return program;
  }
  
  extractStartTime() {
    // Look for time in the Date field: "Sun 10.Aug '25 @ 08:00"
    const dateText = this.findValueByLabel('Date');
    const timeMatch = dateText.match(/@\s*(\d{2}:\d{2})/);
    if (timeMatch && timeMatch[1]) {
      // Convert 24-hour to 12-hour format with am/pm
      const [hours, minutes] = timeMatch[1].split(':');
      const hour24 = parseInt(hours, 10);
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const ampm = hour24 >= 12 ? 'pm' : 'am';
      return `${hour12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    }
    return 'N/A';
  }
  extractName() { return this.findValueByLabel('Customer'); }
  extractPassengers() {
    const pax = { adult: '0', child: '0', infant: '0' };
    const paxCell = this.$('strong').filter((i, el) => this.$(el).text().trim().toLowerCase() === 'pax').first().closest('td').next('td');
    let lines = [];
    const paxHtml = paxCell.html();
    if (paxHtml) {
      lines = paxHtml.split(/<br\s*\/?>/i).map(l => this.$(`<div>${l}</div>`).text()).join('\n').split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    } else {
      lines = paxCell.text().split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    }
    if (lines.length === 0) {
      lines = [paxCell.text().trim()];
    }
    lines.forEach(line => {
      let m;
      m = line.match(/(\d+)\s*Adult/i);
      if (m) pax.adult = (parseInt(pax.adult, 10) + parseInt(m[1], 10)).toString();
      m = line.match(/(\d+)\s*Child/i);
      if (m) pax.child = (parseInt(pax.child, 10) + parseInt(m[1], 10)).toString();
      m = line.match(/(\d+)\s*Infant/i);
      if (m) pax.infant = (parseInt(pax.infant, 10) + parseInt(m[1], 10)).toString();
      m = line.match(/(\d+)\s*Rider/i);
      if (m) pax.adult = (parseInt(pax.adult, 10) + parseInt(m[1], 10)).toString();
      m = line.match(/(\d+)\s*Passenger/i);
      if (m) pax.child = (parseInt(pax.child, 10) + parseInt(m[1], 10)).toString();
    });
    return pax;
  }
  extractHotel() { return this.findValueByLabel('Pick-up').replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  extractPhone() { return this.findValueByLabel('Customer phone').replace(/\D/g, ''); }
  extractCustomerEmail() { return this.findValueByLabel('Customer email'); }
  extractSKU() {
    // Product field: e.g., 'HKT0041 - ...'
    const product = this.findValueByLabel('Product');
    const match = product.match(/^([A-Z0-9]+)\s*-/);
    return match ? match[1] : '';
  }
  extractPaid() {
    // Look for 'Viator amount: THB 1234.56' in the text content
    const match = this.textContent.match(/Viator amount:\s*THB\s*([\d,.]+)/i);
    if (match && match[1]) {
      // Remove commas, parse as float, fix to 2 decimals
      return parseFloat(match[1].replace(/,/g, '')).toFixed(2);
    }
    return null;
  }
  extractBookDate() {
    // Look for a line like 'Created\tFri, July 04 2025 @ 23:17'
    const match = this.textContent.match(/Created\s*[\t:]*\s*([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2}\s+\d{4})/);
    if (match && match[1]) {
      // Remove day of week if present (e.g., 'Fri, July 04 2025' -> 'July 04 2025')
      const dateStr = match[1].replace(/^[A-Za-z]+,?\s+/, '');
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
  }
  extractRate() {
    // Try to find a line or cell labeled 'Rate' and extract its value
    let rate = '';
    this.$('td').each((i, el) => {
      const strongText = this.$(el).find('strong').text().trim();
      if (strongText.toLowerCase() === 'rate') {
        rate = this.$(el).next('td').text().trim();
        if (rate) return false;
      }
    });
    return rate;
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
      customerEmail: this.extractCustomerEmail(),
      isoDate: this._getISODate(tourDate),
      paid: this.extractPaid(),
      book_date: this.extractBookDate(),
      rate: this.extractRate()
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
        // Try multiple formats
        let bookingNumber = this._findLineValue('ORDER NUMBER:');
        if (bookingNumber === 'N/A') {
            bookingNumber = this._findLineValue('Order number:');
        }
        if (bookingNumber === 'N/A') {
            // Try to find it in the subject line or anywhere in the email
            const orderMatch = this.lines.join(' ').match(/(?:order|booking)\s*#?\s*:?\s*(\d+)/i);
            if (orderMatch) {
                bookingNumber = orderMatch[1];
            }
        }
        return bookingNumber;
    }

    // NEW: Extract multiple bookings from the same email
    extractMultipleBookings() {
        const orderNumber = this.extractBookingNumber();
        const bookingSections = this._findBookingSections();
        const bookings = [];

        for (const section of bookingSections) {
            try {
                const booking = this._extractSingleBooking(section, orderNumber);
                if (booking && booking.bookingNumber) {
                    bookings.push(booking);
                }
            } catch (error) {
                console.error('[MULTIPLE] Error extracting booking from section:', error);
            }
        }

        if (bookings.length === 0) {
            // Fall back to single booking extraction
            const { responseTemplate, extractedInfo } = this.formatBookingDetails();
            return [extractedInfo];
        }

        return bookings;
    }

    // NEW: Find all booking sections in the email
    _findBookingSections() {
        const sections = [];
        let currentSection = [];
        let inBookingSection = false;

        for (const line of this.lines) {
            // Check if this line starts a new booking section
            if (line.includes('Booking #') && line.includes('Paid')) {
                // Save previous section if it exists
                if (currentSection.length > 0) {
                    sections.push([...currentSection]);
                }
                // Start new section
                currentSection = [line];
                inBookingSection = true;
            } else if (inBookingSection) {
                currentSection.push(line);
            }
        }

        // Add the final section if it exists
        if (currentSection.length > 0) {
            sections.push([...currentSection]);
        }

        return sections;
    }

    // NEW: Extract a single booking from a section
    _extractSingleBooking(sectionLines, orderNumber) {
        // Extract booking number from the section
        const bookingNumber = this._extractBookingNumberFromSection(sectionLines);
        if (!bookingNumber) return null;
        
        // Extract passengers from this section only
        const passengers = this._extractPassengersFromSection(sectionLines);
        
        // Extract tour date from this section
        const tourDate = this._extractTourDateFromSection(sectionLines);
        
        // Extract SKU from this section
        const sku = this._extractSKUFromSection(sectionLines);
        
        // Extract program from this section
        const program = this._extractProgramFromSection(sectionLines);
        
        // Use main email for customer details
        const name = this.extractName();
        const hotel = this.extractHotel();
        const phoneNumber = this.extractPhone();
        const customerEmail = this.extractCustomerEmail();
        const paid = this._extractPaidForBooking(sectionLines);
        
        return {
            bookingNumber: bookingNumber,
            orderNumber: orderNumber,
            tourDate: tourDate,
            sku: sku,
            program: program,
            name: name,
            adult: passengers.adult,
            child: passengers.child,
            infant: passengers.infant,
            hotel: hotel,
            phoneNumber: phoneNumber,
            customerEmail: customerEmail,
            isoDate: this._getISODate(tourDate),
            paid: paid,
            book_date: this.extractBookDate(),
            rate: this.extractRate(),
            start_time: this._extractStartTimeFromSection(sectionLines)
        };
    }

    // NEW: Extract booking number from a section
    _extractBookingNumberFromSection(sectionLines) {
        for (const line of sectionLines) {
            // Look for "Booking #XXXXX" pattern specifically
            const match = line.match(/Booking\s+#(\d+)/i);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    // NEW: Extract paid amount for a specific booking
    _extractPaidForBooking(sectionLines) {
        // Look for price in the section
        for (const line of sectionLines) {
            // Match Thai Baht symbol followed by number
            const match = line.match(/[฿=E0=B8=BF]?\s*([\d,\.]+)/i);
            if (match && match[1]) {
                return parseFloat(match[1].replace(/,/g, '')).toFixed(2);
            }
        }
        return null;
    }

    // NEW: Extract passengers from a specific section
    _extractPassengersFromSection(sectionLines) {
        let adult = 0;
        let child = 0;
        let infant = 0;

        for (const line of sectionLines) {
            // Look for adult count patterns
            const adultMatch = line.match(/\*?\s*Adults?\s*\(\+?\d+\)\s*:\s*(\d+)/i);
            if (adultMatch) {
                adult = parseInt(adultMatch[1], 10);
                continue;
            }

            // Look for "person+" patterns (adults)
            const personPlusMatch = line.match(/\*?\s*(\d+)\s*person\+/i);
            if (personPlusMatch) {
                adult = parseInt(personPlusMatch[1], 10);
                continue;
            }

            // Look for child count patterns
            const childMatch = line.match(/\*?\s*Children?\s*\(\d+\)\s*:\s*(\d+)/i);
            if (childMatch) {
                child = parseInt(childMatch[1], 10);
                continue;
            }

            // Look for infant count patterns
            const infantMatch = line.match(/\*?\s*Infants?\s*\(\d+\)\s*:\s*(\d+)/i);
            if (infantMatch) {
                infant = parseInt(infantMatch[1], 10);
                continue;
            }
        }

        return {
            adult: adult.toString(),
            child: child.toString(),
            infant: infant.toString()
        };
    }

    // NEW: Extract tour date from a specific section
    _extractTourDateFromSection(sectionLines) {
        for (const line of sectionLines) {
            // Look for date pattern like "August 6, 2025"
            const dateMatch = line.match(/([A-Za-z]+ \d{1,2}, \d{4})/);
            if (dateMatch) {
                return dateMatch[1];
            }
        }
        return 'N/A';
    }

    // NEW: Extract SKU from a specific section
    _extractSKUFromSection(sectionLines) {
        for (const line of sectionLines) {
            // Look for SKU pattern like (#HKT0041)
            const match = line.match(/\(#([A-Z0-9]+)\)/);
            if (match) {
                return match[1];
            }
        }
        return '';
    }

    // NEW: Extract program from a specific section
    _extractProgramFromSection(sectionLines) {
        for (let i = 0; i < sectionLines.length; i++) {
            const line = sectionLines[i];
            // Look for program name (line before SKU)
            if (line.includes('(#') && i > 0) {
                const programLine = sectionLines[i - 1].trim();
                if (programLine && !programLine.startsWith('Booking') && !programLine.includes('#')) {
                    return programLine;
                }
            }
        }
        return 'N/A';
    }

    // NEW: Extract rate from a specific section (including addons)




    // NEW: Extract start time from a specific section
    _extractStartTimeFromSection(sectionLines) {
        // For now, return empty string - can be enhanced later
        return '';
    }

    extractProgram() {
        // The program name is the line right before the line with the product code, e.g., "(#HKT0022)"
        const codeIndex = this.lines.findIndex(line => /\(#([A-Z0-9]+)\)/.test(line));
        let program = 'N/A';
        
        if (codeIndex > 0) {
            // Check the line immediately before the code; it might be blank.
            const lineBefore = this.lines[codeIndex - 1].trim();
            if (lineBefore) {
                program = lineBefore;
            }
            // If the line before was blank, check the one before that.
            else if (codeIndex > 1 && this.lines[codeIndex - 2]) {
                program = this.lines[codeIndex - 2].trim();
            }
        }
        
        // Extract pickup time and append to program if found
        const pickupTime = this.extractPickupTime();
        if (pickupTime && pickupTime !== 'N/A' && program !== 'N/A') {
            program += ` - [${pickupTime}]`;
        }
        
        return program;
    }
    
    extractPickupTime() {
        // Look for "Pickup time: 08:00-08:30 PM" format
        const pickupLine = this.lines.find(line => /pickup time:/i.test(line));
        if (pickupLine) {
            const timeMatch = pickupLine.match(/pickup time:\s*(.+)/i);
            if (timeMatch && timeMatch[1]) {
                let timeStr = timeMatch[1].trim();
                
                // If it's a range like "08:00-08:30 PM", take the first time
                const rangeMatch = timeStr.match(/^(\d{2}:\d{2})/);
                if (rangeMatch) {
                    const time = rangeMatch[1];
                    // Check if PM is mentioned in the original string
                    const isPM = /pm/i.test(timeStr);
                    const isAM = /am/i.test(timeStr);
                    
                    if (isPM || isAM) {
                        // Convert to 12-hour format
                        const [hours, minutes] = time.split(':');
                        const hour24 = parseInt(hours, 10);
                        
                        if (isPM && hour24 !== 12) {
                            // PM time (but not 12 PM)
                            const hour12 = hour24;
                            return `${hour12.toString().padStart(2, '0')}:${minutes} pm`;
                        } else if (isAM && hour24 === 12) {
                            // 12 AM becomes 12 am
                            return `12:${minutes} am`;
                        } else if (isAM) {
                            // AM time
                            return `${hour24.toString().padStart(2, '0')}:${minutes} am`;
                        } else {
                            // PM time
                            return `${hour24.toString().padStart(2, '0')}:${minutes} pm`;
                        }
                    } else {
                        // No AM/PM specified, assume 24-hour format and convert
                        const hour24 = parseInt(hours, 10);
                        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                        const ampm = hour24 >= 12 ? 'pm' : 'am';
                        return `${hour12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
                    }
                }
                
                return timeStr; // Return original if no pattern matches
            }
        }
        return 'N/A';
    }

    extractTourDate() {
        // Try multiple formats:
        // 1. "* June 22, 2025" (old format)
        let dateLine = this.lines.find(line => line.trim().startsWith('*') && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line));
        if (dateLine) {
            const dateMatch = dateLine.match(/[A-Za-z]+ \d{1,2}, \d{4}/);
            if (dateMatch) return dateMatch[0];
        }
        
        // 2. "August 9, 2025" (new format) - look for standalone date
        dateLine = this.lines.find(line => /^[A-Za-z]+ \d{1,2}, \d{4}$/.test(line.trim()));
        if (dateLine) {
            return dateLine.trim();
        }
        
        // 3. Look for date in booking sections
        dateLine = this.lines.find(line => /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) \d{1,2}, \d{4}/i.test(line));
        if (dateLine) {
            const dateMatch = dateLine.match(/([A-Za-z]+ \d{1,2}, \d{4})/i);
            if (dateMatch) return dateMatch[1];
        }
        
        return 'N/A';
    }

    extractPassengers() {
        const pax = { adult: '0', child: '0', infant: '0' };
        for (const line of this.lines) {
            // Adult
            const adultMatch = line.match(/adult[s]?[^\d]*(\d+)\s*$/i) || line.match(/adult[s]?.*?:\s*(\d+)/i);
            if (adultMatch && adultMatch[1]) {
                pax.adult = (parseInt(pax.adult, 10) + parseInt(adultMatch[1], 10)).toString();
            }
            // Child
            const childMatch = line.match(/child[ren|s]?[^\d]*(\d+)\s*$/i) || line.match(/child[ren|s]?.*?:\s*(\d+)/i);
            if (childMatch && childMatch[1]) {
                pax.child = (parseInt(pax.child, 10) + parseInt(childMatch[1], 10)).toString();
            }
            // Infant
            const infantMatch = line.match(/infant[s]?[^\d]*(\d+)\s*$/i) || line.match(/infant[s]?.*?:\s*(\d+)/i);
            if (infantMatch && infantMatch[1]) {
                pax.infant = (parseInt(pax.infant, 10) + parseInt(infantMatch[1], 10)).toString();
            }
            // Person (+4 Years): N (treat as adult)
            const personPlusMatch = line.match(/person \(\+\d+ years\):\s*(\d+)/i);
            if (personPlusMatch && personPlusMatch[1]) {
                pax.adult = (parseInt(pax.adult, 10) + parseInt(personPlusMatch[1], 10)).toString();
            }
        }
        // If no explicit adult/child/infant found, fallback to 'Person: N' or 'Person ฿1099: N'
        if (pax.adult === '0' && pax.child === '0' && pax.infant === '0') {
            // Try standard format: "Person: N"
            let personLine = this.lines.find(line => /person\s*:\s*\d+/i.test(line));
            if (personLine) {
                const personMatch = personLine.match(/person\s*:\s*(\d+)/i);
                if (personMatch && personMatch[1]) {
                    pax.adult = (parseInt(pax.adult, 10) + parseInt(personMatch[1], 10)).toString();
                    pax.child = '0';
                    pax.infant = '0';
                }
            } else {
                // Try new format: "Person ฿1099: N"
                personLine = this.lines.find(line => /person\s*[฿\w]*\d*\s*:\s*\d+/i.test(line));
                if (personLine) {
                    const personMatch = personLine.match(/person\s*[฿\w]*\d*\s*:\s*(\d+)/i);
                    if (personMatch && personMatch[1]) {
                        pax.adult = (parseInt(pax.adult, 10) + parseInt(personMatch[1], 10)).toString();
                        pax.child = '0';
                        pax.infant = '0';
                    }
                }
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

    extractCustomerEmail() {
        // First, try to find email after hotel information (original approach)
        const hotelIndex = this.lines.findIndex(line => line.toLowerCase().includes('hotel'));
        
        if (hotelIndex !== -1) {
            // Look for email pattern in the next few lines after hotel
            for (let i = hotelIndex + 1; i < Math.min(hotelIndex + 5, this.lines.length); i++) {
                const line = this.lines[i];
                const emailMatch = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
                if (emailMatch) {
                    return emailMatch[0];
                }
            }
        }
        
        // If not found after hotel, search the entire email for email addresses
        // but exclude common system emails and the sender's own domain
        for (const line of this.lines) {
            const emailMatch = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
            if (emailMatch) {
                const email = emailMatch[0].toLowerCase();
                // Skip system emails and the sender's own domain
                if (!email.includes('noreply') && 
                    !email.includes('no-reply') && 
                    !email.includes('info@tours.co.th') &&
                    !email.includes('bokun.io') &&
                    !email.includes('tours.co.th')) {
                    return emailMatch[0];
                }
            }
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

    extractPaid() {
      // Look for 'Total:' followed by optional whitespace, optional Baht symbol, and a number (with or without commas)
      const totalLine = this.lines.find(line => /Total:/i.test(line));
      if (totalLine) {
        // Match Total: [optional Baht symbol or encoding] [number]
        const match = totalLine.match(/Total:\s*[฿=E0=B8=BF]?\s*([\d,\.]+)/i);
        if (match && match[1]) {
          return parseFloat(match[1].replace(/,/g, '')).toFixed(2);
        }
      }
      // Fallback: try to find in the whole text (for HTML emails or encoded lines)
      const text = this.lines.join(' ');
      const match = text.match(/Total:\s*[฿=E0=B8=BF]?\s*([\d,\.]+)/i);
      if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, '')).toFixed(2);
      }
      return null;
    }

    extractBookDate() {
      // Look for a line like 'Order date: July 5, 2025'
      const line = this.lines.find(l => l.toLowerCase().startsWith('order date:'));
      if (line) {
        const match = line.match(/Order date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
        if (match && match[1]) {
          const d = new Date(match[1]);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
      }
      return null;
    }

    extractRate() {
        let rate = '';
        
        // Look for rate information in the email
        for (const line of this.lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (!trimmedLine) continue;
            
            // Look for patterns like "Rate: Standard", "Price: Premium", etc.
            const colonMatch = trimmedLine.match(/^(?:Rate|Price|Cost)\s*:\s*(.+)$/i);
            if (colonMatch) {
                rate = colonMatch[1].trim();
                break;
            }
            
            // Look for patterns like "With Transfer: Standard", "Without Transfer: Premium"
            const withWithoutMatch = trimmedLine.match(/^(?:With|Without)\s+Transfer\s*:\s*(.+)$/i);
            if (withWithoutMatch) {
                rate = withWithoutMatch[1].trim();
                break;
            }
            
            // Look for patterns like "Rate: Standard", "Price: Premium"
            const ratePriceMatch = trimmedLine.match(/^(?:Rate|Price)\s*:\s*(.+)$/i);
            if (ratePriceMatch) {
                rate = ratePriceMatch[1].trim();
                break;
            }
        }
        
        return rate;
    }

    extractStartTime() {
        // Look for a line starting with 'Start time:'
        const timeLine = this.lines.find(line => line.toLowerCase().startsWith('start time:'));
        if (timeLine) {
            return timeLine.replace(/^start time:/i, '').trim();
        }
        return '';
    }

    extractAll() {
        const passengers = this.extractPassengers();
        const tourDate = this.extractTourDate();
        const bookingNumber = this.extractBookingNumber();
        

        
        return {
            bookingNumber: bookingNumber,
            tourDate: tourDate,
            sku: this.extractSKU(),
            program: this.extractProgram(),
            name: this.extractName(),
            adult: passengers.adult,
            child: passengers.child,
            infant: passengers.infant,
            hotel: this.extractHotel(),
            phoneNumber: this.extractPhone(),
            customerEmail: this.extractCustomerEmail(),
            isoDate: this._getISODate(tourDate),
            paid: this.extractPaid(),
            book_date: this.extractBookDate(),
            rate: this.extractRate(),
            start_time: this.extractStartTime()
        };
    }

    formatBookingDetails() {
        const extractedInfo = this.extractAll();

        if (extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
            console.error(`Could not extract a valid tour date for booking ${extractedInfo.bookingNumber}. Aborting.`);
        }
        
        return this._formatBaseBookingDetails(extractedInfo);
    }

    // NEW: Format multiple booking details
    formatMultipleBookingDetails() {
        const bookings = this.extractMultipleBookings();
        const results = [];
        
        for (const booking of bookings) {
            if (booking.tourDate === 'N/A' || !booking.isoDate) {
                console.error(`Could not extract a valid tour date for booking ${booking.bookingNumber}. Skipping.`);
                continue;
            }
            
            const result = this._formatBaseBookingDetails(booking);
            results.push(result);
        }
        
        return results;
    }
}

class EmailParserFactory {
  static create(parsedEmail) {
    const { subject, html, text, from } = parsedEmail;
    const fromAddress = from?.value?.[0]?.address?.toLowerCase();
    let channel = null;
    
    if (fromAddress && fromAddress.includes('tours.co.th')) {
      channel = 'Website';
    } else if (fromAddress && fromAddress.includes('bokun.io')) {
      // For bokun.io emails, check the content for "Sold by"
      const emailContent = html || text || '';
      if (emailContent.includes('Sold by') && emailContent.includes('GetYourGuide')) {
        channel = 'GYG';
      } else if (emailContent.includes('Sold by') && emailContent.includes('Viator.com')) {
        channel = 'Viator';
      } else {
        // Default for bokun.io emails
        channel = 'Viator';
      }
    } else {
      channel = 'Website';
    }

    if (!subject || (!subject.toLowerCase().startsWith('new booking') && !subject.toLowerCase().startsWith('updated booking'))) {
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
      const riders = paxLine.match(/(\d+)\s*Rider/i);
      const passengers = paxLine.match(/(\d+)\s*Passenger/i);
      let adultCount = adults ? parseInt(adults[1], 10) : 0;
      let childCount = children ? parseInt(children[1], 10) : 0;
      let infantCount = infants ? parseInt(infants[1], 10) : 0;
      if (riders && riders[1]) adultCount += parseInt(riders[1], 10);
      if (passengers && passengers[1]) childCount += parseInt(passengers[1], 10);
      return {
        adult: adultCount.toString(),
        child: childCount.toString(),
        infant: infantCount.toString()
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

// Helper to search bookings
async function searchBookings(query) {
    // Try booking number (exact)
    let sqlQuery = 'SELECT * FROM bookings WHERE booking_number = $1';
    let params = [query];
    let { rows } = await sql.query(sqlQuery, params);
    if (rows.length > 0) return rows;
    // Try customer name (partial, case-insensitive)
    sqlQuery = 'SELECT * FROM bookings WHERE customer_name ILIKE $1 ORDER BY tour_date DESC LIMIT 3';
    params = [`%${query}%`];
    rows = (await sql.query(sqlQuery, params)).rows;
    if (rows.length > 0) return rows;
    // Try date (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(query)) {
        sqlQuery = 'SELECT * FROM bookings WHERE tour_date::date = $1 ORDER BY tour_date DESC LIMIT 3';
        params = [query];
        rows = (await sql.query(sqlQuery, params)).rows;
        if (rows.length > 0) return rows;
    }
    // Try various natural date formats
    const moment = require('moment');
    
    // Define multiple date formats to try
    const dateFormats = [
        'D MMM YY', 'DD MMM YY', 'D MMMM YY', 'DD MMMM YY',  // 6 May 26, 06 May 26
        'D MMM YYYY', 'DD MMM YYYY', 'D MMMM YYYY', 'DD MMMM YYYY',  // 6 May 2026, 06 May 2026
        'MMM D YY', 'MMM DD YY', 'MMMM D YY', 'MMMM DD YY',  // May 6 26, May 06 26
        'MMM D YYYY', 'MMM DD YYYY', 'MMMM D YYYY', 'MMMM DD YYYY',  // May 6 2026, May 06 2026
        'D/MM/YY', 'DD/MM/YY', 'D/MM/YYYY', 'DD/MM/YYYY',  // 6/5/26, 06/05/26
        'MM/DD/YY', 'MM/DD/YYYY',  // 5/6/26, 05/06/26
        'D-MM-YY', 'DD-MM-YY', 'D-MM-YYYY', 'DD-MM-YYYY',  // 6-5-26, 06-05-26
        'YY-MM-DD', 'YYYY-MM-DD'  // 26-05-06, 2026-05-06
    ];
    
    let parsed = null;
    for (const format of dateFormats) {
        parsed = moment(query, format, true);
        if (parsed.isValid()) {
            break;
        }
    }
    
    if (parsed && parsed.isValid()) {
        const dateStr = parsed.format('YYYY-MM-DD');
        console.log(`[DATE SEARCH] Parsed "${query}" to "${dateStr}"`);
        sqlQuery = 'SELECT * FROM bookings WHERE tour_date::date = $1 ORDER BY tour_date DESC LIMIT 3';
        params = [dateStr];
        rows = (await sql.query(sqlQuery, params)).rows;
        if (rows.length > 0) return rows;
    }
    return [];
}

// Extract search query from message text
function extractQuery(text, botUsername) {
    if (!text) return '';
    text = text.trim();
    // Handle /search command
    if (text.startsWith('/search')) {
        return text.replace(/^\/search(@\w+)?\s*/i, '');
    }
    // Handle mention (e.g., @botname query)
    if (text.startsWith('@')) {
        // Remove @botname and any whitespace
        return text.replace(/^@\w+\s*/i, '');
    }
    // For any other text, treat it as a search query
    return text;
}

// Function to extract order link from email content
function extractOrderLinkFromEmail(emailContent) {
  console.log('[ORDER-LINK-DEBUG] Extracting order link from email content...');
  
  // PRIORITY 1: Try to extract order ID and create a direct link first
  const orderId = extractOrderIdFromContent(emailContent);
  if (orderId) {
    const directLink = createDirectOrderLink(orderId);
    if (directLink) {
      console.log('[ORDER-LINK-DEBUG] PRIORITY 1: Created direct order link from order ID:', directLink);
      return directLink;
    }
  }
  
  // Pattern 1: "Total: [amount]" followed by "View order → [URL]"
  const totalPattern = /Total:\s*[^\n]*\n[^]*?View\s*order\s*→\s*(https?:\/\/[^\s\n]+)/i;
  const match = emailContent.match(totalPattern);
  
  if (match && match[1]) {
    const url = match[1].trim();
    if (isValidOrderEditUrl(url)) {
      console.log('[ORDER-LINK-DEBUG] Found pattern 1 (Total + View order):', url);
      return url;
    } else {
      console.log('[ORDER-LINK-DEBUG] Found pattern 1 URL but it\'s not a valid order edit link:', url);
    }
  }
  
  // Pattern 2: "View order → [URL]"
  const viewOrderPattern = /View\s*order\s*→\s*(https?:\/\/[^\s\n]+)/i;
  const viewOrderMatch = emailContent.match(viewOrderPattern);
  
  if (viewOrderMatch && viewOrderMatch[1]) {
    console.log('[ORDER-LINK-DEBUG] Found pattern 2 (View order):', viewOrderMatch[1]);
    return viewOrderMatch[1].trim();
  }
  
  // Pattern 3: "Order link:" or "Order:" followed by URL
  const orderLinkPattern = /(?:Order\s*link|Order):\s*(https?:\/\/[^\s\n]+)/i;
  const orderLinkMatch = emailContent.match(orderLinkPattern);
  
  if (orderLinkMatch && orderLinkMatch[1]) {
    console.log('[ORDER-LINK-DEBUG] Found pattern 3 (Order link/Order):', orderLinkMatch[1]);
    return orderLinkMatch[1].trim();
  }
  
  // Pattern 4: "Click here" or "View" followed by URL
  const clickHerePattern = /(?:Click\s*here|View|View\s*details?)\s*[:\-]?\s*(https?:\/\/[^\s\n]+)/i;
  const clickHereMatch = emailContent.match(clickHerePattern);
  
  if (clickHereMatch && clickHereMatch[1]) {
    console.log('[ORDER-LINK-DEBUG] Found pattern 4 (Click here/View):', clickHereMatch[1]);
    return clickHereMatch[1].trim();
  }
  
  // Pattern 5: Any URL that contains "order" or "booking" in the path
  const orderUrlPattern = /(https?:\/\/[^\s\n]*?(?:order|booking|reservation)[^\s\n]*)/i;
  const orderUrlMatch = emailContent.match(orderUrlPattern);
  
  if (orderUrlMatch && orderUrlMatch[1]) {
    const url = orderUrlMatch[1].trim();
    if (isValidOrderEditUrl(url)) {
      console.log('[ORDER-LINK-DEBUG] Found valid order/booking URL:', url);
      return url;
    } else {
      console.log('[ORDER-LINK-DEBUG] Found order/booking URL but it\'s not a valid order edit link:', url);
    }
  }
  
  // Pattern 6: Only specific WooCommerce order edit URLs (not homepage)
  const wooCommerceOrderPattern = /(https?:\/\/[^\/]+\/wp-admin\/admin\.php\?page=wc-orders[^"\s\n]+)/i;
  const wooCommerceMatch = emailContent.match(wooCommerceOrderPattern);
  
  if (wooCommerceMatch && wooCommerceMatch[1]) {
    console.log('[ORDER-LINK-DEBUG] Found WooCommerce order URL:', wooCommerceMatch[1]);
    return wooCommerceMatch[1].trim();
  }
  
  // Pattern 6b: Any tours.co.th URL that might be an order link (but be more specific)
  const toursUrlPattern = /(https?:\/\/[^\s\n]*?tours\.co\.th[^\s\n]*?(?:wc-orders|admin\.php|order|booking)[^\s\n]*)/i;
  const toursUrlMatch = emailContent.match(toursUrlPattern);
  
  if (toursUrlMatch && toursUrlMatch[1]) {
    const url = toursUrlMatch[1].trim();
    if (isValidOrderEditUrl(url)) {
      console.log('[ORDER-LINK-DEBUG] Found valid tours.co.th order URL:', url);
      return url;
    } else {
      console.log('[ORDER-LINK-DEBUG] Found tours.co.th URL but it\'s not a valid order edit link:', url);
    }
  }
  
  // Pattern 7: Any URL that appears after common order-related keywords
  const orderKeywordsPattern = /(?:order|booking|reservation|confirm|details?)\s*[:\-]?\s*(https?:\/\/[^\s\n]+)/gi;
  let orderKeywordsMatch;
  while ((orderKeywordsMatch = orderKeywordsPattern.exec(emailContent)) !== null) {
    if (orderKeywordsMatch[1]) {
      console.log('[ORDER-LINK-DEBUG] Found pattern 7 (order keywords + URL):', orderKeywordsMatch[1]);
      return orderKeywordsMatch[1].trim();
    }
  }
  
  // Pattern 8: Any URL that appears in the last few lines (often order links are at the bottom)
  const lines = emailContent.split('\n');
  const lastLines = lines.slice(-10); // Check last 10 lines
  for (const line of lastLines) {
    const urlMatch = line.match(/(https?:\/\/[^\s\n]+)/);
    if (urlMatch && urlMatch[1]) {
      console.log('[ORDER-LINK-DEBUG] Found pattern 8 (URL in last lines):', urlMatch[1]);
      return urlMatch[1].trim();
    }
  }
  
  // Pattern 9: HTML anchor tags with order-related text
  const htmlAnchorPattern = /<a[^>]*>(?:[^<]*?(?:order|booking|reservation|confirm|details?|view)[^<]*?)<\/a>/gi;
  let htmlAnchorMatch;
  while ((htmlAnchorMatch = htmlAnchorPattern.exec(emailContent)) !== null) {
    const hrefMatch = htmlAnchorMatch[0].match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      console.log('[ORDER-LINK-DEBUG] Found pattern 9 (HTML anchor with order text):', hrefMatch[1]);
      return hrefMatch[1].trim();
    }
  }
  
  // Pattern 10: Any URL in href attributes that might be an order link
  const hrefUrlPattern = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let hrefUrlMatch;
  while ((hrefUrlMatch = hrefUrlPattern.exec(emailContent)) !== null) {
    if (hrefUrlMatch[1] && (hrefUrlMatch[1].includes('order') || hrefUrlMatch[1].includes('booking') || hrefUrlMatch[1].includes('tours.co.th'))) {
      console.log('[ORDER-LINK-DEBUG] Found pattern 10 (href with order-related URL):', hrefUrlMatch[1]);
      return hrefUrlMatch[1].trim();
    }
  }
  
  // Pattern 11: WP Mail SMTP tracking links - convert to direct order links
  const wpMailTrackingPattern = /(https?:\/\/[^\/]+\/wp-json\/wp-mail-smtp\/v1\/e\/[A-Za-z0-9+/=]+)/gi;
  let wpMailMatch;
  while ((wpMailMatch = wpMailTrackingPattern.exec(emailContent)) !== null) {
    if (wpMailMatch[1]) {
      console.log('[ORDER-LINK-DEBUG] Found WP Mail SMTP tracking link:', wpMailMatch[1]);
      
      try {
        // Try to decode the base64 part to extract the actual URL
        const urlParts = wpMailMatch[1].split('/e/');
        if (urlParts.length === 2) {
          let base64Data = urlParts[1];
          
          // Clean up malformed base64 data (remove line breaks, spaces, and invalid characters)
          base64Data = base64Data
            .replace(/\s+/g, '') // Remove all whitespace
            .replace(/\n/g, '') // Remove newlines
            .replace(/\r/g, '') // Remove carriage returns
            .replace(/[^A-Za-z0-9+/=]/g, ''); // Remove invalid base64 characters
          
          console.log('[ORDER-LINK-DEBUG] Cleaned base64 data:', base64Data);
          
          // Try to decode the base64
          const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
          console.log('[ORDER-LINK-DEBUG] Decoded data:', decodedData);
          
          // Look for the actual URL in the decoded data
          const urlMatch = decodedData.match(/data\[url\]=([^&]+)/);
          if (urlMatch && urlMatch[1]) {
            const actualUrl = decodeURIComponent(urlMatch[1]);
            console.log('[ORDER-LINK-DEBUG] Extracted actual URL from tracking link:', actualUrl);
            return actualUrl.trim();
          }
          
          // Also look for order ID in the decoded data to create a direct link
          const orderIdMatch = decodedData.match(/id%3D(\d+)/);
          if (orderIdMatch && orderIdMatch[1]) {
            const orderId = orderIdMatch[1];
            const directLink = createDirectOrderLink(orderId);
            if (directLink) {
              console.log('[ORDER-LINK-DEBUG] Created direct link from decoded order ID:', directLink);
              return directLink;
            }
          }
        }
      } catch (error) {
        console.log('[ORDER-LINK-DEBUG] Error decoding tracking link:', error.message);
        
        // If decoding fails, try to extract order ID from the URL itself
        const orderIdMatch = wpMailMatch[1].match(/id%3D(\d+)/);
        if (orderIdMatch && orderIdMatch[1]) {
          const orderId = orderIdMatch[1];
          const directLink = createDirectOrderLink(orderId);
          if (directLink) {
            console.log('[ORDER-LINK-DEBUG] Created direct link from URL order ID:', directLink);
            return directLink;
          }
        }
        
        // If all else fails, return the original tracking link as fallback
        return wpMailMatch[1].trim();
      }
    }
  }
  
  // Pattern 12: WooCommerce order URLs that might be embedded in the email (already handled in Pattern 6)
  // Removed duplicate pattern to avoid variable redeclaration
  
  // Pattern 13: Any URL containing "wc-orders" or "admin.php" that might be an order link
  const adminOrderPattern = /(https?:\/\/[^"\s\n]*?(?:wc-orders|admin\.php)[^"\s\n]*)/gi;
  let adminOrderMatch;
  while ((adminOrderMatch = adminOrderPattern.exec(emailContent)) !== null) {
    if (adminOrderMatch[1] && adminOrderMatch[1].includes('tours.co.th')) {
      console.log('[ORDER-LINK-DEBUG] Found admin order URL:', adminOrderMatch[1]);
      return adminOrderMatch[1].trim();
    }
  }
  
  // Pattern 14: Handle URLs that might be split across multiple lines
  const splitUrlPattern = /(https?:\/\/[^"\s]*?\/wp-json\/wp-mail-smtp\/v1\/e\/[A-Za-z0-9+/=]*)/gi;
  let splitUrlMatch;
  while ((splitUrlMatch = splitUrlPattern.exec(emailContent)) !== null) {
    if (splitUrlMatch[1]) {
      console.log('[ORDER-LINK-DEBUG] Found potentially split tracking URL:', splitUrlMatch[1]);
      
      // Try to find the complete URL by looking for more content after this
      const startIndex = splitUrlMatch.index;
      const searchText = emailContent.substring(startIndex, startIndex + 1000); // Look ahead 1000 chars
      
      // Look for a complete base64 string
      const completeUrlMatch = searchText.match(/(https?:\/\/[^"\s]*?\/wp-json\/wp-mail-smtp\/v1\/e\/[A-Za-z0-9+/=]+)/);
      if (completeUrlMatch && completeUrlMatch[1] !== splitUrlMatch[1]) {
        console.log('[ORDER-LINK-DEBUG] Found complete tracking URL:', completeUrlMatch[1]);
        
        try {
          // Process this complete URL using the same logic as Pattern 11
          const urlParts = completeUrlMatch[1].split('/e/');
          if (urlParts.length === 2) {
            let base64Data = urlParts[1];
            
            // Clean up malformed base64 data
            base64Data = base64Data
              .replace(/\s+/g, '')
              .replace(/\n/g, '')
              .replace(/\r/g, '')
              .replace(/[^A-Za-z0-9+/=]/g, '');
            
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const urlMatch = decodedData.match(/data\[url\]=([^&]+)/);
            if (urlMatch && urlMatch[1]) {
              const actualUrl = decodeURIComponent(urlMatch[1]);
              console.log('[ORDER-LINK-DEBUG] Extracted actual URL from complete tracking link:', actualUrl);
              return actualUrl.trim();
            }
          }
        } catch (error) {
          console.log('[ORDER-LINK-DEBUG] Error processing complete tracking URL:', error.message);
        }
      }
    }
  }
  
  // Final fallback: Look for any number that might be an order ID in the email (if we haven't found one yet)
  const anyNumberPattern = /(\d{4,6})/g;
  let numberMatch;
  while ((numberMatch = anyNumberPattern.exec(emailContent)) !== null) {
    if (numberMatch[1]) {
      const potentialOrderId = numberMatch[1];
      // Only create a link if it looks like a reasonable order ID (4-6 digits)
      if (potentialOrderId.length >= 4 && potentialOrderId.length <= 6) {
        const directLink = createDirectOrderLink(potentialOrderId);
        if (directLink) {
          console.log('[ORDER-LINK-DEBUG] Created final fallback direct order link from potential order ID:', potentialOrderId);
          return directLink;
        }
      }
    }
  }
  
  // Debug: Log what we're looking at
  console.log('[ORDER-LINK-DEBUG] Email content preview (first 500 chars):', emailContent.substring(0, 500));
  console.log('[ORDER-LINK-DEBUG] No order link patterns found');
  
  return null;
}

// Helper function to analyze email content structure for debugging
function analyzeEmailContent(emailContent) {
  console.log('[EMAIL-ANALYSIS] Analyzing email content structure...');
  console.log('[EMAIL-ANALYSIS] Content length:', emailContent.length);
  console.log('[EMAIL-ANALYSIS] Contains HTML tags:', /<[^>]+>/.test(emailContent));
  console.log('[EMAIL-ANALYSIS] Contains URLs:', /https?:\/\/[^\s\n]+/.test(emailContent));
  console.log('[EMAIL-ANALYSIS] Contains "order":', /order/i.test(emailContent));
  console.log('[EMAIL-ANALYSIS] Contains "booking":', /booking/i.test(emailContent));
  console.log('[EMAIL-ANALYSIS] Contains "tours.co.th":', /tours\.co\.th/i.test(emailContent));
  
  // Find all URLs in the content
  const urlMatches = emailContent.match(/https?:\/\/[^\s\n]+/g);
  if (urlMatches) {
    console.log('[EMAIL-ANALYSIS] Found URLs:', urlMatches);
  }
  
  // Find lines containing "order" or "booking"
  const lines = emailContent.split('\n');
  const orderLines = lines.filter(line => /order|booking/i.test(line));
  if (orderLines.length > 0) {
    console.log('[EMAIL-ANALYSIS] Lines containing order/booking:', orderLines);
  }
}

// Helper to send a message back to Telegram
async function sendTelegram(chat_id, text, reply_to_message_id = null) {
    try {
        const token = await getTelegramBotToken();
        if (!token) {
            console.error('No Telegram bot token found');
            return;
        }
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const chatId = chat_id || await getTelegramChatId();
        const payload = {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        };
        if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;
        console.log('Sending Telegram message:', { chat_id: chatId, text: text.substring(0, 50) + '...' });
        const response = await axios.post(url, payload);
        console.log('Telegram response:', response.status);
    } catch (error) {
        console.error('Error sending Telegram message:', error.message);
        if (error.response) {
            console.error('Telegram API error:', error.response.data);
        }
    }
}

async function handleTelegramMessage(message, res) {
    const chat_id = message.chat.id;
    const reply_to_message_id = message.message_id;
    console.log('Processing message:', message.text, 'from chat:', chat_id);
    
    // Get sender's phone number via Telegram (if available)
    const from = message.from || {};
    const telegramUserId = from.id;
    if (!telegramUserId) {
        console.log('No telegram user ID found');
        await sendTelegram(chat_id, 'Access denied. Telegram user ID not found.', reply_to_message_id);
        return res.json({ ok: true });
    }
    console.log('Telegram user ID:', telegramUserId);
    
    // Try to get bot username from environment (optional, fallback to generic)
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
    const text = message.text.trim();
    
    // Handle /debug command to check database tables
    if (text.startsWith('/debug')) {
        try {
            const tablesResult = await sql.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            const tables = tablesResult.rows.map(row => row.table_name).join(', ');
            await sendTelegram(chat_id, `📊 Database tables: ${tables}`, reply_to_message_id);
            return res.json({ ok: true });
        } catch (err) {
            console.error('Debug error:', err.message);
            await sendTelegram(chat_id, '❌ Debug command failed.', reply_to_message_id);
            return res.json({ ok: true });
        }
    }
    
    const query = extractQuery(text, botUsername);
    console.log('Extracted query:', query);
    
    if (!query) {
        console.log('No query extracted, sending help message');
        const helpMessage = `🔍 *Booking Search Bot*\n\nSend me:\n• Booking number (e.g., 12345)\n• Customer name (e.g., John Smith)\n• Date (e.g., 6 May 2026, 2026-05-06, May 6 26)\n\nOr use /search <query> for explicit search`;
        await sendTelegram(chat_id, helpMessage, reply_to_message_id);
        return res.json({ ok: true });
    }
    
    // Check if the query matches a SKU in products_rates - handle gracefully if table doesn't exist
    let skuRows = [];
    try {
        // Check for different possible table names
        const possibleTables = ['products_rates', 'products', 'rates', 'tours', 'programs'];
        let tableExists = false;
        let existingTable = null;
        
        for (const tableName of possibleTables) {
            const tableCheck = await sql.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)", [tableName]);
            if (tableCheck.rows[0].exists) {
                console.log(`Table ${tableName} exists`);
                tableExists = true;
                existingTable = tableName;
                break;
            }
        }
        
        if (tableExists) {
            console.log(`Searching in table: ${existingTable} for query: ${query}`);
            
            // Get table structure to understand columns
            const columnsResult = await sql.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1 
                ORDER BY ordinal_position
            `, [existingTable]);
            
            console.log('Table columns:', columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`));
            
            // Try different search strategies based on available columns
            const columns = columnsResult.rows.map(row => row.column_name);
            
            if (columns.includes('sku')) {
                console.log('Trying SKU search');
                skuRows = (await sql.query(`SELECT * FROM ${existingTable} WHERE sku = $1`, [query])).rows;
            }
            
            if (skuRows.length === 0 && columns.includes('program')) {
                console.log('Trying program name search');
                skuRows = (await sql.query(`SELECT * FROM ${existingTable} WHERE program ILIKE $1`, [`%${query}%`])).rows;
            }
            
            if (skuRows.length === 0 && columns.includes('name')) {
                console.log('Trying name search');
                skuRows = (await sql.query(`SELECT * FROM ${existingTable} WHERE name ILIKE $1`, [`%${query}%`])).rows;
            }
            
            if (skuRows.length === 0 && columns.includes('title')) {
                console.log('Trying title search');
                skuRows = (await sql.query(`SELECT * FROM ${existingTable} WHERE title ILIKE $1`, [`%${query}%`])).rows;
            }
            
            console.log(`SKU search results from ${existingTable}:`, skuRows.length);
        } else {
            console.log('No product/rate tables found, skipping SKU lookup');
        }
    } catch (err) {
        console.error('SKU lookup error:', err.message);
        // Continue to booking search logic
    }
    
    if (skuRows.length > 0) {
        const product = skuRows[0];
        let msg = `*${product.program}*\nSKU: \`${product.sku}\``;
        if (product.rates && Array.isArray(product.rates)) {
            msg += `\n*Rates:*`;
            product.rates.forEach(rate => {
                const adultPrice = rate.net_adult ? `฿${rate.net_adult}` : 'N/A';
                const childPrice = rate.net_child ? `฿${rate.net_child}` : 'N/A';
                msg += `\n• ${rate.name}: Adult ${adultPrice}, Child ${childPrice}`;
            });
        }
        await sendTelegram(chat_id, msg, reply_to_message_id);
        return res.json({ ok: true });
    }

    // Continue with booking search logic
    console.log('Searching for:', query);
    const results = await searchBookings(query);
    console.log('Search results:', results.length);

    if (results.length === 0) {
        console.log('No results found, sending not found message');
        const notFoundMessage = `❌ No bookings found for: *${query}*\n\nTry searching by:\n• Booking number (e.g., 12345)\n• Customer name (e.g., John Smith)\n• Date (e.g., 6 May 2026, 2026-05-06, May 6 26)`;
        await sendTelegram(chat_id, notFoundMessage, reply_to_message_id);
        return res.json({ ok: true });
    }

    console.log('Sending results');
    const nm = new NotificationManager();
    for (const booking of results) {
        await nm.sendTelegramWithButtons(booking, chat_id);
    }
    return res.json({ ok: true });
}

// Helper to get Telegram Bot Token from settings
async function getTelegramBotToken() {
  const { rows } = await sql`SELECT telegram_bot_token FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  return rows[0]?.telegram_bot_token || '';
}

// Helper to get Telegram Chat ID from settings
async function getTelegramChatId() {
  const { rows } = await sql`SELECT telegram_chat_id FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  return rows[0]?.telegram_chat_id || '';
}

async function handler(req, res) {
    console.log('WEBHOOK REQUEST RECEIVED:', req.method, new Date().toISOString());
    console.log('Request headers:', req.headers);
    
    // Add a simple test endpoint for GET requests
    if (req.method === 'GET') {
        return res.json({ 
            ok: true, 
            message: 'Unified webhook endpoint is working',
            timestamp: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Get the raw body for email parsing
        let rawBody = await getRawBody(req);
        let sourceEmail = null;
        
        // Log the raw body for debugging
        console.log('Raw body length:', rawBody ? rawBody.length : 'null/undefined');

        
        // Handle JSON payloads (for Telegram webhooks, etc.)
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            try {
                const jsonData = JSON.parse(rawBody.toString('utf-8'));
                console.log('Received JSON data:', JSON.stringify(jsonData, null, 2));
                
                // Handle Telegram callback queries (inline keyboard)
                if (jsonData && jsonData.callback_query) {
                    console.log('Processing Telegram callback query...');
                    return handleTelegramCallback(jsonData.callback_query, res);
                }

                // Handle Telegram messages (search commands and general search)
                if (jsonData && jsonData.message && jsonData.message.chat && jsonData.message.text) {
                    return handleTelegramMessage(jsonData.message, res);
                }
                
                // Handle other JSON payloads (like email services that send JSON)
                if (jsonData.raw) {
                    rawBody = Buffer.from(jsonData.raw, 'utf-8');
                    sourceEmail = jsonData.source;
                }
            } catch (jsonError) {
                console.log('Failed to parse JSON, treating as raw email:', jsonError.message);
            }
        }
        
        // Check if we have raw body for email parsing
        if (!rawBody) {
            console.error('Webhook error: rawBody is null or undefined');
            console.log('Request headers:', req.headers);
            console.log('Request method:', req.method);
            return res.status(400).json({ 
                error: 'No email content received',
                message: 'Please ensure the request contains email content in the body.',
                headers: req.headers
            });
        }
        
        // Parse the raw email
        const parsedEmail = await simpleParser(rawBody);

        // Handle cancellation emails - BULLETPROOF VERSION
        if (parsedEmail.subject && parsedEmail.subject.toLowerCase().includes('cancelled booking')) {
            console.log('[CANCEL] Cancellation email detected:', {
                subject: parsedEmail.subject,
                from: parsedEmail.from?.value?.[0]?.address
            });
    
            
            // Extract booking number from multiple sources
            let bookingNumber = null;
            
            // Try to extract from subject first - support both Bokun and tours.co.th formats
            const subjectMatch = parsedEmail.subject.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
            if (subjectMatch && subjectMatch[1]) {
                bookingNumber = subjectMatch[1];
            }
            
            // If not found in subject, try to extract from body
            if (!bookingNumber && parsedEmail.text) {
                const bodyMatch = parsedEmail.text.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
                if (bodyMatch && bodyMatch[1]) {
                    bookingNumber = bodyMatch[1];
                }
            }
            
            // If still not found, try HTML body
            if (!bookingNumber && parsedEmail.html) {
                const htmlText = convert(parsedEmail.html, { wordwrap: false });
                const htmlMatch = htmlText.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
                if (htmlMatch && htmlMatch[1]) {
                    bookingNumber = htmlMatch[1];
                }
            }
            
            // Additional fallback: look for any number that could be a booking number in the email
            if (!bookingNumber) {
                const allText = `${parsedEmail.subject} ${parsedEmail.text || ''} ${parsedEmail.html ? convert(parsedEmail.html, { wordwrap: false }) : ''}`;
                // Look for patterns like "34680" (just numbers) or "BK12345" (letters + numbers)
                const numberMatch = allText.match(/(?:Booking|Booking ID|Booking #|Ext\. booking ref)\s*([A-Z0-9]{4,10})/gi);
                if (numberMatch && numberMatch.length > 0) {
                    // Extract the number from the first match
                    const extracted = numberMatch[0].match(/([A-Z0-9]{4,10})/i);
                    if (extracted && extracted[1]) {
                        bookingNumber = extracted[1];
                    }
                }
            }
            
            if (bookingNumber) {
                console.log('[CANCEL] Extracted booking number:', bookingNumber);
                
                try {
                    // Check if booking exists before sending notification
                    const { rows: existingBookings } = await sql`
                        SELECT booking_number FROM bookings WHERE booking_number = ${bookingNumber}
                    `;
                    
                    if (existingBookings.length > 0) {
                        // Send cancellation notification to Telegram only if booking exists
                        const nm = new NotificationManager();
                        const tourDate = existingBookings[0].tour_date;
                        await nm.sendCancellationNotification(bookingNumber, 'Email cancellation received', null, tourDate);
                        
                        // Trigger web notification for cancellation
                        await triggerWebNotification({
                            booking_number: bookingNumber,
                            customer_name: existingBookings[0].customer_name,
                            program: existingBookings[0].program,
                            tour_date: existingBookings[0].tour_date,
                            adult: existingBookings[0].adult,
                            child: existingBookings[0].child,
                            infant: existingBookings[0].infant,
                            action: 'cancelled'
                        });
                    }
                    
                    // Delete from all relevant tables
                    await sql`DELETE FROM bookings WHERE booking_number = ${bookingNumber}`;
                    
                    await sql`DELETE FROM parsed_emails WHERE booking_number = ${bookingNumber}`;
                    
                    // Note: If you have other tables with booking_number, add them here
                    // await sql`DELETE FROM accounting WHERE booking_number = ${bookingNumber}`;
                    // await sql`DELETE FROM other_table WHERE booking_number = ${bookingNumber}`;
                    
                    return res.status(200).send(`Webhook processed: Booking ${bookingNumber} completely removed (cancelled).`);
                    
                } catch (error) {
                    console.error(`[CANCEL] Error removing booking ${bookingNumber}:`, error);
                    return res.status(500).send(`Error removing cancelled booking: ${error.message}`);
                }
            } else {
                console.warn('[CANCEL] Cancelled booking email detected, but booking number not found in subject or body');
                console.warn('[CANCEL] Subject:', parsedEmail.subject);
                console.warn('[CANCEL] Body preview:', parsedEmail.text ? parsedEmail.text.substring(0, 200) : 'No text body');
                return res.status(400).send('Webhook processed: Cancelled booking email, but booking number not found.');
            }
        }

        const parser = EmailParserFactory.create(parsedEmail);

        if (!parser) {
            console.warn('[SKIP] No suitable parser found or subject incorrect:', {
                subject: parsedEmail.subject,
                from: parsedEmail.from?.value?.[0]?.address,
            });
            return res.status(200).send('Email skipped: No suitable parser found or subject incorrect.');
        }

        // Check if this is a Thailand Tours email with multiple bookings
        let bookingsToProcess = [];
        if (parser instanceof ThailandToursParser) {
            try {
                const multipleBookings = parser.extractMultipleBookings();
                if (multipleBookings.length > 1) {
                    console.log(`[MULTIPLE] Found ${multipleBookings.length} bookings in Thailand Tours email`);
                    bookingsToProcess = multipleBookings;
                } else {
                    // Fall back to single booking
                    const { responseTemplate, extractedInfo } = parser.formatBookingDetails();
                    bookingsToProcess = [extractedInfo];
                }
            } catch (error) {
                console.error('[MULTIPLE] Error extracting multiple bookings, falling back to single:', error);
                const { responseTemplate, extractedInfo } = parser.formatBookingDetails();
                bookingsToProcess = [extractedInfo];
            }
        } else {
            // Use the original single booking logic for other parsers
            const { responseTemplate, extractedInfo } = parser.formatBookingDetails();
            bookingsToProcess = [extractedInfo];
        }

        // Process each booking
        const processedBookings = [];
        for (const extractedInfo of bookingsToProcess) {
            // Always insert or update into parsed_emails for analytics
            await sql`
              INSERT INTO parsed_emails (sender, subject, body, source_email, booking_number, parsed_at)
              VALUES (
                ${parsedEmail.from?.value?.[0]?.address || ''},
                ${parsedEmail.subject || ''},
                ${rawBody},
                ${sourceEmail},
                ${extractedInfo.bookingNumber || null},
                NOW()
              )
              ON CONFLICT (booking_number) DO UPDATE
                SET sender = EXCLUDED.sender,
                    subject = EXCLUDED.subject,
                    body = EXCLUDED.body,
                    source_email = EXCLUDED.source_email,
                    parsed_at = EXCLUDED.parsed_at;
            `;

            // Extract order link from email content if it's from tours.co.th
            let orderLink = null;
            if (parsedEmail.from?.value?.[0]?.address?.includes('tours.co.th')) {
              console.log(`[ORDER-LINK] Processing tours.co.th email for booking ${extractedInfo.bookingNumber}`);
              const emailContent = parsedEmail.html || parsedEmail.text || '';
              console.log(`[ORDER-LINK] Email content type: HTML=${!!parsedEmail.html}, Text=${!!parsedEmail.text}`);
              console.log(`[ORDER-LINK] Email content length: ${emailContent.length} characters`);
              
              // Analyze the email content structure for debugging
              analyzeEmailContent(emailContent);
              
              orderLink = extractOrderLinkFromEmail(emailContent);
              
              if (orderLink && extractedInfo.bookingNumber) {
                console.log(`[ORDER-LINK] SUCCESS: Extracted order link for booking ${extractedInfo.bookingNumber}: ${orderLink}`);
              } else {
                console.log(`[ORDER-LINK] FAILED: No order link extracted for booking ${extractedInfo.bookingNumber}`);
              }
              
              // Store the order link in the extractedInfo object so it can be accessed later
              extractedInfo.orderLink = orderLink;
            }

            if (!extractedInfo || extractedInfo.tourDate === 'N/A' || !extractedInfo.isoDate) {
                console.warn('[SKIP] Skipped due to invalid date:', {
                    bookingNumber: extractedInfo?.bookingNumber,
                    tourDate: extractedInfo?.tourDate,
                    isoDate: extractedInfo?.isoDate,
                });
                continue; // Skip this booking but continue with others
            }
            if (!extractedInfo.bookingNumber) {
                console.warn('[SKIP] Skipped due to missing booking number:', extractedInfo);
                continue; // Skip this booking but continue with others
            }

            processedBookings.push(extractedInfo);
        }

        if (processedBookings.length === 0) {
            return res.status(200).send('Webhook processed: No valid bookings found.');
        }

        // Process each booking individually
        const results = [];
        for (const extractedInfo of processedBookings) {
            try {
                const { rows: existingBookings } = await sql`
                    SELECT * FROM bookings WHERE booking_number = ${extractedInfo.bookingNumber};
                `;

                const adult = parseInt(extractedInfo.adult, 10) || 0;
                const child = parseInt(extractedInfo.child, 10) || 0;
                const infant = parseInt(extractedInfo.infant, 10) || 0;
                const paid = extractedInfo.paid !== undefined && extractedInfo.paid !== null && extractedInfo.paid !== '' ? Number(parseFloat(extractedInfo.paid).toFixed(2)) : null;

                if (existingBookings.length > 0) {
                    // Compare all relevant fields
                    const existing = existingBookings[0];
                    let changed = false;
                    // PRIORITY: If SKU exists, look up correct program name and rate from database for comparison
                    let comparisonProgram = extractedInfo.program;
                    let comparisonRate = extractedInfo.rate;
                    
                    // If SKU is provided, prioritize database program name over email program name
                    if (extractedInfo.sku && extractedInfo.sku.trim() !== '') {
                        try {
                            // Look up the correct program name and rate for this SKU
                            const { rows: productRows } = await sql`
                                SELECT p.program, r.name as rate_name
                                FROM products p 
                                LEFT JOIN rates r ON p.id = r.product_id 
                                WHERE p.sku = ${extractedInfo.sku}
                                ORDER BY r.id 
                                LIMIT 1
                            `;
                            
                            if (productRows.length > 0) {
                                // PRIORITY: Use database program name if SKU matches
                                if (productRows[0].program) {
                                    comparisonProgram = productRows[0].program;
                                }
                                // Use database rate if no rate was extracted from email
                                if ((!comparisonRate || comparisonRate.trim() === '') && productRows[0].rate_name) {
                                    comparisonRate = productRows[0].rate_name;
                                }
                            }
                        } catch (error) {
                            console.error(`[SKU-PRIORITY-UPDATE] Error looking up program/rate for SKU ${extractedInfo.sku}:`, error);
                        }
                    }

                    const fields = [
                      ['tour_date', extractedInfo.isoDate],
                      ['sku', extractedInfo.sku],
                      ['program', comparisonProgram],
                      ['customer_name', extractedInfo.name],
                      ['adult', adult],
                      ['child', child],
                      ['infant', infant],
                      ['hotel', extractedInfo.hotel],
                      ['phone_number', extractedInfo.phoneNumber],
                      ['raw_tour_date', extractedInfo.tourDate],
                      ['paid', paid],
                      ['book_date', extractedInfo.book_date],
                      ['rate', comparisonRate],
                      ['order_number', extractedInfo.orderNumber]
                    ];
                    let updatedFields = existing.updated_fields || {};
                    let anyFieldChanged = false;
                    for (const [key, value] of fields) {
                      if ((existing[key] ?? '').toString() !== (value ?? '').toString()) {
                        updatedFields[key] = true;
                        anyFieldChanged = true;
                      }
                    }
                    // Remove highlights if more than one day after tour_date
                    let clearHighlight = false;
                    if (existing.tour_date) {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      let tourDateStr = '';
                      if (typeof existing.tour_date === 'string') {
                        tourDateStr = existing.tour_date.substring(0, 10);
                      } else if (existing.tour_date instanceof Date) {
                        tourDateStr = existing.tour_date.toISOString().substring(0, 10);
                      }
                      if (tourDateStr) {
                        const tourDate = new Date(tourDateStr);
                        const dayAfterTour = new Date(tourDate);
                        dayAfterTour.setDate(tourDate.getDate() + 1);
                        if (today > dayAfterTour) {
                          updatedFields = {};
                          clearHighlight = true;
                        }
                      }
                    }
                    if (anyFieldChanged || clearHighlight) {
                      await sql`
                        UPDATE bookings SET tour_date=${extractedInfo.isoDate}, sku=${extractedInfo.sku}, program=${comparisonProgram}, customer_name=${extractedInfo.name}, adult=${adult}, child=${child}, infant=${infant}, hotel=${extractedInfo.hotel}, phone_number=${extractedInfo.phoneNumber}, raw_tour_date=${extractedInfo.tourDate}, paid=${paid}, book_date=${extractedInfo.book_date}, rate=${comparisonRate}, order_number=${extractedInfo.orderNumber}, order_link=${extractedInfo.orderLink}, updated_fields=${JSON.stringify(updatedFields)}
                        WHERE booking_number = ${extractedInfo.bookingNumber}
                      `;
                      
                      // Trigger web notification for booking update
                      await triggerWebNotification({
                        booking_number: extractedInfo.bookingNumber,
                        customer_name: extractedInfo.name,
                        program: comparisonProgram,
                        tour_date: extractedInfo.isoDate,
                        adult,
                        child,
                        infant,
                        action: 'updated'
                      });
                      
                      results.push({ bookingNumber: extractedInfo.bookingNumber, action: 'updated' });
                    } else {
                      results.push({ bookingNumber: extractedInfo.bookingNumber, action: 'unchanged' });
                    }
                } else {
                    if (adult === 0) {
                        await sql`DELETE FROM bookings WHERE booking_number = ${extractedInfo.bookingNumber}`;
                        results.push({ bookingNumber: extractedInfo.bookingNumber, action: 'removed' });
                        continue;
                    }
                    
                    // Determine channel based on sender and email content
                    let channel = 'Website';
                    if (parsedEmail.from && parsedEmail.from.value && parsedEmail.from.value[0]) {
                      const sender = parsedEmail.from.value[0].address || '';
                      
                      if (sender.includes('tours.co.th')) {
                        // All emails from tours.co.th are Website
                        channel = 'Website';
                      } else if (sender.includes('bokun.io')) {
                        // For bokun.io emails, check the content for "Sold by"
                        const emailContent = parsedEmail.html || parsedEmail.text || '';
                        if (emailContent.includes('Sold by') && emailContent.includes('GetYourGuide')) {
                          channel = 'GYG';
                        } else if (emailContent.includes('Sold by') && emailContent.includes('Viator.com')) {
                          channel = 'Viator';
                        } else {
                          // Default for bokun.io emails
                          channel = 'Viator';
                        }
                      } else {
                        channel = 'Website';
                      }
                    }

                    // PRIORITY: If SKU exists in email, look up correct program name from database
                    let finalProgram = extractedInfo.program;
                    let finalRate = extractedInfo.rate;
                    
                    console.log(`[SKU-PRIORITY] Email SKU: "${extractedInfo.sku}"`);
                    console.log(`[SKU-PRIORITY] Email program: "${extractedInfo.program}"`);
                    console.log(`[SKU-PRIORITY] Email rate: "${extractedInfo.rate}"`);
                    
                    // If SKU is provided, prioritize database program name over email program name
                    if (extractedInfo.sku && extractedInfo.sku.trim() !== '') {
                        try {
                            // Look up the correct program name and rate for this SKU
                            const { rows: productRows } = await sql`
                                SELECT p.program, r.name as rate_name
                                FROM products p 
                                LEFT JOIN rates r ON p.id = r.product_id 
                                WHERE p.sku = ${extractedInfo.sku}
                                ORDER BY r.id 
                                LIMIT 1
                            `;
                            
                            console.log(`[SKU-PRIORITY] Database lookup found ${productRows.length} products for SKU ${extractedInfo.sku}`);
                            if (productRows.length > 0) {
                                // PRIORITY: Use database program name if SKU matches
                                if (productRows[0].program) {
                                    finalProgram = productRows[0].program;
                                    console.log(`[SKU-PRIORITY] Using database program: "${finalProgram}" (overriding email program)`);
                                }
                                // Use database rate if no rate was extracted from email
                                if ((!finalRate || finalRate.trim() === '') && productRows[0].rate_name) {
                                    finalRate = productRows[0].rate_name;
                                    console.log(`[SKU-PRIORITY] Using database rate: "${finalRate}"`);
                                }
                            } else {
                                console.log(`[SKU-PRIORITY] No products found in database for SKU ${extractedInfo.sku}, using email program`);
                            }
                        } catch (error) {
                            console.error(`[SKU-PRIORITY] Error looking up program/rate for SKU ${extractedInfo.sku}:`, error);
                        }
                    } else {
                        console.log(`[SKU-PRIORITY] No SKU provided, using email program: "${finalProgram}"`);
                    }

                    // Calculate net_total for the booking
                    let netTotal = 0;
                    if (extractedInfo.sku && finalRate) {
                        try {
                            const { rows: rateRows } = await sql`
                                SELECT r.net_adult, r.net_child, r.fee_adult, r.fee_child, r.fee_type
                                FROM rates r
                                JOIN products p ON r.product_id = p.id
                                WHERE p.sku = ${extractedInfo.sku} AND r.name = ${finalRate}
                                LIMIT 1
                            `;
                            
                            if (rateRows.length > 0) {
                                const rate = rateRows[0];
                                
                                // Calculate net_total based on passengers and rates
                                if (adult > 0) {
                                    netTotal += (rate.net_adult * adult);
                                    if (rate.fee_type === 'per_person' && rate.fee_adult) {
                                        netTotal += (rate.fee_adult * adult);
                                    }
                                }
                                
                                if (child > 0) {
                                    netTotal += (rate.net_child * child);
                                    if (rate.fee_type === 'per_person' && rate.fee_child) {
                                        netTotal += (rate.fee_child * child);
                                    }
                                }
                                
                                if (rate.fee_type === 'total' && rate.fee_adult) {
                                    netTotal += rate.fee_adult;
                                }
                                
                                console.log(`[NET-TOTAL] Calculated net_total: ${netTotal} for SKU ${extractedInfo.sku}, rate ${finalRate}`);
                            } else {
                                console.log(`[NET-TOTAL] No rate found for SKU ${extractedInfo.sku} and rate ${finalRate}`);
                            }
                        } catch (error) {
                            console.error(`[NET-TOTAL] Error calculating net_total:`, error);
                        }
                    }

                    await sql`
                        INSERT INTO bookings (booking_number, order_number, tour_date, sku, program, customer_name, customer_email, adult, child, infant, hotel, phone_number, notification_sent, raw_tour_date, paid, book_date, channel, rate, net_total, order_link)
                        VALUES (${extractedInfo.bookingNumber}, ${extractedInfo.orderNumber}, ${extractedInfo.isoDate}, ${extractedInfo.sku}, ${finalProgram}, ${extractedInfo.name}, ${extractedInfo.customerEmail}, ${adult}, ${child}, ${infant}, ${extractedInfo.hotel}, ${extractedInfo.phoneNumber}, FALSE, ${extractedInfo.tourDate}, ${paid}, ${extractedInfo.book_date}, ${channel}, ${finalRate}, ${netTotal}, ${extractedInfo.orderLink})
                        ON CONFLICT (booking_number) DO UPDATE SET
                          order_number = EXCLUDED.order_number,
                          tour_date = EXCLUDED.tour_date,
                          sku = EXCLUDED.sku,
                          program = EXCLUDED.program,
                          customer_name = EXCLUDED.customer_name,
                          customer_email = EXCLUDED.customer_email,
                          adult = EXCLUDED.adult,
                          child = EXCLUDED.child,
                          infant = EXCLUDED.infant,
                          hotel = EXCLUDED.hotel,
                          phone_number = EXCLUDED.phone_number,
                          notification_sent = EXCLUDED.notification_sent,
                          raw_tour_date = EXCLUDED.raw_tour_date,
                          paid = EXCLUDED.paid,
                          book_date = EXCLUDED.book_date,
                          channel = EXCLUDED.channel,
                          rate = EXCLUDED.rate,
                          net_total = EXCLUDED.net_total,
                          order_link = EXCLUDED.order_link;
                    `;

                    // Send Telegram notification for ALL new bookings regardless of date
                    const nm = new NotificationManager();
                    await nm.sendTelegramWithButtons({
                      booking_number: extractedInfo.bookingNumber,
                      tour_date: extractedInfo.isoDate,
                      sku: extractedInfo.sku,
                      program: finalProgram,
                      customer_name: extractedInfo.name,
                      adult,
                      child,
                      infant,
                      hotel: extractedInfo.hotel,
                      phone_number: extractedInfo.phoneNumber,
                      raw_tour_date: extractedInfo.tourDate,
                      paid,
                      book_date: extractedInfo.book_date,
                      channel,
                      rate: finalRate,
                      start_time: extractedInfo.start_time
                    });

                    // Trigger web notification for new booking
                    await triggerWebNotification({
                      booking_number: extractedInfo.bookingNumber,
                      customer_name: extractedInfo.name,
                      program: finalProgram,
                      tour_date: extractedInfo.isoDate,
                      adult,
                      child,
                      infant
                    });

                    results.push({ bookingNumber: extractedInfo.bookingNumber, action: 'inserted' });
                }
            } catch (error) {
                console.error(`[ERROR][DB] Database error while processing booking ${extractedInfo.bookingNumber}:`, error);
                results.push({ bookingNumber: extractedInfo.bookingNumber, action: 'error', error: error.message });
            }
        }

        // Return summary of all processed bookings
        const summary = results.map(r => `${r.bookingNumber} (${r.action})`).join(', ');
        return res.status(200).send(`Webhook processed: ${summary}`);

    } catch (error) {
        console.error('Error in webhook processing:', error);
        return res.status(500).json({ error: 'Error processing email.', details: error.message });
    }
}

// Function to notify connected clients about booking updates
async function notifyBookingUpdate(bookingNumber, action = 'updated') {
    try {
        // This would typically send a message to connected SSE clients
        // In a production environment, you might want to:
        // 1. Store notifications in a database
        // 2. Use a message queue system
        // 3. Implement WebSocket or SSE broadcasting
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Function to trigger web notifications for new bookings, updates, and cancellations
async function triggerWebNotification(booking) {
    try {
        const action = booking.action || 'new';
        
        // Store notification in database for web clients to check
        await sql`
            INSERT INTO web_notifications (booking_number, customer_name, program, tour_date, adult, child, infant, created_at, action)
            VALUES (${booking.booking_number}, ${booking.customer_name}, ${booking.program}, ${booking.tour_date}, ${booking.adult}, ${booking.child}, ${booking.infant}, NOW(), ${action})
            ON CONFLICT (booking_number) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                program = EXCLUDED.program,
                tour_date = EXCLUDED.tour_date,
                adult = EXCLUDED.adult,
                child = EXCLUDED.child,
                infant = EXCLUDED.infant,
                action = EXCLUDED.action,
                created_at = NOW()
        `;
        
        console.log(`[WEB-NOTIFICATION] Stored ${action} notification for booking ${booking.booking_number}`);
    } catch (error) {
        console.error('Error storing web notification:', error);
    }
}

// Helper function to create direct order link from order ID
function createDirectOrderLink(orderId) {
  if (!orderId) return null;
  
  // Create a direct link to the WooCommerce order
  const directLink = `https://tours.co.th/wp-admin/admin.php?page=wc-orders&action=edit&id=${orderId}`;
  console.log('[ORDER-LINK-DEBUG] Created direct order link:', directLink);
  return directLink;
}

// Helper function to validate if a URL is actually an order edit link
function isValidOrderEditUrl(url) {
  if (!url) return false;
  
  // Must be a tours.co.th URL
  if (!url.includes('tours.co.th')) return false;
  
  // Must contain order-related paths
  const validPaths = [
    '/wp-admin/admin.php?page=wc-orders',
    '/wp-admin/admin.php?page=orders',
    '/wp-admin/edit.php?post_type=shop_order',
    '/my-account/orders/',
    '/order/',
    '/booking/'
  ];
  
  return validPaths.some(path => url.includes(path));
}

// Helper function to extract order ID from various sources
function extractOrderIdFromContent(emailContent) {
  // Look for order ID patterns in the email content
  const patterns = [
    /order\s*#?\s*:?\s*(\d{4,6})/i,
    /order\s*id\s*:?\s*(\d{4,6})/i,
    /order\s*number\s*:?\s*(\d{4,6})/i,
    /booking\s*#?\s*:?\s*(\d{4,6})/i,
    /id\s*:?\s*(\d{4,6})/i,
    /(\d{4,6})/ // Look for 4-6 digit numbers that might be order IDs
  ];
  
  for (const pattern of patterns) {
    const match = emailContent.match(pattern);
    if (match && match[1]) {
      const orderId = match[1];
      // Validate that this looks like a reasonable order ID
      if (orderId.length >= 4 && orderId.length <= 6 && !isNaN(parseInt(orderId))) {
        console.log('[ORDER-LINK-DEBUG] Extracted valid order ID:', orderId);
        return orderId;
      }
    }
  }
  
  return null;
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser; 
module.exports.ThailandToursParser = ThailandToursParser; 