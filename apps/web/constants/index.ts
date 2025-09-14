import { capaybilities1, capaybilities2, capaybilities3, capaybilities4, client01, client02, client03, client04, client05, client06, client07, client08, client09, insights1, insights2, insights3, latest1, latest2, nestle, officevibe, phase1, phase2, phase3, phase4, phase5, planetly, project1, project2, project3, project4, project5, project6, project7, project8, project9, publication1, publication2, publication3 } from "@/public";

// Navbar
export const navbarItems = [
   {
      id: 1,
      title: "Products",
      href: "/presentation",
   },
   {
      id: 2,
      title: "Solutions",
      href: "/services",
   },
   {
      id: 3,
      title: "Company",
      href: "/team",
      subItems: [
         {
            id: 31,
            title: "About Us",
            href: "/about",
         },
         {
            id: 32,
            title: "Team",
            href: "/team",
         },
         {
            id: 33,
            title: "Careers",
            href: "/careers",
         },
         {
            id: 34,
            title: "Press & Media",
            href: "/press",
         }
      ]
   },
   {
      id: 4,
      title: "Resources",
      href: "/insights",
   },
   {
      id: 5,
      title: "Get Started",
      href: "/get-started",
   },
];

// Footer

export const footerItems = [
   {
      id: 1,
      title: "LinkedIn",
      href: "https://www.linkedin.com/",
   },
   {
      id: 2,
      title: "X",
      href: "https://www.x.com/",
   },
   {
      id: 3,
      title: "Medium",
      href: "https://www.medium.com/",
   },
   {
      id: 4,
      title: "Discord",
      href: "https://www.discord.com/",
   },
];

export const footernavbarItems = [
   {
      id: 1,
      title: "Home",
      href: "/",
   },
   {
      id: 2,
      title: "Products",
      href: "presentation",
   },
   {
      id: 3,
      title: "Solutions",
      href: "services",
   },
   {
      id: 4,
      title: "Company",
      href: "ochi-team",
   },
   {
      id: 5,
      title: "Resources",
      href: "insights",
   },
   {
      id: 6,
      title: "Contact us",
      href: "contact",
   },
];

