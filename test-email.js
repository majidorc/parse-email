const { simpleParser } = require('mailparser');

// Sample email content for testing
const sampleEmail = `From: sender@example.com
To: recipient@example.com
Subject: Booking Confirmation
Date: Mon, 15 Dec 2024 10:00:00 +0000

Dear Team,

Please find the booking details below:

Booking no: BK123456
Tour date: 15/12/2024
Program: City Tour Package
Name: John Doe
2 adult, 1 child, 0 infant
Hotel: Grand Hotel Downtown
Phone Number: +1234567890

Best regards,
Sender`;

// Email parser class (same as in webhook.js)
class EmailParser {
  constructor(emailContent) {
    this.content = emailContent;
  }

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