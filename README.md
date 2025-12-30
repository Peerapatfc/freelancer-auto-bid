# Freelancer Auto-Bid Script

Automate your Freelancer.com bidding with AI-powered project recommendations and proposal generation.

## Features

- 🔍 **Project Scraping**: Scrape 2 pages (40 projects) matching your keywords
- 🤖 **AI Recommendations**: Score projects based on skill match, budget, competition
- ✍️ **AI Proposals**: Generate personalized proposals using Google Gemini
- 💰 **Smart Milestones**: AI-generated milestone payment suggestions
- 🎯 **Smart Bidding**: Fill and submit bids via Playwright browser automation
- 🔐 **Session Persistence**: Login once, session saved for future runs
- 🛡️ **Safety Features**: Dry-run mode, confirmation prompts
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
# Edit .env with your Gemini API key
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

### 4. Run Dry Mode (Recommended First)

```bash
npm start -- --dry-run
```

This will:
- Open browser and prompt for Freelancer login
- Scrape 40 projects (2 pages)
- Show AI recommendations and generated proposals
- **NOT** submit any bids

### 5. Run Live Mode

```bash
npm start
```

Each bid requires manual confirmation before submitting.

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview bids without submitting |
| `--max=N` | Limit to N projects (default: 40) |
| `--headless` | Run browser in headless mode |
| `--template` | Use template proposals instead of AI |
| `--skip-details` | Skip fetching detailed project info |

## GitHub Actions (Daily Cron)

The script can run automatically via GitHub Actions.

### Setup

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Add Secrets** (GitHub → Settings → Secrets → Actions):
   - `GEMINI_API_KEY`: Your Google Gemini API key

3. **First-time Login:**
   - Run locally once with `npm start -- --dry-run` to create session
   - The `.auth/` folder contains your login session
   - You may need to periodically refresh the session locally

4. **Schedule:**
   - Runs daily at **9:00 AM Thailand time** (2:00 AM UTC)
   - Can be triggered manually from Actions tab

### ⚠️ Important Notes

- **Session Expiry**: Freelancer sessions expire. You may need to re-login locally and update the session.
- **Dry Run by Default**: The cron job runs in `--dry-run` mode. Set `dry_run: false` for live bids.
- **Review Before Live**: Always check the logs before enabling live bidding.

## How It Works

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Scrape Projects │ ──▶ │  AI Recommender  │ ──▶ │  AI Proposals   │
│  (2 pages)       │      │  (Score 0-100)   │      │  (Gemini)       │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                                            │
                                                            ▼
                                                   ┌─────────────────┐
                                                   │  Fill Bid Form  │
                                                   │  + Milestones   │
                                                   └─────────────────┘
```

## Configuration

### Profile Settings (`config/profile.ts`)

```typescript
bidSettings: {
  minBudget: 50,       // Minimum project budget (USD)
  maxBudget: 2000,     // Maximum project budget (USD)
  minScore: 65,        // Only bid on 65+ match score
  deliveryDays: 14,    // Default delivery period (realistic for part-time)
}
```

### Search URL

The script uses keyword-based search:
```
https://www.freelancer.com/search/projects?q=magento%20wordpress%20woocommerce
```

## Safety

- **Dry Run**: Always test with `--dry-run` first
- **Confirmation**: Each bid requires manual Y/N confirmation (when not headless)
- **Screenshots**: Bid form previews saved before submission
- **Session**: Cookies stored locally, no password stored

## Troubleshooting

**"No projects found"**
- Check your search URL is valid
- Verify you're logged in to Freelancer

**"Could not find bid button"**
- You may have already bid on this project
- The project may be closed

**"Gemini API error"**
- Check your API key in `.env`
- Use `--template` flag as fallback
- Check rate limits (429 errors are auto-retried)

**"Session expired"**
- Run locally with `npm start -- --dry-run` to re-login
- Re-upload the `.auth/` folder if using CI

## License

MIT
