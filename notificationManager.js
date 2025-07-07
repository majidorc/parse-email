const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('./config.json');

class NotificationManager {
    constructor() {
        // Setup nodemailer transporter for email
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    constructNotificationMessage(booking) {
        // Matches frontend format
        const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
        const adult = parseInt(booking.adult, 10) || 0;
        const child = parseInt(booking.child, 10) || 0;
        const infant = parseInt(booking.infant, 10) || 0;
        const parts = [];
        parts.push(`${adult} Adult${adult === 1 ? '' : 's'}`);
        if (child > 0) parts.push(`${child} Child${child === 1 ? '' : 'ren'}`);
        if (infant > 0) parts.push(`${infant} Infant${infant === 1 ? '' : 's'}`);
        const paxString = parts.join(', ');
        const totalPax = adult + child + infant;
        const bookingNumber = booking.booking_number;
        const program = booking.program;
        const customerName = booking.customer_name;
        const hotel = booking.hotel;
        const phoneNumber = booking.phone_number || '';
        return `Please confirm the *pickup time* for this booking:\n\n` +
            `Booking no : ${bookingNumber}\n` +
            `Tour date : ${tourDate}\n` +
            `Program : ${program}\n` +
            `Name : ${customerName}\n` +
            `Pax : ${paxString} (Total: ${totalPax})\n` +
            `Hotel : ${hotel}\n` +
            `Phone Number : ${phoneNumber}\n` +
            `Cash on tour : None\n\n` +
            `Please mentioned if there is any additional charge for transfer collect from customer`;
    }

    async sendAll(booking) {
        const message = this.constructNotificationMessage(booking);
        const results = [];
        if (config.notifications.email.enabled) {
            try {
                await this.sendEmail(booking, message);
                results.push('email');
            } catch (e) { console.error('Email notification failed:', e); }
        }
        if (config.notifications.telegram.enabled) {
            try {
                await this.sendTelegram(message);
                results.push('telegram');
            } catch (e) { console.error('Telegram notification failed:', e); }
        }
        if (config.notifications.line.enabled) {
            try {
                await this.sendLine(message);
                results.push('line');
            } catch (e) { console.error('LINE notification failed:', e); }
        }
        return results;
    }

    async sendEmail(booking, message) {
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: process.env.NOTIFY_EMAIL_TO,
            subject: `Booking Notification: ${booking.booking_number}`,
            text: message
        };
        await this.transporter.sendMail(mailOptions);
    }

    async sendTelegram(message) {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        // Wrap message in triple backticks for monospace font
        const monoMessage = '```' + message + '```';
        await axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: monoMessage,
            parse_mode: 'Markdown'
        });
    }

    async sendTelegramWithButtons(booking, message) {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        // Wrap message in triple backticks for monospace font
        const monoMessage = '```' + message + '```';
        await axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: monoMessage,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'OP', callback_data: `op:${booking.booking_number}` },
                        { text: 'RI', callback_data: `ri:${booking.booking_number}` },
                        { text: 'Customer', callback_data: `customer:${booking.booking_number}` }
                    ]
                ]
            }
        });
    }

    async sendLine(message) {
        const url = 'https://api.line.me/v2/bot/message/push';
        await axios.post(url, {
            to: process.env.LINE_USER_ID,
            messages: [{ type: 'text', text: message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
    }

    async sendLineButton(message, op, customer) {
        // Example: send a button template to LINE (customize as needed)
        const url = 'https://api.line.me/v2/bot/message/push';
        await axios.post(url, {
            to: process.env.LINE_USER_ID,
            messages: [{
                type: 'template',
                altText: message,
                template: {
                    type: 'buttons',
                    text: message,
                    actions: [
                        {
                            type: 'postback',
                            label: op ? 'OP ✓' : 'OP X',
                            data: 'toggle:op:'
                        },
                        {
                            type: 'postback',
                            label: customer ? 'Customer ✓' : 'Customer X',
                            data: 'toggle:customer:'
                        }
                    ]
                }
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
    }
}

module.exports = NotificationManager; 