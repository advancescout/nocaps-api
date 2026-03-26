import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const prebuiltIdeas = [
  {
    business_idea: 'AI-powered soil health monitoring platform that provides real-time crop yield predictions and personalised fertiliser recommendations for smallholder farmers via a mobile app',
    target_demographic: 'Smallholder farmers in Sub-Saharan Africa and South Asia, aged 25-55, with basic smartphone access',
    opportunity_size_label: 'Large',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Subscription-based mental wellness platform specifically designed for shift workers and night-shift employees, featuring asynchronous therapy sessions, sleep optimisation tools, and peer support communities',
    target_demographic: 'Nurses, factory workers, security guards, and hospitality staff aged 22-45 working non-standard hours',
    opportunity_size_label: 'Medium',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'Peer-to-peer elderly care marketplace connecting retired professionals with seniors who need companionship, light assistance, and technology help — creating meaningful income for active retirees',
    target_demographic: 'Adults 65+ living independently and their adult children aged 40-60 managing parental care remotely',
    opportunity_size_label: 'Large',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Hyper-local food waste reduction app that connects restaurants and grocery stores with nearby households and food banks to redistribute surplus food within a 3-mile radius in real time',
    target_demographic: 'Urban consumers aged 25-40 with sustainability values, and local food businesses in cities with populations over 500k',
    opportunity_size_label: 'Medium',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'Decentralised micro-lending platform for creative freelancers using work-history verification via social platforms to underwrite small loans (£500-£5k) without traditional credit checks',
    target_demographic: 'Freelance designers, writers, developers and photographers aged 22-38 in the UK, EU, and US',
    opportunity_size_label: 'Medium',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'B2B SaaS platform that uses computer vision to automate inventory tracking and expiry date management for independent pharmacies, reducing medication waste and compliance risk',
    target_demographic: 'Independent pharmacy owners and small pharmacy chains (2-20 locations) in the UK, US, and Australia',
    opportunity_size_label: 'Medium',
    freshness_label: 'Steady',
  },
  {
    business_idea: 'Gamified language learning app for business professionals that teaches industry-specific vocabulary and business etiquette for doing deals in Japan, South Korea, and the Middle East',
    target_demographic: 'B2B sales professionals, consultants and executives aged 28-50 at companies expanding into Asian and Middle Eastern markets',
    opportunity_size_label: 'Small',
    freshness_label: 'Steady',
  },
  {
    business_idea: 'Climate-risk insurance product for independent coffee farmers that pays out automatically based on satellite rainfall and temperature data, bypassing traditional claims processes entirely',
    target_demographic: 'Independent coffee farmers in Ethiopia, Colombia, Vietnam, and Honduras growing under 50 acres',
    opportunity_size_label: 'Medium',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'On-demand electric vehicle fleet management SaaS for last-mile delivery companies, optimising charge scheduling, route planning, and battery health across mixed fleets',
    target_demographic: 'Last-mile delivery operators with 10-200 vehicles transitioning to electric in the UK, Germany, and Netherlands',
    opportunity_size_label: 'Large',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'AI ghostwriting service for academic researchers who need to translate complex scientific papers into accessible content for grant applications, press releases, and public engagement',
    target_demographic: 'University researchers and postdocs aged 28-45 in STEM fields at institutions in the UK, US, and Canada',
    opportunity_size_label: 'Small',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Vertical farming-as-a-service for premium hotel chains and Michelin-star restaurants, installing and maintaining compact indoor growing systems to provide hyperlocal produce year-round',
    target_demographic: '5-star hotels and fine dining restaurants in London, Dubai, Singapore, and New York with F&B budgets over £500k annually',
    opportunity_size_label: 'Small',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'Corporate neurodiversity training and workplace assessment platform that helps HR teams create inclusive environments for employees with autism, ADHD, and dyslexia using evidence-based frameworks',
    target_demographic: 'HR directors and DEI leads at mid-to-large companies (500+ employees) in financial services, tech, and professional services',
    opportunity_size_label: 'Medium',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'Marketplace connecting independent architects and interior designers with pre-vetted sustainable material suppliers, including AI-assisted material specification and carbon footprint calculation tools',
    target_demographic: 'Independent architecture firms and interior design studios with 1-20 staff focused on sustainable projects',
    opportunity_size_label: 'Medium',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Real-time sports performance analytics platform for amateur and semi-professional football clubs, using affordable wearable sensors and AI coaching insights previously only available to elite clubs',
    target_demographic: 'Semi-professional and amateur football clubs with budgets of £50k-£2m annually across the UK, Spain, and Germany',
    opportunity_size_label: 'Medium',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'B2B2C platform enabling estate agents to offer instant digital probate valuations and property clearance coordination services to bereaved families, reducing a typically 18-month process to weeks',
    target_demographic: 'Estate agencies handling 50+ probate cases annually in the UK, and their bereaved family clients',
    opportunity_size_label: 'Medium',
    freshness_label: 'Steady',
  },
  {
    business_idea: 'Personalised nutrition platform for women in perimenopause and menopause using continuous glucose monitoring data, hormone tracking, and AI dietitian coaching to manage symptoms through food',
    target_demographic: 'Women aged 42-58 in the US, UK, and Australia experiencing perimenopause or menopause symptoms, with disposable income over £40k/year',
    opportunity_size_label: 'Large',
    freshness_label: 'Hot',
  },
  {
    business_idea: 'Embedded insurance API for travel booking platforms and airlines that dynamically prices and issues parametric weather disruption cover at the point of ticket purchase',
    target_demographic: 'Online travel agencies, airline booking platforms, and travel management companies processing over 10k bookings monthly',
    opportunity_size_label: 'Large',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Co-working and maker space network specifically for hardware startups, offering shared prototyping equipment, PCB fabrication, injection moulding access, and on-demand electrical engineering mentors',
    target_demographic: 'Hardware startup founders and product engineers at pre-seed and seed stage in London, Berlin, and Amsterdam',
    opportunity_size_label: 'Small',
    freshness_label: 'Steady',
  },
  {
    business_idea: 'AI-powered procurement assistant for NHS trusts and public sector healthcare organisations that identifies cost savings, flags contract compliance issues, and automates supplier due diligence',
    target_demographic: 'NHS procurement directors and supply chain managers at UK acute hospital trusts with annual procurement spend over £50m',
    opportunity_size_label: 'Large',
    freshness_label: 'Emerging',
  },
  {
    business_idea: 'Subscription box and community platform for home fermenters and gut-health enthusiasts, delivering monthly live culture kits (kombucha, kefir, sourdough, kimchi) with expert video tutorials and a member forum',
    target_demographic: 'Health-conscious home cooks and wellness enthusiasts aged 28-50 in the UK, US, and Australia interested in gut health and DIY food',
    opportunity_size_label: 'Small',
    freshness_label: 'Steady',
  },
];

async function seed() {
  console.log('Seeding 20 prebuilt ideas...');

  // Check existing count
  const { count } = await supabaseAdmin
    .from('prebuilt_ideas')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`Already have ${count} ideas. Skipping seed.`);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('prebuilt_ideas')
    .insert(prebuiltIdeas)
    .select();

  if (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }

  console.log(`Successfully seeded ${data?.length || 0} prebuilt ideas`);
}

seed().catch(console.error);