export const clientsItem = [
   {
      id: 1,
      website: "Privacy-First Virtual Cards",
      href: "#",
      title: "Tech:",
      name: "Visa network integration, KMS security infrastructure",
      src: client01,
      review: "Advanced cryptographic architecture ensures your transactions across different disposable cards cannot be correlated, giving you financial privacy that was never possible before in digital payments. Each card exists in complete isolation with verifiable permanent deletion.",
      links: [
         {
            id: 1,
            title: "zero correlation",
            href: "#",
         },
         {
            id: 2,
            title: "cryptographic deletion",
            href: "#",
         },
         {
            id: 3,
            title: "transaction isolation",
            href: "#",
         },
      ]
   },
   {
      id: 2,
      website: "SMS-Based Crypto Access",
      href: "#",
      title: "Tech:",
      name: "SMS Infrastructure, Solana blockchain integration",
      src: client02,
      review: "Revolutionary SMS interface brings cryptocurrency to the 2.7 billion unbanked worldwide. Simple text commands like 'SEND 10 to +1234567890' enable crypto payments for anyone with a basic mobile phone, no internet or banking required.",
      links: [
         {
            id: 1,
            title: "no smartphone needed",
            href: "#",
         },
         {
            id: 2,
            title: "global reach",
            href: "#",
         },
         {
            id: 3,
            title: "instant onboarding",
            href: "#",
         },
      ]
   },
   {
      id: 3,
      website: "Real-Time Crypto Conversion",
      href: "#",
      title: "Tech:",
      name: "Oracles, DEX aggregation, Multi-chain networks",
      src: client03,
      review: "Seamless cryptocurrency-to-fiat conversion with real-time market rates across BTC, ETH, USDT, USDC, and XRP. Advanced slippage protection and optimal routing ensure you get the best value when funding your disposable cards.",
      links: [
         {
            id: 1,
            title: "live rates",
            href: "#",
         },
         {
            id: 2,
            title: "multi-chain support",
            href: "#",
         },
         {
            id: 3,
            title: "slippage protection",
            href: "#",
         },
      ]
   },
   {
      id: 4,
      website: "Financial Inclusion Revolution",
      href: "#",
      title: "Tech:",
      name: "Global telecom partnerships, remittance corridor optimization",
      src: client04,
      review: "Breaking down barriers that exclude billions from digital finance. Our SMS-based system requires no smartphone, no bank account, and no internet - just the ability to send text messages. Built-in referral bonuses drive organic growth while reducing remittance costs from 6-9% to under 2%.",
      links: [
         {
            id: 1,
            title: "2.7B unbanked",
            href: "#",
         },
         {
            id: 2,
            title: "feature phone compatible",
            href: "#",
         },
         {
            id: 3,
            title: "viral growth",
            href: "#",
         },
      ]
   },
   {
      id: 5,
      website: "RWA DeFi-versified Asset Management",
      href: "#",
      title: "Tech:",
      name: "Fireblocks custody, Major DeFi protocols, traditional asset bridges",
      src: client05,
      review: "Our platform is built on enterprise-grade cloud infrastructure, utilizing advanced encryption and a dedicated key management service to ensure the highest level of data security and global scalability.",
      links: [
         {
            id: 1,
            title: "enterprise cloud",
            href: "#",
         },
         {
            id: 2,
            title: "advanced encryption",
            href: "#",
         },
         {
            id: 3,
            title: "global scalability",
            href: "#",
         },
      ]
   },
   {
      id: 6,
      website: "Multi-Wallet Integration",
      href: "#",
      title: "Tech:",
      name: "MetaMask, Ledger, Trezor, 100+ wallet compatibility",
      src: client06,
      review: "Connect your existing crypto wallets seamlessly - from MetaMask and hardware wallets to mobile solutions. No need to transfer funds to new platforms. Fund your disposable cards directly from your preferred wallet while maintaining security and control.",
      links: [
         {
            id: 1,
            title: "walletconnect",
            href: "#",
         },
         {
            id: 2,
            title: "hardware support",
            href: "#",
         },
         {
            id: 3,
            title: "cross-platform",
            href: "#",
         },
      ]
   },
   {
      id: 7,
      website: "Viral Peer-to-Peer Growth",
      href: "#",
      title: "Tech:",
      name: "Automated smart contract rewards, Solana ecosystem integration",
      src: client07,
      review: "Every payment to a new user automatically creates an invitation with crypto bonuses for both sender and recipient. This viral growth mechanism drives organic user acquisition while providing immediate value, creating powerful network effects that expand financial access globally.",
      links: [
         {
            id: 1,
            title: "implicit referrals",
            href: "#",
         },
         {
            id: 2,
            title: "automatic bonuses",
            href: "#",
         },
         {
            id: 3,
            title: "network effects",
            href: "#",
         },
      ]
   },
   {
      id: 8,
      website: "Instant Transaction Privacy",
      href: "#",
      title: "Tech:",
      name: "Visa payment network, zk-SNARK protocols, advanced encryption infrastructure",
      src: client08,
      review: "Delete cards instantly with cryptographic zero-knowledge proofs that verify deletion occurred without revealing what was deleted. Our zk-proof system enables privacy-preserving compliance - proving transactions meet regulatory requirements without exposing personal spending data. Shop anywhere Visa is accepted with mathematical guarantees that your financial activity remains private.",
      links: [
         {
            id: 1,
            title: "zero-knowledge proofs",
            href: "#",
         },
         {
            id: 2,
            title: "forensic resistance",
            href: "#",
         },
         {
            id: 3,
            title: "privacy-preserving compliance",
            href: "#",
         },
      ]
   },
   {
      id: 9,
      website: "Global Infrastructure Scalability",
      href: "#",
      title: "Tech:",
      name: "Global infrastructure, Enterprise blockchain nodes, 99.9% uptime SLA",
      src: client09,
      review: "Built on enterprise-grade infrastructure supporting millions of users across multiple regions. Our scalable architecture handles everything from SMS delivery in remote areas to high-frequency card transactions, ensuring reliable service whether you're sending $5 or managing institutional portfolios.",
      links: [
         {
            id: 1,
            title: "enterprise grade",
            href: "#",
         },
         {
            id: 2,
            title: "multi-region",
            href: "#",
         },
         {
            id: 3,
            title: "high availability",
            href: "#",
         },
      ]
   },
];

