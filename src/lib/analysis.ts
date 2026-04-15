import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase';
import { calculateFounderCredibility } from './credibility';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function searchReddit(query: string): Promise<string> {
  if (!BRAVE_API_KEY) {
    return 'No Reddit results found (missing BRAVE_API_KEY).';
  }
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });
    if (!response.ok) {
      console.error('Brave search error:', response.status, response.statusText);
      return 'No Reddit results found';
    }
    const data = (await response.json()) as any;
    const results = data.web?.results || [];
    if (!results.length) return 'No Reddit results found';
    return results
      .map((r: any, i: number) => `${i + 1}. ${r.title} - ${r.url}\n${r.snippet}`)
      .join('\n\n');
  } catch (err) {
    console.error('Error calling Brave search:', err);
    return 'No Reddit results found';
  }
}

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

export interface StepResult {
  stepNumber: number;
  stepName: string;
  response: Record<string, unknown>;
}

type PromptFn = (idea: IdeaData, prev: StepResult[]) => string | Promise<string>;

const STEPS: Array<{ number: number; name: string; prompt: PromptFn }> = [
  // Step 2: industry_size
  { number: 2, name: 'industry_size', prompt: (idea: IdeaData) => `You are a market research expert. For the business idea: "${idea.business_idea}" targeting "${idea.target_demographic}", provide a detailed industry size analysis table with the following markets: Global, APAC, Western Europe, North America. For each market include: current market size (USD), projected market size (5yr), CAGR percentage, and key growth drivers. Return as structured JSON with fields: markets (array of {region, currentSizeUsd, projectedSizeUsd, cagr, keyDrivers}), totalGlobalMarket, analysisYear.` },
  // Step 3: competitors
  { number: 3, name: 'competitors', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a competitive intelligence expert. For the business idea: "${idea.business_idea}" in the market analyzed as ${JSON.stringify(prev.find(s => s.stepNumber === 2)?.response || {})}, list the top 8-10 direct and indirect competitors. For each competitor include: company name, estimated annual revenue, website URL, founding year, key differentiator, market share estimate. Return as structured JSON with fields: competitors (array of {name, estimatedRevenue, websiteUrl, foundingYear, keyDifferentiator, marketShare}).` },
  // Step 4: value_chain
  { number: 4, name: 'value_chain', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic analyst. Analyzing the competitors: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, identify the strongest competitor and map their complete value chain. Include: primary activities (inbound logistics, operations, outbound logistics, marketing/sales, service) and support activities (firm infrastructure, HR, technology, procurement). Also identify where they create the most value. Return as JSON with fields: strongestCompetitor (name, rationale), valueChain (primaryActivities, supportActivities), strongestValueCreationPoint.` },
  // Step 5: industry_trends
  { number: 5, name: 'industry_trends', prompt: (idea: IdeaData) => `You are a trends analyst. For the business: "${idea.business_idea}", identify 10-15 key industry trends using the STEEP framework (Social, Technological, Economic, Environmental, Political). For each trend: type (STEEP category), trend description, where it's occurring (geography/sector), when (timeline: now/1-2yr/3-5yr/5yr+), impact level (high/medium/low), opportunity or threat. Return as JSON with fields: trends (array of {type, description, where, when, impactLevel, opportunityOrThreat}).` },
  // Step 6: reddit_validation (NEW) — Brave Search + Claude synthesis
  {
    number: 6,
    name: 'reddit_validation',
    prompt: async (idea: IdeaData) => {
      const query = `site:reddit.com ${idea.business_idea} ${idea.target_demographic}`;
      const results = await searchReddit(query);
      return `Based on the following Reddit search results for "${idea.business_idea}" targeting "${idea.target_demographic}":\n\n${results}\n\nSynthesise and return:\n- The top 3 most relevant communities or forums where this problem is discussed\n- A sentiment summary: is the problem widely acknowledged? (positive signal / mixed / sceptical)\n- 2-3 specific discussion themes or pain points that validate or challenge the idea\n- An overall Reddit Signal rating: Strong / Moderate / Weak\n\nReturn as JSON with fields: communities (array of {name, url, relevance}), sentiment ("positive_signal" | "mixed" | "sceptical"), themes (array of {theme, description, validatesOrChallenges}), overallRating ("Strong" | "Moderate" | "Weak"), summary (1-2 sentence plain English summary).\n\nIf no relevant results were found, return overallRating: "Weak" and explain in summary.\n\nIMPORTANT: Respond ONLY with valid JSON.`;
    },
  },
  // Step 7: insights (was step 6)
  { number: 7, name: 'insights', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a strategic insight generator. Cross-reference the following analyses for "${idea.business_idea}": Market size: ${JSON.stringify(prev.find(s => s.stepNumber === 2)?.response || {})}, Competitors: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, Value chain: ${JSON.stringify(prev.find(s => s.stepNumber === 4)?.response || {})}, Trends: ${JSON.stringify(prev.find(s => s.stepNumber === 5)?.response || {})}, Reddit signal: ${JSON.stringify(prev.find(s => s.stepNumber === 6)?.response || {})}. Generate 5-7 powerful strategic insight statements that reveal non-obvious opportunities or risks. Return as JSON with fields: insights (array of {statement, evidence, implication, confidence}).` },
  // Step 8: company_name (was step 7)
  { number: 8, name: 'company_name', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a brand strategist. For the business: "${idea.business_idea}" targeting "${idea.target_demographic}", with insights: ${JSON.stringify(prev.find(s => s.stepNumber === 7)?.response || {})}, generate 5 unique company name options. Each name should be: memorable, available as a domain (check common patterns), not a known existing brand, under 12 characters preferred. Return as JSON with fields: names (array of {name, rationale, domainSuggestion, memorabilityScore}), recommendedName.` },
  // Step 9: business_strategy (was step 8)
  { number: 9, name: 'business_strategy', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a business strategist. For "${idea.business_idea}", create a strategic dos and don'ts table based on market insights: ${JSON.stringify(prev.find(s => s.stepNumber === 7)?.response || {})} and competitive landscape: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}. Generate 6-8 dos and 6-8 don'ts. Each should be specific, actionable, and grounded in the analysis. Return as JSON with fields: dos (array of {action, rationale}), donts (array of {action, rationale}).` },
  // Step 10: strategic_goals (was step 9)
  { number: 10, name: 'strategic_goals', prompt: (idea: IdeaData) => `You are a strategic planner. For "${idea.business_idea}", define 5-7 strategic goals that are uncommon (not generic platitudes), each under 10 words. Goals should challenge conventional thinking in this industry. Also identify the primary goal. Return as JSON with fields: goals (array of {goal, timeframe, measureOfSuccess}), primaryGoal, rationale.` },
  // Step 11: strategic_place (was step 10)
  { number: 11, name: 'strategic_place', prompt: (idea: IdeaData) => `You are a strategic positioning expert. For "${idea.business_idea}", define where to play across: geography (specific regions/cities to target first), customer segments (prioritized), channels (go-to-market channels ranked by potential), value chain position (where in the value chain to operate), products/services (initial offering vs future expansion). Return as JSON with fields: geography (primaryMarkets, expansionMarkets), segments (primary, secondary), channels (ranked list with rationale), valueChainPosition, products (initial, future).` },
  // Step 12: strategic_activities (was step 11)
  { number: 12, name: 'strategic_activities', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a blue ocean strategist. For "${idea.business_idea}" with competitive landscape: ${JSON.stringify(prev.find(s => s.stepNumber === 3)?.response || {})}, create: 1) A Blue Ocean strategy canvas comparing your positioning vs competitors on 8-10 key factors, 2) An ERRC (Eliminate-Reduce-Raise-Create) grid. Return as JSON with fields: blueOceanCanvas (factors array of {factor, industryAverage, yourPosition}), errcGrid (eliminate, reduce, raise, create - each array of {factor, rationale}).` },
  // Step 13: business_model (was step 12)
  { number: 13, name: 'business_model', prompt: (idea: IdeaData) => `You are a business model innovator familiar with businessmodelnavigator.com's 55 patterns. For "${idea.business_idea}", identify 2-3 relevant business model patterns from the navigator (e.g., Freemium, Platform, Subscription, etc.). Then combine them into a novel hybrid model. Return as JSON with fields: patterns (array of {name, description, whyRelevant}), hybridModel (name, description, keyMechanics), innovationRationale.` },
  // Step 14: business_model_definition (was step 13, depends on step 13)
  { number: 14, name: 'business_model_definition', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a business model architect. Define the new business model for "${idea.business_idea}" using the hybrid model: ${JSON.stringify(prev.find(s => s.stepNumber === 13)?.response || {})}. Answer: WHAT (what do we offer), WHY (why would customers pay), HOW (how do we deliver it), WHO (who are we delivering to and who delivers it). Be specific and concrete. Return as JSON with fields: what (offering description), why (value proposition, pain solved), how (delivery mechanism, key processes), who (customer profile, key partners, team needed).` },
  // Step 15: ecosystem (was step 14, depends on step 14)
  { number: 15, name: 'ecosystem', prompt: (idea: IdeaData, prev: StepResult[]) => `You are an ecosystem designer. For "${idea.business_idea}" with business model: ${JSON.stringify(prev.find(s => s.stepNumber === 14)?.response || {})}, map the complete business ecosystem. Identify all actors (customers, partners, suppliers, competitors, regulators, complementors) and the value/money/data flows between them. Return as JSON with fields: actors (array of {name, type, role, influence}), flows (array of {from, to, type, description}), keyDependencies, ecosystemInsight.` },
  // Step 16: assumption_test (was step 15, depends on step 14)
  { number: 16, name: 'assumption_test', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a lean startup expert. For "${idea.business_idea}" with business model: ${JSON.stringify(prev.find(s => s.stepNumber === 14)?.response || {})}, identify the single riskiest assumption that must be true for this business to work. Design a test for it. Return as JSON with fields: riskiestAssumption (statement), hypothesis (if X then Y), experiment (specific test to run), successMetric (measurable outcome), scope (time, budget, sample size), expectedLearning, pivotIfFalse.` },
  // Step 17: website_copy (was step 16)
  { number: 17, name: 'website_copy', prompt: (idea: IdeaData) => `You are a conversion copywriter. For "${idea.business_idea}" targeting "${idea.target_demographic}", create high-converting website copy. Requirements: headline MUST be under 5 words, conversion sentence MUST be under 10 words, 3 features with clear user benefits. Return as JSON with fields: headline (max 5 words), conversionSentence (max 10 words), features (array of {title, benefit, description}), ctaButton, subheadline.` },
  // Step 18: facebook_ads (was step 17, depends on step 17)
  { number: 18, name: 'facebook_ads', prompt: (idea: IdeaData, prev: StepResult[]) => `You are a Facebook/Meta ads specialist. For "${idea.business_idea}" targeting "${idea.target_demographic}" with website copy: ${JSON.stringify(prev.find(s => s.stepNumber === 17)?.response || {})}, create 3 high-converting Facebook ad variants. Each ad must have: primary text, headline, CTA button, FOMO element, target audience specification. Vary the angle: one pain-focused, one aspiration-focused, one social proof focused. Return as JSON with fields: ads (array of {variant, primaryText, headline, ctaButton, fomoElement, targetAudience, angle}).` },
  // Step 19: nocaps_verdict (NEW) — Ships or Cooked
  {
    number: 19,
    name: 'nocaps_verdict',
    prompt: (idea: IdeaData, prev: StepResult[]) => {
      const get = (n: number) => JSON.stringify(prev.find(s => s.stepNumber === n)?.response || {});
      return `Based on everything analysed — industry size (Step 2), competitors (Step 3), value chain (Step 4), trends (Step 5), Reddit validation (Step 6), insights (Step 7), business strategy (Step 9), strategic goals (Step 10), strategic activities (Step 12), business model (Step 13), and assumption test (Step 16) — generate a Nocaps Verdict for "${idea.business_idea}" targeting "${idea.target_demographic}".

Context from analysis:
- Industry size: ${get(2)}
- Competitors: ${get(3)}
- Reddit validation: ${get(6)}
- Insights: ${get(7)}
- Business strategy: ${get(9)}
- Strategic activities: ${get(12)}
- Business model: ${get(13)}
- Assumption test: ${get(16)}
- Founder: field experience=${idea.founder_has_field_experience}, started business before=${idea.founder_has_shipped_before}, experience summary="${idea.founder_experience}"

Provide:
1. An overall validation score from 1-10
2. Breakdown across four dimensions (each scored 1-10):
   - Market Opportunity: based on industry size, trends and Reddit signal
   - Competitive Landscape: based on competitors, value chain and strategic activities
   - Reddit Signal: strength of community validation
   - Founder Credibility: based on experience in this field, whether they have started a business before, and the strength and passion of their stated experience
3. A plain-language verdict paragraph — honest, direct, no corporate waffle
4. A single verdict: "Ships" or "Cooked" with a one-sentence explanation of why

Return as JSON with fields: overallScore (1-10), dimensions ({marketOpportunity, competitiveLandscape, redditSignal, founderCredibility} each with score and rationale), verdictParagraph (string), verdict ("Ships" | "Cooked"), verdictExplanation (string).`;
    },
  },
];

