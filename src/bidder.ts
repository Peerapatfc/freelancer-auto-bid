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
    // Check if already bid on this project
    const alreadyBid = await page.evaluate(() => {
      // Look for indicators that we already bid
      const bidIndicators = [
        '[class*="your-bid"]',
        '[class*="already-bid"]',
        '[class*="my-bid"]',
        '[class*="YourBid"]',
        '[class*="BidSubmitted"]',
        'app-your-bid',
        '.YourBid',
      ];
      
      for (const selector of bidIndicators) {
        if (document.querySelector(selector)) return true;
      }
      
      // Check for text indicating already bid
      const pageText = document.body.innerText;
      if (pageText.includes("You've already bid on this project") ||
          pageText.includes("Your bid on this project") ||
          pageText.includes("You have already placed a bid")) {
        return true;
      }
      
      // Check if bid form is disabled or hidden
      const bidForm = document.querySelector('#bidAmountInput');
      if (!bidForm) {
        // No bid form might mean already bid or project closed
        const closedIndicators = document.body.innerText;
        if (closedIndicators.includes("already bid") || 
            closedIndicators.includes("Your Bid")) {
          return true;
        }
      }
      
      return false;
    });

    if (alreadyBid) {
      console.log("⏭️  Already bid on this project - skipping");
      return false;
    }

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

    // Auto-submit without confirmation
    console.log(`\n🚀 Auto-submitting bid: ${bidData.amount.toLocaleString()} ${bidData.currency || ""} / ${bidData.period} days...`);

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
 * Edit an existing bid to improve ranking
 * - Can lower bid amount
 * - Can update proposal text
 * - Automatically adjusts milestone payments proportionally
 */
