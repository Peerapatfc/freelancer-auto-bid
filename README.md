# Freelancer Auto-Bid Script

Automate your Freelancer.com bidding with AI-powered project recommendations and proposal generation.

## Features

- 🔍 **Project Scraping**: Scrape 2 pages (40 projects) with pagination support
- 🤖 **AI Recommendations**: Score projects based on skill match, budget, competition
- ✍️ **AI Proposals**: Generate personalized proposals using Google Gemini
- 💰 **Smart Milestones**: AI-generated milestone payment suggestions
- 🎯 **Smart Bidding**: Auto-fill bid forms with correct currency
- � **Bid Limit Check**: Monitors remaining bids (Free: 6 bids)
- � **Auto-Login**: Login with email/password or saved session
- ⏰ **GitHub Actions**: Run daily via cron schedule

## Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Configure Your Profile

Edit `config/profile.ts` with your:
- Skills and experience
- Portfolio links
- Bid amount range
- Delivery preferences

### 3. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
GEMINI_API_KEY=your_gemini_key_here
FREELANCER_EMAIL=your_email@example.com
FREELANCER_PASSWORD=your_password
```

### 4. Run Dry Mode (Recommended First)

```bash
npm start -- --dry-run
```

### 5. Run Live Mode

```bash
npm start
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview bids without submitting |
| `--max=N` | Limit to N projects (default: 40) |
| `--headless` | Run browser in headless mode |
| `--template` | Use template proposals instead of AI |
| `--skip-details` | Skip fetching detailed project info |

## Bid Limit Management

Free members have **6 bids** that replenish over time (~1 bid per 5 days).

The script automatically:
1. ✅ Checks remaining bids before starting
2. ❌ Stops if 0 bids remaining
3. 🎯 Prioritizes top-scoring projects when bids are limited

```
📊 Checking remaining bids...
   📋 Bids: 2 / 6 remaining

⚠️  You have 2 bids, but 8 projects match.
   Bidding on top 2 highest-scoring projects only.
```

## GitHub Actions (Daily Cron)

### Setup

1. **Push to GitHub**
2. **Add Secrets** (Settings → Secrets → Actions):
   - `GEMINI_API_KEY`
   - `FREELANCER_EMAIL`
   - `FREELANCER_PASSWORD`

3. **Schedule**: Runs daily at **9:00 AM Thailand time** (2:00 AM UTC)

### ⚠️ Important Notes

- Cron runs in **dry-run mode** by default
- Sessions may expire - re-login locally if needed
- CAPTCHA/2FA requires manual intervention

## How It Works

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Check Bids     │ ──▶ │  Scrape Projects │ ──▶ │  AI Recommender │
│  (0/6 = stop)   │      │  (2 pages)       │      │  (Score 0-100)  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                                            │
                                                            ▼
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Submit Bid     │ ◀── │  Fill Form +     │ ◀── │  AI Proposals   │
│  (if not dup)   │      │  Milestones      │      │  (Gemini)       │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

## Configuration

### Profile Settings (`config/profile.ts`)

```typescript
bidSettings: {
  minBudget: 50,       // Minimum project budget
  maxBudget: 2000,     // Maximum project budget
  minScore: 65,        // Minimum AI score to bid
  deliveryDays: 14,    // Default delivery period
}
```

### Search URL

```typescript
export const searchUrl = "https://www.freelancer.com/search/projects?q=magento%20wordpress%20woocommerce";
```

## Safety Features

- ✅ **Bid Limit Check**: Won't try to bid if 0 bids remaining
- ✅ **Duplicate Check**: Skips projects you've already bid on
- ✅ **Dry Run**: Test with `--dry-run` before live
- ✅ **Screenshots**: Bid form previews saved before submission
- ✅ **Session Persistence**: No password stored in code

## Troubleshooting

**"No bids remaining"**
- Wait for bid replenishment (~5 days per bid)
- Upgrade membership for more bids

**"Already bid on this project"**
- Script automatically skips duplicates

**"Session expired"**
- Run locally with `npm start -- --dry-run` to re-login

**"CAPTCHA detected"**
- Login manually, auto-login doesn't bypass CAPTCHA

## License

MIT
