<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1h60P6YzF4NNIlbfhh73KuaLZ19a9rMQZ

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:  
   `npm install`
2. Create a `.env` file in the project root and set your Render Postgres connection string and OpenAI key:  
   `DATABASE_URL=postgresql://...`  
   `OPENAI_API_KEY=your_openai_api_key_here`  
   (use the Render URL you shared above for DATABASE_URL).
3. In one terminal, start the API server (connects to Render Postgres):  
   `npm run server`
4. In another terminal, start the frontend (Vite dev server, proxied to the API):  
   `npm run dev`
