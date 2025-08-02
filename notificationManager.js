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
        
        // Get program icon based on program name
        const getProgramIcon = (programName) => {
            if (!programName) return '🎯';
            
            const lowerProgram = programName.toLowerCase();
            
            // Adventure/Outdoor activities
            if (lowerProgram.includes('jungle') || lowerProgram.includes('adventure')) return '🌿';
            if (lowerProgram.includes('rock') || lowerProgram.includes('climbing')) return '🧗';
            if (lowerProgram.includes('zip') || lowerProgram.includes('zipline')) return '🦅';
            if (lowerProgram.includes('rafting') || lowerProgram.includes('raft')) return '🛶';
            if (lowerProgram.includes('trekking') || lowerProgram.includes('hike')) return '🥾';
            
            // Water activities
            if (lowerProgram.includes('snorkel') || lowerProgram.includes('diving')) return '🤿';
            if (lowerProgram.includes('boat') || lowerProgram.includes('cruise')) return '⛵';
            if (lowerProgram.includes('fishing')) return '🎣';
            if (lowerProgram.includes('kayak') || lowerProgram.includes('canoe')) return '🛶';
            
            // Cultural activities
            if (lowerProgram.includes('temple') || lowerProgram.includes('buddha')) return '🏛️';
            if (lowerProgram.includes('cooking') || lowerProgram.includes('food')) return '👨‍🍳';
            if (lowerProgram.includes('market') || lowerProgram.includes('shopping')) return '🛍️';
            if (lowerProgram.includes('village') || lowerProgram.includes('local')) return '🏘️';
            
            // Transportation
            if (lowerProgram.includes('transfer') || lowerProgram.includes('pickup')) return '🚐';
            if (lowerProgram.includes('airport')) return '✈️';
            
            // Nature/Wildlife
            if (lowerProgram.includes('elephant') || lowerProgram.includes('safari')) return '🐘';
            if (lowerProgram.includes('tiger') || lowerProgram.includes('zoo')) return '🐯';
            if (lowerProgram.includes('monkey') || lowerProgram.includes('gibbon')) return '🐒';
            if (lowerProgram.includes('bird') || lowerProgram.includes('birdwatching')) return '🦜';
            
            // Beach/Island activities
            if (lowerProgram.includes('island') || lowerProgram.includes('beach')) return '🏝️';
            if (lowerProgram.includes('sunset') || lowerProgram.includes('sunrise')) return '🌅';
            
            // Spa/Wellness
            if (lowerProgram.includes('spa') || lowerProgram.includes('massage')) return '💆';
            if (lowerProgram.includes('yoga') || lowerProgram.includes('meditation')) return '🧘';
            
            // Default icons for common words
            if (lowerProgram.includes('tour')) return '🗺️';
            if (lowerProgram.includes('trip')) return '🎒';
            if (lowerProgram.includes('excursion')) return '🚶';
            if (lowerProgram.includes('experience')) return '✨';
            
            return '🎯'; // Default icon
        };
        
        const programIcon = getProgramIcon(program);
        
        // Compose program line with rate title for all bookings
        let programLine = `${programIcon} Program : ${program}`;
        const rate = booking.rate || '';

        if (rate) {
            programLine = `${programIcon} Program : ${program} - [${rate}]`;
        }
        
        // Dynamic cash on tour text based on national_park_fee value
        // Handle case where national_park_fee column doesn't exist
        const cashOnTourText = booking.national_park_fee !== undefined && booking.national_park_fee ? 'National Park Fee' : 'None';
        
        // Build message lines based on transfer status
        let lines;
        
        // Create passenger display string
        let paxDisplay = '';
        if (child > 0 && infant > 0) {
            paxDisplay = `${adult} Adults, ${child} Children, ${infant} Infants (Total: ${totalPax})`;
        } else if (child > 0) {
            paxDisplay = `${adult} Adults, ${child} Children (Total: ${totalPax})`;
        } else if (infant > 0) {
            paxDisplay = `${adult} Adults, ${infant} Infants (Total: ${totalPax})`;
        } else {
            paxDisplay = `${adult} Adults (Total: ${totalPax})`;
        }
        
        if (booking.no_transfer) {
            // No Transfer version - shorter format
            lines = [
                '🆕 Please confirm for this booking:',
                '',
                `📋 Booking no : ${bookingNumber}`,
                `📅 Tour date : ${tourDate}`,
                programLine,
                `👤 Name : ${customerName}`,
                `👥 Pax : ${paxDisplay}`,
                `💵 Cash on tour : ${cashOnTourText}`
            ];
        } else {
            // Transfer version - full format with pickup time
            lines = [
                '🆕 Please confirm the *pickup time* for this booking:',
                '',
                `📋 Booking no : ${bookingNumber}`,
                `📅 Tour date : ${tourDate}`,
                programLine,
                `👤 Name : ${customerName}`,
                `👥 Pax : ${paxDisplay}`,
                `🏨 Hotel : ${cleanHotel}`,
                `📞 Phone Number : ${phoneNumber}`,
                `💵 Cash on tour : ${cashOnTourText}`,
                '',
                '💡 Please mentioned if there is any additional charge for transfer collect from customer'
            ];
        }
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
        // LINE notifications disabled temporarily
        // if (config.notifications.line.enabled) {
        //     try {
        //         await this.sendLine(message);
        //         results.push('line');
        //     } catch (e) { console.error('LINE notification failed:', e); }
        // }
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
                        { text: `${booking.no_transfer ? 'Transfer' : 'No Transfer'}`, callback_data: `toggle:transfer:${booking.booking_number}` }
                    ]
                ]
            }
        });
    }

    // New: Send cancellation notification to Telegram
    async sendCancellationNotification(bookingNumber, reason = 'cancelled', chat_id = null, tourDate = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const chatId = chat_id || await this.getTelegramChatId();
        
        // Format tour date if provided
        let tourDateText = '';
        if (tourDate) {
            const tourDateLabel = this.getTourDateLabel(tourDate);
            tourDateText = `${tourDateLabel}\n\n`;
        }
        
        // Create cancellation message
        const cancellationMessage = `${tourDateText}❌ <b>BOOKING CANCELLED</b> ❌\n\n` +
            `📋 <b>Booking Number:</b> <code>${bookingNumber}</code>\n` +
            `🕐 <b>Cancelled:</b> <code>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}</code>\n` +
            `📝 <b>Reason:</b> <code>${reason}</code>\n\n` +
            `⚠️ This booking has been removed from the system.`;
        
        await axios.post(url, {
            chat_id: chatId,
            text: cancellationMessage,
            parse_mode: 'HTML'
        });
    }
}

module.exports = NotificationManager;