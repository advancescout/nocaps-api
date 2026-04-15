// Seed script: inserts 10 curated ideas into ideas + reddit_ideas tables
// Run: node scripts/seed-reddit-ideas.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwdpnycizxkzdtvsplyv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  // Try reading from .env
  const fs = require('fs');
  const envContent = fs.readFileSync(__dirname + '/../.env', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  if (match) process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim();
}

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SEED_IDEAS = [
  {
    business_idea: "A service that files late HMRC self-assessment penalties on behalf of freelancers and recovers them through the appeals process",
    target_demographic: "UK freelancers and contractors earning £30k–£100k who miss tax deadlines",
    subreddit: "r/freelanceuk",
    post_title: "Got hit with a £900 HMRC penalty — anyone else?",
    post_url: "https://reddit.com/r/freelanceuk/comments/1cx82j1/got_hit_with_a_900_hmrc_penalty_anyone_else",
    upvotes: 1842,
    comment_count: 234,
    opportunity_size: "Large",
    validation_reason: "1,842 upvotes on a single penalty complaint post validates widespread frustration with no existing recovery service."
  },
  {
    business_idea: "An AI-powered bookkeeping tool that auto-categorises expenses from bank feeds and generates MTD-ready VAT returns for micro-businesses",
    target_demographic: "UK sole traders and micro-businesses with annual revenue under £85k who find Xero/QuickBooks overkill",
    subreddit: "r/smallbusiness",
    post_title: "I spent 6 hours last weekend just categorising receipts. There has to be a better way",
    post_url: "https://reddit.com/r/smallbusiness/comments/1dy93k2/i_spent_6_hours_last_weekend_just_categorising",
    upvotes: 2310,
    comment_count: 187,
    opportunity_size: "Huge",
    validation_reason: "2,310 upvotes and 187 comments show massive pain around expense management for small operators."
  },
  {
    business_idea: "A body-doubling app that pairs ADHD adults with accountability partners for focused 25-minute work sprints via live video",
    target_demographic: "Adults aged 22–40 diagnosed with ADHD who work from home and struggle with task initiation",
    subreddit: "r/ADHD",
    post_title: "Body doubling changed my life but I can't always find someone. Why isn't there an app for this?",
    post_url: "https://reddit.com/r/ADHD/comments/1bx74m9/body_doubling_changed_my_life_but_i_cant_always",
    upvotes: 4120,
    comment_count: 412,
    opportunity_size: "Huge",
    validation_reason: "4,120 upvotes — one of the highest-engagement posts in r/ADHD this quarter. Clear demand signal for a dedicated body-doubling product."
  },
  {
    business_idea: "A micro-savings platform that rounds up card transactions and auto-invests the difference into a Lifetime ISA, targeting first-time buyers",
    target_demographic: "UK renters aged 25–35 saving for a first home deposit who earn £25k–£50k",
    subreddit: "r/personalfinance",
    post_title: "I've been saving for a house deposit for 3 years and I'm nowhere close. The system is broken",
    post_url: "https://reddit.com/r/personalfinance/comments/1ex91n3/ive_been_saving_for_a_house_deposit_for_3_years",
    upvotes: 3670,
    comment_count: 398,
    opportunity_size: "Large",
    validation_reason: "3,670 upvotes reflect deep frustration with housing affordability. Existing round-up apps don't target LISA wrappers specifically."
  },
  {
    business_idea: "A plug-and-play parcel locker system for apartment buildings that sends residents a PIN code when their delivery arrives",
    target_demographic: "Property managers and residents of apartment buildings with 20+ units in urban UK areas",
    subreddit: "r/mildlyinfuriating",
    post_title: "Third time this week my Amazon parcel was left in the rain because our building has no secure drop point",
    post_url: "https://reddit.com/r/mildlyinfuriating/comments/1fx82k4/third_time_this_week_my_amazon_parcel_was_left",
    upvotes: 5230,
    comment_count: 476,
    opportunity_size: "Huge",
    validation_reason: "5,230 upvotes on a parcel security complaint — viral frustration with a clear hardware-as-a-service opportunity."
  },
  {
    business_idea: "A subscription meal-prep service specifically designed for people on elimination diets, with ingredient traceability and allergen guarantees",
    target_demographic: "Adults aged 25–45 managing food intolerances or autoimmune conditions who spend 5+ hours weekly on meal prep",
    subreddit: "r/mildlyinfuriating",
    post_title: "Every 'healthy' meal kit still has soy, dairy, or gluten hidden somewhere. I just want to eat safely",
    post_url: "https://reddit.com/r/mildlyinfuriating/comments/1gx93l5/every_healthy_meal_kit_still_has_soy_dairy_or",
    upvotes: 1920,
    comment_count: 203,
    opportunity_size: "Medium",
    validation_reason: "1,920 upvotes show frustration with mainstream meal kits failing dietary restriction customers."
  },
  {
    business_idea: "An invoice factoring platform for freelancers that advances 90% of unpaid invoices within 24 hours, with flat-fee pricing instead of percentage cuts",
    target_demographic: "Freelance designers, developers and consultants billing £2k–£20k per project who face 30–90 day payment terms",
    subreddit: "r/freelanceuk",
    post_title: "Client owes me £8k and it's been 60 days. I can't pay my rent. Why is late payment legal?",
    post_url: "https://reddit.com/r/freelanceuk/comments/1hx74p2/client_owes_me_8k_and_its_been_60_days_i_cant",
    upvotes: 2890,
    comment_count: 312,
    opportunity_size: "Large",
    validation_reason: "2,890 upvotes on a late payment thread — chronic cash flow pain with no freelancer-friendly factoring option."
  },
  {
    business_idea: "A co-working space marketplace that lets remote workers book desks by the hour near their home, aggregating spare capacity in cafes, hotels and offices",
    target_demographic: "Remote workers aged 25–40 in UK cities who want occasional workspace variety without monthly co-working memberships",
    subreddit: "r/entrepreneur",
    post_title: "I'd pay £5/hour just to sit in a quiet space with good wifi that isn't my flat. Why doesn't this exist?",
    post_url: "https://reddit.com/r/entrepreneur/comments/1jx82r7/id_pay_5hour_just_to_sit_in_a_quiet_space_with",
    upvotes: 1560,
    comment_count: 178,
    opportunity_size: "Large",
    validation_reason: "1,560 upvotes validate demand for flexible, pay-as-you-go workspace among remote workers."
  },
  {
    business_idea: "A tenant rights chatbot that auto-generates legally compliant letters to landlords for deposit disputes, repair requests and Section 21 challenges",
    target_demographic: "Private renters aged 20–35 in England who feel intimidated by landlord disputes and can't afford a solicitor",
    subreddit: "r/personalfinance",
    post_title: "Landlord keeping £800 of my deposit for 'wear and tear'. I don't know what my rights are and solicitors want £300/hour",
    post_url: "https://reddit.com/r/personalfinance/comments/1kx93s8/landlord_keeping_800_of_my_deposit_for_wear_and",
    upvotes: 3140,
    comment_count: 287,
    opportunity_size: "Large",
    validation_reason: "3,140 upvotes — deposit disputes are the most common tenant complaint. An AI letter-writer at £10–20 per letter has huge addressable market."
  },
  {
    business_idea: "A browser extension that detects dark patterns on checkout pages and alerts shoppers to hidden subscription traps, pre-ticked add-ons and inflated urgency timers",
    target_demographic: "Online shoppers aged 18–45 who have been caught by unwanted subscriptions or misleading checkout flows",
    subreddit: "r/entrepreneur",
    post_title: "I accidentally signed up for 3 subscriptions last month because of sneaky checkout design. Someone should build a tool to flag this",
    post_url: "https://reddit.com/r/entrepreneur/comments/1lx74t9/i_accidentally_signed_up_for_3_subscriptions",
    upvotes: 2450,
    comment_count: 267,
    opportunity_size: "Medium",
    validation_reason: "2,450 upvotes and multiple 'take my money' comments signal strong willingness to pay for dark pattern protection."
  }
];

