import type { Project } from "./types.js";
import { browserManager } from "./browser.js";

// Currency exchange rates (approximate - update as needed)
const USD_EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.10,    // 1 EUR = 1.10 USD
  GBP: 1.27,    // 1 GBP = 1.27 USD
  INR: 0.012,   // 1 INR = 0.012 USD
  AUD: 0.64,    // 1 AUD = 0.64 USD
  CAD: 0.74,    // 1 CAD = 0.74 USD
  SGD: 0.74,    // 1 SGD = 0.74 USD
  THB: 0.029,   // 1 THB = 0.029 USD
};

/**
 * Convert amount to USD
 */
function convertToUSD(amount: number, currency: string): number {
  const rate = USD_EXCHANGE_RATES[currency.toUpperCase()] || 1;
  return Math.round(amount * rate);
}

/**
 * Detect currency from symbol
 */
function detectCurrency(symbol: string): string {
  const currencyMap: Record<string, string> = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "A$": "AUD",
    "C$": "CAD",
    "S$": "SGD",
    "฿": "THB",
  };
  return currencyMap[symbol] || "USD";
}

/**
 * Parse currency amount from text like "₹25,000.00 INR" or "$500 USD"
 */
function parseCurrencyAmount(text: string): { amount: number; currency: string } {
  const match = text.match(/([\$₹€£])?([\d,]+(?:\.\d+)?)\s*(\w+)?/);
  if (match) {
    const symbol = match[1] || "$";
    const amount = Number.parseFloat(match[2].replace(/,/g, ""));
    const currency = match[3]?.toUpperCase() || detectCurrency(symbol);
    return { amount, currency };
  }
  return { amount: 0, currency: "USD" };
}

// Raw project interface for scraping
interface RawProject {
  id: string;
  title: string;
  description: string;
  budgetText: string;
  skills: string[];
  bidsCount: number;
  clientRating: number;
  timePosted: string;
  url: string;
}

/**
 * Scrape projects from a single page
 */
async function scrapeProjectsFromPage(maxPerPage: number): Promise<RawProject[]> {
  const page = browserManager.getPage();
  
  const rawProjects = await page.evaluate((max: number) => {
    const projectLinks = document.querySelectorAll(
      'a[href^="/projects/"][class="ng-star-inserted"]'
    );
    
    interface RawProjectInner {
      id: string;
      title: string;
      description: string;
      budgetText: string;
      skills: string[];
      bidsCount: number;
      clientRating: number;
      timePosted: string;
      url: string;
    }
    
    const results: RawProjectInner[] = [];

    for (const [index, el] of Array.from(projectLinks).entries()) {
      if (index >= max) break;

      try {
        const linkEl = el as HTMLAnchorElement;
        const url = linkEl.href;
        
        const urlMatch = url.match(/\/projects\/[^/]+\/([^/]+)/);
        const id = urlMatch ? urlMatch[1] : `proj_${index}`;
        
        const titleEl = el.querySelector('h2.Title-text, .Title-text');
        const title = titleEl?.textContent?.trim() || "";
        
        const descEl = el.querySelector('p.mb-xxsmall');
        const description = descEl?.textContent?.trim().replace(/more$/, '').trim() || "";
        
        const budgetContainer = el.querySelector('.BudgetUpgradeWrapper-budget');
        const budgetText = budgetContainer?.textContent?.trim() || "";
        
        const skillEls = el.querySelectorAll('fl-tag .Content, .SkillsWrapper-skill .Content');
        const skills: string[] = [];
        for (const skill of skillEls) {
          const skillText = skill.textContent?.trim();
          if (skillText && !skills.includes(skillText)) {
            skills.push(skillText);
          }
        }
        
        const bidsEl = el.querySelector('.BidEntryData');
        const bidsText = bidsEl?.textContent?.trim() || "";
        const bidsMatch = bidsText.match(/(\d+)\s*bids?/);
        const bidsCount = bidsMatch ? Number.parseInt(bidsMatch[1]) : 0;
        
        const ratingEl = el.querySelector('fl-rating .LayerGroup');
        const clientRating = Number.parseFloat(ratingEl?.getAttribute('data-rating') || "0");
        
        const timeEl = el.querySelector('fl-relative-time');
        const timePosted = timeEl?.textContent?.trim() || "";

        if (title) {
          results.push({
            id,
            title,
            description: description.substring(0, 500),
            budgetText,
            skills,
            bidsCount,
            clientRating,
            timePosted,
            url,
          });
        }
      } catch (error) {
        console.error("Error parsing project:", error);
      }
    }

    return results;
  }, maxPerPage);
  
  return rawProjects;
}

