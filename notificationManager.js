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
        // Format tour date as "6 May 26"
        const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
        const adult = parseInt(booking.adult, 10) || 0;
        const child = parseInt(booking.child, 10) || 0;
        const infant = parseInt(booking.infant, 10) || 0;
        const totalPax = adult + child + infant;
        const bookingNumber = booking.booking_number;
        const program = booking.program;
        const customerName = booking.customer_name;
        const hotel = booking.hotel;
        const phoneNumber = booking.phone_number || '';
        
        // Clean hotel name - remove "THAILAND" from the end and zip codes like "Phuket 83150"
        const cleanHotel = hotel ? hotel
            .replace(/\s*THAILAND\s*$/i, '') // Remove "THAILAND" from the end
            .replace(/\s+[A-Za-z]+\s+\d{5}\s*$/i, '') // Remove zip codes like "Phuket 83150"
            .trim() : '';
        
        // Compose program line with rate title for tours.co.th
        let programLine = `Program : ${program}`;
        if (booking.channel && booking.channel.includes('tours.co.th')) {
            const rate = booking.rate || '';
            if (rate) {
                programLine = `Program : ${program} + {rate title}`;
            }
        }
        
        // Dynamic cash on tour text based on national_park_fee value
        // Handle case where national_park_fee column doesn't exist
        const cashOnTourText = booking.national_park_fee !== undefined && booking.national_park_fee ? 'National Park Fee' : 'None';
        
        // Build message lines exactly as requested - dynamic cash on tour text
        const lines = [
            '🆕 Please confirm for this booking:',
            '',
            `📋 Booking no : ${bookingNumber}`,
            `📅 Tour date : ${tourDate}`,
            programLine,
            `👤 Name : ${customerName}`,
            `👥 Pax : ${adult} Adults (Total: ${totalPax})`,
            `🏨 Hotel : ${cleanHotel}`,
            `📞 Phone Number : ${phoneNumber}`,
            `💵 Cash on tour : ${cashOnTourText}`
        ];
        return lines.join('\n');
    }

    // Helper to get the label for the tour date (Today/Tomorrow/Day After Tomorrow/Other)
    getTourDateLabel(tourDateStr) {
        if (!tourDateStr) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const date = new Date(tourDateStr);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((dateOnly - today) / (1000 * 60 * 60 * 24));
        
        // Format the date as "27 Jul 25"
        const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        
        // Get the label
        let label = '';
        if (diffDays === 0) label = 'Today';
        else if (diffDays === 1) label = 'Tomorrow';
        else if (diffDays === 2) label = 'Day After Tomorrow';
        
        // Return formatted date with label
        return `${formattedDate} - ${label}`;
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
        const chatId = chat_id || await this.getTelegramChatId();
        
        // Format tour date label
        const tourDateLabel = this.getTourDateLabel(booking.tour_date);
        
        // Create one message with HTML formatting
        const formattedMessage = `<b>${tourDateLabel}</b>\n<code>${message}</code>`;
        
        // Dynamic cash on tour text for button
        const cashOnTourButtonText = booking.national_park_fee ? 'National Park Fee' : 'None';
        
        await axios.post(url, {
            chat_id: chatId,
            text: formattedMessage,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `OP${booking.op ? ' ✓' : ' X'}`, callback_data: `toggle:op:${booking.booking_number}` },
                        { text: `RI${booking.ri ? ' ✓' : ' X'}`, callback_data: `toggle:ri:${booking.booking_number}` },
                        { text: `Customer${booking.customer ? ' ✓' : ' X'}`, callback_data: `toggle:customer:${booking.booking_number}` }
                    ],
                    [
                        { text: `Cash on tour : ${cashOnTourButtonText} ${booking.national_park_fee ? '✅' : '❌'}`, callback_data: `toggle:parkfee:${booking.booking_number}` }
                    ],
                    [
                        { text: 'No Transfer', callback_data: `toggle:transfer:${booking.booking_number}` }
                    ]
                ]
            }
        });
    }
}

module.exports = NotificationManager;