export const projectItem = [
   {
      id: 1,
      title: "DisCard",
      href: "/discard",
      src: project1,
      links: [
         {
            id: 1,
            title: "virtual card",
            href: "#",
         },
         {
            id: 2,
            title: "privacy-first",
            href: "#",
         },
         {
            id: 3,
            title: "defi",
            href: "#",
         },
         {
            id: 4,
            title: "blockchain",
            href: "#",
         },
      ]
   },
   {
      id: 2,
      title: "TextPay",
      href: "#",
      src: project2,
      links: [
         {
            id: 1,
            title: "offline-first",
            href: "#",
         },
         {
            id: 2,
            title: "border-less",
            href: "#",
         },
      ]
   },
];


// services page

export const serviceProcessItems = [
   {
      id: 1,
      phase: "01. Phase",
      name: "Bridge",
      src: phase1,
      review: "Connecting crypto wealth to everyday needs.",
      button: "read"
   },
   {
      id: 2,
      phase: "02. Phase",
      name: "Universal Access",
      src: phase2,
      review: "One key unlocking all financial doors.",
      button: "read"
   },
   {
      id: 3,
      phase: "03. Phase",
      name: "Network",
      src: phase3,
      review: "Global connectivity without barriers.",
      button: "read"
   },
   {
      id: 4,
      phase: "04. Phase",
      name: "Evolution",
      src: phase4,
      review: "Traditional money → Digital freedom.",
      button: "read"
   },
   {
      id: 5,
      phase: "05. Phase",
      name: "Feedback",
      src: phase5,
      review: "We want to stay on the same page. Hence, each phase wraps up then we come to you to collect and implement your feedback if such appears.",
      button: "read"
   },
];

export const serviceClientsItem = [
   {
      id: 1,
      website: "Global Payment Network",
      href: "#",
      title: "Payment Partner:",
      name: "Worldwide Merchant Acceptance",
      src: client01,
      review: "We are proud to build Discard by integrating with industry leaders in global payments, institutional-grade security, and scalable cloud infrastructure. This allows us to focus on what matters most: delivering a private and seamless experience for you.",
      links: [
         {
            id: 1,
            title: "global acceptance",
            href: "#",
         },
         {
            id: 2,
            title: "real-time processing",
            href: "#",
         },
         {
            id: 3,
            title: "merchant access",
            href: "#",
         },
      ]
   },
   {
      id: 2,
      website: "Institutional Crypto Custody",
      href: "#",
      title: "Security Partner:",
      name: "Bank-Grade Asset Security",
      src: client02,
      review: "All user funds are protected by a leading institutional custody provider, utilizing bank-grade security and multi-party computation (MPC) to ensure your assets are always safe.",
      links: [
         {
            id: 1,
            title: "bank-grade security",
            href: "#",
         },
         {
            id: 2,
            title: "mpc custody",
            href: "#",
         },
         {
            id: 3,
            title: "asset protection",
            href: "#",
         },
      ]
   },
   {
      id: 3,
      website: "Modern Card Issuing",
      href: "#",
      title: "Technology Partner:",
      name: "API-First Virtual Cards",
      src: client03,
      review: "Our virtual cards are enabled by a leading API-first card issuing platform. This gives us the flexibility to programmatically create innovative, crypto-friendly payment solutions for our users in real-time.",
      links: [
         {
            id: 1,
            title: "api-first",
            href: "#",
         },
         {
            id: 2,
            title: "virtual cards",
            href: "#",
         },
         {
            id: 3,
            title: "real-time issuing",
            href: "#",
         },
      ]
   },
   {
      id: 4,
      website: "Blockchain & Oracle Infrastructure",
      href: "#",
      title: "Infrastructure Partner:",
      name: "On-Chain Operations",
      src: client04,
      review: "We ensure fast and accurate cryptocurrency operations by using high-performance node infrastructure for stable blockchain connectivity and decentralized oracles for real-time, tamper-proof price feeds.",
      links: [
         {
            id: 1,
            title: "on-chain reliability",
            href: "#",
         },
         {
            id: 2,
            title: "decentralized oracles",
            href: "#",
         },
         {
            id: 3,
            title: "price feeds",
            href: "#",
         },
      ]
   },
   {
      id: 5,
      website: "Enterprise Cloud Infrastructure",
      href: "#",
      title: "Technology Partner:",
      name: "Security, Scalability & Reliability",
      src: client05,
      review: "Our platform is built on enterprise-grade cloud infrastructure, utilizing advanced encryption and a dedicated key management service to ensure the highest level of data security and global scalability.",
      links: [
         {
            id: 1,
            title: "enterprise cloud",
            href: "#",
         },
         {
            id: 2,
            title: "advanced encryption",
            href: "#",
         },
         {
            id: 3,
            title: "global scalability",
            href: "#",
         },
      ]
   },
   {
      id: 6,
      website: "Backend & Database",
      href: "#",
      title: "Technology Partner:",
      name: "Modern, Scalable Architecture",
      src: client06,
      review: "Our platform is built on a modern, integrated backend architecture that handles our database, authentication, and real-time features, ensuring a responsive and secure user experience.",
      links: [
         {
            id: 1,
            title: "scalable architecture",
            href: "#",
         },
         {
            id: 2,
            title: "secure database",
            href: "#",
         },
         {
            id: 3,
            title: "real-time features",
            href: "#",
         },
      ]
   },
   {
      id: 7,
      website: "Regulatory Adherence",
      href: "#",
      title: "Partnership:",
      name: "Compliance by Design",
      src: client07,
      review: "Our platform is built with a 'Compliance by Design' approach. We partner with industry experts to ensure our KYC/AML procedures and financial operations meet or exceed regulatory standards.",
      links: [
         {
            id: 1,
            title: "kyc/aml",
            href: "#",
         },
         {
            id: 2,
            title: "regulatory standards",
            href: "#",
         },
         {
            id: 3,
            title: "financial compliance",
            href: "#",
         },
      ]
   },
   {
      id: 8,
      website: "Deep Liquidity & Exchange",
      href: "#",
      title: "Infrastructure Partner:",
      name: "Optimal Conversion Rates",
      src: client08,
      review: "By integrating with both decentralized exchange (DEX) aggregators and institutional liquidity providers, we ensure our users receive optimal, low-slippage conversion rates for their crypto assets.",
      links: [
         {
            id: 1,
            title: "deep liquidity",
            href: "#",
         },
         {
            id: 2,
            title: "dex aggregation",
            href: "#",
         },
         {
            id: 3,
            title: "optimal rates",
            href: "#",
         },
      ]
   },
   {
      id: 9,
      website: "Performance & Uptime Monitoring",
      href: "#",
      title: "Partnership:",
      name: "Proactive System Reliability",
      src: client09,
      review: "We use enterprise-grade monitoring solutions to track application performance and errors in real-time. This proactive approach allows us to ensure maximum uptime and reliability for all critical operations.",
      links: [
         {
            id: 1,
            title: "uptime monitoring",
            href: "#",
         },
         {
            id: 2,
            title: "performance tracking",
            href: "#",
         },
         {
            id: 3,
            title: "system reliability",
            href: "#",
         },
      ]
   },
];

