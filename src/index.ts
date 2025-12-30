import "dotenv/config";
import { browserManager } from "./browser.js";
import { scrapeProjects, enrichProjectsWithDetails } from "./scraper.js";
import { recommendProjects, filterByScore } from "./ai/recommender.js";
import { generateProposal, generateTemplateProposal } from "./ai/proposal.js";
import { submitBid } from "./bidder.js";
import { profile, searchUrl } from "../config/profile.js";
import type { BidData } from "./types.js";

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxProjects = Number.parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] || "10");
const headless = args.includes("--headless");
const useTemplate = args.includes("--template"); // Use template instead of AI
const skipDetails = args.includes("--skip-details"); // Skip fetching project details

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         🚀 Freelancer Auto-Bid Script                       ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${dryRun ? "DRY RUN (no bids submitted)" : "LIVE (will submit bids!)"}`.padEnd(63) + "║");
  console.log(`║  Max Projects: ${maxProjects}`.padEnd(63) + "║");
  console.log(`║  Min Score: ${profile.bidSettings.minScore}`.padEnd(63) + "║");
  console.log(`║  Fetch Details: ${!skipDetails ? "Yes (more accurate)" : "No (faster)"}`.padEnd(63) + "║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    // Initialize browser
    await browserManager.init(headless);

    // Check if logged in, if not attempt login (auto or manual)
    const loggedIn = await browserManager.isLoggedIn();
    if (!loggedIn) {
      await browserManager.login();
    } else {
      console.log("✅ Already logged in to Freelancer\n");
    }

    // Scrape projects from search page
    let projects = await scrapeProjects(searchUrl, maxProjects);

    if (projects.length === 0) {
      console.log("❌ No projects found. Check your search URL and filters.");
      return;
    }

    // Enrich projects with detailed info from individual pages
    if (!skipDetails) {
      projects = await enrichProjectsWithDetails(projects, Math.min(10, projects.length), 2000);
    }

    // AI recommends projects
    const scores = await recommendProjects(projects);

    // Filter by minimum score
    const recommended = filterByScore(scores, profile.bidSettings.minScore);

    if (recommended.length === 0) {
      console.log(`\n⚠️  No projects meet the minimum score of ${profile.bidSettings.minScore}`);
      console.log("   Try lowering the minScore in config/profile.ts");
      return;
    }

    console.log(`\n🎯 ${recommended.length} projects recommended for bidding:\n`);

    // Process each recommended project
    for (const rec of recommended) {
      console.log("═".repeat(60));
      console.log(`📌 ${rec.project.title}`);
      
      // Show budget with currency info
      const budgetDisplay = rec.project.budget.currency !== "USD"
        ? `${rec.project.budget.min.toLocaleString()}-${rec.project.budget.max.toLocaleString()} ${rec.project.budget.currency} (~$${rec.project.budget.minUSD}-$${rec.project.budget.maxUSD} USD)`
        : `$${rec.project.budget.min}-$${rec.project.budget.max} USD`;
      
      console.log(`   Score: ${rec.score} | Budget: ${budgetDisplay}`);
      console.log(`   URL: ${rec.project.url}`);
      
      // Show client info if available
      if (rec.project.clientInfo?.location) {
        console.log(`   Client: ${rec.project.clientInfo.location}${rec.project.clientVerified ? " ✓ Verified" : ""}`);
      }

      // Generate proposal
      let proposal: string;
      if (useTemplate || !process.env.GEMINI_API_KEY) {
        console.log("\n📝 Using template proposal...");
        proposal = generateTemplateProposal(rec.project);
      } else {
        proposal = await generateProposal(rec.project);
      }

      // Prepare bid data (in project's currency)
      const bidData: BidData = {
        projectId: rec.project.id,
        amount: rec.bidSuggestion.amount,
        currency: rec.bidSuggestion.currency,
        period: rec.bidSuggestion.period,
        proposal,
        milestones: rec.bidSuggestion.milestones,
      };
      
      // Log milestones if available
      if (bidData.milestones && bidData.milestones.length > 0) {
        console.log("   📋 Suggested milestones:");
        bidData.milestones.forEach((m, i) => {
          console.log(`      ${i + 1}. ${m.description}: ${m.amount.toLocaleString()} ${bidData.currency}`);
        });
      }

      // Submit bid
      const success = await submitBid(rec.project.url, bidData, dryRun);

      if (success) {
        console.log(`✅ Bid submitted for: ${rec.project.title}\n`);
      }

      // Add delay between bids to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log("\n✨ Auto-bid session complete!");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Save session and close browser
    await browserManager.saveSession();
    await browserManager.close();
  }
}

// Run the script
main().catch(console.error);
