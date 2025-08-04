# Contract Analysis Web App (React & Node)

This repository contains a full‑stack web application that lets users upload a contract file, ask questions about it and receive answers generated using OpenAI’s ChatGPT API.  The front‑end is built with **React** and communicates with a **Node.js**/**Express** back‑end that handles file uploads, extracts text from the contract (supporting PDF and plain text files) and forwards the contract and user’s question to the OpenAI API.  In this simplified version there is **no authentication**.  Instead, the user must purchase access via **Stripe Checkout** before the upload and Ask functions are enabled.  Once payment is complete, the session is marked as paid and the user can upload a contract and ask questions.  This project illustrates how to integrate payments with an AI‑powered document analysis service.

## Features

- **Payment gating with Stripe** – before uploading a contract or asking a question, the user must purchase access via a Stripe Checkout session.  Once payment is complete, the session is marked as paid and the upload/question functions are enabled.
- **File upload** – upload a contract in plain text or PDF format.
- **Ask questions** – type any question about the contract and submit it.  The **Ask** button is enabled only after a successful payment.
- **Simple UI** – there is a single page.  If unpaid, it shows a **Purchase Access** button; after payment, it shows the file input, question field and **Ask** button.
- **ChatGPT integration** – the server forwards the contract and question to the OpenAI API and returns the AI’s answer.
- **React UI** – a lightweight React component drives the user interface.  State hooks manage the uploaded file, question and answer【451567244833381†L399-L405】.
- **Express API** – the back‑end uses Express, Multer for file uploads, the `openai` package to call the ChatGPT API【451567244833381†L232-L237】 and the `stripe` package to create checkout sessions.

## Prerequisites

- **Node.js** (v14 or later).  Ensure you have a recent Node version installed; you can check it with `node -v`【451567244833381†L214-L217】.  The server uses modern ECMAScript modules and packages like Stripe that may not work on very old Node versions.
- An **OpenAI API key**.  You can create one by signing in to the [OpenAI dashboard](https://platform.openai.com/).  Keep your API key secret and never commit it to version control.
- There is **no authentication** in this version; you do not need an Auth0 tenant.
- A **Stripe account** with a product price configured for your service.  In the Stripe dashboard you need to create a **Price ID** for a one‑time payment (e.g., \$5 or \$10).  You will also need a **Secret key** to create checkout sessions.  See Stripe’s documentation on [Checkout](https://stripe.com/docs/payments/checkout) for details.

## Project structure

```
contract_ai/
├── client/           # React front‑end (served as static files)
│   ├── index.html    # Main HTML file loading React, ReactDOM and axios
│   ├── app.js        # React application code
│   └── styles.css    # Basic styles for the UI
├── server/           # Node/Express back‑end
│   ├── index.js      # Express server with file upload and OpenAI integration
│   ├── package.json  # Server dependencies
│   ├── .env.example  # Sample environment variables file
│   └── uploads/      # Temporary storage for uploaded files (created at runtime)
└── README.md         # This documentation
```

## Setup instructions

Follow these steps to run the project locally.  The instructions cover both the back‑end and front‑end with authentication and payments.

1. **Clone or download the repository** and navigate into the project folder:

   ```bash
   cd contract_ai
   ```

2. **Install back‑end dependencies**.  In the `server` directory, install the required packages (Express, Multer, CORS, `openai`, `pdf-parse-debugging-disabled`, `dotenv`, `stripe` and their peers):

   ```bash
   cd server
   npm install
   ```

   You can verify that the `openai` package is installed by running `npm ls openai`—the package is installed as a dependency so you don’t need to install it separately【451567244833381†L232-L237】.

3. **Provide environment variables**.  Copy the `.env.example` file to `.env` and set the following values:

   - `OPENAI_API_KEY` – your OpenAI key.
   - `STRIPE_SECRET_KEY` – your Stripe secret key (starting with `sk_`).
   - `STRIPE_PRICE_ID` – the Price ID of the product you created in Stripe (starts with `price_`).
   - `DOMAIN` – the public domain where your app will run (used for redirect URLs).  For local development, you can leave this blank and the server will default to `http://localhost:<PORT>`.

   ```bash
   cp .env.example .env
   # Edit .env to add your keys and IDs
   ```

   The `.env.example` file provides a template for these variables.

4. **Run the server**.  From the `server` directory, start the Express server:

   ```bash
   npm start
   ```

   The server will start on `http://localhost:5000` (or the port specified in the `PORT` environment variable).  It will also serve the React front‑end from the `client` directory.

5. **Open the application**.  In your browser, navigate to `http://localhost:5000`.  You will see a simple interface.  If you have not purchased access, a **Purchase Access** button will appear.  Clicking it opens a Stripe Checkout page.  After completing payment, you will be redirected back to the app, your session will be marked as paid and the file upload and **Ask** features will be enabled.

## Deployment

To host this project online, choose a platform that can run a Node.js server and serve static files.  Render, Heroku, Railway, Vercel and Netlify are popular choices.  For example, on Render you would:

1. Push the code to a GitHub repository (be sure not to commit `.env`).
2. Create a new Web Service on Render, point it to your repository and set the **Build Command** to `cd server && npm install` and the **Start Command** to `cd server && npm start`.
3. Add environment variables (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `DOMAIN`) in the Render dashboard.  Use the platform’s secret manager to store sensitive keys.
4. Configure Stripe’s success and cancel URLs to point to your deployed domain (e.g., `https://your-app.onrender.com/?session_id={CHECKOUT_SESSION_ID}` for success and `https://your-app.onrender.com/?canceled=true` for cancellation).  See the Stripe documentation for setting up Checkout.

Hosting on other platforms follows similar steps: specify build and start commands, configure environment variables and set your `DOMAIN` environment variable to the production URL so Stripe can redirect correctly after payment.

## Front‑end overview

The front‑end is a lightweight React application loaded via CDN.  It uses the `useState` hook to manage form state and user data【451567244833381†L399-L405】.  Key components include:
In this simplified version there is a single page.  The front‑end stores the payment state in `localStorage` and verifies it with the server after returning from Stripe.

- If the session has not been marked as paid, the page shows a notice and a **Purchase Access** button.  Clicking this button sends a request to `/api/create-checkout-session` to obtain a Stripe Checkout URL and then redirects the browser to Stripe.
- After successful payment, Stripe redirects back to your domain with a `session_id` query parameter.  The app calls `/api/checkout-session?session_id=...` to verify the payment.  If paid, the session ID and payment flag are stored in `localStorage` so the user does not need to pay again on subsequent visits.
- Once paid, the file input, question field and **Ask** button are enabled.  When the form is submitted, the app bundles the contract file, question and the stored `sessionId` into a `FormData` object and posts it to the `/api/query` endpoint.

The front‑end uses Axios to communicate with the server and manage Stripe Checkout sessions.  The payment state is stored client‑side but verified on the server before answering questions.

## Back‑end overview

The Express server exposes several endpoints:

− **`POST /api/query`** – accepts a multipart form with a contract file, a question and a `sessionId`.  It extracts text from the file using the patched `pdf‑parse‑debugging‑disabled` library for PDF files or UTF‑8 for others, checks whether the provided session ID corresponds to a completed Stripe Checkout session and then sends the contract and question to the OpenAI Chat Completion API to obtain an answer【91921599722780†L0-L10】.  The answer is returned as JSON.  If payment has not been made, the endpoint returns a `402 Payment Required` response.
− **`POST /api/create-checkout-session`** – creates a Stripe Checkout session for the configured price and returns the session’s URL.  The server does not accept any user ID; instead, the session ID is used to verify payment later.
− **`GET /api/checkout-session`** – accepts a `session_id` query parameter, retrieves the corresponding Stripe session and, if payment is complete, records the session ID in an in‑memory store.  The client calls this endpoint upon returning from Stripe Checkout to verify payment.

The server uses an in‑memory `paidSessions` object to track which Stripe Checkout sessions have completed payment for demonstration purposes.  In a production application you would use a persistent database or Stripe webhooks.  The server also loads secrets (OpenAI key, Stripe key, price ID and domain) from environment variables and uses `dotenv` to read them from `.env` during development.

## Security considerations

- **Secrets management** – never hardcode your OpenAI API key or Stripe secret key.  Keep them in the `.env` file and ensure that file is excluded from version control.  Hosting providers usually offer secret management tools—use them in production.
- **Payment enforcement** – the server returns a `402 Payment Required` response if the provided `sessionId` has not been marked as paid.  This simple check is for demonstration only; in a production system you should persist payment records and verify Stripe webhooks to prevent abuse.
- **Input validation** – the server performs basic checks on the uploaded file and question.  Additional validations may be required depending on your use case (e.g., file size limits, allowed MIME types).
- **File size limits** – this example doesn’t set an explicit upload size limit.  In production, configure Multer to limit file sizes and consider summarizing large contracts before sending them to the AI API.

## Extending this project

You can extend this code to support additional file formats (e.g., Word documents via a library like `mammoth.js`), persist chat history, authenticate users or implement streaming responses from the OpenAI API.  The architecture separates front‑end and back‑end concerns so you can replace either side without major changes.

---

*Note*: This project is provided for educational purposes.  You are responsible for complying with OpenAI’s terms of service and ensuring that your use case respects legal and ethical guidelines.# contractRead
