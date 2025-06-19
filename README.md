# Email Auto-Responder

An automated email processing system that extracts booking information from incoming emails and sends formatted responses. Built for Vercel deployment.

## Features

- **Automatic Email Processing**: Receives emails via webhook and extracts booking information
- **Smart Information Extraction**: Uses regex patterns to find booking details like:
  - Booking number
  - Tour date
  - Program/tour name
  - Customer name
  - Passenger counts (adult, child, infant)
  - Hotel information
  - Phone number
- **Automated Response**: Sends formatted confirmation emails with extracted information
- **Sender Authorization**: Only processes emails from authorized senders
- **Vercel Ready**: Deploy directly to Vercel with serverless functions

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

To receive emails automatically, you'll need to set up an email-to-webhook service. Here are some options:

#### Option A: Using Zapier
1. Create a Zapier account
2. Set up a trigger for new emails in Gmail
3. Add a webhook action pointing to your Vercel endpoint: `https://your-app.vercel.app/api/webhook`
4. Configure the webhook to send the email content in the request body

#### Option B: Using Integromat/Make
1. Create a scenario for email processing
2. Add Gmail trigger for new emails
3. Add HTTP request to your webhook endpoint
4. Map email content to the request body

#### Option C: Using Email Service Providers
- **SendGrid Inbound Parse**: Configure to forward emails to your webhook
- **Mailgun Routes**: Set up routes to forward emails to your webhook
- **Postmark Inbound**: Configure webhook for incoming emails

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
    "bookingNumber": "BK123456",
    "tourDate": "15/12/2024",
    "program": "City Tour",
    "name": "John Doe",
    "adult": "2",
    "child": "1",
    "infant": "0",
    "hotel": "Grand Hotel",
    "phoneNumber": "+1234567890"
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