export const serviceCapaybilitiesItem = [
   {
      id: 1,
      src1: capaybilities1,
      title1: "RAISE FUNDS:",
      review: "We help manage investor expectations and secure financing for your business with an excellent investor deck.Having a good product or illuminating ideas is not enough anymore.Poor investor presentation may close the door to potential financing right away.In contrast, a properly made investor deck provides investors with clarity, evokes confidence, and leaves them craving for more.",
      subTitle: "Projects",
      links1: [
         {
            id: 1,
            title: "investor deck",
            href: "/"
         },
         {
            id: 2,
            title: "startup pitch",
            href: "/"
         },
      ],
      src2: capaybilities2,
      title2: "SELL PRODUCTS:",
      links2: [
         {
            id: 1,
            title: "business proposal",
            href: "/"
         },
         {
            id: 2,
            title: "company presentation",
            href: "/"
         },
         {
            id: 3,
            title: "product presentation",
            href: "/"
         },
         {
            id: 4,
            title: "sales deck",
            href: "/"
         },
         {
            id: 5,
            title: "service deck",
            href: "/"
         },
      ]
   },
   {
      id: 2,
      src1: capaybilities3,
      title1: "HIRE & MANAGE PEOPLE:",
      review: "We help manage investor expectations and secure financing for your business with an excellent investor deck.Having a good product or illuminating ideas is not enough anymore.Poor investor presentation may close the door to potential financing right away.In contrast, a properly made investor deck provides investors with clarity, evokes confidence, and leaves them craving for more.",
      subTitle: "Projects",
      links1: [
         {
            id: 1,
            title: "big news deck",
            href: "/"
         },
         {
            id: 2,
            title: "branded template",
            href: "/"
         },
         {
            id: 3,
            title: "onboarding presentation",
            href: "/"
         },
         {
            id: 4,
            title: "policy deck & playbook",
            href: "/"
         },
         {
            id: 5,
            title: "progress report",
            href: "/"
         },
      ],
      src2: capaybilities4,
      title2: "ADDITIONAL:",
      links2: [
         {
            id: 1,
            title: "agency",
            href: "/"
         },
         {
            id: 2,
            title: "branding",
            href: "/"
         },
         {
            id: 3,
            title: "corporate training",
            href: "/"
         },
         {
            id: 4,
            title: "redesign",
            href: "/"
         },
         {
            id: 5,
            title: "review",
            href: "/"
         },
      ]
   },
];

