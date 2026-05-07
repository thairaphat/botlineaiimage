# LINE OCR Bot (Bun + Elysia + Prisma + MySQL)

A LINE bot that receives images, performs OCR using Tesseract.js, parses the text, and saves the data to a MySQL database.

## Prerequisites

- [Bun](https://bun.sh/) installed
- MySQL Database

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Configure environment variables in `.env`:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `DATABASE_URL` (e.g., `mysql://user:password@localhost:3306/linebot`)

3. Setup Database with Prisma:
   ```bash
   bunx prisma migrate dev --name init
   ```

4. Run the server:
   ```bash
   bun run src/index.ts
   ```

## Features

- **Webhook:** `POST /webhook/line`
- **Health Check:** `GET /health`
- **Image Processing:**
  - Auto-downloads images from LINE groups/chats.
  - Saves images to `uploads/`.
  - OCR support for Thai and English.
  - Saves results to MySQL via Prisma.

## Project Structure

- `src/index.ts`: Entry point and Elysia server setup.
- `src/db.ts`: Prisma client configuration.
- `src/line.ts`: LINE SDK clients.
- `src/services/`: Business logic (Image processing pipeline).
- `src/ocr/`: OCR implementation using Tesseract.js.
- `src/parsers/`: Text parsing logic.
- `src/utils/`: Shared utilities (Logger, etc.).
- `prisma/`: Database schema.
- `uploads/`: Local storage for downloaded images.