/**
 * Convert raw projects to Project objects
 */
function convertRawProjects(rawProjects: RawProject[]): Project[] {
  return rawProjects.map((raw) => {
    const budgetMatch = raw.budgetText.match(/([\$₹€£])?([\d,]+)\s*[–-]\s*([\$₹€£]?)?([\d,]+)\s*(\w+)?/);
    const isHourly = raw.budgetText.toLowerCase().includes("per hour");
    
    let minBudget = 0;
    let maxBudget = 0;
    let currency = "USD";
    let minBudgetUSD = 0;
    let maxBudgetUSD = 0;
    
    if (budgetMatch) {
      const symbol = budgetMatch[1] || budgetMatch[3] || "$";
      minBudget = Number.parseInt(budgetMatch[2].replace(/,/g, ""));
      maxBudget = Number.parseInt(budgetMatch[4].replace(/,/g, ""));
      
      if (budgetMatch[5]) {
        currency = budgetMatch[5].toUpperCase();
      } else {
        currency = detectCurrency(symbol);
      }
      
      minBudgetUSD = convertToUSD(minBudget, currency);
      maxBudgetUSD = convertToUSD(maxBudget, currency);
    }
    
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      budget: {
        min: minBudget,
        max: maxBudget,
        currency,
        minUSD: minBudgetUSD,
        maxUSD: maxBudgetUSD,
        isHourly,
      },
      skills: raw.skills,
      bidsCount: raw.bidsCount,
      clientRating: raw.clientRating,
      clientVerified: false,
      timePosted: raw.timePosted,
      url: raw.url,
    };
  });
}

/**
 * Scrape projects from Freelancer search page with pagination support
 * @param searchUrl Base search URL
 * @param maxProjects Maximum total projects to scrape
 * @param maxPages Maximum pages to scrape (20 projects per page)
 */
export async function scrapeProjects(
  searchUrl: string, 
  maxProjects = 40, 
  maxPages = 2
): Promise<Project[]> {
  const page = browserManager.getPage();
  
  console.log(`\n🔍 Scraping projects from Freelancer...`);
  console.log(`   URL: ${searchUrl}`);
  console.log(`   Pages: ${maxPages} (up to ${maxProjects} projects)\n`);

  const allRawProjects: RawProject[] = [];
  const projectsPerPage = 20;
  
  // Scrape multiple pages
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    // Check if we have enough projects
    if (allRawProjects.length >= maxProjects) break;
    
    // Build URL with page parameter
    const separator = searchUrl.includes("?") ? "&" : "?";
    const pageUrl = pageNum === 1 ? searchUrl : `${searchUrl}${separator}page=${pageNum}`;
    
    console.log(`   📄 Page ${pageNum}/${maxPages}...`);
    
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60000 });

    await page.waitForSelector('fl-project-contest-card, a[href^="/projects/"]', {
      timeout: 30000,
    }).catch(() => {
      console.log("   ⚠️ Waiting for projects to load...");
    });

    await page.waitForTimeout(2000);
    
    // Scrape this page
    const pageProjects = await scrapeProjectsFromPage(projectsPerPage);
    console.log(`      Found ${pageProjects.length} projects on this page`);
    
    // Add to collection, avoiding duplicates
    for (const proj of pageProjects) {
      if (!allRawProjects.some(p => p.id === proj.id)) {
        allRawProjects.push(proj);
      }
    }
    
    // Short delay between pages
    if (pageNum < maxPages) {
      await page.waitForTimeout(1000);
    }
  }
  
  // Limit to maxProjects
  const limitedRawProjects = allRawProjects.slice(0, maxProjects);
  
  // Convert to Project objects
  const projects = convertRawProjects(limitedRawProjects);

  console.log(`\n✅ Found ${projects.length} total projects\n`);
  
  if (projects.length > 0) {
    console.log("📋 Sample projects:");
    projects.slice(0, 3).forEach((p, i) => {
      const budgetDisplay = p.budget.currency !== "USD" 
        ? `${p.budget.min.toLocaleString()}-${p.budget.max.toLocaleString()} ${p.budget.currency} (~$${p.budget.minUSD}-$${p.budget.maxUSD} USD)`
        : `$${p.budget.min}-$${p.budget.max} USD`;
      console.log(`   ${i + 1}. ${p.title}`);
      console.log(`      Budget: ${budgetDisplay}${p.budget.isHourly ? " /hr" : ""}`);
      console.log(`      Skills: ${p.skills.slice(0, 3).join(", ")}${p.skills.length > 3 ? "..." : ""}`);
      console.log(`      Bids: ${p.bidsCount} | Rating: ${p.clientRating.toFixed(1)}`);
    });
    console.log("");
  }
  
  return projects;
}