export const expectationsItems = [
   {
      id: 1,
      title1: "01",
      subTitle1: "Comunication",
      btn: "read",
      para1: "The relationship with the clients is our top priority. We put extra effort into keeping mutual respect, honesty, and clarity in the conversation. For each client, we develop a project view site in Notion to track milestones and see the thinking behind steps. You always know what and when we do, as you feel confident in the results we bring.",
   },
   {
      id: 2,
      title1: "04",
      subTitle1: "One point of contact",
      btn: "read",
      para1: "Every project is led by Ihor, the agency's founder and creative director. He ensures the whole project flows from start to finish. He puts together the right creative team for your specific project. You will always have this direct contact person available to speak your business language. He takes care of translating your business goals into the language of design for the team."
   },
   {
      id: 3,
      title1: "02",
      subTitle1: "Ukrainian Business",
      btn: "read",
      para1: "We are a Ukrainian-born business working mainly with international clients. And as Ukrainians, we offer an unshakable workforce that's proven it can handle anything. The international arena was our focus from the start. And each working day, we showed up as genuine innovators and Ukraine ambassadors. Part of our mission is to promote our homeland by doing the most incredible work we can, each project at a time.",
   },
   {
      id: 4,
      title1: "05",
      subTitle1: "Constantly Improving",
      btn: "read",
      para1: "We are passionate about creating industry-shifting presentations. And as the world around us, we constantly evolve and improve. Our growth is fueled by an innovative ecosystem designed for each team member to grow. We provide them with frequent pieces for training both on design craft and personal development. We are constantly looking for new ways to support our creatives and our community as for our clients."
   },
   {
      id: 5,
      title1: "03",
      subTitle1: "Holistic Approach",
      btn: "read",
      para1: "We simply ask lots of questions to understand your goals, business, and niche you operate. Our discovery process is essential as it informs our decisions throughout the project. Once we firmly define the goal, it is incredible to move towards that goal. That's why so much of our work is discovery, research, and asking good questions. The answers we get and the data we find go into the foundation of project success.",
   },
   {
      id: 6,
      title1: "06",
      subTitle1: "Limited Amount of Client",
      btn: "read",
      para1: "We believe it is vital to dedicate sole focus and undivided attention to each project. To add as much value as possible, we serve a limited amount of clients per month. We have a rule that we follow to choosing projects: our client understands the value of the presentation as a communication tool. We believe in their products or ideas. Together, we work to create positive change."
   },
];

export const achiveItems = [
   {
      id: 1,
      title1: ["100+"],
      title2: ["$280+"],
      subTitle1: "Users from 17 Countries",
      subTitle2: "Billions in transactions",
   },
   {
      id: 2,
      title1: ["90%"],
      title2: ["98%"],
      subTitle1: "Of our users transact every day",
      subTitle2: "User Satisfaction Score",
   },
];


// presentation page

export const presentationProjectItem = [
   {
      id: 1,
      title: "DisCard",
      src: project1,
      href: "/discard",
      links: [
         {
            id: 1,
            title: "virtual card",
            href: "/services",
         },
         {
            id: 2,
            title: "privacy-first",
            href: "services",
         },
         {
            id: 3,
            title: "defi",
            href: "services",
         },
         {
            id: 4,
            title: "blockchain",
            href: "services",
         },
      ]
   },
   {
      id: 2,
      title: "TextPay",
      src: project2,
      href: "/textpay",
      links: [
         {
            id: 1,
            title: "offline-first",
            href: "/services",
         },
         {
            id: 2,
            title: "border-less",
            href: "services",
         },
      ]
   },
];


export const publicationItems = [
   {
      id: 1,
      title: "Privacy-first Virtual Cards",
      src: publication1
   },
   {
      id: 2,
      title: "SMS-Based Crypto Access",
      src: publication2
   },
   {
      id: 3,
      title: "Seamless Crypto & Fiat Integration",
      src: publication3
   },
];