export async function editBid(
  projectUrl: string,
  newAmount?: number,
  newProposal?: string,
  dryRun = false,
  originalAmount?: number  // Original amount to calculate adjustment ratio
): Promise<boolean> {
  const page = browserManager.getPage();

  console.log(`\n✏️  Editing bid for: ${projectUrl}`);

  // Navigate to project page (proposals view)
  await page.goto(projectUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  try {
    // Scroll to find the bid card (Your Proposal section)
    await page.evaluate(() => {
      const bidCard = document.querySelector('app-bid-card, .Actions-freelancer');
      bidCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(1000);

    // Look for the Edit button using the actual Freelancer DOM selector
    // fl-button[fltrackinglabel="EditBidButton"] contains button with text "Edit"
    const editButton = await page.$('fl-button[fltrackinglabel="EditBidButton"] button');
    
    if (!editButton) {
      // Fallback: try text-based selector
      const fallbackButton = await page.$('button:has-text("Edit")');
      if (!fallbackButton) {
        console.log("   ⚠️ Edit button not found - may not have bid on this project");
        return false;
      }
    }

    // Calculate adjustment ratio for milestones
    const adjustmentRatio = (originalAmount && newAmount) ? newAmount / originalAmount : 1;

    if (dryRun) {
      console.log("   🔄 [DRY RUN] Would click Edit button");
      if (newAmount) console.log(`   🔄 [DRY RUN] Would change amount to: ${newAmount}`);
      if (adjustmentRatio < 1) {
        console.log(`   🔄 [DRY RUN] Would adjust milestones by ${Math.round((1 - adjustmentRatio) * 100)}%`);
      }
      if (newProposal) console.log("   🔄 [DRY RUN] Would update proposal");
      return true;
    }

    // Click the Edit button
    const buttonToClick = await page.$('fl-button[fltrackinglabel="EditBidButton"] button') || 
                          await page.$('button:has-text("Edit")');
    if (buttonToClick) {
      await buttonToClick.click();
      console.log("   ✓ Clicked Edit button");
    }
    await page.waitForTimeout(2000);

    // Update bid amount if provided
    if (newAmount) {
      const amountInput = await page.$('#bidAmountInput, input[type="number"]');
      if (amountInput) {
        await amountInput.click({ clickCount: 3 }); // Select all
        await amountInput.fill(newAmount.toString());
        console.log(`   ✓ Updated amount to: ${newAmount}`);
      }
    }

    // Handle milestones: update existing milestone amounts to match new bid
    // Instead of deleting/creating, just update the values proportionally
    if (newAmount && originalAmount && originalAmount > 0) {
      const adjustmentRatio = newAmount / originalAmount;
      
      // Find all existing milestone amount inputs
      const milestoneAmountInputs = await page.$$('.MilestoneRequest input[aria-label="Milestone request amount"], input[type="number"][inputmode="decimal"]');
      
      if (milestoneAmountInputs.length > 0) {
        console.log(`   📋 Updating ${milestoneAmountInputs.length} milestone(s) proportionally...`);
        
        let totalNewMilestones = 0;
        const newValues: number[] = [];
        
        for (let i = 0; i < milestoneAmountInputs.length; i++) {
          const input = milestoneAmountInputs[i];
          const currentValue = await input.inputValue();
          const numericValue = Number.parseFloat(currentValue.replace(/[^0-9.]/g, ''));
          
          if (!Number.isNaN(numericValue) && numericValue > 0) {
            // Calculate new value proportionally, ensure minimum 1
            let newValue = Math.round(numericValue * adjustmentRatio);
            if (newValue < 1) newValue = 1;
            
            // Update the input
            await input.click({ clickCount: 3 });
            await input.fill(newValue.toString());
            await page.waitForTimeout(200);
            
            newValues.push(newValue);
            totalNewMilestones += newValue;
          }
        }
        
        // If total doesn't match new bid amount, adjust the last milestone
        if (newValues.length > 0 && totalNewMilestones !== newAmount) {
          const diff = newAmount - totalNewMilestones;
          const lastInput = milestoneAmountInputs[milestoneAmountInputs.length - 1];
          const lastValue = newValues[newValues.length - 1] + diff;
          if (lastValue >= 1) {
            await lastInput.click({ clickCount: 3 });
            await lastInput.fill(lastValue.toString());
            newValues[newValues.length - 1] = lastValue;
            totalNewMilestones = newAmount;
          }
        }
        
        console.log(`   ✓ Milestones updated: ${newValues.join(' + ')} = ${totalNewMilestones}`);
      } else {
        console.log("   ℹ️ No milestones to update");
      }
    }

    // Update proposal text if provided
    if (newProposal) {
      const descInput = await page.$('#descriptionTextArea, textarea');
      if (descInput) {
        await descInput.click();
        await descInput.fill("");
        await descInput.fill(newProposal);
        console.log(`   ✓ Updated proposal (${newProposal.length} chars)`);
      }
    }

    // Capture screenshot before saving for debugging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectSlug = projectUrl.split('/projects/')[1]?.split('/')[1] || 'unknown';
    const screenshotPath = `.auth/bid_edit_${projectSlug}_${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   📸 Screenshot saved: ${screenshotPath}`);

    // Look for Save/Update button
    const saveButton = await page.$('button:has-text("Save"), button:has-text("Update"), fl-button:has-text("Save")');
    
    if (saveButton) {
      await saveButton.click();
      await page.waitForTimeout(3000);
      
      // Check for error messages after save
      const errorMessage = await page.$('.ErrorMessage, [class*="error"], .Alert--error');
      if (errorMessage) {
        const errorText = await errorMessage.textContent();
        console.log(`   ❌ Error: ${errorText}`);
        // Capture error screenshot
        await page.screenshot({ path: `.auth/bid_edit_error_${projectSlug}_${timestamp}.png`, fullPage: true });
        return false;
      }
      
      console.log("   ✅ Bid updated successfully!");
      return true;
    }
    
    console.log("   ⚠️ Could not find Save button");
    return false;

  } catch (error) {
    console.error(`   ❌ Error editing bid: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Get count of bids made today (for rate limiting)
 */
export function getTodayBidCount(): number {
  // In a real implementation, this would read from a persistent store
  // For now, we'll track in memory
  return 0;
}
