/**
 * TypeScript interfaces for Freelancer Auto-Bid Script
 */

export interface Project {
  id: string;
  title: string;
  description: string;        // Short description from search page
  fullDescription?: string;   // Full description from project details page
  budget: {
    min: number;
    max: number;
    currency: string;
    minUSD?: number;  // Converted to USD for comparison
    maxUSD?: number;  // Converted to USD for comparison
    isHourly?: boolean;
  };
  skills: string[];
  bidsCount: number;
  averageBid?: number;        // Average bid amount
  averageBidCurrency?: string;
  clientRating: number;
  clientVerified: boolean;
  clientInfo?: {
    location?: string;
    memberSince?: string;
    totalJobs?: number;
    hireRate?: number;
    totalSpent?: string;
    avgHourlyRate?: string;
  };
  deliverables?: string[];    // List of project deliverables
  competitorBids?: {          // Other freelancers' bids for strategic analysis
    freelancerName: string;
    rating: number;
    reviews: number;
    completionRate: number;
    bidAmount: number;
    bidCurrency: string;
    deliveryDays: number;
    isVerified: boolean;
    isPreferred: boolean;
  }[];
  timePosted: string;
  url: string;
}

export interface ProjectScore {
  project: Project;
  score: number; // 0-100 match score
  reasoning: string;
  bidSuggestion: {
    amount: number;           // Bid amount in PROJECT's currency (e.g., INR)
    currency: string;         // Project's currency code
    amountUSD: number;        // Equivalent in USD for display
    period: number;           // Delivery days
    milestones?: {            // AI-suggested milestones
      description: string;
      amount: number;
    }[];
  };
}

export interface BidData {
  projectId: string;
  amount: number;           // Total bid amount in project's currency
  currency: string;         // Currency code (INR, USD, etc.)
  period: number;           // Delivery days
  proposal: string;
  milestones?: {            // Optional milestone payment requests
    description: string;    // What will be delivered
    amount: number;         // Amount for this milestone (in project currency)
  }[];
}

export interface Profile {
  name: string;
  skills: string[];
  experience: string;
  portfolio: string[];
  bidSettings: {
    minBudget: number;
    maxBudget: number;
    minScore: number;
    deliveryDays: number;
  };
  autoMode: {
    enabled: boolean;
    interval: number; // ms
    maxBidsPerDay: number;
  };
}

export interface ScraperConfig {
  searchUrl: string;
  maxProjects: number;
  skillIds: number[];
  languages: string[];
}
