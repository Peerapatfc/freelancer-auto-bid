import "dotenv/config";
import { browserManager } from "./browser.js";
import { scrapeProjects, enrichProjectsWithDetails, getRemainingBids, getBidInsights, analyzeCompetition } from "./scraper.js";
import { recommendProjects, filterByScore, suggestBidEdit } from "./ai/recommender.js";
import { generateProposal, generateTemplateProposal } from "./ai/proposal.js";
import { submitBid, editBid } from "./bidder.js";
import { profile, searchUrl } from "../config/profile.js";
import type { BidData } from "./types.js";

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxProjects = Number.parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] || "10");
const headless = args.includes("--headless");
const useTemplate = args.includes("--template"); // Use template instead of AI
const skipDetails = args.includes("--skip-details"); // Skip fetching project details
const improveBidsMode = args.includes("--improve-bids"); // Mode to edit poor-ranking bids

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

    // Check remaining bids (skip for --improve-bids since editing doesn't use new bids)
    const bidStatus = await getRemainingBids();
    if (bidStatus.remaining === 0 && !improveBidsMode) {
      console.log("\n❌ No bids remaining!");
      console.log("   Free members get 6 bids, which replenish over time.");
      if (bidStatus.replenishTime) {
        console.log(`   ⏰ Next bid in: ${bidStatus.replenishTime}`);
      }
      console.log("   💡 Upgrade membership or wait for bid replenishment.\n");
      return;
    }
    
    if (!improveBidsMode) {
      console.log(`\n✅ You have ${bidStatus.remaining} bids available`);
    }

    // Fetch current bid performance
    const existingBids = await getBidInsights();
    const competition = analyzeCompetition(existingBids);
    
    if (existingBids.length > 0) {
      console.log(`📈 Bid Performance: ${competition.sealedCount} sealed, avg rank #${competition.avgRank}, avg competition ${competition.avgTotalBids} bids`);
    }
    console.log("");

    // If --improve-bids mode, edit poor-ranking bids instead of placing new ones
    if (improveBidsMode) {
      console.log("🔧 IMPROVE BIDS MODE: Editing poor-ranking bids...\n");
      
      // Find bids with poor visibility (>50% position)
      const poorBids = existingBids.filter(bid => {
        if (bid.bidRank === 0 || bid.totalBids === 0) return false;
        const positionPercent = (bid.bidRank / bid.totalBids) * 100;
        return positionPercent > 50;
      });

      if (poorBids.length === 0) {
        console.log("✅ No poor-ranking bids found. All bids have good visibility!");
        return;
      }

      console.log(`Found ${poorBids.length} bids with poor visibility (>50%):\n`);

      for (const bid of poorBids) {
        const positionPercent = Math.round((bid.bidRank / bid.totalBids) * 100);
        console.log(`📉 ${bid.projectTitle}`);
        console.log(`   Position: #${bid.bidRank}/${bid.totalBids} (${positionPercent}%)`);
        console.log(`   Current bid: ${bid.yourBid} ${bid.yourBidCurrency}`);
        
        // Get AI-powered bid suggestion
        console.log("   🤖 Analyzing with AI...");
        const suggestion = await suggestBidEdit(
          bid.projectTitle,
          bid.yourBid,
          bid.yourBidCurrency,
          bid.bidRank,
          bid.totalBids,
          bid.timeRemaining
        );
        
        const strategyIcon = suggestion.strategy === "aggressive" ? "🔥" : 
                            suggestion.strategy === "moderate" ? "📊" : "🛡️";
        const changePercent = Math.round((1 - suggestion.suggestedAmount / bid.yourBid) * 100);
        
        console.log(`   ${strategyIcon} Strategy: ${suggestion.strategy.toUpperCase()}`);
        console.log(`   💡 Suggested: ${suggestion.suggestedAmount} ${suggestion.currency} (-${changePercent}%)`);
        console.log(`   📝 Reason: ${suggestion.reason}`);
        
        // Edit the bid (pass original amount for milestone adjustment)
        const success = await editBid(bid.projectUrl, suggestion.suggestedAmount, undefined, dryRun, bid.yourBid);
        
        if (success) {
          console.log("   ✅ Bid updated!\n");
        } else {
          console.log("   ⚠️ Could not update bid\n");
        }
        
        // Delay between edits (and API calls)
        await new Promise(r => setTimeout(r, 2000));
      }

      console.log("\n✨ Bid improvement complete!");
      
      // Recheck rankings after editing (only if not dry run)
      if (!dryRun) {
        console.log("\n📊 Rechecking bid rankings...\n");
        await new Promise(r => setTimeout(r, 2000));
        
        const updatedBids = await getBidInsights();
        const updatedCompetition = analyzeCompetition(updatedBids);
        
        console.log(`📈 Updated Performance: avg rank #${updatedCompetition.avgRank}, avg competition ${updatedCompetition.avgTotalBids} bids`);
        
        // Compare before/after for edited bids
        console.log("\n📊 Ranking changes:");
        for (const oldBid of poorBids) {
          const newBid = updatedBids.find(b => b.projectUrl === oldBid.projectUrl);
          if (newBid) {
            const oldPct = Math.round((oldBid.bidRank / oldBid.totalBids) * 100);
            const newPct = Math.round((newBid.bidRank / newBid.totalBids) * 100);
            const improved = newPct < oldPct;
            const icon = improved ? "📈" : (newPct === oldPct ? "➡️" : "📉");
            console.log(`   ${icon} ${oldBid.projectTitle.substring(0, 30)}...`);
            console.log(`      #${oldBid.bidRank}/${oldBid.totalBids} (${oldPct}%) → #${newBid.bidRank}/${newBid.totalBids} (${newPct}%)`);
          }
        }
      } else {
        console.log("\n💡 Run without --dry-run to actually edit bids and see ranking changes.");
      }
      
      return;
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

    // Limit to available bids (precious bids go to top-scoring projects)
    const projectsToBid = recommended.slice(0, bidStatus.remaining);
    
    if (projectsToBid.length < recommended.length) {
      console.log(`\n⚠️  You have ${bidStatus.remaining} bids, but ${recommended.length} projects match.`);
      console.log(`   Bidding on top ${projectsToBid.length} highest-scoring projects only.\n`);
    }

    console.log(`\n🎯 ${projectsToBid.length} projects selected for bidding:\n`);

    // Process each selected project
    for (const rec of projectsToBid) {
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
