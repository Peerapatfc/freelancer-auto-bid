import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Project, ProjectScore } from "../types.js";
import { profile } from "../../config/profile.js";
import { convertToUSD, USD_EXCHANGE_RATES } from "../scraper.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS_MS = 2000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert USD amount to target currency
 */
function convertFromUSD(amountUSD: number, targetCurrency: string): number {
  const rate = USD_EXCHANGE_RATES[targetCurrency.toUpperCase()] || 1;
  // rate is how much 1 unit of currency = USD, so divide to get back
  return Math.round(amountUSD / rate);
}

/**
 * AI-powered project recommendation system
 */
export async function recommendProjects(projects: Project[]): Promise<ProjectScore[]> {
  console.log("\n🤖 AI analyzing projects...\n");

  const scores: ProjectScore[] = [];

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    
    try {
      console.log(`   Analyzing (${i + 1}/${projects.length}): ${project.title.substring(0, 50)}...`);
      const score = await analyzeProjectWithRetry(project);
      scores.push(score);
      
      if (i < projects.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    } catch (error) {
      console.error(`   ⚠️ Error analyzing "${project.title}": ${(error as Error).message}`);
      // Fallback: use project minimum budget
      const fallbackAmount = project.budget.min || 1000;
      scores.push({
        project,
        score: 0,
        reasoning: "Unable to analyze - API error",
        bidSuggestion: {
          amount: fallbackAmount,
          currency: project.budget.currency,
          amountUSD: convertToUSD(fallbackAmount, project.budget.currency),
          period: profile.bidSettings.deliveryDays,
        },
      });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  console.log("\n📊 Top Recommendations:\n");
  scores.slice(0, 5).forEach((s, i) => {
    const bidDisplay = s.bidSuggestion.currency !== "USD"
      ? `${s.bidSuggestion.amount.toLocaleString()} ${s.bidSuggestion.currency} (~$${s.bidSuggestion.amountUSD} USD)`
      : `$${s.bidSuggestion.amount} USD`;
    
    console.log(`${i + 1}. [Score: ${s.score}] ${s.project.title}`);
    console.log(`   Budget: ${s.project.budget.min.toLocaleString()}-${s.project.budget.max.toLocaleString()} ${s.project.budget.currency}`);
    console.log(`   Suggested bid: ${bidDisplay} / ${s.bidSuggestion.period} days`);
    
    // Show competitor insights if available
    if (s.project.competitorBids && s.project.competitorBids.length > 0) {
      console.log(`   Competition: ${s.project.competitorBids.length} bids`);
    }
    
    if (s.project.clientInfo?.location) {
      console.log(`   Client: ${s.project.clientInfo.location}${s.project.clientVerified ? " ✓" : ""}`);
    }
    console.log(`   ${s.reasoning}\n`);
  });

  return scores;
}

async function analyzeProjectWithRetry(project: Project): Promise<ProjectScore> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await analyzeProject(project);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || "";
      
      if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests")) {
        const retryMatch = errorMessage.match(/retry in ([\d.]+)/i);
        const retryDelay = retryMatch 
          ? Number.parseFloat(retryMatch[1]) * 1000 
          : INITIAL_RETRY_DELAY_MS * (2 ** attempt);
        
        console.log(`   ⏳ Rate limited. Waiting ${Math.round(retryDelay / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await sleep(retryDelay);
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

async function analyzeProject(project: Project): Promise<ProjectScore> {
  const budgetMinUSD = project.budget.minUSD || project.budget.min;
  const budgetMaxUSD = project.budget.maxUSD || project.budget.max;
  const projectCurrency = project.budget.currency;
  
  // Use full description if available
  const description = project.fullDescription || project.description;
  
  // Build client info string
  let clientInfoStr = "";
  if (project.clientInfo) {
    const info = project.clientInfo;
    clientInfoStr = `
Client Info:
- Location: ${info.location || "Unknown"}
- Member Since: ${info.memberSince || "Unknown"}
- Total Jobs Posted: ${info.totalJobs || "Unknown"}
- Hire Rate: ${info.hireRate ? `${info.hireRate}%` : "Unknown"}
- Total Spent: ${info.totalSpent || "Unknown"}
- Verified: ${project.clientVerified ? "Yes" : "No"}`;
  }
  
  // Build deliverables string
  let deliverablesStr = "";
  if (project.deliverables && project.deliverables.length > 0) {
    deliverablesStr = `\nDeliverables:\n${project.deliverables.map(d => `- ${d}`).join("\n")}`;
  }
  
  // Build competitor analysis string
  let competitorAnalysis = "";
  if (project.competitorBids && project.competitorBids.length > 0) {
    const bids = project.competitorBids;
    
    // Calculate bid statistics in project currency
    const avgBid = bids.reduce((sum, b) => sum + b.bidAmount, 0) / bids.length;
    const minBid = Math.min(...bids.map(b => b.bidAmount));
    const maxBid = Math.max(...bids.map(b => b.bidAmount));
    const verifiedCount = bids.filter(b => b.isVerified).length;
    const avgRating = bids.reduce((sum, b) => sum + b.rating, 0) / bids.length;
    
    competitorAnalysis = `
COMPETITOR ANALYSIS (${bids.length} bids):
- Average bid: ${avgBid.toLocaleString()} ${projectCurrency}
- Bid range: ${minBid.toLocaleString()} - ${maxBid.toLocaleString()} ${projectCurrency}
- Verified freelancers: ${verifiedCount}/${bids.length}
- Average rating: ${avgRating.toFixed(1)}/5

Top 3 Competitors:
${bids.slice(0, 3).map((b, i) => 
  `${i + 1}. ${b.freelancerName} - ${b.bidAmount.toLocaleString()} ${b.bidCurrency}, ${b.deliveryDays} days, ${b.rating.toFixed(1)}⭐`
).join("\n")}`;
  }
  
  const prompt = `
You are an expert freelancer advisor. Analyze this project for a NEW FREELANCER with no reviews yet.

PROJECT:
Title: ${project.title}
Description: ${description}
Budget: ${project.budget.min.toLocaleString()} - ${project.budget.max.toLocaleString()} ${projectCurrency}
Skills Required: ${project.skills.join(", ")}
Number of Bids: ${project.bidsCount}
${clientInfoStr}
${deliverablesStr}
${competitorAnalysis}

MY PROFILE (NEW FREELANCER):
Skills: ${profile.skills.join(", ")}
Experience: ${profile.experience}

IMPORTANT - NEW FREELANCER STRATEGY:
- I'm new with 0 reviews, so I need to be COMPETITIVE on price
- Bid 10-20% BELOW average bid to stand out
- The bid MUST be in ${projectCurrency} (project currency), NOT USD
- Minimum allowed bid is usually around ${project.budget.min} ${projectCurrency}

Analyze and provide:
1. Match score (0-100) considering:
   - Skill match (35%)
   - Competition level (25%) - fewer bids = better
   - Project clarity (20%)
   - Client quality (20%)

2. Brief reasoning (1-2 sentences)

3. Suggested bid amount IN ${projectCurrency} (must be within project budget range)
   - As a new freelancer, bid competitively but not too low

4. Delivery period in days

5. Suggested milestones (2-4 milestones that divide the work):
   - Each milestone should have a description and amount in ${projectCurrency}
   - Total of all milestone amounts MUST EQUAL the bid amount exactly
   - First milestone should be ~30-40% (e.g., "Setup & Initial Development")
   - Middle milestone(s) for main work ~40-50%
   - Final milestone ~10-20% (e.g., "Testing & Final Delivery")

Respond in JSON format ONLY:
{
  "score": <0-100>,
  "reasoning": "<explanation>",
  "bidAmount": <number in ${projectCurrency}>,
  "bidPeriod": <days>,
  "milestones": [
    {"description": "<phase 1 description>", "amount": <number>},
    {"description": "<phase 2 description>", "amount": <number>},
    {"description": "<phase 3 description>", "amount": <number>}
  ]
}
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  let jsonStr = response.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  }
  
  const parsed = JSON.parse(jsonStr);
  
  // Ensure bid amount is within project budget range
  let bidAmount = parsed.bidAmount || project.budget.min;
  if (bidAmount < project.budget.min) {
    bidAmount = project.budget.min;
  }
  if (bidAmount > project.budget.max) {
    bidAmount = project.budget.max;
  }

  // Parse milestones and ensure they sum to bid amount
  let milestones = parsed.milestones || [];
  if (milestones.length > 0) {
    const milestoneTotal = milestones.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);
    
    // If milestones don't sum correctly, adjust the last one
    if (milestoneTotal !== bidAmount && milestones.length > 0) {
      const diff = bidAmount - milestoneTotal;
      milestones[milestones.length - 1].amount += diff;
    }
  } else {
    // Generate default milestones if AI didn't provide any
    milestones = [
      { description: "Initial setup and requirements", amount: Math.round(bidAmount * 0.35) },
      { description: "Development and implementation", amount: Math.round(bidAmount * 0.45) },
      { description: "Testing and final delivery", amount: bidAmount - Math.round(bidAmount * 0.35) - Math.round(bidAmount * 0.45) }
    ];
  }

  return {
    project,
    score: parsed.score || 0,
    reasoning: parsed.reasoning || "Unable to analyze",
    bidSuggestion: {
      amount: bidAmount,
      currency: projectCurrency,
      amountUSD: convertToUSD(bidAmount, projectCurrency),
      period: parsed.bidPeriod || profile.bidSettings.deliveryDays,
      milestones,
    },
  };
}

