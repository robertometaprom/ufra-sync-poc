# UFRA Sync POC

Minimal Vercel proof of concept. It reads the first 10 product links from UFRA's fragrance category at request time, fetches each product page, extracts product metadata and calculates a sample retail price.

## Goal
Prove supplier catalog synchronization before building the full store.

## Current scope
- 10 live products from UFRA
- supplier price
- SKU/name/brand where exposed by product markup
- availability
- image where exposed by JSON-LD
- sample margin rule
- no database, checkout or production automation yet

## Important
This is a technical POC, not a production scraper. Before scaling, prefer an authorized UFRA API/feed/CSV if available and confirm rights for product images/descriptions.
