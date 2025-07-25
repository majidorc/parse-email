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
        this.telegramBotToken = null;
        this.telegramChatId = null;
        this.notificationEmailTo = null;
    }

    async getTelegramBotToken() {
        if (this.telegramBotToken) return this.telegramBotToken;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT telegram_bot_token FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.telegramBotToken = rows[0]?.telegram_bot_token || '';
        return this.telegramBotToken;
    }

    async getTelegramChatId() {
        if (this.telegramChatId) return this.telegramChatId;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT telegram_chat_id FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.telegramChatId = rows[0]?.telegram_chat_id || '';
        return this.telegramChatId;
    }

    async getNotificationEmailTo() {
        if (this.notificationEmailTo) return this.notificationEmailTo;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT notification_email_to FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.notificationEmailTo = rows[0]?.notification_email_to || '';
        return this.notificationEmailTo;
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
        // Compose program line for info@tours.co.th
        let programLine = `Program : ${program}`;
        if (booking.channel && booking.channel.includes('tours.co.th')) {
            const rate = booking.rate || '';
            const startTime = booking.start_time || '';
            if (rate && startTime) {
                programLine = `Program : ${program} - ${rate} - ${startTime}`;
            } else if (rate) {
                programLine = `Program : ${program} - ${rate}`;
            } else if (startTime) {
                programLine = `Program : ${program} - ${startTime}`;
            } else {
                programLine = `Program : ${program}`;
            }
        }
        // National Park Fee logic
        const cashOnTour = booking.national_park_fee ? 'National Park Fee' : 'None';
        // Build message lines, omitting any with 'N/A'
        const lines = [
            'Please confirm the *pickup time* for this booking:',
            `Booking no : ${bookingNumber}`,
            `Tour date : ${tourDate}`,
            programLine,
            `Name : ${customerName}`,
            `Pax : ${paxString} (Total: ${totalPax})`,
            hotel !== 'N/A' ? `Hotel : ${hotel}` : null,
            phoneNumber !== 'N/A' ? `Phone Number : ${phoneNumber}` : null,
            `Cash on tour : ${cashOnTour}`,
            '', // blank line between cash and next
            `Please mentioned if there is any additional charge for transfer collect from customer`
        ];
        return lines.filter(Boolean).join('\n');
    }

    // Helper to get the label for the tour date (Today/Tomorrow/Day After Tomorrow/Other)
    getTourDateLabel(tourDateStr) {
        if (!tourDateStr) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const date = new Date(tourDateStr);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((dateOnly - today) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays === 2) return 'Day After Tomorrow';
        return '';
    }

    // Helper to format the pre-message
    formatTourDatePreMessage(booking) {
        const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
        const label = this.getTourDateLabel(booking.tour_date);
        return `Tour Date: ${tourDate}${label ? ` (${label})` : ''}`;
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
                await this.sendTelegramWithButtons(booking);
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
        const to = await this.getNotificationEmailTo();
        if (!to) throw new Error('No notification email address set');
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: to,
            subject: `Booking Notification: ${booking.booking_number}`,
            text: message
        };
        await this.transporter.sendMail(mailOptions);
    }

    async sendEmailNotification(subject, text, html) {
        const to = await this.getNotificationEmailTo();
        if (!to) throw new Error('No notification email address set');
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: to,
            subject: subject,
            text: text,
            html: html
        };
        await this.transporter.sendMail(mailOptions);
    }

    async sendTelegram(message, booking = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const chatId = await this.getTelegramChatId();
        // If booking is provided, send the pre-message first
        if (booking) {
            const preMessage = this.formatTourDatePreMessage(booking);
            await axios.post(url, {
                chat_id: chatId,
                text: preMessage
            });
        }
        // Wrap message in triple backticks for monospace font
        const monoMessage = '```' + message + '```';
        await axios.post(url, {
            chat_id: chatId,
            text: monoMessage,
            parse_mode: 'Markdown'
        });
    }

    // New: Unified sendTelegramWithButtons for all Telegram notifications
    async sendTelegramWithButtons(booking, chat_id = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const message = this.constructNotificationMessage(booking);
        // Pre-message (tour date)
        const preMessage = this.formatTourDatePreMessage(booking);
        const chatId = chat_id || await this.getTelegramChatId();
        await axios.post(url, {
            chat_id: chatId,
            text: preMessage
        });
        // Inline keyboard: first row OP | RI | Customer, second row National Park Fee
        const opText = `OP${booking.op ? ' ✓' : ' X'}`;
        const riText = `RI${booking.ri ? ' ✓' : ' X'}`;
        const customerText = `Customer${booking.customer ? ' ✓' : ' X'}`;
        const parkFeeText = `Cash on tour : National Park Fee ${booking.national_park_fee ? '✅' : '❌'}`;
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: opText, callback_data: `toggle:op:${booking.booking_number}` },
                        { text: riText, callback_data: `toggle:ri:${booking.booking_number}` },
                        { text: customerText, callback_data: `toggle:customer:${booking.booking_number}` }
                    ],
                    [
                        { text: parkFeeText, callback_data: `toggle:parkfee:${booking.booking_number}` }
                    ]
                ]
            }
        });
    }
}

module.exports = NotificationManager;