// insights page constants

export const insightsPublicationItems = [
   {
      id: 1,
      title: "Sales calls?  Oh no!👀",
      src: insights1
   },
   {
      id: 2,
      title: "Are you trying to be the main character?",
      src: insights2
   },
   {
      id: 3,
      title: "New Top 7",
      src: insights3
   },
];

export const latestItemss = [
   {
      id: 1,
      href: "#",
      src: latest1,
      links: [
         {
            id: 1,
            title: "public speaking"
         },
         {
            id: 1,
            title: "storytelling"
         },
      ],
      title: "Presenting to an International Audience: <br/> Tips and Lessons Learned.",
      subTitle: "By Brandon Azevedo",
      date: "26 August 2025"
   },
   {
      id: 2,
      href: "/",
      src: latest2,
      links: [
         {
            id: 1,
            title: "presentation template"
         },
      ],
      title: "Developing company-wide presentation template for premium blend.",
      subTitle: "By Brandon Azevedo",
      date: "07 August 2025"
   },
];

// workiz page constants
export const workizItem = [
   {
      id: 1,
      title: "office vibe",
      src: project7,
      href: "/case/",
      links: [
         {
            id: 1,
            title: "brand template",
            href: "/services",
         },
      ]
   },
   {
      id: 2,
      title: "planetly",
      src: project5,
      href: "/case/",
      links: [
         {
            id: 1,
            title: "brand template",
            href: "/services",
         },
         {
            id: 2,
            title: "big news deck",
            href: "/services",
         },
         {
            id: 3,
            title: "branded template",
            href: "/services",
         },
         {
            id: 4,
            title: "investor deck",
            href: "/services",
         },
         {
            id: 5,
            title: "policy deck & playbook",
            href: "/services",
         },
         {
            id: 6,
            title: "sales deck",
            href: "/services",
         },
      ]
   },
];


// about page constants

export const aboutPartberItems = [
   {
      id: 1,
      src: planetly,
      title: "Planetly",
      para: "Ihor and his team tackled the projects with great professionalism and creativity. They understood our brand value and turned this into excellent slide designs. The process was seamless and very effective, so we decided to roll this out across all our presentation decks. Furthermore, their understanding, professionalism, and creativity have secured a continued partnership."
   },
   {
      id: 2,
      src: officevibe,
      title: "Officevibe",
      para: "Ochi has an impressive understanding of what's needed to do an effective presentation. The stakeholders at work said it's the best most complete PP template they've ever seen. Ochi delivered more than I was expecting and we were really surprised with the quality of his work. Will work with Ochi design again for sure!"
   },
   {
      id: 3,
      src: nestle,
      title: "Nestle",
      para: "This is just a great experience for us! As an established company, you operate within different industries and expect immediate input with a certain level of service. Ihor and the team delivered exactly that. Fantastic result, quick delivery time, and highly responsive. This team is a hidden gem. We've already started to outline our next projects for them."
   },
   // {
   //    id: 4,
   //    src: toyota,
   //    title: "Toyota",
   //    para: "Great work, great communication, and work ethic. Their skills, and understanding of project scope and subject matter - are simply unmatched. Looking very forward to working again soon."
   // },
   // {
   //    id: 5,
   //    src: lexus,
   //    title: "Lexus",
   //    para: "Thanks for your great work! The communication was excellent, the team was able to grasp in detail what we wanted and plastered it on the company presentation and sales deck. Their work is absolutely amazing."
   // },
   // {
   //    id: 6,
   //    src: aflorihtmic,
   //    title: "Aflorithmic",
   //    para: "Super responsive and quick. A charm to work with. Unfortunately, often designers are not like that and you end up losing a lot of time with briefings that don't lead anywhere. This is definitely not the case here. I'd work again with lhor and his team anytime!"
   // },
   // {
   //    id: 7,
   //    src: orderlion,
   //    title: "Orderlion",
   //    para: "The result was just amazing! For me, a designer is exceptional when you are so satisfied with the result that you want to look at it the whole day like a kid with a new toy. Ihor and his team delivered exactly that! They are very talented designers who understand the real business problem we are trying to solve and iterate over many drafts to achieve the best possible outcome. We are looking for a long-lasting working relationship!"
   // },
   // {
   //    id: 8,
   //    src: blackBox,
   //    title: "BlackBox",
   //    para: "They nailed what our product was all about. We found their ability to workshop all the angles and take on feedback was great and it shows in the final product. Everything moved with a milestone dynamic brief via Notion which was handy to track progress. We're very happy with the process and the final product. All was handled well and professionally."
   // },
];

