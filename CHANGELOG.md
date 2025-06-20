# Changelog

## [Unreleased]
- Booking number now extracted from Ext. booking ref
- Tour date extracted as just day, month, year from subject or Date field
- Program extracted from Product field (removes product code prefix)
- Name extracted from Customer field, with any email address removed
- Pax omits child/infant if 0
- Hotel extracted from Pick-up field
- Phone number now digits only
- Improved regex and parsing logic for all fields
- Updated response template to match new requirements 