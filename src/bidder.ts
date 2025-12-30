import { browserManager } from "./browser.js";
import type { BidData } from "./types.js";
import * as readline from "readline";

/**
 * Fill and submit bid form on Freelancer project page
 * 
 * Based on actual DOM selectors from Freelancer.com:
 * - Bid amount: #bidAmountInput (expects project currency, e.g., INR)
 * - Period: #periodInput (in days)
 * - Description: #descriptionTextArea (minimum 100 characters)
 * - Submit: button with text "Place Bid"
 */
export async function submitBid(
  projectUrl: string,
  bidData: BidData,
  dryRun = false
): Promise<boolean> {
  const page = browserManager.getPage();

  console.log(`\n💼 Preparing bid for project: ${bidData.projectId}`);
  console.log(`   Amount: ${bidData.amount.toLocaleString()} ${bidData.currency || "USD"}`);
  console.log(`   Delivery: ${bidData.period} days`);

  // Navigate to project page
  await page.goto(projectUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  try {
    // Wait for bid form to load - look for the bid amount input
    await page.waitForSelector('#bidAmountInput', { 
      timeout: 10000 
    }).catch(() => {
      console.log("⚠️  Bid form not immediately visible, scrolling...");
    });
    
    // Scroll to bid form card using valid CSS selector
    await page.evaluate(() => {
      // Find the bid form by looking for the button container
      const bidForm = document.querySelector('.BidFormBtn') || 
                      document.querySelector('fl-button[fltrackinglabel="PlaceBidButton"]');
      bidForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(1000);

    // Fill bid amount - use the specific ID from Freelancer's DOM
    const amountInput = await page.$('#bidAmountInput');
    if (amountInput) {
      await amountInput.click();
      await amountInput.fill("");
      await amountInput.fill(bidData.amount.toString());
      console.log(`   ✓ Filled bid amount: ${bidData.amount}`);
    } else {
      console.log("⚠️  Could not find bid amount input (#bidAmountInput)");
      // Try alternative selector
      const altInput = await page.$('input[type="number"][placeholder*="amount"], input[id*="amount"]');
      if (altInput) {
        await altInput.fill(bidData.amount.toString());
        console.log(`   ✓ Filled bid amount (alt selector): ${bidData.amount}`);
      }
    }

    // Fill delivery period
    const periodInput = await page.$('#periodInput');
    if (periodInput) {
      await periodInput.click();
      await periodInput.fill("");
      await periodInput.fill(bidData.period.toString());
      console.log(`   ✓ Filled delivery period: ${bidData.period} days`);
    } else {
      console.log("⚠️  Could not find period input (#periodInput)");
    }

    // Fill proposal/description - minimum 100 characters required
    const proposalInput = await page.$('#descriptionTextArea');
    if (proposalInput) {
      await proposalInput.click();
      await proposalInput.fill("");
      await proposalInput.fill(bidData.proposal);
      console.log(`   ✓ Filled proposal: ${bidData.proposal.length} characters`);
    } else {
      console.log("⚠️  Could not find description textarea (#descriptionTextArea)");
      // Try alternative
      const altTextarea = await page.$('textarea[placeholder*="candidate"], textarea[id*="description"]');
      if (altTextarea) {
        await altTextarea.fill(bidData.proposal);
        console.log(`   ✓ Filled proposal (alt selector): ${bidData.proposal.length} characters`);
      }
    }

    // Fill milestone requests if provided
    if (bidData.milestones && bidData.milestones.length > 0) {
      console.log(`\n   📋 Adding ${bidData.milestones.length} milestone(s)...`);
      
      for (let i = 0; i < bidData.milestones.length; i++) {
        const milestone = bidData.milestones[i];
        
        // For first milestone, the form already has one row
        // For additional milestones, click "Request milestone" button
        if (i > 0) {
          const addMilestoneBtn = await page.$(
            'fl-button[fltrackinglabel="AddMilestoneRequestButton"] button:not([disabled])'
          );
          if (addMilestoneBtn) {
            await addMilestoneBtn.click();
            await page.waitForTimeout(500);
          } else {
            console.log("   ⚠️ Cannot add more milestones (total must not exceed bid)");
            break;
          }
        }
        
        // Find milestone inputs using correct selectors from DOM
        // The inputs are inside fl-input with specific fltrackinglabel
        const descInputs = await page.$$(
          'fl-input[fltrackinglabel="MilestoneRequestDescriptionInput-OnBid"] input.NativeElement'
        );
        const amountInputs = await page.$$(
          'fl-input[fltrackinglabel="MilestoneRequestAmountInput-OnBid"] input.NativeElement'
        );
        
        if (descInputs[i] && amountInputs[i]) {
          await descInputs[i].click();
          await descInputs[i].fill(milestone.description);
          await amountInputs[i].click();
          await amountInputs[i].fill(milestone.amount.toString());
          console.log(`   ✓ Milestone ${i + 1}: "${milestone.description}" - ${milestone.amount} ${bidData.currency}`);
        } else {
          console.log(`   ⚠️ Could not find milestone inputs for #${i + 1}`);
        }
      }
    }

    // Wait for validation
    await page.waitForTimeout(500);

    // Take screenshot of filled form
    const screenshotPath = `.auth/bid_preview_${bidData.projectId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 Form preview saved to ${screenshotPath}`);

    if (dryRun) {
      console.log("\n🏃 DRY RUN MODE - Bid NOT submitted");
      console.log("   Review the screenshot and run without --dry-run to submit.");
      
      // Check for validation errors
      const validationError = await page.$('.ValidationError:not(:empty), [class*="error"]:not(:empty)');
      if (validationError) {
        const errorText = await validationError.textContent();
        if (errorText?.trim()) {
          console.log(`   ⚠️  Validation warning: ${errorText.trim()}`);
        }
      }
      
      return false;
    }

    // Ask for confirmation before submitting
    const confirmed = await askConfirmation(
      `\n⚠️  Submit bid for ${bidData.amount.toLocaleString()} ${bidData.currency || ""} / ${bidData.period} days? (y/n): `
    );

    if (!confirmed) {
      console.log("❌ Bid cancelled by user.");
      return false;
    }

    // Find and click submit button - Freelancer uses specific structure
    const submitButton = await page.$(
      'fl-button[fltrackinglabel="PlaceBidButton"] button, button:has-text("Place Bid")'
    );

    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(3000);
      
      // Check for errors after submission
      const errorAlert = await page.$('.Alert--error, [class*="error-message"]');
      if (errorAlert) {
        const errorText = await errorAlert.textContent();
        console.log(`❌ Bid failed: ${errorText?.trim()}`);
        return false;
      }
      
      console.log("✅ Bid submitted successfully!");
      return true;
    } else {
      console.log("⚠️  Could not find submit button.");
      return false;
    }
  } catch (error) {
    console.error("Error submitting bid:", error);
    return false;
  }
}

/**
 * Ask user for confirmation in terminal
 */
async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Get count of bids made today (for rate limiting)
 */
export function getTodayBidCount(): number {
  // In a real implementation, this would read from a persistent store
  // For now, we'll track in memory
  return 0;
}