// contact page constants

export const FaqItems = [
   {
      id: 1,
      question: "How secure is the Discard bridge between crypto wallets and traditional payments?",
      title: "Security & Privacy",
      description: "We're committed to maintaining the highest security standards while preserving user privacy. Our non-custodial architecture means we never hold your funds, and our privacy-first approach ensures your financial data remains protected.",
      links: [
         {
            id: 1,
            title: 1,
            description: "Discard operates on a zero-knowledge protocol, meaning we facilitate transactions without accessing or storing your private keys or personal financial information."
         },
         {
            id: 2,
            title: 2,
            description: "Our platform is universally compatible with all major blockchain networks, not locked into any particular ecosystem, giving you complete freedom over your assets."
         },
      ],
      button: "read"
   },
   {
      id: 2,
      question: "How does TextPay achieve 60-80% lower fees than competitors?",
      title: "Cost Efficiency",
      description: "By leveraging existing mobile infrastructure and optimizing our blockchain settlement protocols, we've eliminated the traditional intermediary costs that plague cross-border payments. Our direct integration approach means savings get passed directly to our 2.7 billion potential users.",
      links: [
         {
            id: 1,
            title: 1,
            description: "Unlike traditional remittance services like M-PESA, we don't maintain expensive physical infrastructure or multiple currency reserves, allowing us to operate at a fraction of the cost."
         },
      ],
      button: "read"
   },
   {
      id: 3,
      question: "Do you partner with traditional financial institutions?",
      title: "Strategic Partnerships",
      description: "Yes, we actively collaborate with banks, payment processors, and regulatory bodies to ensure seamless integration between crypto and traditional finance. Our approach isn't to replace existing systems but to bridge them efficiently.",
      links: [
         {
            id: 1,
            title: 1,
            description: "We're building strategic partnerships across 54 African markets and MENA regions, working with local banks and mobile money operators to ensure compliant, frictionless cross-border transactions."
         },
      ],
      button: "read"
   },
   {
      id: 4,
      question: "Are you hiring for the Discard Technologies team?",
      title: "Join Our Mission",
      description: "Yes! We're actively seeking talented individuals passionate about financial inclusion and blockchain innovation. As we scale across emerging markets, we need developers, compliance experts, and regional market specialists who share our vision of democratizing global finance.",
      links: [
         {
            id: 1,
            title: 1,
            description: "If you have expertise in blockchain development, regulatory compliance, or emerging market payments, send your CV and portfolio to careers@discardtech.com with 'FINANCIAL INCLUSION' in the subject line."
         },
         {
            id: 2,
            title: 2,
            description: "We're particularly interested in candidates with experience in African and MENA markets, mobile money systems, or cross-border payment regulations."
         },
      ],
      button: "read"
   },
   {
      id: 5,
      question: "Can Discard help with regulatory compliance for crypto businesses?",
      title: "Compliance Solutions",
      description: "Absolutely. Our platform is built with compliance at its core.",
      links: [
         {
            id: 1,
            title: 1,
            description: "We've invested heavily in KYC/AML systems that work across multiple jurisdictions, with transaction monitoring and reporting systems that adapt to different regulatory formats. This means businesses using our infrastructure automatically benefit from our compliance framework."
         },
         {
            id: 2,
            title: 2,
            description: "As we expand through our phased rollout (starting with 5-8 priority markets representing 70% of continental GDP), we're establishing the regulatory partnerships and licenses that our clients can leverage."
         },
      ],
      button: "read"
   },
   {
      id: 6,
      question: "How can I integrate Discard or TextPay into my business?",
      title: "Integration & API",
      description: "Integration is straightforward through our developer-friendly APIs. Whether you're a fintech startup, e-commerce platform, or traditional business looking to accept crypto payments, we provide comprehensive documentation and support.",
      links: [
         {
            id: 1,
            title: 1,
            description: "Our APIs support both the Discard bridge for wallet-to-payment conversions and TextPay for mobile-based transactions. With our $14.20 ARPU and 12.2x LTV/CAC ratio, we're built for sustainable, long-term partnerships that grow with your business."
         },
      ],
      button: "read"
   },
];
