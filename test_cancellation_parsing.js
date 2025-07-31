// Test script for cancellation email parsing
// This tests the updated cancellation logic with tours.co.th email format

const { simpleParser } = require('mailparser');
const convert = require('html-to-text');

// Sample tours.co.th cancellation email content
const sampleEmail = `Delivered-To: o0dr.orc0o@gmail.com
Received: by 2002:a05:7010:708a:b0:43a:645b:9485 with SMTP id nk10csp1569464mdc;
        Thu, 31 Jul 2025 05:40:34 -0700 (PDT)
From: Thailand Tours <info@tours.co.th>
Subject: [Thailand Tours] A booking of Full Moon Party by Speedboat Transfer has been cancelled
To: info@tours.co.th
Content-Type: text/plain; charset="UTF-8"

Thailand Tours

Booking Cancelled

The following booking has been cancelled. The details of the cancelled
booking can be found below.
Booked Product
Full Moon Party by Speedboat Transfer

   - *Ticket Option:*

   Roundtrip
   - *Pickup time:*

   09:00-09:30 pm
   - *Return (For roundtrip option):*

   03:00 am

* Booking #34680 Cancelled *

   - August 9, 2025
   - Person =E0=B8=BF1099: 2

View booking =E2=86=92

Booking ID 34680
Booking Start Date August 9, 2025
Booking End Date August 9, 2025
Person =E0=B8=BF1099 2

You can view and edit this booking in the dashboard here: Edit booking

Copyright =C2=A9 2025 Thailand Tours, All rights reserved.`;

async function testCancellationParsing() {
    console.log('Testing cancellation email parsing...\n');
    
    try {
        // Parse the email
        const parsedEmail = await simpleParser(sampleEmail);
        
        console.log('Parsed email subject:', parsedEmail.subject);
        console.log('Parsed email text preview:', parsedEmail.text?.substring(0, 200));
        
        // Test the cancellation detection
        const isCancellation = parsedEmail.subject && parsedEmail.subject.toLowerCase().includes('cancelled booking');
        console.log('\nIs cancellation email?', isCancellation);
        
        if (isCancellation) {
            console.log('\nExtracting booking number...');
            
            let bookingNumber = null;
            
            // Test subject extraction
            const subjectMatch = parsedEmail.subject.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
            if (subjectMatch && subjectMatch[1]) {
                bookingNumber = subjectMatch[1];
                console.log('Found in subject:', bookingNumber);
            }
            
            // Test body extraction
            if (!bookingNumber && parsedEmail.text) {
                const bodyMatch = parsedEmail.text.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
                if (bodyMatch && bodyMatch[1]) {
                    bookingNumber = bodyMatch[1];
                    console.log('Found in body:', bookingNumber);
                }
            }
            
            // Test fallback extraction
            if (!bookingNumber) {
                const allText = `${parsedEmail.subject} ${parsedEmail.text || ''}`;
                const numberMatch = allText.match(/(?:Booking|Booking ID|Booking #|Ext\. booking ref)\s*([A-Z0-9]{4,10})/gi);
                if (numberMatch && numberMatch.length > 0) {
                    const extracted = numberMatch[0].match(/([A-Z0-9]{4,10})/i);
                    if (extracted && extracted[1]) {
                        bookingNumber = extracted[1];
                        console.log('Found in fallback:', bookingNumber);
                    }
                }
            }
            
            console.log('\nFinal extracted booking number:', bookingNumber);
            
            if (bookingNumber) {
                console.log('✅ SUCCESS: Booking number extracted correctly');
            } else {
                console.log('❌ FAILED: Could not extract booking number');
            }
        }
        
    } catch (error) {
        console.error('Error testing cancellation parsing:', error);
    }
}

// Run the test
testCancellationParsing(); 