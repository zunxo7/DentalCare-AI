# 🦷 DentalCare AI

A full-stack AI-powered orthodontic assistant that answers dental FAQs, detects English/Urdu/Roman Urdu automatically, and attaches the correct images/videos using embeddings + keyword scoring + GPT-based re-ranking.

---

## 📌 Features

### Core Functionality
- **Hybrid FAQ Matching**: Embeddings (text-embedding-3-small) + lexical similarity + keyword weighting
- **GPT-4o-mini Answering**: Language-aware and deterministic responses
- **Media Recommendation Engine**: Automatically selects relevant images/videos based on embeddings, keyword overlap, and GPT relevance filtering
- **Multilingual Support**: English, Urdu script (اردو), and Roman Urdu
- **Persistent Conversations**: Stores users, messages, conversations, and FAQ usage counts
- **Cost-Optimized**: Uses GPT-4o-mini + embeddings for thousands of messages at minimal cost

### Admin Dashboard
- **FAQ Management**: Full CRUD operations for FAQs with automatic embedding recalculation
- **Media Library**: Upload and manage images, videos, and documents
- **User Conversations**: View and manage all user conversations
- **Real-time Statistics**: Track unique users, message count, and average session time
- **Reports Management**: View and categorize user reports
- **Keep-Alive Monitor**: Server health monitoring tool

### User Features
- **Chat Interface**: Clean, responsive chat UI with conversation history
- **Starter Questions**: Quick access to common questions
- **Media Attachments**: Automatic media recommendations with answers
- **Conversation History**: Persistent chat history across sessions

---

## 🛠️ Tech Stack

### Frontend
- **React 19** (TypeScript)
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **React Router** - Client-side routing

### Backend
- **Node.js** + **Vite** - Development server with API routes
- **Turso** - libSQL (SQLite) database for data storage
- **OpenAI API** - GPT-4o-mini for answers + text-embedding-3-small for embeddings
- **OpenRouter API** - Query classification (optional)

### Database
- **Turso/libSQL** - SQLite-compatible database
- Tables: `faqs`, `media`, `users`, `conversations`, `chat_messages`, `user_reports`, `report_categories`

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js 18+
- Turso database account
- OpenAI API key
- OpenRouter API key (optional, for query classification)

### 1. Clone and Install

```bash
git clone <repository-url>
cd DentalCare-AI
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# Turso Database Configuration
TURSO_DATABASE_URL=libsql://your-database-url.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# OpenRouter API (optional)
VITE_OPENROUTER_API_KEY=your_openrouter_api_key

# Admin Password
VITE_ADMIN_PASSWORD=your_admin_password
```

### 3. Database Setup

1. Create a Turso database at [turso.tech](https://turso.tech)
2. Run the schema file in your Turso database:
   ```bash
   turso db execute your-database-name --file schema.sql
   ```
   Or use the Turso dashboard SQL editor to run `schema.sql`
3. The schema includes all necessary tables and indexes

### 4. Start Development Server

```bash
npm run dev
```
The server runs on `http://localhost:3000` and handles both frontend and API routes

### 5. Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
DentalCare-AI/
├── components/          # Reusable React components
│   └── icons.tsx       # Icon components
├── lib/                # Utility libraries
│   ├── apiClient.ts    # API client with admin auth
│   ├── auth.ts         # Authentication utilities
│   ├── debugApi.ts     # Debug API helpers
│   ├── dbHelpers.ts    # Turso database helper functions
│   └── turso.ts        # Turso database client
├── pages/              # Page components
│   ├── AdminLoginPage.tsx
│   ├── ChatbotPage.tsx
│   ├── DashboardPage.tsx
│   ├── ManageFaqsPage.tsx
│   ├── MediaLibraryPage.tsx
│   ├── UserConversationsPage.tsx
│   └── debug/          # Debug/admin pages
│       ├── IdlePage.tsx
│       ├── ReportsPage.tsx
│       └── components/
├── services/           # Business logic
│   ├── botService.ts   # Main bot response pipeline
│   ├── faqMatching.ts # FAQ matching algorithm
│   ├── languageDetection.ts
│   ├── intentRegistry.ts
│   ├── fallbacks.ts
│   └── utils.ts
├── server/             # Backend server
│   ├── index.mjs       # Express API server
├── types.ts            # TypeScript type definitions
├── constants.ts         # App constants
└── vite.config.ts      # Vite configuration
```

---

## 🔑 Key Features Explained

### FAQ Matching System
The system uses a hybrid approach:
1. **Embedding Similarity** (70% weight): Semantic matching using OpenAI embeddings
2. **Lexical Similarity** (30% weight): Text-based matching for exact/partial matches
3. **Top 3 Selection**: Returns top 3 FAQs, then LLM picks the best one

### Language Detection
- Automatically detects English, Urdu script, or Roman Urdu
- Translates queries to English for FAQ matching
- Translates answers back to user's language

### Embedding Recalculation
- Embeddings automatically recalculate when FAQ questions or answers are updated
- Only the specific FAQ's embedding is updated (not all FAQs)
- Embeddings are not recalculated when only media associations change

### Admin Commands
- Type `/debug` in the chatbot to navigate to the Reports page (admin only)

---

## 🔐 Admin Access

1. Navigate to `/login` or use the `/debug` command
2. Enter the admin password (set in `VITE_ADMIN_PASSWORD`)
3. Access the dashboard at `/dashboard`

---

## 📊 API Endpoints

### Public Endpoints
- `GET /api/faqs` - Get all FAQs
- `GET /api/media` - Get all media
- `POST /api/users` - Create user
- `POST /api/conversations` - Create conversation
- `POST /api/messages` - Create message
- `POST /api/reports` - Submit report

### Admin Endpoints (require admin password)
- `GET /api/stats` - Dashboard statistics
- `GET /api/reports` - Get all reports
- `POST /api/faqs` - Create FAQ
- `PUT /api/faqs/:id` - Update FAQ
- `DELETE /api/faqs/:id` - Delete FAQ
- `POST /api/media` - Upload media
- `DELETE /api/media/:id` - Delete media
- `GET /api/admin/conversations-with-users` - Get all conversations

---

## 🚀 Deployment

### Frontend (Vite)
- Build: `npm run build`
- Output: `dist/` folder
- Deploy to: Vercel, Netlify, or any static hosting

### Backend (Vite + API Routes)
- Deploy to: Vercel (recommended), Netlify, or any platform supporting Edge Functions
- Ensure environment variables are set in your deployment platform
- API routes are handled automatically by Vercel Edge Functions

### Database
- Use Turso managed libSQL database
- Run `schema.sql` to set up tables
- Ensure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set

---

## 📝 License

[Add your license here]

---

## 🤝 Contributing

[Add contribution guidelines here]

---

## 📧 Support

[Add support/contact information here]
