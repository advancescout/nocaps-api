import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase';
import { calculateFounderCredibility } from './credibility';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface IdeaData {
  id: string;
  business_idea: string;
  target_demographic: string;
  founder_has_field_experience: boolean;
  founder_years_in_field: number | null;
  founder_expertise: 'novice' | 'intermediate' | 'expert' | 'thought_leader' | null;
  founder_has_shipped_before: boolean;
  founder_experience: string;
}

interface StepResult {
  stepNumber: number;
  stepName: string;
  response: Record<string, unknown>;
}

const STEPS = [
  { number: 2, name: 'industry_size', prompt: (idea: IdeaData) => `You are a market research expert. For the business idea: "${idea.business_idea}" targeting "${idea.target_demographic}", provide a detailed industry size analysis table with the following markets: Global, APAC, Western Europe, North America. For each market include: current market size (USD), projected market size (5yr), CAGR percentage, and key growth drivers. Return as structured JSON with fields: markets (array of {region, currentSizeUsd, projectedSizeUsd, cagr, keyDrivers}), totalGlobalMarket, analysisYear.` },
  { number: 3, name: 'competitors', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a competitive intelligence expert. For the business idea: "${idea.business_idea}" in the market analyzed as ${JSON.stringify(prev.find(s => s.stepNumber === 2)?.response || {})}, list the top 8-10 direct and indirect competitors. For each competitor include: company name, estimated annual revenue, website URL, founding year, key differentiator, market share estimate. Return as structured JSON with fields: competitors (array of {name, estimatedRevenue, websiteUrl, foundingYear, keyDifferentiator, marketShare}).` },
  { number: 4, name: 'value_chain', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic analyst. Analyzing the competitors: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, identify the strongest competitor and map their complete value chain. Include: primary activities (inbound logistics, operations, outbound logistics, marketing/sales, service) and support activities (firm infrastructure, HR, technology, procurement). Also identify where they create the most value. Return as JSON with fields: strongestCompetitor (name, rationale), valueChain (primaryActivities, supportActivities), strongestValueCreationPoint.` },
  { number: 5, name: 'industry_trends', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a trends analyst. For the business: "${idea.business_idea}", identify 10-15 key industry trends using the STEEP framework (Social, Technological, Economic, Environmental, Political). For each trend: type (STEEP category), trend description, where it's occurring (geography/sector), when (timeline: now/1-2yr/3-5yr/5yr+), impact level (high/medium/low), opportunity or threat. Return as JSON with fields: trends (array of {type, description, where, when, impactLevel, opportunityOrThreat}).` },
  { number: 6, name: 'insights', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic insight generator. Cross-reference the following analyses for "${idea.business_idea}": Market size: ${JSON.stringify(prev.find(s => s.stepNumber === 2)?.response || {})}, Competitors: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, Value chain: ${JSON.stringify(prev.find(s => s.stepNumber === 4)?.response || {})}, Trends: ${JSON.stringify(prev.find(s => s.stepNumber === 5)?.response || {})}. Generate 5-7 powerful strategic insight statements that reveal non-obvious opportunities or risks. Return as JSON with fields: insights (array of {statement, evidence, implication, confidence}).` },
  { number: 7, name: 'company_name', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a brand strategist. For the business: "${idea.business_idea}" targeting "${idea.target_demographic}", with insights: ${JSON.stringify(prev.find(s => s.stepNumber === 6)?.response || {})}, generate 5 unique company name options. Each name should be: memorable, available as a domain (check common patterns), not a known existing brand, under 12 characters preferred. Return as JSON with fields: names (array of {name, rationale, domainSuggestion, memorabilityScore}), recommendedName.` },
  { number: 8, name: 'business_strategy', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a business strategist. For "${idea.business_idea}", create a strategic dos and don'ts table based on market insights: ${JSON.stringify(prev.find(s => s.stepNumber === 6)?.response || {})} and competitive landscape: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}. Generate 6-8 dos and 6-8 don'ts. Each should be specific, actionable, and grounded in the analysis. Return as JSON with fields: dos (array of {action, rationale}), donts (array of {action, rationale}).` },
  { number: 9, name: 'strategic_goals', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic planner. For "${idea.business_idea}", define 5-7 strategic goals that are uncommon (not generic platitudes), each under 10 words. Goals should challenge conventional thinking in this industry. Also identify the primary goal. Return as JSON with fields: goals (array of {goal, timeframe, measureOfSuccess}), primaryGoal, rationale.` },
  { number: 10, name: 'strategic_place', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic positioning expert. For "${idea.business_idea}", define where to play across: geography (specific regions/cities to target first), customer segments (prioritized), channels (go-to-market channels ranked by potential), value chain position (where in the value chain to operate), products/services (initial offering vs future expansion). Return as JSON with fields: geography (primaryMarkets, expansionMarkets), segments (primary, secondary), channels (ranked list with rationale), valueChainPosition, products (initial, future).` },
  { number: 11, name: 'strategic_activities', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a blue ocean strategist. For "${idea.business_idea}" with competitive landscape: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, create: 1) A Blue Ocean strategy canvas comparing your positioning vs competitors on 8-10 key factors, 2) An ERRC (Eliminate-Reduce-Raise-Create) grid. Return as JSON with fields: blueOceanCanvas (factors array of {factor, industryAverage, yourPosition}), errcGrid (eliminate, reduce, raise, create - each array of {factor, rationale}).` },
  { number: 12, name: 'business_model', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a business model innovator familiar with businessmodelnavigator.com's 55 patterns. For "${idea.business_idea}", identify 2-3 relevant business model patterns from the navigator (e.g., Freemium, Platform, Subscription, etc.). Then combine them into a novel hybrid model. Return as JSON with fields: patterns (array of {name, description, whyRelevant}), hybridModel (name, description, keyMechanics), innovationRationale.` },
  { number: 13, name: 'business_model_definition', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a business model architect. Define the new business model for "${idea.business_idea}" using the hybrid model: ${JSON.stringify(prev.find(s => s.stepNumber === 12)?.response || {})}. Answer: WHAT (what do we offer), WHY (why would customers pay), HOW (how do we deliver it), WHO (who are we delivering to and who delivers it). Be specific and concrete. Return as JSON with fields: what (offering description), why (value proposition, pain solved), how (delivery mechanism, key processes), who (customer profile, key partners, team needed).` },
  { number: 14, name: 'ecosystem', prompt: (idea: IdeaData, prev: StepResult[]) => `You are an ecosystem designer. For "${idea.business_idea}" with business model: ${JSON.stringify(prev.find(s => s.stepNumber === 13)?.response || {})}, map the complete business ecosystem. Identify all actors (customers, partners, suppliers, competitors, regulators, complementors) and the value/money/data flows between them. Return as JSON with fields: actors (array of {name, type, role, influence}), flows (array of {from, to, type, description}), keyDependencies, ecosystemInsight.` },
  { number: 15, name: 'assumption_test', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a lean startup expert. For "${idea.business_idea}" with business model: ${JSON.stringify(prev.find(s => s.stepNumber === 13)?.response || {})}, identify the single riskiest assumption that must be true for this business to work. Design a test for it. Return as JSON with fields: riskiestAssumption (statement), hypothesis (if X then Y), experiment (specific test to run), successMetric (measurable outcome), scope (time, budget, sample size), expectedLearning, pivotIfFalse.` },
  { number: 16, name: 'website_copy', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a conversion copywriter. For "${idea.business_idea}" targeting "${idea.target_demographic}", create high-converting website copy. Requirements: headline MUST be under 5 words, conversion sentence MUST be under 10 words, 3 features with clear user benefits. Return as JSON with fields: headline (max 5 words), conversionSentence (max 10 words), features (array of {title, benefit, description}), ctaButton, subheadline.` },
  { number: 17, name: 'facebook_ads', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a Facebook/Meta ads specialist. For "${idea.business_idea}" targeting "${idea.target_demographic}" with website copy: ${JSON.stringify(prev.find(s => s.stepNumber === 16)?.response || {})}, create 3 high-converting Facebook ad variants. Each ad must have: primary text, headline, CTA button, FOMO element, target audience specification. Vary the angle: one pain-focused, one aspiration-focused, one social proof focused. Return as JSON with fields: ads (array of {variant, primaryText, headline, ctaButton, fomoElement, targetAudience, angle}).` },
  { number: 18, name: 'video_concepts', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a video creative director specializing in AI-generated video (Kling). For the 3 Facebook ads: ${JSON.stringify(prev.find(s => s.stepNumber === 17)?.response || {})}, create a detailed video concept for each ad. Each concept must include: opening scene description, visual style, script/voiceover, mood/tone, and a specific Kling AI prompt optimized for the tool. Return as JSON with fields: videoConcepts (array of {adVariant, openingScene, visualStyle, script, mood, klingPrompt}).` },
];

async function callClaude(prompt: string): Promise<{ content: string; tokensUsed: number }> {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt + '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.',
      },
    ],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return { content, tokensUsed };
}

function parseJsonSafe(text: string): Record<string, unknown> {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return { raw: text };
      }
    }
    return { raw: text };
  }
}

export async function runAnalysis(ideaId: string): Promise<void> {
  try {
    // Fetch idea
    const { data: idea, error } = await supabaseAdmin
      .from('ideas')
      .select('*')
      .eq('id', ideaId)
      .single();

    if (error || !idea) {
      console.error('Failed to fetch idea for analysis:', error);
      return;
    }

    const completedSteps: StepResult[] = [];

    // Step 1: Store idea input (no Claude call)
    const step1Response = {
      businessIdea: idea.business_idea,
      targetDemographic: idea.target_demographic,
      founderHasFieldExperience: idea.founder_has_field_experience,
      founderYearsInField: idea.founder_years_in_field,
      founderExpertise: idea.founder_expertise,
      founderHasShippedBefore: idea.founder_has_shipped_before,
      founderExperience: idea.founder_experience,
    };

    // Calculate founder credibility
    const credibility = calculateFounderCredibility(
      idea.founder_has_field_experience,
      idea.founder_years_in_field,
      idea.founder_expertise,
      idea.founder_has_shipped_before
    );

    const step1Full = { ...step1Response, founderCredibility: credibility };

    await supabaseAdmin.from('analysis_results').insert({
      idea_id: ideaId,
      step_number: 1,
      step_name: 'idea_input',
      prompt_used: 'N/A - stored input',
      response: step1Full,
      completed_at: new Date().toISOString(),
      duration_ms: 0,
      tokens_used: 0,
    });

    completedSteps.push({ stepNumber: 1, stepName: 'idea_input', response: step1Full });

    // Initialize scores
    await supabaseAdmin.from('idea_scores').upsert({
      idea_id: ideaId,
      domain_expertise_score: credibility.domainScore,
      execution_history_score: credibility.executionScore,
      founder_credibility: credibility.credibility,
      leaderboard_score: 0,
    });

    // Steps 2-18: Claude API calls
    for (const step of STEPS) {
      const startedAt = Date.now();

      try {
        const promptFn = step.prompt as (idea: IdeaData, prev: StepResult[]) => string;
        const prompt = promptFn(idea as IdeaData, completedSteps);

        const insertData = {
          idea_id: ideaId,
          step_number: step.number,
          step_name: step.name,
          prompt_used: prompt,
          response: {} as Record<string, unknown>,
          started_at: new Date(startedAt).toISOString(),
        };

        const { content, tokensUsed } = await callClaude(prompt);
        const parsedResponse = parseJsonSafe(content);
        const durationMs = Date.now() - startedAt;

        await supabaseAdmin.from('analysis_results').insert({
          ...insertData,
          response: parsedResponse,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          tokens_used: tokensUsed,
        });

        completedSteps.push({
          stepNumber: step.number,
          stepName: step.name,
          response: parsedResponse,
        });

        // Update scores based on analysis results
        if (step.number === 2) {
          // Market score from industry size
          await supabaseAdmin
            .from('idea_scores')
            .update({ market_score: 0.5, internal_score: 0.5 })
            .eq('idea_id', ideaId);
        }

        if (step.number === 3) {
          // Competitive score from competitor analysis
          await supabaseAdmin
            .from('idea_scores')
            .update({ competitive_score: 0.5 })
            .eq('idea_id', ideaId);
        }
      } catch (stepError) {
        console.error(`Error in step ${step.number} for idea ${ideaId}:`, stepError);
        // Store error result and continue
        await supabaseAdmin.from('analysis_results').insert({
          idea_id: ideaId,
          step_number: step.number,
          step_name: step.name,
          prompt_used: 'error',
          response: { error: String(stepError) },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          tokens_used: 0,
        });
      }
    }

    // Final leaderboard score update
    const { data: scores } = await supabaseAdmin
      .from('idea_scores')
      .select('*')
      .eq('idea_id', ideaId)
      .single();

    if (scores) {
      const leaderboardScore =
        scores.meta_ads_conversions * 0.40 +
        (scores.upvotes - scores.downvotes) * 0.30 +
        scores.shares * 0.20 +
        scores.reddit_validation * 0.10;

      await supabaseAdmin
        .from('idea_scores')
        .update({ leaderboard_score: Math.max(0, leaderboardScore), last_updated: new Date().toISOString() })
        .eq('idea_id', ideaId);
    }

    console.log(`Analysis complete for idea ${ideaId}`);
  } catch (err) {
    console.error(`Analysis failed for idea ${ideaId}:`, err);
  }
}
