import type { Profile } from "../src/types.js";

/**
 * Your Freelancer Profile Configuration
 * ⚠️ IMPORTANT: Customize this with YOUR real information!
 *
 * Tips for New Freelancers:
 * - Be honest about experience - clients appreciate transparency
 * - Lower initial rates help win first projects and build reviews
 * - Focus on smaller projects ($50-500) to build reputation
 * - Quick delivery times show eagerness and availability
 */
export const profile: Profile = {
	name: "Peerapat Pongnipakorn", // TODO: Update with your real name

	// Your skills - be honest about what you can actually deliver
	skills: [
		// E-Commerce Platforms
		"Magento",
		"Magento 2",
		"Medusa.js",
		"WooCommerce",
		"Shopify",
		// Frontend
		"Vue.js",
		"Vue Storefront",
		"Nuxt.js",
		"React",
		"JavaScript",
		"TypeScript",
		// Backend
		"Node.js",
		"Laravel",
		"PHP",
		"CodeIgniter",
		// Databases
		"MySQL",
		"PostgreSQL",
		"MongoDB",
		"Redis",
		// APIs & Integrations
		"REST API",
		"GraphQL",
		"Payment Gateway Integration",
		// Infrastructure
		"Docker",
		"AWS",
		"Linux",
	],

	// Be honest about your experience level - clients appreciate transparency
	experience: `
Experienced Full-Stack Developer available for freelance work outside my regular office hours (evenings & weekends).

Why work with me:
✅ 10+ years of professional development experience
✅ Specializing in E-commerce: Magento, WooCommerce, WordPress
✅ Reliable communication - I respond within 12-24 hours
✅ Dedicated evening/weekend availability (~15-20 hrs/week)
✅ Quality-focused with attention to detail

I work part-time on freelance projects alongside my full-time role, which means I'm selective but fully committed to projects I take on.
  `.trim(),

	// Portfolio links (GitHub, personal site, etc.)
	portfolio: [
		"https://github.com/peerapatfc", // TODO: Update with your real GitHub
	],

	// Bid settings - adjusted for part-time availability
	bidSettings: {
		minBudget: 50, // Slightly higher minimum for quality projects
		maxBudget: 2000, // Manageable scope for part-time work
		minScore: 65, // Focus on good matches
		deliveryDays: 14, // Realistic for part-time (evenings/weekends)
	},

	// Auto-bid mode settings
	autoMode: {
		enabled: true, // Keep disabled until you're comfortable
		interval: 300000, // Check every 5 minutes
		maxBidsPerDay: 15, // New freelancers should bid more to get noticed
	},
};

/**
 * NEW FREELANCER TIPS:
 *
 * 1. BID COMPETITIVELY
 *    - Your first 3-5 projects are crucial for building reviews
 *    - Consider bidding 20-30% below average to stand out
 *    - Quality work at lower rates → great reviews → higher rates later
 *
 * 2. WRITE PERSONALIZED PROPOSALS
 *    - Reference specific project details
 *    - Explain HOW you'll solve their problem
 *    - Be professional but friendly
 *
 * 3. TARGET THE RIGHT PROJECTS
 *    - Start with smaller projects ($50-300)
 *    - Look for clients with good ratings (4.5+)
 *    - Avoid projects with 50+ bids (too competitive)
 *    - Focus on projects matching your best skills
 *
 * 4. RESPOND QUICKLY
 *    - Fast response time shows professionalism
 *    - Be available for chat/clarification
 *
 * 5. OVER-DELIVER
 *    - First projects = your reputation
 *    - Do slightly more than asked
 *    - Ask for reviews after successful delivery
 */

// Skill IDs from the search URL - update these to match YOUR skills
// Find skill IDs by searching on Freelancer.com and checking the URL
export const skillIds = [
	3, 9, 51, 68, 69, 77, 90, 95, 237, 305, 323, 335, 343, 788, 1042, 1075, 1087,
	1239, 1325, 1531,
];

// Languages to filter
export const languages = ["th", "en"];

// Search URL - searches for magento, wordpress, and woocommerce projects
export const searchUrl = "https://www.freelancer.com/search/projects?q=magento%20wordpress%20woocommerce";

