import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Project } from "../types.js";
import { profile } from "../../config/profile.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Rate limiting configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 5000; // 5 seconds initial retry delay

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a personalized proposal for a project using AI with retry logic
 */
export async function generateProposal(project: Project): Promise<string> {
  console.log(`\n✍️  Generating proposal for: ${project.title}`);

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await generateProposalInternal(project);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || "";
      
      // Check if it's a rate limit error (429)
      if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests")) {
        // Extract retry delay from error if available
        const retryMatch = errorMessage.match(/retry in ([\d.]+)/i);
        const retryDelay = retryMatch 
          ? parseFloat(retryMatch[1]) * 1000 
          : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        
        console.log(`   ⏳ Rate limited. Waiting ${Math.round(retryDelay / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await sleep(retryDelay);
      } else {
        // For non-rate-limit errors, don't retry
        throw error;
      }
    }
  }
  
  // If all retries failed, use template
  console.log(`   ⚠️ AI proposal failed after ${MAX_RETRIES} retries. Using template.`);
  return generateTemplateProposal(project);
}

/**
 * Internal function to generate proposal
 */
async function generateProposalInternal(project: Project): Promise<string> {
  const prompt = `
You are an expert freelancer writing a winning proposal. Write a compelling, personalized proposal for this project.

PROJECT:
Title: ${project.title}
Description: ${project.description}
Budget: $${project.budget.min} - $${project.budget.max} ${project.budget.currency}
Skills Required: ${project.skills.join(", ")}

MY PROFILE:
Name: ${profile.name}
Skills: ${profile.skills.join(", ")}
Experience: ${profile.experience}
Portfolio: ${profile.portfolio.join(", ")}

GUIDELINES:
1. Start with a hook that shows you understand the project
2. Briefly mention relevant experience (1-2 sentences)
3. Outline your approach to solving their problem
4. Include a clear call to action
5. Keep it concise (150-250 words)
6. Be professional but friendly
7. DO NOT use generic phrases like "I'm the perfect fit" or "I've read your requirements carefully"
8. DO NOT mention your bid amount or timeline in the proposal

Write the proposal now (just the proposal text, no extra formatting):
`;

  const result = await model.generateContent(prompt);
  const proposal = result.response.text().trim();
  
  console.log("\n📝 Generated Proposal:");
  console.log("─".repeat(50));
  console.log(proposal);
  console.log("─".repeat(50) + "\n");

  return proposal;
}

/**
 * Generate a template-based proposal (fallback without AI)
 */
export function generateTemplateProposal(project: Project): string {
  const proposal = `
Hi,

I'm interested in your project "${project.title}".

With expertise in ${profile.skills.slice(0, 5).join(", ")}, I can deliver a high-quality solution for your needs.

${profile.experience.split("\n")[0]}

I'd love to discuss your requirements in more detail. Please feel free to reach out!

Best regards,
${profile.name}

Portfolio: ${profile.portfolio[0] || "Available upon request"}
`.trim();

  console.log("\n📝 Template Proposal:");
  console.log("─".repeat(50));
  console.log(proposal);
  console.log("─".repeat(50) + "\n");

  return proposal;
}
