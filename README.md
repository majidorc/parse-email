# Email Auto-Responder

An automated email processing system that extracts booking information from incoming emails and sends formatted responses. Built for Vercel deployment.

## Features

- **Automatic Email Processing**: Receives emails via webhook and extracts booking information
- **Smart Information Extraction**: Uses regex patterns to find booking details like:
  - Booking number (from Ext. booking ref)
  - Tour date (just day, month, year from subject or Date field)
  - Program/tour name (from Product field)
  - Customer name (removes any email address)
  - Passenger counts (adult, child, infant; omits child/infant if 0)
  - Hotel information (from Pick-up field)
  - Phone number (digits only)
- **Automated Response**: Sends formatted confirmation emails with extracted information
- **Sender Authorization**: Only processes emails from authorized senders
- **Vercel Ready**: Deploy directly to Vercel with serverless functions

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

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Set up the following environment variables in your Vercel project:

```bash
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=your-email@gmail.com

# Authorized Senders (comma-separated)
ALLOWED_SENDERS=sender1@example.com,sender2@example.com
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 4. Configure Email Webhook

To receive emails automatically, set up a free Google Apps Script to forward emails from Gmail to your webhook. See `email-forwarder.gs` for details.

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

## Customization

### Adding New Extraction Patterns

Edit the `EmailParser` class in `api/webhook.js` to add new regex patterns:

```javascript
extractCustomField() {
  const patterns = [
    /your\s*pattern\s*:?\s*([^\n\r]+)/i,
    /another\s*pattern\s*:?\s*([^\n\r]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = this.content.match(pattern);
    if (match) return match[1].trim();
  }
  return 'N/A';
}
```

### Modifying Response Template

Update the `sendResponse` method in the `EmailSender` class:

```javascript
const responseTemplate = `Your custom response template here...`;
```

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