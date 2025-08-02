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
        // Build the update query
        const setClauses = Object.keys(update).map((col, i) => `${col} = $${i + 2}`);
        const values = [bookingId, ...Object.values(update)];
        if (setClauses.length > 0) {
    
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
    
    // Clean hotel name - remove "THAILAND" from the end and zip codes like "Phuket 83150"
    const cleanHotel = hotel ? hotel
        .replace(/\s*THAILAND\s*$/i, '') // Remove "THAILAND" from the end
        .replace(/\s+[A-Za-z]+\s+\d{5}\s*$/i, '') // Remove zip codes like "Phuket 83150"
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
    return this.findValueByLabel('Product').replace(/^[A-Z0-9]+\s*-\s*/, '').replace(/[^a-zA-Z0-9\s,:'&\-]/g, ' ').replace(/\s+/g, ' ').trim();
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
        return this._findLineValue('ORDER NUMBER:');
    }

    // NEW: Extract multiple bookings from the same email
    extractMultipleBookings() {
        const bookings = [];
        const orderNumber = this.extractBookingNumber();
        
        console.log('[DEBUG] extractMultipleBookings - Order Number:', orderNumber);
        
        // Find all booking sections in the email
        const bookingSections = this._findBookingSections();
        console.log('[DEBUG] extractMultipleBookings - Found booking sections:', bookingSections.length);
        
        for (const section of bookingSections) {
            console.log('[DEBUG] extractMultipleBookings - Processing section:', section[0]);
            const booking = this._extractSingleBooking(section, orderNumber);
            if (booking && booking.bookingNumber) {
                console.log('[DEBUG] extractMultipleBookings - Extracted booking:', booking.bookingNumber, 'with', booking.adult, 'adults');
                bookings.push(booking);
            } else {
                console.log('[DEBUG] extractMultipleBookings - Failed to extract booking from section');
            }
        }
        
        console.log('[DEBUG] extractMultipleBookings - Total bookings extracted:', bookings.length);
        
        // If no multiple bookings found, fall back to single booking extraction
        if (bookings.length === 0) {
            console.log('[DEBUG] extractMultipleBookings - No bookings found, falling back to single booking');
            const singleBooking = this.extractAll();
            if (singleBooking.bookingNumber && singleBooking.bookingNumber !== 'N/A') {
                bookings.push(singleBooking);
            }
        }
        
        return bookings;
    }

    // NEW: Find all booking sections in the email
    _findBookingSections() {
        const sections = [];
        let currentSection = [];
        let inBookingSection = false;
        
        console.log('[DEBUG] _findBookingSections - Total lines:', this.lines.length);
        
        for (const line of this.lines) {
            // Check if this line starts a new booking (look for "Booking #XXXXX" specifically)
            if (line.includes('Booking #') && /\d+/.test(line)) {
                console.log('[DEBUG] _findBookingSections - Found booking line:', line);
                // If we were in a booking section, save it
                if (inBookingSection && currentSection.length > 0) {
                    sections.push([...currentSection]);
                    console.log('[DEBUG] _findBookingSections - Saved section with', currentSection.length, 'lines');
                }
                // Start new section
                currentSection = [line];
                inBookingSection = true;
            } else if (inBookingSection) {
                currentSection.push(line);
            }
        }
        
        // Add the last section
        if (inBookingSection && currentSection.length > 0) {
            sections.push(currentSection);
            console.log('[DEBUG] _findBookingSections - Saved final section with', currentSection.length, 'lines');
        }
        
        console.log('[DEBUG] _findBookingSections - Total sections found:', sections.length);
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
        const pax = { adult: '0', child: '0', infant: '0' };
        
        console.log('[DEBUG] _extractPassengersFromSection - Processing section with', sectionLines.length, 'lines');
        
        // Look for the specific passenger line in this section
        for (const line of sectionLines) {
            // Look for patterns like "Adult: 4", "Adults: 4", "Person (+4 Years): 4"
            const adultMatch = line.match(/adult[s]?[^\d]*(\d+)\s*$/i) || line.match(/adult[s]?.*?:\s*(\d+)/i);
            if (adultMatch && adultMatch[1]) {
                console.log('[DEBUG] _extractPassengersFromSection - Found adult match:', line, '->', adultMatch[1]);
                pax.adult = adultMatch[1]; // Take the first match, don't accumulate
                break; // Found adult count, stop looking
            }
            
            // Person (+4 Years): N (treat as adult)
            const personPlusMatch = line.match(/person \(\+\d+ years\):\s*(\d+)/i);
            if (personPlusMatch && personPlusMatch[1]) {
                console.log('[DEBUG] _extractPassengersFromSection - Found person+ match:', line, '->', personPlusMatch[1]);
                pax.adult = personPlusMatch[1];
                break; // Found adult count, stop looking
            }
        }
        
        // Look for child count
        for (const line of sectionLines) {
            const childMatch = line.match(/child[ren|s]?[^\d]*(\d+)\s*$/i) || line.match(/child[ren|s]?.*?:\s*(\d+)/i);
            if (childMatch && childMatch[1]) {
                console.log('[DEBUG] _extractPassengersFromSection - Found child match:', line, '->', childMatch[1]);
                pax.child = childMatch[1];
                break; // Found child count, stop looking
            }
        }
        
        // Look for infant count
        for (const line of sectionLines) {
            const infantMatch = line.match(/infant[s]?[^\d]*(\d+)\s*$/i) || line.match(/infant[s]?.*?:\s*(\d+)/i);
            if (infantMatch && infantMatch[1]) {
                console.log('[DEBUG] _extractPassengersFromSection - Found infant match:', line, '->', infantMatch[1]);
                pax.infant = infantMatch[1];
                break; // Found infant count, stop looking
            }
        }
        
        console.log('[DEBUG] _extractPassengersFromSection - Final passenger counts:', pax);
        return pax;
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
        // If no explicit adult/child/infant found, fallback to 'Person: N'
        if (pax.adult === '0' && pax.child === '0' && pax.infant === '0') {
            const personLine = this.lines.find(line => /person\s*:\s*\d+/i.test(line));
            if (personLine) {
                const personMatch = personLine.match(/person\s*:\s*(\d+)/i);
                if (personMatch && personMatch[1]) {
                    pax.adult = (parseInt(pax.adult, 10) + parseInt(personMatch[1], 10)).toString();
                    pax.child = '0';
                    pax.infant = '0';
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
        
        console.log('[RATE-EXTRACTION] Looking for rate in full email lines:', this.lines.length, 'lines');
        
        // Look for patterns like "Kayaking: With Kayaking", "Kayaking: Without Kayaking", etc.
        for (const line of this.lines) {
            const trimmedLine = line.trim();
            console.log('[RATE-EXTRACTION] Checking line:', trimmedLine);
            
            // Look for patterns like "With Kayaking", "Without Kayaking", etc.
            if (trimmedLine.includes('With') || trimmedLine.includes('Without')) {
                // If it's a colon-separated line like "Kayaking: With Kayaking", extract only the part after colon
                const colonIndex = trimmedLine.indexOf(':');
                if (colonIndex !== -1 && colonIndex > 0) {
                    const afterColon = trimmedLine.substring(colonIndex + 1).trim();
                    if (afterColon) {
                        rate = afterColon;
                        console.log('[RATE-EXTRACTION] Found rate (colon pattern):', rate);
                        break;
                    }
                } else {
                    rate = trimmedLine;
                    console.log('[RATE-EXTRACTION] Found rate (With/Without):', rate);
                    break;
                }
            }
            
            // Look for patterns like "Rate:", "Price:", etc.
            if (trimmedLine.toLowerCase().includes('rate:') || trimmedLine.toLowerCase().includes('price:')) {
                const colonIndex = trimmedLine.indexOf(':');
                if (colonIndex !== -1) {
                    rate = trimmedLine.substring(colonIndex + 1).trim();
                    console.log('[RATE-EXTRACTION] Found rate (Rate/Price):', rate);
                    break;
                }
            }
        }
        
        console.log('[RATE-EXTRACTION] Final extracted rate:', rate);
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
                    // Use the rate from email parsing (which includes addon information) for field comparison
                    let comparisonRate = extractedInfo.rate;
                    // Only fall back to database lookup if no rate was extracted from email
                    if ((!comparisonRate || comparisonRate.trim() === '') && extractedInfo.sku && extractedInfo.sku.trim() !== '') {
                        try {
                            // Look up the first available rate for this SKU
                            const { rows: rateRows } = await sql`
                                SELECT r.name 
                                FROM products p 
                                JOIN rates r ON p.id = r.product_id 
                                WHERE p.sku = ${extractedInfo.sku}
                                ORDER BY r.id 
                                LIMIT 1
                            `;
                            
                            if (rateRows.length > 0) {
                                comparisonRate = rateRows[0].name;
                            }
                        } catch (error) {
                            console.error(`[AUTO-RATE] Error looking up rate for field comparison SKU ${extractedInfo.sku}:`, error);
                        }
                    }

                    const fields = [
                      ['tour_date', extractedInfo.isoDate],
                      ['sku', extractedInfo.sku],
                      ['program', extractedInfo.program],
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
                        UPDATE bookings SET tour_date=${extractedInfo.isoDate}, sku=${extractedInfo.sku}, program=${extractedInfo.program}, customer_name=${extractedInfo.name}, adult=${adult}, child=${child}, infant=${infant}, hotel=${extractedInfo.hotel}, phone_number=${extractedInfo.phoneNumber}, raw_tour_date=${extractedInfo.tourDate}, paid=${paid}, book_date=${extractedInfo.book_date}, rate=${comparisonRate}, order_number=${extractedInfo.orderNumber}, updated_fields=${JSON.stringify(updatedFields)}
                        WHERE booking_number = ${extractedInfo.bookingNumber}
                      `;
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

                    // Use the rate from email parsing (which includes addon information)
                    let finalRate = extractedInfo.rate;
                    console.log(`[RATE-DEBUG] Extracted rate from email: "${extractedInfo.rate}"`);
                    console.log(`[RATE-DEBUG] SKU: "${extractedInfo.sku}"`);
                    
                    // Only fall back to database lookup if no rate was extracted from email
                    if ((!finalRate || finalRate.trim() === '') && extractedInfo.sku && extractedInfo.sku.trim() !== '') {
                        try {
                            // Look up the first available rate for this SKU
                            const { rows: rateRows } = await sql`
                                SELECT r.name 
                                FROM products p 
                                JOIN rates r ON p.id = r.product_id 
                                WHERE p.sku = ${extractedInfo.sku}
                                ORDER BY r.id 
                                LIMIT 1
                            `;
                            
                            console.log(`[RATE-DEBUG] Database lookup found ${rateRows.length} rates for SKU ${extractedInfo.sku}`);
                            if (rateRows.length > 0) {
                                finalRate = rateRows[0].name;
                                console.log(`[RATE-DEBUG] Using database rate: "${finalRate}"`);
                            } else {
                                console.log(`[RATE-DEBUG] No rates found in database for SKU ${extractedInfo.sku}`);
                            }
                        } catch (error) {
                            console.error(`[AUTO-RATE] Error looking up rate for SKU ${extractedInfo.sku}:`, error);
                        }
                    } else {
                        console.log(`[RATE-DEBUG] Using email-extracted rate: "${finalRate}"`);
                    }

                    await sql`
                        INSERT INTO bookings (booking_number, order_number, tour_date, sku, program, customer_name, adult, child, infant, hotel, phone_number, notification_sent, raw_tour_date, paid, book_date, channel, rate)
                        VALUES (${extractedInfo.bookingNumber}, ${extractedInfo.orderNumber}, ${extractedInfo.isoDate}, ${extractedInfo.sku}, ${extractedInfo.program}, ${extractedInfo.name}, ${adult}, ${child}, ${infant}, ${extractedInfo.hotel}, ${extractedInfo.phoneNumber}, FALSE, ${extractedInfo.tourDate}, ${paid}, ${extractedInfo.book_date}, ${channel}, ${finalRate})
                        ON CONFLICT (booking_number) DO UPDATE SET
                          order_number = EXCLUDED.order_number,
                          tour_date = EXCLUDED.tour_date,
                          sku = EXCLUDED.sku,
                          program = EXCLUDED.program,
                          customer_name = EXCLUDED.customer_name,
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
                          rate = EXCLUDED.rate;
                    `;

                    // Send Telegram notification for ALL new bookings regardless of date
                    const nm = new NotificationManager();
                    await nm.sendTelegramWithButtons({
                      booking_number: extractedInfo.bookingNumber,
                      tour_date: extractedInfo.isoDate,
                      sku: extractedInfo.sku,
                      program: extractedInfo.program,
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

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports.BokunParser = BokunParser;
module.exports.ThailandToursParser = ThailandToursParser; 
module.exports.ThailandToursParser = ThailandToursParser; 