/**
 * Get detailed project info from individual project page
 * Includes full description, client info, and competitor bids
 */
export async function getProjectDetails(project: Project): Promise<Project> {
  const page = browserManager.getPage();
  
  console.log(`   📄 Fetching details: ${project.title.substring(0, 40)}...`);
  
  // Go to the details tab first
  const detailsUrl = project.url.includes("/details") ? project.url : `${project.url}/details`;
  await page.goto(detailsUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  const details = await page.evaluate(() => {
    // Average bid from header
    const avgBidEl = document.querySelector('.AveragePrice, app-project-summary .text-large');
    const avgBidText = avgBidEl?.textContent?.trim() || "";
    
    // Full project description - try multiple selectors
    const descriptionSelectors = [
      '.ProjectDescription',
      '[class*="ProjectViewDetails"] p',
      '.project-details p',
      'app-project-view-header + * p'
    ];
    
    let fullDescription = "";
    for (const selector of descriptionSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        fullDescription = el.textContent.trim();
        break;
      }
    }
    
    // Deliverables
    const deliverableEls = document.querySelectorAll('.Deliverables li, [class*="deliverable"] li');
    const deliverables: string[] = [];
    for (const el of deliverableEls) {
      const text = el.textContent?.trim();
      if (text) deliverables.push(text);
    }
    
    // Client verification - check for verified badges
    const verifiedBadge = document.querySelector('[class*="Verified"], .VerificationStatus');
    const clientVerified = !!verifiedBadge || 
      document.body.innerHTML.includes("Payment Verified") ||
      document.body.innerHTML.includes("Identity Verified");
    
    // Client info from "About the Client" section
    let location = "";
    let memberSince = "";
    
    const clientSection = document.querySelector('[class*="AboutClient"], [class*="ClientCard"], .client-info');
    if (clientSection) {
      const locationEl = clientSection.querySelector('[class*="location"], .country');
      location = locationEl?.textContent?.trim() || "";
      
      const memberEl = clientSection.querySelector('[class*="member"]');
      const memberMatch = memberEl?.textContent?.match(/member since[:\s]*([\w\s,]+)/i);
      memberSince = memberMatch ? memberMatch[1].trim() : "";
    }
    
    return {
      avgBidText,
      fullDescription: fullDescription.substring(0, 3000),
      deliverables,
      clientVerified,
      clientInfo: {
        location,
        memberSince,
        totalJobs: 0,
        hireRate: 0,
        totalSpent: "",
        avgHourlyRate: "",
      },
    };
  });

  // Now go to proposals tab to get competitor bids
  const proposalsUrl = project.url.replace("/details", "") + "/proposals";
  await page.goto(proposalsUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  const competitorBids = await page.evaluate(() => {
    const bidCards = document.querySelectorAll('app-bid-card fl-bid-pattern-card');
    const bids: {
      freelancerName: string;
      rating: number;
      reviews: number;
      completionRate: number;
      bidAmount: number;
      bidCurrency: string;
      deliveryDays: number;
      isVerified: boolean;
      isPreferred: boolean;
    }[] = [];
    
    for (const card of Array.from(bidCards).slice(0, 10)) { // Limit to top 10 bids
      try {
        // Freelancer name
        const nameEl = card.querySelector('.Username-displayName');
        const freelancerName = nameEl?.textContent?.trim() || "Unknown";
        
        // Rating
        const ratingEl = card.querySelector('fl-rating .LayerGroup');
        const rating = Number.parseFloat(ratingEl?.getAttribute('data-rating') || "0");
        
        // Reviews count
        const reviewEl = card.querySelector('fl-review-count span');
        const reviews = Number.parseInt(reviewEl?.textContent?.trim() || "0");
        
        // Completion rate
        const completionEl = card.querySelector('fl-completed-jobs p');
        const completionMatch = completionEl?.textContent?.match(/(\d+)%/);
        const completionRate = completionMatch ? Number.parseInt(completionMatch[1]) : 0;
        
        // Bid amount - look in PriceContainer
        const priceEl = card.querySelector('.PriceContainer .text-large.font-bold');
        const priceText = priceEl?.textContent?.trim() || "";
        
        // Parse amount and currency from text like "₹25,000.00 INR"
        const amountMatch = priceText.match(/([\$₹€£])?([\d,]+(?:\.\d+)?)\s*(\w+)?/);
        let bidAmount = 0;
        let bidCurrency = "USD";
        if (amountMatch) {
          bidAmount = Number.parseFloat(amountMatch[2].replace(/,/g, ""));
          bidCurrency = amountMatch[3] || (amountMatch[1] === "₹" ? "INR" : "USD");
        }
        
        // Delivery days
        const daysEl = card.querySelector('.PriceContainer .text-xsmall');
        const daysMatch = daysEl?.textContent?.match(/in\s*(\d+)\s*days?/i);
        const deliveryDays = daysMatch ? Number.parseInt(daysMatch[1]) : 7;
        
        // Badges
        const isVerified = !!card.querySelector('fl-badge[data-type="verified"]');
        const isPreferred = !!card.querySelector('fl-badge[data-type="preferred-freelancer"]');
        
        bids.push({
          freelancerName,
          rating,
          reviews,
          completionRate,
          bidAmount,
          bidCurrency,
          deliveryDays,
          isVerified,
          isPreferred,
        });
      } catch (e) {
        console.error("Error parsing bid card:", e);
      }
    }
    
    return bids;
  });

  // Parse average bid
  const { amount: averageBid, currency: averageBidCurrency } = parseCurrencyAmount(details.avgBidText);

  // Merge details with existing project
  return {
    ...project,
    fullDescription: details.fullDescription || project.description,
    deliverables: details.deliverables,
    clientVerified: details.clientVerified,
    clientInfo: details.clientInfo,
    averageBid,
    averageBidCurrency,
    competitorBids,
  };
}

/**
 * Enrich projects with detailed information
 */
export async function enrichProjectsWithDetails(
  projects: Project[], 
  maxToEnrich = 5,
  delayMs = 2000
): Promise<Project[]> {
  console.log(`\n📄 Fetching detailed info for top ${Math.min(maxToEnrich, projects.length)} projects...`);
  
  const enrichedProjects: Project[] = [];
  
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    
    if (i < maxToEnrich) {
      try {
        const detailedProject = await getProjectDetails(project);
        enrichedProjects.push(detailedProject);
        
        // Log competitor analysis
        if (detailedProject.competitorBids && detailedProject.competitorBids.length > 0) {
          console.log(`      💰 ${detailedProject.competitorBids.length} bids found`);
          console.log(`      📊 Avg bid: ${detailedProject.averageBid?.toLocaleString()} ${detailedProject.averageBidCurrency}`);
        }
        
        if (i < maxToEnrich - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`   ⚠️ Could not fetch details for "${project.title}": ${(error as Error).message}`);
        enrichedProjects.push(project);
      }
    } else {
      enrichedProjects.push(project);
    }
  }
  
  console.log(`✅ Enriched ${Math.min(maxToEnrich, projects.length)} projects with details\n`);
  
  return enrichedProjects;
}

