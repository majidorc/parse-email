const { simpleParser } = require('mailparser');

// Sample Bokun.io booking notification
const sampleEmail = `From: no-reply@bokun.io
To: recipient@example.com
Subject: New booking: Fri 20.Jun '25 @ 07:30 (TT-T98893827) Ext. booking ref: 1275699329

The following booking was just created.

Booking ref.     VIA-68941697
Product booking ref.  TT-T98893827
Ext. booking ref  1275699329
Product     HKT0041 - Phi Phi , Khai & Maya : Unforgettable Island Hopping by Speedboat
Supplier    Tours.co.th
Sold by     Viator.com
Booking channel   Viator.com

Customer    Giroud, Marie-Caroline
Customer email    S-7f97c8c8268b4170a01a497bdac5132f+1275699329-9spw235pfaj9n@evpmessaging.tripadvisor.com
Customer phone    FR+33 0666962682
Date    Fri 20.Jun '25 @ 07:30
Rate    Included transfer (Inzone)
PAX     2 Adult
Pick-up     Access Resort & Villas
Extras
Created     Thu, June 19 2025 @ 15:52

Notes    --- Inclusions: ---
Coffee and/or Tea - Coffee, tea, and juice, along with bakery and fresh fruits, are complimentary at the pier
Bottled water
Lunch
Seasonal Fruit
Use of Snorkelling equipment

--- Booking languages: ---
GUIDE : English
Viator amount: THB 2600.0`;

// Email parser class (same as in webhook.js)
class EmailParser {
  constructor(emailContent) {
    this.content = emailContent;
  }

  extractBookingNumber() {
    // First try to find VIA booking reference
    const viaMatch = this.content.match(/Booking ref\.\s*([A-Z0-9-]+)/i);
    if (viaMatch) return viaMatch[1];

    // Then try external booking reference
    const extMatch = this.content.match(/Ext\. booking ref\s*(\d+)/i);
    if (extMatch) return extMatch[1];

    return 'N/A';
  }

  extractTourDate() {
    const dateMatch = this.content.match(/Date\s*([^\n]+)/i);
    if (dateMatch) return dateMatch[1].trim();
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
    const pickupMatch = this.content.match(/Pick-up\s*([^\n]+)/i);
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

// Test function
async function testEmailParsing() {
  try {
    console.log('Testing Email Parsing...\n');
    
    // Parse the sample email
    const parsed = await simpleParser(sampleEmail);
    console.log('Parsed Email:');
    console.log('From:', parsed.from?.value?.[0]?.address);
    console.log('Subject:', parsed.subject);
    console.log('Date:', parsed.date);
    console.log('\nEmail Content:');
    console.log(parsed.text || parsed.html);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Extract information
    const emailParser = new EmailParser(parsed.text || parsed.html || '');
    const extractedInfo = emailParser.extractAll();
    
    console.log('Extracted Information:');
    console.log(JSON.stringify(extractedInfo, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Generate response template
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

    console.log('Generated Response:');
    console.log(responseTemplate);
    
  } catch (error) {
    console.error('Error testing email parsing:', error);
  }
}

// Run the test
testEmailParsing(); 