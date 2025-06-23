const nodemailer = require('nodemailer');
const axios = require('axios');

/**
 * Manages sending notifications via Email and Telegram.
 */
class NotificationManager {

  /**
   * Escapes special characters for Telegram's MarkdownV2 format.
   * @param {string} text - The text to escape.
   * @returns {string} - The escaped text.
   */
  escapeTelegramMarkdown(text) {
      if (text === null || typeof text === 'undefined') {
          return '';
      }
      const escapeChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
      return String(text).replace(new RegExp(`[${escapeChars.join('\\')}]`, 'g'), '\\$&');
  }

  /**
   * Constructs the notification message from booking data.
   * @param {object} booking - The booking data from the database.
   * @returns {object} - An object containing the response template and individual fields.
   */
  constructNotificationMessage(booking) {
    // Robustly find the core booking data, whether it's nested or not.
    const details = booking.extractedInfo ? booking.extractedInfo : booking;

    // Use the raw_tour_date for display if available, otherwise format the tour_date.
    const tourDate = details.raw_tour_date || 
                     (details.tour_date ? new Date(details.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A');

    let paxString = details.pax;
    if (!paxString) {
        const parts = [];
        const adult = parseInt(details.adult, 10) || 0;
        const child = parseInt(details.child, 10) || 0;
        const infant = parseInt(details.infant, 10) || 0;

        if (adult > 0) parts.push(`${adult} Adult${adult > 1 ? 's' : ''}`);
        if (child > 0) parts.push(`${child} Child${child > 1 ? 'ren' : ''}`);
        if (infant > 0) parts.push(`${infant} Infant${infant > 1 ? 's' : ''}`);
        
        paxString = parts.join(', ') || 'N/A';
    }

    // Use a consistent source for all properties
    const bookingNumber = details.bookingNumber || details.booking_number;
    const program = details.program;
    const customerName = details.name || details.customer_name;
    const hotel = details.hotel;
    const phoneNumber = details.phoneNumber || details.phone_number;


    const responseTemplate = `Please confirm the *pickup time* for this booking:\n\n` +
                             `Booking no : ${bookingNumber}\n` +
                             `Tour date : ${tourDate}\n` +
                             `Program : ${program}\n` +
                             `Name : ${customerName}\n` +
                             `Pax : ${paxString}\n` +
                             `Hotel : ${hotel}\n` +
                             `Phone Number : ${phoneNumber}\n` +
                             `Cash on tour : None\n\n` +
                             `Please mentioned if there is any additional charge for transfer collect from customer`;

    return {
      responseTemplate,
      bookingNumber,
      tourDate,
      program,
      customerName,
      pax: paxString,
      hotel,
      phoneNumber,
    };
  }

  /**
   * Sends an email notification.
   * @param {object} messageData - The message data from constructNotificationMessage.
   */
  async sendEmail(messageData) {
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true' || !process.env.SMTP_HOST) {
      console.log('Email notifications are disabled or SMTP host is not configured.');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_PORT == '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'Booking Notification'}" <${process.env.FROM_EMAIL}>`,
        to: 'o0dr.orc0o@gmail.com',
        subject: `Booking Confirmation - ${messageData.bookingNumber}`,
        text: messageData.responseTemplate,
        html: messageData.responseTemplate.replace(/\n/g, '<br>'),
      });
      console.log(`Email sent for booking ${messageData.bookingNumber}`);
    } catch (error) {
      console.error(`Failed to send email for booking ${messageData.bookingNumber}:`, error);
    }
  }

  /**
   * Sends a Telegram notification.
   * @param {object} messageData - The message data from constructNotificationMessage.
   */
  async sendTelegram(messageData) {
    if (process.env.ENABLE_TELEGRAM_NOTIFICATIONS !== 'true' || !process.env.TELEGRAM_BOT_TOKEN) {
      console.log('Telegram notifications are disabled or bot token is not configured.');
      return;
    }
    
    try {
      const messageBodyForCopy = `Booking no : ${messageData.bookingNumber}\n` +
                                 `Tour date : ${messageData.tourDate}\n` +
                                 `Program : ${messageData.program}\n` +
                                 `Name : ${messageData.customerName}\n` +
                                 `Pax : ${messageData.pax}\n` +
                                 `Hotel : ${messageData.hotel}\n` +
                                 `Phone Number : ${messageData.phoneNumber}\n` +
                                 `Cash on tour : None\n\n` +
                                 `Please mentioned if there is any additional charge for transfer collect from customer`;
      
      const introText = `New Booking For ${messageData.tourDate}`;
      const escapedIntro = this.escapeTelegramMarkdown(introText);

      const message = `${escapedIntro}\n\n` +
                      "Details to copy:\n" +
                      "```\n" +
                      messageBodyForCopy +
                      "\n```";

      const payload = {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'MarkdownV2'
      };
      
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
      console.log(`Telegram message sent for booking ${messageData.bookingNumber}`);
    } catch (error) {
      console.error(`Failed to send Telegram message for booking ${messageData.bookingNumber}:`, error.response ? error.response.data : error.message);
    }
  }

  /**
   * Sends all configured notifications.
   * @param {object} booking - The raw booking object from the database.
   */
  async sendAll(booking) {
    console.log('--- NOTIFICATION MANAGER: INCOMING DATA ---');
    console.log(JSON.stringify(booking, null, 2));
    console.log('-------------------------------------------');
    
    const messageData = this.constructNotificationMessage(booking);
    
    const promises = [
      this.sendEmail(messageData),
      this.sendTelegram(messageData)
    ];
    
    await Promise.allSettled(promises);
  }
}

module.exports = NotificationManager; 