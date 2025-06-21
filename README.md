# Email Auto-Responder

An automated email processing system that extracts booking information from incoming emails and sends formatted responses. Built for Vercel deployment.

## Features

- **Automatic Email Processing**: Receives emails via a webhook and forwards them for parsing.
- **Config-Driven Parsing**: Uses a `config.json` file to map sender email addresses to specific parsers, allowing for easy customization without code changes.
- **Multi-Format Support**: Comes with pre-built parsers for different email structures:
  - `BokunParser`: For table-based emails (e.g., from GetYourGuide, Viator).
  - `ThailandToursParser`: For plain-text emails with various formats.
- **Smart Information Extraction**: Each parser is tailored to extract key booking details like booking number, tour date, program name, customer name, passenger count, and hotel/pickup location.
- **Automated Response**: Sends a standardized, formatted confirmation email with the extracted information.
- **Vercel Ready**: Designed for easy deployment with Vercel serverless functions.

## How It Works

1.  An email is sent to your designated inbox (e.g., a Gmail account).
2.  A **Google Apps Script** (see `email-forwarder.gs`) forwards the raw email content to the Vercel webhook (`/api/webhook`).
3.  The webhook receives the email and identifies the sender's address.
4.  It consults `config.json` to find the correct parser for that sender.
5.  The selected parser extracts the booking information.
6.  A formatted confirmation email is sent to your business address.

## Configuration

### 1. `config.json`

This file is the heart of the system's flexibility. It maps a sender's email address to a specific parser class.

**Example `config.json`:**
```json
[
  {
    "fromAddress": "no-reply@bokun.io",
    "parserName": "BokunParser"
  },
  {
    "fromAddress": "info@tours.co.th",
    "parserName": "ThailandToursParser"
  }
]
```
To support a new sender, simply add a new object to this array with their `fromAddress` and the `parserName` you want to use.

### 2. Environment Variables

Set up the following environment variables in your Vercel project for sending emails:

```bash
# SMTP Configuration for sending the final formatted email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-business-email@gmail.com
SMTP_PASS=your-google-app-password
FROM_EMAIL=your-business-email@gmail.com
```

## Setup & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Your Parsers
Modify `config.json` to match the sender emails you want to process.

### 3. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

### 4. Set Up the Email Forwarder
Follow the instructions in `email-forwarder.gs` to set up a Google Apps Script that forwards emails from your monitoring inbox (e.g., Gmail) to your new Vercel webhook URL.

## Customization

To support a completely new email layout, you can create a new parser class.

1.  **Create the Parser**: Add a new class in `api/webhook.js` that extends `BaseEmailParser`.
2.  **Implement Methods**: Implement the required extraction methods (`extractAll`, `formatBookingDetails`, etc.).
3.  **Update Factory**: Add the new parser to the `parsers` object in the `EmailParserFactory`.
4.  **Update Config**: Add a rule to `config.json` to map a sender's email to your new parser's name.

## Testing

The project includes a comprehensive test suite. To run it:
```bash
node test-email.js
```
This script uses the sample emails defined within it to test each parser directly, allowing you to quickly verify that changes work as expected.

## Field Extraction & Formatting Rules

- **Booking no**: Extracted from `Ext. booking ref` (e.g., `1275699329`)
- **Tour date**: Extracted as just the day, month, and year (e.g., `8.Jan '26`) from either the subject or the `Date` field
- **Program**: Extracted from the `Product` field (removes product code prefix)
- **Name**: Extracted from the `Customer` field, with any email address removed
- **Pax**: If there are no children or infants, those parts are omitted (e.g., `2 adult` or `2 adult, 1 child, 1 infant`)
- **Hotel**: Extracted from the `Pick-up` field
- **Phone Number**: Only digits (e.g., `330666962682`)

## Example Output

```
Please confirm the *pickup time* for this booking:

Booking no : 1275699329
Tour date : 8.Jan '26
Program : Phi Phi , Khai & Maya : Unforgettable Island Hopping by Speedboat
Name : Orc, Majid
Pax : 2 adult, 1 child, 1 infant
Hotel : Access Resort & Villas
Phone Number : +66 123456
Cash on tour : None

Please mentioned if there is any additional charge for transfer collect from customer
```

If there are no children or infants, the Pax line will be just `2 adult`.

## API Endpoint

### POST /api/webhook

Receives email content and sends automated response.

**Request Body:**
```json
{
  "email": "Raw email content (RFC 2822 format)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Automated response sent successfully",
  "extractedInfo": {
    "bookingNumber": "1275699329",
    "tourDate": "8.Jan '26",
    "program": "Phi Phi , Khai & Maya : Unforgettable Island Hopping by Speedboat",
    "name": "Orc, Majid",
    "adult": "2",
    "child": "1",
    "infant": "1",
    "hotel": "Access Resort & Villas",
    "phoneNumber": "+66 123456"
  }
}
```

## Email Format Recognition

The system recognizes various email formats and extracts information using these patterns:

### Booking Number
- `Booking no: BK123456`
- `Booking number: BK123456`
- `Confirmation #: BK123456`

### Tour Date
- `Tour date: 15/12/2024`
- `Date: 15-12-2024`
- `15/12/2024`

### Program/Tour
- `Program: City Tour`
- `Tour: Beach Package`
- `Package: Mountain Adventure`

### Customer Name
- `Name: John Doe`
- `Customer name: John Doe`
- `Guest name: John Doe`

### Passengers
- `2 adult, 1 child, 0 infant`
- `Adults: 2, Children: 1, Infants: 0`

### Hotel
- `Hotel: Grand Hotel`
- `Accommodation: Beach Resort`
- `Pickup from: Downtown Hotel`

### Phone Number
- `Phone: +1234567890`
- `Contact number: (123) 456-7890`
- `Tel: 123-456-7890`

## Response Template

The system automatically sends this formatted response:

```
Please confirm the *pickup time* for this booking:

Booking no : {extracted booking number}
Tour date : {extracted tour date}
Program : {extracted program}
Name : {extracted name}
Pax : {extracted adult} adult , {extracted child} child , {extracted infant} infant
Hotel : {extracted hotel}
Phone Number : {extracted phone number}
Cash on tour : None

Please mentioned if there is any additional charge for transfer collect from customer
```

## Security Features

- **Sender Authorization**: Only processes emails from authorized senders
- **Input Validation**: Validates email content before processing
- **Error Handling**: Comprehensive error handling and logging
- **CORS Support**: Proper CORS headers for webhook integration

## Troubleshooting

### Common Issues

1. **SMTP Authentication Failed**
   - Ensure SMTP credentials are correct
   - For Gmail, use App Passwords instead of regular passwords
   - Check if 2FA is enabled and use App Passwords

2. **Webhook Not Receiving Emails**
   - Verify webhook URL is correct
   - Check email service configuration
   - Ensure CORS headers are properly set

3. **Information Not Extracted**
   - Check email format matches expected patterns
   - Review regex patterns in EmailParser class
   - Test with sample email content

### Testing

You can test the webhook locally using curl:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "email": "From: sender@example.com\nSubject: Test Booking\n\nBooking no: BK123456\nTour date: 15/12/2024\nProgram: City Tour\nName: John Doe\n2 adult, 1 child\nHotel: Grand Hotel\nPhone: +1234567890"
  }'
```

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Vercel function logs
3. Test with sample email content
4. Verify environment variables are set correctly 

## Changelog

See `CHANGELOG.md` for recent updates.

## License
MIT 