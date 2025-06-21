const { simpleParser } = require('mailparser');
const { BokunParser, ThailandToursParser } = require('./api/webhook');

// ######################################################
// #### SAMPLE EMAIL 1: Bokun.io / GetYourGuide ########
// ######################################################
const getYourGuideEmail = `
From: "Bókun Notifications" <no-reply@bokun.io>
Subject: New booking: Sat 21 Jun '25 @ 09:00 (TT-T99002050) Ext. booking ref: GYGVN3W8ZKMV
Content-Type: text/html; charset=UTF-8

<!DOCTYPE html><html><body>
<div style="font-size: 14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">The following booking was just created.</div>
<table style="border-collapse: collapse;width: auto;display: inline-block;border: 1px solid black;">
    <tbody>
        <tr><td><strong>Ext. booking ref</strong></td><td>GYGVN3W8ZKMV</td></tr>
        <tr><td><strong>Product</strong></td><td>194613P46 - Koh Samui Private Longtail Boat To Koh Tan, Koh Madsum and Koh Rap</td></tr>
        <tr><td><strong>Customer</strong></td><td>Teng, Joel</td></tr>
        <tr><td><strong>Customer phone</strong></td><td>+6583333918</td></tr>
        <tr><td><strong>Date</strong></td><td>Sat 21 Jun '25 @ 09:00</td></tr>
        <tr><td><strong>PAX</strong></td><td>4 Adult</td></tr>
        <tr><td><strong>Pick-up</strong></td><td>Rocky's Boutique Resort - Veranda Collection Samui, 438, T. 1, Tambon Maret, Amphoe Ko Samui, Chang Wat Surat Thani 84310, Thailand</td></tr>
    </tbody>
</table>
</body></html>
`;


// ######################################################
// #### SAMPLE EMAIL 2: Bokun.io / Viator ###############
// ######################################################
const viatorEmail = `
From: "Bókun Notifications" <no-reply@bokun.io>
Subject: New booking: Wed 16 Apr '25 @ 13:30 (TT-T93114602) Ext. booking ref: 1248796575
Content-Type: text/html; charset=UTF-8

<!DOCTYPE html><html><body>
<div style="font-size: 14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">The following booking was just created.</div>
<table style="border-collapse: collapse;width: auto;display: inline-block;border: 1px solid black;">
    <tbody>
        <tr><td><strong>Ext. booking ref</strong></td><td>1248796575</td></tr>
        <tr><td><strong>Product</strong></td><td>HKT0037 - Khai Islands Speedboat Trip: Half-Day Khai Nok, Nai & Nui</td></tr>
        <tr><td><strong>Customer</strong></td><td>Joenson, Anita</td></tr>
        <tr><td><strong>Customer phone</strong></td><td>DK+45 24667270</td></tr>
        <tr><td><strong>Date</strong></td><td>Wed 16 Apr '25 @ 13:30</td></tr>
        <tr><td><strong>PAX</strong></td><td>2 Adult<br>2 Child</td></tr>
        <tr><td><strong>Pick-up</strong></td><td>Centara Karon Resort Phuket</td></tr>
    </tbody>
</table>
</body></html>
`;


// ######################################################
// #### SAMPLE EMAIL 3: Thailand Tours ##################
// ######################################################
const thailandToursEmail = `
From: "Thailand Tours" <info@tours.co.th>
Subject: New Booking (6862011376)
Content-Type: text/plain; charset=UTF-8

New Order: #6862011376

Order Details
Order number: 6862011376
Order date: June 20, 2025

Product Price
Best of Phuket: Half-Day City Tour & ATV Experience
Booking #64145 Paid
- JUNE 21, 2025
- Time: Morning
- Adults (+1), TTL 1

Billing address
zarah shemperlain
front village hotel karon beach
225
Thailand
+6612345678
zarah@hotmail.com

Congratulations on the sale
`;


async function testParser(emailType, emailContent, ParserClass) {
    console.log(`\n=================================================`);
    console.log(`========= TESTING: ${emailType} ===============`);
    console.log(`=================================================`);
    try {
        const parsedEmail = await simpleParser(emailContent);
        const contentToParse = parsedEmail.html || parsedEmail.text;
        
        let parser;
        // The factory logic is in the main handler, here we test the parsers directly
        if (ParserClass.name === "BokunParser") {
            parser = new BokunParser(contentToParse);
        } else if (ParserClass.name === "ThailandToursParser") {
            parser = new ThailandToursParser(contentToParse);
        }

        if (!parser) {
            throw new Error("Could not instantiate parser for test.");
        }

        const { responseTemplate, extractedInfo } = parser.formatBookingDetails();

        console.log("--------- Extracted Info ---------");
        console.log(extractedInfo);
        console.log("\n--------- Formatted Response ---------");
        console.log(responseTemplate);
        console.log("\n--------- TEST SUCCEEDED ---------\n");

    } catch (error) {
        console.error(`\n!!!!!!!!!! TEST FAILED for ${emailType} !!!!!!!!!!!`);
        console.error(error);
    }
}


async function runAllTests() {
    await testParser("Bokun / GetYourGuide", getYourGuideEmail, BokunParser);
    await testParser("Bokun / Viator", viatorEmail, BokunParser);
    await testParser("Thailand Tours", thailandToursEmail, ThailandToursParser);
}

runAllTests(); 