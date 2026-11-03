// Fixed copy from the approved v2.0 design. Episodes, speakers and numbers come from the API (api.js).

export const CONTACT_EMAIL = 'info@descienceosclub.com';
export const CLUB_URL = 'https://descienceosclub.com/';

export const audiences = [
  { num: '01', label: 'Students', body: 'Go beyond the syllabus — see how real projects get built and where you can contribute.' },
  { num: '02', label: 'Job aspirants', body: 'Resumes, interviews and what companies really expect — straight from people who hire.' },
  { num: '03', label: 'Early-career devs', body: 'SDLC, DevOps, Agile and AI in the real world — the stuff college skips.' },
  { num: '04', label: 'Future founders', body: "Placements aren't the only path. Learn to build something of your own." }
];

export const personas = [
  { id: 'student', num: '01', label: 'Student', slug: 'student',
    hook: 'Your syllabus stops where the industry starts.',
    body: 'Fridays show you how real projects get built — the code, the tools, the trade-offs — so you walk into placement season with more than marks.',
    gets: ['See real projects and live code tear-downs', 'Find starter-friendly open source work through the DOS Club', 'Start a GitHub that speaks for you — before anyone asks'],
    eps: [1, 2, 12] },
  { id: 'aspirant', num: '02', label: 'Job aspirant', slug: 'job-aspirant',
    hook: 'Applied everywhere, heard back from nowhere?',
    body: 'Hear it from people who hire — what gets resumes filtered out, what companies actually expect, and which domains are quietly hiring.',
    gets: ['Resume and ATS fixes you can apply the same night', 'What businesses really expect from tech candidates', 'Niche, high-growth domains most people never hear about'],
    eps: [16, 8, 15] },
  { id: 'dev', num: '03', label: 'Early-career dev', slug: 'early-career',
    hook: 'Shipping at work, but nobody explained the why?',
    body: 'Principal engineers walk through how code really reaches production, what Agile looks like without the buzzwords, and how pipelines are built live.',
    gets: ['Real-world SDLC and modern DevOps, end to end', 'Agile in high-stakes enterprise engineering', 'Live cloud data pipelines — AWS, PySpark, architecture'],
    eps: [13, 14, 6] },
  { id: 'founder', num: '04', label: 'Future founder', slug: 'future-founder',
    hook: "Placements aren't the only path.",
    body: 'Carrying buckets or building a pipeline? Learn from people who chose to build something of their own — and how to lead in the AI era.',
    gets: ['Think beyond placements and test your own ideas', 'Build long-term value instead of short-term income', 'Leadership and performance in the AI era'],
    eps: [10, 11, 5] }
];

export const pathSteps = [
  { title: 'Join', body: 'Register for a Friday. Become part of a community that wants you to win.' },
  { title: 'Learn', body: 'Show up live, ask anything, and follow the episodes in your lane.' },
  { title: 'Build', body: 'Apply it on real projects with the DOS Club — feedback at every step.' },
  { title: 'Contribute', body: 'Push your work to the open source world and let your commits speak for you.' }
];

export const faqs = [
  { q: 'Is Open Source Fridays free?', a: 'Yes — events are currently free. Paid events are planned from January 2027, and any paid event will show its price and terms before you pay.' },
  { q: 'When and where does it happen?', a: 'Every Friday, 7:00 – 8:00 PM IST, online on Zoom. Register on the event page and Zoom emails you your personal meeting link.' },
  { q: "I'm new to coding or open source. Can I still join?", a: 'Absolutely. The club is built for beginners and pros alike. Mentors and starter-friendly tasks help you learn by doing, at your own pace.' },
  { q: 'Will I get a certificate?', a: "Registering alone doesn't guarantee a certificate or other outcome. Attendance comes from Zoom reports — by default you need to stay 30 minutes to be marked present." },
  { q: 'Can I use my contributions in my portfolio or resume?', a: 'Yes! Public contributions are verifiable, real-world proof of your skills. Your commits and projects make a portfolio that speaks for itself.' },
  { q: 'Is contributing only about writing code?', a: "Not at all. Design, documentation, testing, community and content all matter. There's a meaningful way to contribute for everyone." }
];

export const howItWorks = [
  { title: 'Register for the episode', body: 'Under a minute. Zoom emails you the join link.' },
  { title: 'Show up Friday, 7 PM IST', body: 'Live and online — laptop or phone, both work.' },
  { title: 'Ask, build, repeat', body: 'Bring questions to the live Q&A. Come back next Friday.' }
];

