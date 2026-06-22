# AI Tutor — Copilot Instructions

## Design Context

### Users
Three distinct roles share the platform:
- **Students** — the primary audience; they learn through lessons, AI-generated content, quizzes, flashcards, and an AI chat tutor. They need clarity and motivation to stay on task.
- **Teachers / Instructors** — upload lesson materials, manage content, and monitor student progress. They need efficient, information-dense views.
- **Admins** — manage the platform holistically; need clear dashboard-style layouts with strong data hierarchy.

### Brand Personality
**Motivated · Energetic · Focused**

The product should feel like a high-performance learning tool — purposeful and fast, not playful or casual.

### Aesthetic Direction
- **Reference**: NotebookLM — clean, structured, AI-first, information-dense. Strong sidebar + main content layout.
- **Theme**: Light mode default, full dark mode. Both must feel equally intentional.
- **Accent**: `#ff6900` (orange) — for CTAs, active states, AI-related highlights. Never overuse it.
- **Active / highlight tint**: `#fff3e3` bg + `#ff6900` text (light); `rgba(255,105,0,0.15)` bg + `#ff6900` text (dark).
- **Surfaces (light)**: `#ffffff` primary · `#f8f9fa` secondary · `#e9ecef` borders.
- **Surfaces (dark)**: `#0d0d0d` base · `#111111` panels · `#1a1a1a` cards · `#333333` borders.

### Typography
**Font: Inter** — import from Google Fonts. Optimized for screens, excellent legibility, WCAG AA compliant.

| Role            | Size      | Weight |
|-----------------|-----------|--------|
| Page title      | 1.5rem    | 700    |
| Section heading | 1.125rem  | 600    |
| Body            | 0.9375rem | 400    |
| Label / caption | 0.8125rem | 500    |
| Micro / badge   | 0.75rem   | 500    |

### Design Principles
1. **Clarity over decoration** — every element earns its place. Noise is eliminated.
2. **Energy through structure** — orange accent and weight contrasts create dynamism without clutter. Motion is subtle and purposeful.
3. **AI is a first-class citizen** — AI features feel powerful and trustworthy, never gimmicky.
4. **Role-adaptive density** — student views are spacious and guided; teacher/admin views can be denser with clean hierarchy.
5. **WCAG AA by default** — 4.5:1 contrast minimum, visible focus rings, 44×44px touch targets, `prefers-reduced-motion` respected.
