# Changes Made

## Multilingual Support (NEW!)
- **Auto language detection** - English, Urdu script (اردو), Roman Urdu
  - Expanded Roman Urdu keywords: kaise, kartay, hai, mein, ko, ka, ki, etc.
  - Console shows detected language
- **Automatic translation** - if user asks in Urdu/Roman Urdu:
  1. Finds best English FAQ using embeddings (cross-language)
  2. Translates answer to user's language via LLM
  3. Returns translated answer (extra LLM call only if needed)
- **Maintains accuracy** - medical terms preserved in translation

## FAQ Selection (Major Redesign)
- **LLM picks from top 3 FAQs** - returns EXACT FAQ answer (no rewriting)
- **Post-operative context** - assumes user has braces/aligners
  - "how brush" → "how to brush WITH braces" (not general brushing)
  - Prioritizes orthodontic-specific FAQs
- **Smart question type detection** - filters out wrong FAQ types
  - "what does X do?" = informational → blocks problem-solving FAQs
  - "wire poking" / "sharp" = problem → blocks informational FAQs
  - Penalized FAQs never match (even with high scores)
- **Embedding weight increased** to 0.6 for better semantic matching

## Media Selection (Content-Based)
- **Matches what's MENTIONED in the answer** (not just the question)
  - If answer mentions "interproximal brush" → attaches that video
  - If answer mentions "brush" → attaches brushing videos
  - If answer mentions "wax" → attaches wax videos
- **Smart filtering**
  - "what does X do" / parts questions → diagrams + explanation images
  - "how often" = frequency → NO videos
  - Attaches ALL relevant media mentioned

## User Conversations Page
- **Added time spent calculation** - shows total conversation time per user
- Displays as "Time spent: Xm Ys" under "Last active"
- Calculates from first to last message in each conversation

## UI Improvements (NEW!)
- **Modern color scheme** - Vibrant teal (#06D6A0) & blue gradients
- **Glassmorphism effects** - Frosted glass, backdrop blur on cards/modals
- **Enhanced Home Page**
  - Animated gradient background with floating orbs
  - Icon-based question cards with hover effects
  - Gradient text logo with glow effects
  - Modern "Start Chatting" CTA button
- **Better Chat Interface**
  - Gradient avatar bubbles with glow shadows
  - Glassmorphic message bubbles with hover effects
  - Smoother animations and transitions
  - Enhanced empty state with animated bot icon
- **Improved Modal Design** - Welcome modal with gradient styling
- **Better Scrollbars** - Gradient scrollbars matching theme
- **Smooth Transitions** - All elements have smooth hover/focus states

