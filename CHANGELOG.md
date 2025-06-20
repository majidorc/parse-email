# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added
- Initial project setup with Vercel deployment
- Email webhook endpoint (`/api/webhook`)
- Email parser for Bokun.io booking notifications
- Automated response system with SMTP integration
- Google Apps Script email forwarder (`email-forwarder.gs`)
- Test script for email parsing (`test-email.js`)
- Comprehensive README documentation

### Features
- Extract booking number from "Ext. booking ref"
- Extract tour date in DD.Month 'YY format from subject or Date field
- Extract program name from Product field (removes product code prefix)
- Extract customer name from Customer field (removes email addresses)
- Extract passenger counts (adult, child, infant) with conditional display
- Extract hotel information from Pick-up field
- Extract phone number as digits only
- Send formatted confirmation emails to specified address
- Only process emails from `no-reply@bokun.io`

### Technical
- Node.js serverless function for Vercel
- Nodemailer for SMTP email sending
- Mailparser for email content parsing
- Regex-based information extraction
- Environment variable configuration
- CORS support for webhook integration

## [1.1.0] - 2025-01-XX

### Changed
- Updated field extraction rules based on specific requirements
- Modified booking number extraction to use "Ext. booking ref" only
- Updated tour date extraction to show only DD.Month 'YY format
- Enhanced program extraction to remove product code prefixes
- Improved name extraction to remove email addresses
- Updated passenger extraction to detect child and infant counts
- Modified hotel extraction to use "Pick-up" field
- Changed phone number extraction to digits only

### Fixed
- Fixed regex patterns for better field extraction
- Improved date parsing from subject and Date fields
- Enhanced passenger count detection and conditional display
- Fixed email address removal from customer names

## [1.2.0] - 2025-01-XX

### Changed
- Updated response template to conditionally show child/infant counts
- Improved phone number formatting (digits only)
- Enhanced name cleaning to remove email addresses
- Updated example output in README with new format

### Documentation
- Updated README with detailed field extraction rules
- Added example output showing new formatting
- Updated API response examples
- Added troubleshooting section

## [Unreleased]

### Planned
- Additional email format support
- Enhanced error handling
- Performance optimizations
- Additional customization options 