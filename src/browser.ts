import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = ".auth";
const SESSION_FILE = path.join(AUTH_DIR, "session.json");

/**
 * Browser manager with session persistence and auto-login
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
   * Auto-login using environment variables
   */
  async autoLogin(): Promise<boolean> {
    const email = process.env.FREELANCER_EMAIL;
    const password = process.env.FREELANCER_PASSWORD;

    if (!email || !password) {
      console.log("⚠️  FREELANCER_EMAIL or FREELANCER_PASSWORD not set in environment");
      return false;
    }

    const page = this.getPage();
    console.log("🔐 Attempting auto-login...");

    try {
      // Navigate to login page
      await page.goto("https://www.freelancer.com/login", {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for login form
      await page.waitForSelector('input[type="email"], input[name="email"], #emailOrUsernameInput', {
        timeout: 10000,
      });

      // Fill email
      const emailInput = await page.$('input[type="email"], input[name="email"], #emailOrUsernameInput');
      if (emailInput) {
        await emailInput.fill(email);
        console.log("   ✓ Email entered");
      }

      // Fill password
      const passwordInput = await page.$('input[type="password"], input[name="password"], #passwordInput');
      if (passwordInput) {
        await passwordInput.fill(password);
        console.log("   ✓ Password entered");
      }

      // Click login button
      const loginButton = await page.$(
        'button[type="submit"], button:has-text("Log In"), button:has-text("Login"), fl-button[fltrackinglabel="LoginButton"] button'
      );
      if (loginButton) {
        await loginButton.click();
        console.log("   ✓ Login button clicked");
      }

      // Wait for navigation
      await page.waitForTimeout(5000);

      // Check if login successful
      const url = page.url();
      if (!url.includes("/login") && !url.includes("/signup")) {
        console.log("✅ Auto-login successful!");
        await this.saveSession();
        return true;
      }

      // Check for CAPTCHA or 2FA
      const captcha = await page.$('[class*="captcha"], [class*="recaptcha"], [id*="captcha"]');
      if (captcha) {
        console.log("⚠️  CAPTCHA detected - manual intervention required");
        return false;
      }

      // Check for error message
      const errorEl = await page.$('.Alert--error, [class*="error-message"], [class*="ErrorMessage"]');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        console.log(`❌ Login failed: ${errorText?.trim()}`);
        return false;
      }

      console.log("❌ Auto-login failed - unknown reason");
      return false;

    } catch (error) {
      console.error("❌ Auto-login error:", (error as Error).message);
      return false;
    }
  }

  /**
   * Login - try auto-login first, then fall back to manual
   */
  async login(): Promise<void> {
    // First try auto-login if credentials are available
    if (process.env.FREELANCER_EMAIL && process.env.FREELANCER_PASSWORD) {
      const success = await this.autoLogin();
      if (success) return;
    }

    // Fall back to manual login
    await this.waitForManualLogin();
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

    // Wait for user input (skip in headless mode)
    if (process.stdin.isTTY) {
      await new Promise<void>((resolve) => {
        process.stdin.once("data", () => resolve());
      });
    } else {
      // In headless/CI mode, wait for navigation away from login
      console.log("   Waiting for login to complete...");
      await page.waitForURL((url) => !url.toString().includes("/login"), {
        timeout: 120000,
      }).catch(() => {
        console.log("   ⚠️ Login timeout - please check credentials");
      });
    }

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
