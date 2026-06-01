# Bagi Duit Lah Bang 💸

**Bagi Duit Lah Bang** is a frictionless, real-time web application designed to eliminate the awkwardness and mathematical headache of splitting group bills. Whether it's a shared dinner plate or a coffee run, users can snap a picture of their receipt, claim their specific items, and see optimized peer-to-peer payment instructions instantly.

## Features

*   **Gemini AI Receipt Scanning** – Automatically extracts line items, pricing, and tax values from receipt images using advanced visual OCR analysis.
*   **Real-Time Synchronization** – Instantly syncs room creation, participant list updates, and live item claiming status across all users in the room.
*   **Interactive Item Claiming** – Simple tap-to-claim system featuring highly interactive, smooth-popping overlapping avatar bubbles showing exactly who claimed what.
*   **Optimized Transaction Engine** – Automatically simplifies complex group ledger math into the absolute minimum number of peer-to-peer transaction steps.
*   **One-Click Shareable Summary** – Converts final calculations into a polished, high-resolution visual receipt card to easily pass directly into group chats.

---

## 🛠️ Tech Stack

*   **Frontend Framework:** Next.js (App Router & Client Routing Components)
*   **Styling:** Tailwind CSS + Tailwind-Animate (for transitions and bubble animations)
*   **Database & Sync Engine:** Firebase Firestore (Real-time listener subscriptions)
*   **Authentication:** Firebase Auth (Supports anonymous Guest creation and standard Google Sign-In)
*   **AI Engine:** Google Gemini Pro Vision API
*   **Image Processing:** `html-to-image` (Client-side DOM rendering)

---

## 📁 Folder Structure

```text
src/
 ├── app/
 │    ├── api/
 │    │    └── scan-receipt/
 │    │         └── route.ts       # Gemini API processing backend
 │    ├── page.tsx                 # Core View router and state manager
 │    └── layout.tsx
 ├── components/                   # Extended design elements 
 ├── hooks/
 │    └── useAuth.ts               # Custom authentication handler
 ├── lib/
 │    └── roomOps.ts               # Firebase transactional database execution wrappers
 └── types/
      └── index.ts                 # Shared Type definitions (Room, Order, Participant)