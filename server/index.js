// contract_ai/server/index.js
// This Express server exposes an endpoint that accepts a contract file and a question.
// It reads the file, converts it to plain text (supporting PDFs via pdf‑parse) and
// forwards the contents along with the user’s question to the OpenAI Chat API.

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import pdf from 'pdf-parse-debugging-disabled';
import OpenAI from 'openai';
import Stripe from 'stripe';

// Load environment variables from .env if present
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Enable CORS for all origins (you can restrict this in production)
app.use(cors());

// Use multer to handle multipart/form-data for file uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Serve static files from the client directory
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// Initialize Stripe with secret key
const stripeSecret = process.env.STRIPE_SECRET_KEY;
let stripe;
if (stripeSecret) {
  stripe = new Stripe(stripeSecret);

}

// In-memory store of checkout sessions that have completed payment.  When a
// Stripe Checkout session is marked as paid, its session ID is added to this
// object.  In a real application you would persist this information in a
// database or use Stripe webhooks to update your records.
const paidSessions = {};

/**
 * POST /api/query
 * This endpoint receives a contract file and a question from the client.
 * It extracts text from the uploaded file (supporting PDFs and plain text),
 * sends the contract and question to the OpenAI Chat Completion API and
 * returns the model’s answer.
 */
app.post('/api/query', upload.single('contract'), async (req, res) => {
  const file = req.file;
  const { question, sessionId } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'No contract file uploaded.' });
  }
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'A question is required.' });
  }

  // Enforce payment requirement: if a session ID is provided, ensure it
  // corresponds to a completed Checkout session.  Without a valid payment
  // session, respond with 402 Payment Required.
  if (!sessionId || !paidSessions[sessionId]) {
    return res.status(402).json({ error: 'Payment required. Please purchase access to ask questions.' });
  }

  let contractText = '';
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    const buffer = fs.readFileSync(file.path);
    if (ext === '.pdf') {
      // Use the patched pdf-parse package to extract text from PDFs.  The
      // debugging‑disabled build does not require the missing test file.
      const pdfData = await pdf(buffer);
      contractText = pdfData.text;
    } else {
      // Assume any other file type is plain text encoded in UTF‑8
      contractText = buffer.toString('utf8');
    }
  } catch (err) {
    console.error('Failed to read uploaded file:', err);
    // Ensure the temporary file is deleted even if reading fails
    try { fs.unlinkSync(file.path); } catch (unlinkErr) {}
    return res.status(500).json({ error: 'Failed to read uploaded file.' });
  }

  // Remove the temporary file after reading it
  try { fs.unlinkSync(file.path); } catch (err) {}

  // Compose the system and user messages for the chat model.
  // Use a single concatenated string with double quotes so we don’t need
  // backslash line continuations.  The apostrophe in "user's" is safe
  // inside double quotes.
  const systemPrompt =
    "You are a knowledgeable legal assistant. Answer the user's questions about the provided contract. " +
    "Only use information contained in the contract and avoid making assumptions. " +
    "If the contract does not specify the answer, respond that the information is not available.";

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Contract:\n\n${contractText}\n\nQuestion: ${question}` },
  ];

  // Initialize OpenAI client
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is misconfigured: missing OpenAI API key.' });
  }
  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 512,
    });
    const answer = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ answer });
  } catch (err) {
    console.error('OpenAI API request failed:', err);
    res.status(500).json({ error: 'Failed to retrieve answer from OpenAI.' });
  }
});

/**
 * POST /api/create-checkout-session
 * Creates a Stripe Checkout session for the authenticated user.  The client
 * should send the userId (e.g. Auth0 sub) in the request body.  The server
 * responds with the Checkout session URL, which the client can redirect to.
 */
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }
  try {
    const domain = process.env.DOMAIN || `http://localhost:${PORT}`;
    // Determine line items: use a configured price ID if provided; otherwise
    // fall back to inline price data with a default amount and currency.  This
    // allows local testing without pre‑creating a price in Stripe.
    let lineItems;
    const priceId = process.env.STRIPE_PRICE_ID;
    if (priceId && priceId.startsWith('price_')) {
      lineItems = [{ price: priceId, quantity: 1 }];
    } else {
      // Use environment variables STRIPE_AMOUNT (in smallest currency unit) and
      // STRIPE_CURRENCY (e.g. usd, aud) or default to USD $10.00 (1000 cents).
      const amount = Number(process.env.STRIPE_AMOUNT) || 1000;
      const currency = process.env.STRIPE_CURRENCY || 'usd';
      lineItems = [
        {
          price_data: {
            currency,
            product_data: { name: 'Contract Analyzer Access' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ];
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${domain}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/?canceled=true`,
    });
    res.json({ url: session.url, id: session.id });
  } catch (err) {
    // Log the full error on the server for debugging
    console.error('Error creating checkout session:', err);
    // Respond with a generic error message and include the Stripe error message
    const message = err?.raw?.message || err.message || 'Unknown error';
    res.status(500).json({ error: 'Unable to create checkout session.', details: message });
  }
});

/**
 * GET /api/checkout-session
 * Retrieves a checkout session and marks the user as paid if the payment is complete.
 */
app.get('/api/checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }
  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id query parameter is required.' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const isPaid = session.payment_status === 'paid';
    // Record the session ID as paid if payment is complete
    if (isPaid) {
      paidSessions[session_id] = true;
    }
    res.json({ paid: isPaid });
  } catch (err) {
    console.error('Error retrieving checkout session:', err);
    res.status(500).json({ error: 'Unable to retrieve checkout session.' });
  }
});


// Fallback route: serve index.html for any other GET request (for single-page app routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});