export function filterByScore(scores: ProjectScore[], minScore: number): ProjectScore[] {
  return scores.filter((s) => s.score >= minScore);
}

/**
 * AI-powered bid edit suggestion
 * Analyzes competition and suggests optimal bid amount
 */
export interface BidEditSuggestion {
  originalAmount: number;
  suggestedAmount: number;
  currency: string;
  reason: string;
  strategy: "aggressive" | "moderate" | "conservative";
}

export async function suggestBidEdit(
  projectTitle: string,
  currentBid: number,
  currency: string,
  bidRank: number,
  totalBids: number,
  timeRemaining: string
): Promise<BidEditSuggestion> {
  // Calculate position percentage
  const positionPercent = totalBids > 0 ? (bidRank / totalBids) * 100 : 100;
  
  // If no API key, use simple fallback
  if (!process.env.GEMINI_API_KEY) {
    const reduction = positionPercent > 75 ? 0.15 : positionPercent > 50 ? 0.10 : 0.05;
    return {
      originalAmount: currentBid,
      suggestedAmount: Math.round(currentBid * (1 - reduction)),
      currency,
      reason: `Position ${Math.round(positionPercent)}% - ${reduction * 100}% reduction`,
      strategy: reduction >= 0.15 ? "aggressive" : reduction >= 0.10 ? "moderate" : "conservative",
    };
  }

  const prompt = `You are a Freelancer.com bidding strategist. Analyze this bid and suggest an edit.

PROJECT: ${projectTitle}
CURRENT BID: ${currentBid} ${currency}
YOUR RANK: #${bidRank} out of ${totalBids} bids (${Math.round(positionPercent)}% position - lower is better)
TIME REMAINING: ${timeRemaining}

Consider:
1. Very poor position (>75%): Aggressive reduction (15-20%) or strategic repositioning
2. Poor position (50-75%): Moderate reduction (10-15%)  
3. OK position (25-50%): Small reduction (5-10%) or hold
4. Good position (<25%): Don't reduce much, maintain competitiveness

Respond ONLY with JSON (no markdown):
{
  "suggestedAmount": <number>,
  "reason": "<brief 1-line explanation>",
  "strategy": "aggressive" | "moderate" | "conservative"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        originalAmount: currentBid,
        suggestedAmount: Math.round(parsed.suggestedAmount),
        currency,
        reason: parsed.reason || "AI suggestion",
        strategy: parsed.strategy || "moderate",
      };
    }
  } catch (error) {
    console.log("   ⚠️ AI suggestion failed, using fallback");
  }

  // Fallback: simple percentage reduction
  const reduction = positionPercent > 75 ? 0.15 : positionPercent > 50 ? 0.10 : 0.05;
  return {
    originalAmount: currentBid,
    suggestedAmount: Math.round(currentBid * (1 - reduction)),
    currency,
    reason: `Fallback: ${Math.round(reduction * 100)}% reduction based on position`,
    strategy: reduction >= 0.15 ? "aggressive" : reduction >= 0.10 ? "moderate" : "conservative",
  };
}