/**
 * Check if we've already bid on a project
 */
export async function hasExistingBid(projectUrl: string): Promise<boolean> {
  const page = browserManager.getPage();
  
  await page.goto(projectUrl, { waitUntil: "networkidle", timeout: 60000 });

  const alreadyBid = await page.evaluate(() => {
    const bidIndicators = document.querySelectorAll(
      '[class*="your-bid"], [class*="already-bid"], [class*="my-bid"], [class*="YourBid"]'
    );
    return bidIndicators.length > 0;
  });

  return alreadyBid;
}

/**
 * Get remaining bids from dashboard
 * Returns { remaining: number, total: number, replenishTime: string | null }
 */
export async function getRemainingBids(): Promise<{
  remaining: number;
  total: number;
  replenishTime: string | null;
}> {
  const page = browserManager.getPage();
  
  console.log("📊 Checking remaining bids...");
  
  await page.goto("https://www.freelancer.com/dashboard", { 
    waitUntil: "networkidle", 
    timeout: 60000 
  });
  await page.waitForTimeout(2000);

  const bidInfo = await page.evaluate(() => {
    // Look for "X bids left out of Y" text
    const pageText = document.body.innerText;
    
    // Pattern: "0 bids left out of 6"
    const bidMatch = pageText.match(/(\d+)\s*bids?\s*left\s*out\s*of\s*(\d+)/i);
    
    if (bidMatch) {
      return {
        remaining: parseInt(bidMatch[1]),
        total: parseInt(bidMatch[2]),
      };
    }
    
    // Fallback: look for bid count element
    const bidEl = document.querySelector('[class*="bids-left"], [class*="BidCount"]');
    if (bidEl) {
      const text = bidEl.textContent || "";
      const match = text.match(/(\d+)/);
      if (match) {
        return { remaining: parseInt(match[1]), total: 6 };
      }
    }
    
    return { remaining: -1, total: -1 }; // Unknown
  });

  // Check for replenish time (e.g., "4 days, 22 hours until next additional bid")
  const replenishTime = await page.evaluate(() => {
    const pageText = document.body.innerText;
    const replenishMatch = pageText.match(/([\d]+\s*days?,?\s*[\d]+\s*hours?)\s*until\s*next/i);
    return replenishMatch ? replenishMatch[1] : null;
  });

  if (bidInfo.remaining >= 0) {
    console.log(`   📋 Bids: ${bidInfo.remaining} / ${bidInfo.total} remaining`);
    if (replenishTime) {
      console.log(`   ⏰ Next bid replenishes in: ${replenishTime}`);
    }
  } else {
    console.log("   ⚠️ Could not determine bid count");
  }

  return { ...bidInfo, replenishTime };
}