export const speakDomains = [
  { code: '[ AI_NODE ]', tone: 'leaf', title: 'AI Engineer', body: 'Prompting, RAG, agents, GPUs and the tooling that ships them.' },
  { code: '< DEPLOY :: INFRA >', tone: 'sky', title: 'Cloud Computing', body: 'Deploy, scale, automate — DevOps and data pipelines in production.' },
  { code: '{ GIT_TREE => PULL }', tone: 'leaf', title: 'Open Source', body: 'Maintaining, contributing, reading real code, building in public.' },
  { code: '// DEV_GROWTH', tone: 'sky', title: 'Digital Skills', body: 'Careers, hiring, resumes, leadership and the paths nobody talks about.' }
];

export const speakFormats = ['Talk + live Q&A', 'Live demo', 'Code walkthrough', 'Open-mic discussion', 'Slide-free breakdown', 'Multi-part series'];

export const speakProcess = [
  { cmd: 'git commit -m', arg: '"01"', title: 'Pitch', body: 'Send a title, a few lines on what people will learn, and the Fridays that suit you.' },
  { cmd: 'git commit -m', arg: '"02"', title: 'Quick call', body: 'A short chat with the team to shape the session and lock a date.' },
  { cmd: 'git commit -m', arg: '"03"', title: 'We promote', body: "Episode page, poster and posts across the club's channels — we handle registrations and Zoom." },
  { cmd: 'git push', arg: 'origin friday', title: 'Go live', body: "Show up at 7 PM IST, share what you know, take questions. That's it." }
];

export const interestChips = ['AI / ML', 'Web dev', 'App dev', 'Cloud & DevOps', 'Cybersecurity', 'Data science', 'Open source', 'UI / UX', 'Interview prep'];

export const tickerItems = [
  ['Careers', '</>'], ['AI Engineer', '{ }'], ['Cloud', '=>'], ['Open Source', '&&'],
  ['Live Q&A', '[ ]'], ['Build in public', '::'], ['Get hired', '/*']
];

// How OSF promotes every speaker (event details page). Audience figures are left out until real numbers are available.
export const promoRunway = [
  { when: 'T – 7 DAYS', title: 'Announcement', body: 'Your banner goes out across our WhatsApp communities, LinkedIn page and the OSF site.' },
  { when: 'T – 3 DAYS', title: 'Speaker spotlight', body: 'A dedicated post about you: photo, role, expertise and why students should hear from you.' },
  { when: 'FRIDAY', title: 'Live session', body: 'Morning reminder to every registrant, countdown story, and a host who introduces you properly.' },
  { when: 'T + 1 DAY', title: 'Afterglow', body: 'Recording and highlights published with your name on them, plus a thank-you post and speaker certificate.' }
];

export const socialLinks = [
  ['https://www.instagram.com/descienceopensourceclub/', 'Instagram'],
  ['https://www.linkedin.com/company/descience-open-source-club/', 'LinkedIn'],
  ['https://www.youtube.com/channel/UCvF5jATxekeLcFvjLrMGjpA', 'YouTube'],
  ['https://x.com/descienceosclub', 'X'],
  ['https://www.threads.net/@descienceosclub', 'Threads'],
  ['https://www.facebook.com/descienceosclub', 'Facebook'],
  ['https://github.com/descienceosclub', 'GitHub']
];

// One-line summaries shown above each policy's full text (the full text lives in components/PolicyPage.jsx).
export const policyTldr = {
  'privacy-policy': [
    "We collect what's needed to register you, get you into Zoom and track attendance.",
    'WhatsApp updates are opt-in, for that event only — never promos or groups.',
    'The attendee list is never shown on public event pages.',
    'You can ask to see, correct or delete your details at any time.'
  ],
  'request-data': [
    'Get a copy, fix something, delete it, or stop WhatsApp updates.',
    'Email us from your registered address and name the event.',
    'Never send passwords, ID documents or payment details.'
  ],
  'code-of-conduct': [
    'Be kind. Every experience level is welcome here.',
    "No harassment, spam, impersonation or sharing other people's details.",
    'Something off? Tell the host privately or email the team.'
  ],
  'terms-of-service': [
    'Events are free right now. Paid events are planned from January 2027.',
    'All times are IST. Registration usually stays open until 30 minutes after the start.',
    'Stay at least 30 minutes to be marked present (event rules may differ).',
    "Registering doesn't guarantee a certificate, placement or other outcome."
  ],
  'brand-guidelines': [
    'Say “Descience Open Source Club” or “DOS Club”; the series is “Open Source Fridays”.',
    'Use the supplied logos as-is — no stretching, redrawing or recolouring.',
    'Partner campaigns, merch or modified artwork? Ask us first.'
  ]
};
