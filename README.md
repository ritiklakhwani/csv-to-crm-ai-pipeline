# GrowEasy — AI-Powered CSV Lead Importer

Upload any lead CSV — Facebook Leads export, Google Ads export, a real-estate CRM dump, a messy
hand-made spreadsheet — and get back clean, validated GrowEasy CRM records.

> This README is a placeholder and is rewritten at the end of the build with the architecture
> diagram, the actual extraction prompt, measured cost/latency numbers, setup instructions and the
> live demo link.

## Structure

| Path        | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `shared/`   | Zod schema + types for the CRM contract, shared by both apps      |
| `backend/`  | Node.js + Express + TypeScript API and the AI extraction pipeline |
| `frontend/` | Next.js App Router UI                                             |
| `samples/`  | Example CSVs demonstrating the range of inputs handled            |

## Quick start

```bash
pnpm install
cp backend/.env.example backend/.env   # add your OPENAI_API_KEY
pnpm preflight                         # verifies the key + model + structured outputs
pnpm dev
```