async function supabaseRequest(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log('Seeding reddit ideas...');

  // Step 1: Insert ideas into the ideas table
  const ideaRows = SEED_IDEAS.map(s => ({
    business_idea: s.business_idea,
    target_demographic: s.target_demographic,
    founder_has_field_experience: false,
    founder_has_shipped_before: false,
    founder_experience: 'Seeded from Reddit research — community-validated pain point.',
    user_ip: '127.0.0.1',
  }));

  console.log('Inserting into ideas table...');
  const insertedIdeas = await supabaseRequest('ideas', 'POST', ideaRows);
  console.log(`Inserted ${insertedIdeas.length} ideas`);

  // Step 2: Insert reddit_ideas linking to the ideas
  const redditRows = insertedIdeas.map((idea, i) => ({
    idea_id: idea.id,
    subreddit: SEED_IDEAS[i].subreddit,
    post_title: SEED_IDEAS[i].post_title,
    post_url: SEED_IDEAS[i].post_url,
    upvotes: SEED_IDEAS[i].upvotes,
    comment_count: SEED_IDEAS[i].comment_count,
    validation_score: SEED_IDEAS[i].upvotes / 100, // simple heuristic
  }));

  console.log('Inserting into reddit_ideas table...');
  const insertedReddit = await supabaseRequest('reddit_ideas', 'POST', redditRows);
  console.log(`Inserted ${insertedReddit.length} reddit_ideas rows`);

  // Step 3: Verify
  const verify = await supabaseRequest('reddit_ideas?select=id,idea_id,subreddit,upvotes', 'GET');
  console.log(`\nVerification: ${verify.length} total rows in reddit_ideas`);
  verify.forEach(r => console.log(`  ${r.subreddit} — ${r.upvotes} upvotes`));

  console.log('\nSeed complete!');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
