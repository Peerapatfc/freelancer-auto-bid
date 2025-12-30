import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = ".auth";
const SESSION_FILE = path.join(AUTH_DIR, "session.json");

/**
 * Browser manager with session persistence
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Initialize browser with persistent session
   */
  async init(headless = false): Promise<Page> {
    console.log("🚀 Launching browser...");

    this.browser = await chromium.launch({
      headless,
      slowMo: 100, // Add slight delay for stability
    });

    // Check if we have a saved session
    if (fs.existsSync(SESSION_FILE)) {
      console.log("📂 Loading saved session...");
      const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      this.context = await this.browser.newContext({ storageState });
    } else {
      console.log("🆕 Creating new browser context...");
      this.context = await this.browser.newContext();
    }

    this.page = await this.context.newPage();

    // Set viewport
    await this.page.setViewportSize({ width: 1280, height: 800 });

    return this.page;
  }

  /**
   * Get the current page
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error("Browser not initialized. Call init() first.");
    }
    return this.page;
  }

  /**
   * Save current session (cookies, localStorage)
   */
  async saveSession(): Promise<void> {
    if (!this.context) return;

    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const storageState = await this.context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));
    console.log("💾 Session saved!");
  }

  /**
   * Check if user is logged in to Freelancer
   */
  async isLoggedIn(): Promise<boolean> {
    const page = this.getPage();
    
    try {
      // Navigate to Freelancer dashboard
      await page.goto("https://www.freelancer.com/dashboard", {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Check if we're redirected to login page
      const url = page.url();
      return !url.includes("/login") && !url.includes("/signup");
    } catch (error) {
      return false;
    }
  }

  /**
   * Prompt user to login manually
   */
  async waitForManualLogin(): Promise<void> {
    const page = this.getPage();

    console.log("\n🔐 Please login to Freelancer.com manually in the browser window.");
    console.log("   After logging in, press Enter in this terminal to continue...\n");

    // Navigate to login page
    await page.goto("https://www.freelancer.com/login", {
      waitUntil: "networkidle",
    });

    // Wait for user input
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });

    // Save the session after login
    await this.saveSession();
    console.log("✅ Login successful! Session saved for next time.\n");
  }

  /**
   * Navigate to a URL
   */
  async goto(url: string): Promise<void> {
    const page = this.getPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      console.log("🔒 Browser closed.");
    }
  }
}

// Export singleton instance
export const browserManager = new BrowserManager();