/**
 * Bid insight data structure
 */
export interface BidInsight {
  projectTitle: string;
  projectUrl: string;
  timeRemaining: string;
  bidRank: number;
  totalBids: number;
  yourBid: number;
  yourBidCurrency: string;
  status: "active" | "sealed" | "won" | "lost";
  clientCountry: string;
  clientRating: number;
}

/**
 * Scrape bid insights from /insights/bids page
 * Shows your bid performance: rank, status, competition
 */
export async function getBidInsights(): Promise<BidInsight[]> {
  const page = browserManager.getPage();
  
  console.log("\n📊 Fetching bid insights...");
  
  await page.goto("https://www.freelancer.com/insights/bids", { 
    waitUntil: "networkidle", 
    timeout: 60000 
  });
  await page.waitForTimeout(3000);

  const insights = await page.evaluate(() => {
    // Select only main bid rows, not expandable detail rows
    const rows = document.querySelectorAll('.InsightsBidsTable table tbody tr.BodyRow:not(.BodyRowExpandable)');
    const results: {
      projectTitle: string;
      projectUrl: string;
      timeRemaining: string;
      bidRank: number;
      totalBids: number;
      yourBid: number;
      yourBidCurrency: string;
      status: string;
      clientCountry: string;
      clientRating: number;
    }[] = [];

    for (const row of rows) {
      try {
        // Project title and link - inside app-project-title-column
        const titleEl = row.querySelector('app-project-title-column fl-link a');
        const projectTitle = titleEl?.textContent?.trim() || "";
        const projectUrl = (titleEl as HTMLAnchorElement)?.href || "";

        // Skip if no title (not a valid bid row)
        if (!projectTitle) continue;

        // Time to bid - 2nd column
        const cells = row.querySelectorAll('td');
        const timeRemaining = cells[1]?.textContent?.trim() || "";

        // Bid rank - in .InsightsBidsTable-column-bidRank
        const rankEl = row.querySelector('.InsightsBidsTable-column-bidRank');
        const rankText = rankEl?.textContent?.trim() || "";
        // Pattern: "#100+ of 179 bids" or "#26 of 33 bids"
        const rankMatch = rankText.match(/#?(\d+)\+?\s*of\s*(\d+)/i);
        const bidRank = rankMatch ? Number.parseInt(rankMatch[1], 10) : 0;
        const totalBids = rankMatch ? Number.parseInt(rankMatch[2], 10) : 0;

        // Your bid amount - 5th column contains the amount like "£30.00 GBP" or "₹850.00 INR"
        const yourBidText = cells[4]?.textContent?.trim() || "";
        // Match currency symbol + amount + currency code
        const bidMatch = yourBidText.match(/([£$₹€])?([0-9,]+(?:\.[0-9]+)?)\s*([A-Z]{3})?/);
        const yourBid = bidMatch ? Number.parseFloat(bidMatch[2].replace(/,/g, "")) : 0;
        let yourBidCurrency = bidMatch?.[3] || "USD";
        // Infer from symbol if no code
        if (!bidMatch?.[3] && bidMatch?.[1]) {
          const symbolMap: Record<string, string> = { "£": "GBP", "$": "USD", "₹": "INR", "€": "EUR" };
          yourBidCurrency = symbolMap[bidMatch[1]] || "USD";
        }

        // Status - check for Sealed badge in winning bid column (4th column)
        const sealedEl = row.querySelector('fl-upgrade-tag[data-upgrade-type="sealed"]');
        const isSealed = !!sealedEl || cells[3]?.textContent?.toLowerCase().includes("sealed");
        const status = isSealed ? "sealed" : "active";

        // Client info - flag image src contains country code
        const flagImg = row.querySelector('app-client-information-column fl-flag img') as HTMLImageElement;
        const flagSrc = flagImg?.src || "";
        // Extract country from URL like ".../flags/gb.png"
        const countryMatch = flagSrc.match(/flags\/([a-z]{2})\.png/i);
        const clientCountry = countryMatch ? countryMatch[1].toUpperCase() : "";
        
        // Client rating - from fl-rating ValueBlock
        const ratingEl = row.querySelector('fl-rating .ValueBlock');
        const clientRating = ratingEl ? Number.parseFloat(ratingEl.textContent?.trim() || "0") : 0;

        results.push({
          projectTitle,
          projectUrl,
          timeRemaining,
          bidRank,
          totalBids,
          yourBid,
          yourBidCurrency,
          status,
          clientCountry,
          clientRating,
        });
      } catch (e) {
        console.error("Error parsing bid row:", e);
      }
    }

    return results;
  });

  // Display summary
  if (insights.length > 0) {
    console.log(`   Found ${insights.length} active bids:\n`);
    
    const sealed = insights.filter(i => i.status === "sealed");
    
    // Calculate position as percentage: lower % = better visibility
    // #1 of 100 = 1% (top), #50 of 100 = 50% (middle), #100 of 100 = 100% (bottom)
    const getPositionPercent = (rank: number, total: number) => 
      total > 0 ? (rank / total) * 100 : 100;
    
    const goodPosition = insights.filter(i => {
      if (i.bidRank === 0 || i.totalBids === 0) return false;
      return getPositionPercent(i.bidRank, i.totalBids) <= 25; // Top 25%
    });
    
    const okPosition = insights.filter(i => {
      if (i.bidRank === 0 || i.totalBids === 0) return false;
      const pct = getPositionPercent(i.bidRank, i.totalBids);
      return pct > 25 && pct <= 50; // 25-50%
    });
    
    const poorPosition = insights.filter(i => {
      if (i.bidRank === 0 || i.totalBids === 0) return true; // Unknown = poor
      return getPositionPercent(i.bidRank, i.totalBids) > 50; // Bottom 50%
    });
    
    if (sealed.length > 0) {
      console.log(`   🔒 ${sealed.length} SEALED projects (bids hidden from competitors):`);
      for (const b of sealed) {
        console.log(`      - ${b.projectTitle.substring(0, 40)}...`);
      }
    }
    
    if (goodPosition.length > 0) {
      console.log(`   🎯 ${goodPosition.length} GOOD visibility (top 25%):`);
      for (const b of goodPosition) {
        const pct = Math.round(getPositionPercent(b.bidRank, b.totalBids));
        console.log(`      - #${b.bidRank}/${b.totalBids} (${pct}%): ${b.projectTitle.substring(0, 30)}...`);
      }
    }
    
    if (okPosition.length > 0) {
      console.log(`   📊 ${okPosition.length} OK visibility (25-50%):`);
      for (const b of okPosition) {
        const pct = Math.round(getPositionPercent(b.bidRank, b.totalBids));
        console.log(`      - #${b.bidRank}/${b.totalBids} (${pct}%): ${b.projectTitle.substring(0, 30)}...`);
      }
    }
    
    if (poorPosition.length > 0) {
      console.log(`   📉 ${poorPosition.length} POOR visibility (bottom 50%):`);
      for (const b of poorPosition) {
        const pct = b.totalBids > 0 ? Math.round(getPositionPercent(b.bidRank, b.totalBids)) : "?";
        console.log(`      - #${b.bidRank || "?"}/${b.totalBids || "?"} (${pct}%): ${b.projectTitle.substring(0, 30)}...`);
      }
    }
    
    console.log("");
  } else {
    console.log("   No active bids found\n");
  }

  return insights as BidInsight[];
}

/**
 * Calculate average winning position from insights
 * Used to estimate if a new bid would be competitive
 */
export function analyzeCompetition(insights: BidInsight[]): {
  avgRank: number;
  sealedCount: number;
  avgTotalBids: number;
  winRate: number;
} {
  if (insights.length === 0) {
    return { avgRank: 0, sealedCount: 0, avgTotalBids: 0, winRate: 0 };
  }

  const withRank = insights.filter(i => i.bidRank > 0);
  const avgRank = withRank.length > 0 
    ? withRank.reduce((sum, i) => sum + i.bidRank, 0) / withRank.length 
    : 0;
  
  const sealedCount = insights.filter(i => i.status === "sealed").length;
  const avgTotalBids = insights.reduce((sum, i) => sum + i.totalBids, 0) / insights.length;
  const winRate = sealedCount / insights.length * 100;

  return { avgRank: Math.round(avgRank), sealedCount, avgTotalBids: Math.round(avgTotalBids), winRate };
}

// Export for use in other modules
export { convertToUSD, USD_EXCHANGE_RATES, parseCurrencyAmount };