const HAIKU_STEPS = new Set([8, 17, 18]);

async function callClaude(prompt: string, stepNumber?: number): Promise<{ content: string; tokensUsed: number }> {
  const model = (stepNumber !== undefined && HAIKU_STEPS.has(stepNumber)) ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
  const response = await anthropic.messages.create({
    model,
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

export async function runAnalysis(
  ideaId: string,
  onStep?: (step: StepResult) => void,
  onStepError?: (step: { stepNumber: number; stepName: string }) => void
): Promise<void> {
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
    let failedStepCount = 0;

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
    // Parallel wave execution — steps within each wave run concurrently
    const STEP_WAVES: number[][] = [
      [2, 5, 6],            // Wave 1: no deps — industry_size, industry_trends, reddit_validation
      [3],                  // Wave 2: competitors (needs 2)
      [4],                  // Wave 3: value_chain (needs 3)
      [7],                  // Wave 4: insights (needs 2,3,4,5,6)
      [8, 9, 10, 11, 12, 13, 17], // Wave 5: unblocked after insights
      [14],                 // Wave 6: business_model_definition (needs 13)
      [15, 16, 18],         // Wave 7: ecosystem+assumption_test (need 14), facebook_ads (needs 17)
      [19],                 // Wave 8: nocaps_verdict (needs everything)
    ];

    const executeStep = async (stepNum: number): Promise<void> => {
      const step = STEPS.find(s => s.number === stepNum);
      if (!step) return;

      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const startedAt = Date.now();
        try {
          const prompt = await Promise.resolve(step.prompt(idea as IdeaData, completedSteps));
          const { content, tokensUsed } = await callClaude(prompt, step.number);
          const parsedResponse = parseJsonSafe(content);
          const durationMs = Date.now() - startedAt;

          await supabaseAdmin.from('analysis_results').insert({
            idea_id: ideaId,
            step_number: step.number,
            step_name: step.name,
            prompt_used: prompt,
            response: parsedResponse,
            completed_at: new Date().toISOString(),
            duration_ms: durationMs,
            tokens_used: tokensUsed,
          });

          const stepResult: StepResult = {
            stepNumber: step.number,
            stepName: step.name,
            response: parsedResponse,
          };

          completedSteps.push(stepResult);

          if (onStep) {
            try { onStep(stepResult); } catch (e) { console.error('onStep callback error:', e); }
          }

          if (step.number === 2) {
            await supabaseAdmin.from('idea_scores').update({ market_score: 0.5, internal_score: 0.5 }).eq('idea_id', ideaId);
          }
          if (step.number === 3) {
            await supabaseAdmin.from('idea_scores').update({ competitive_score: 0.5 }).eq('idea_id', ideaId);
          }

          return; // success
        } catch (err) {
          lastError = err;
          console.error(`Step ${stepNum} attempt ${attempt}/${MAX_RETRIES} failed for idea ${ideaId}:`, err);
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
          }
        }
      }

      // All retries exhausted
      console.error(`Step ${stepNum} failed after ${MAX_RETRIES} attempts for idea ${ideaId}:`, lastError);
      failedStepCount++;

      await supabaseAdmin.from('analysis_results').insert({
        idea_id: ideaId,
        step_number: stepNum,
        step_name: step.name,
        prompt_used: 'error',
        response: null,
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        tokens_used: 0,
      });

      if (onStepError) {
        try { onStepError({ stepNumber: stepNum, stepName: step.name }); } catch (e) { /* ignore */ }
      }
    };

    for (const wave of STEP_WAVES) {
      await Promise.all(wave.map(executeStep));
    }

    // If >3 steps failed, flag the verdict as partial data
    if (failedStepCount > 3) {
      const { data: verdictRow } = await supabaseAdmin
        .from('analysis_results')
        .select('id, response')
        .eq('idea_id', ideaId)
        .eq('step_number', 19)
        .single();

      if (verdictRow?.response) {
        const isObject = typeof verdictRow.response === 'object' && verdictRow.response !== null;
        const updatedResponse = {
          ...(isObject ? (verdictRow.response as Record<string, unknown>) : {}),
          partialDataNote: 'Note: some analysis steps could not complete \u2014 this verdict is based on partial data.',
        };
        await supabaseAdmin
          .from('analysis_results')
          .update({ response: updatedResponse })
          .eq('id', verdictRow.id);
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
