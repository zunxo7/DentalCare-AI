# 🦷 DentalCare AI

A full-stack AI-powered orthodontic assistant that answers dental FAQs, detects English/Urdu/Roman Urdu automatically, and attaches relevant images/videos using embeddings + keyword scoring + GPT-based re-ranking.

## 🌐 Live Application

**Use the deployed application at: [dentalcare-ai.vercel.app](https://dentalcare-ai.vercel.app)**

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

## 📁 Project Structure

```
DentalCare-AI/
├── components/          # Reusable React components
├── lib/                # Utility libraries
├── pages/              # Page components
├── api/                # API route handlers
├── types.ts            # TypeScript type definitions
└── vite.config.ts      # Vite configuration
```