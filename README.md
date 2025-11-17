Got it — here is a **clean, professional, no-Google, no-AI-Studio, no-extra-crap** README with your banner and your actual Render deployment link.

---

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🦷 Orthodontic AI Chatbot

A full-stack AI-powered orthodontic assistant that answers dental FAQs, detects English/Urdu/Roman Urdu automatically, and attaches the correct images/videos using embeddings + keyword scoring + GPT-based re-ranking.

### 🔗 **Live Demo:**

**[https://chatbot-yb7t.onrender.com](https://chatbot-yb7t.onrender.com)**

---

# 📌 Features

* **Hybrid FAQ Matching**
  Embeddings (text-embedding-3-small) + lexical similarity + keyword weighting.

* **GPT-4o-mini Answering**
  Language-aware and deterministic. No mixing languages.

* **Media Recommendation Engine**
  Automatically selects the correct images/videos based on:

  * embeddings
  * keyword overlap
  * GPT relevance filtering

* **Full Admin Dashboard**

  * FAQ CRUD
  * Media management
  * Real-time stats (unique users, message count, average session time)
  * Reset tools

* **Multilingual Support**

  * English
  * Urdu script
  * Roman Urdu

* **Persistent Conversations**
  PostgreSQL stores users, messages, conversations, FAQ usage counts.

* **Cost-Optimized**
  Uses GPT-4o-mini + embeddings → thousands of messages for a few cents.

---

# 🛠️ Tech Stack

**Frontend:**

* React (TypeScript)
* Vite
* TailwindCSS

**Backend:**

* Node.js
* Express
* PostgreSQL
* OpenAI API (GPT-4o-mini + Embedding-3-Small)

**Deployment:**

* Render (frontend + backend + managed PostgreSQL)

---

# ⚙️ Run Locally

### **Prerequisites**

* Node.js 18+
* PostgreSQL (local or cloud)

---

### **1. Install dependencies**

```
npm install
```

---

### **2. Create `.env` in the project root**

```
DATABASE_URL=postgresql://YOUR_CONNECTION_STRING
OPENAI_API_KEY=your_openai_key_here
```

(If you're using Render Postgres, paste the INTERNAL DATABASE URL.)

---

### **3. Start the backend server**

```
npm run server
```

This launches the Express API and connects to your PostgreSQL database.

---

### **4. Start the frontend**

```
npm run dev
```

Frontend runs on Vite and proxies API calls automatically.

---
