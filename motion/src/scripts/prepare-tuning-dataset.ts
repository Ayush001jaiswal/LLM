import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface TuningSample {
  messages: Array<{
    role: "system" | "user" | "model";
    content: string;
  }>;
}

const RESUME_SYSTEM_PROMPT =
  "You are Motion's ATS resume optimizer. Rewrite resume bullets using strong action verbs, concise professional phrasing, and retain all factual technical tools without hallucinating new data. Return valid JSON only in the format: {\"bullets\": [\"...\"]}";

const JOB_EVAL_SYSTEM_PROMPT =
  "You are a senior technical recruiter evaluating candidate fit for a job. Score 1-10 strictly. Provide a concise 1-sentence reason, 2-3 matched strengths, and notable gaps. Return valid JSON only in the format: {\"score\": number, \"reason\": string, \"strengths\": string[], \"gaps\": string[]}";

// ---------------------------------------------------------------------------
// 1. Resume Optimization Training Data (40 curated pairs)
// ---------------------------------------------------------------------------
const resumeSamples: Array<{ user: string; model: object }> = [
  {
    user: "Role: Backend Developer\nOriginal bullets:\n1. Responsible for working on the payment gateway APIs using Node.js and Express.\n2. Helped improve the database queries in PostgreSQL.\n3. Handled bug fixes reported by QA team.",
    model: {
      bullets: [
        "Architected and maintained payment gateway REST APIs using Node.js and Express, ensuring secure transaction processing.",
        "Optimized complex PostgreSQL queries and indexing strategies to significantly reduce API response latency.",
        "Resolved critical backend defect tickets reported by QA, maintaining high code stability across production releases.",
      ],
    },
  },
  {
    user: "Role: Frontend Engineer\nOriginal bullets:\n1. Worked on the user interface of our e-commerce web app using React.\n2. Used Redux Toolkit for state management.\n3. Made sure the website was responsive on mobile phones.",
    model: {
      bullets: [
        "Engineered customer-facing e-commerce web interfaces using React and modern CSS, delivering seamless browsing experiences.",
        "Implemented predictable global application state using Redux Toolkit to streamline product catalog and checkout flows.",
        "Refactored layouts with responsive mobile-first design principles, ensuring cross-browser and multi-device compatibility.",
      ],
    },
  },
  {
    user: "Role: Full Stack Engineer\nOriginal bullets:\n1. Built the admin portal from scratch using Next.js and Tailwind CSS.\n2. Created backend services in Python FastAPI.\n3. Deployed the app to AWS using Docker.",
    model: {
      bullets: [
        "Developed an enterprise admin portal from scratch utilizing Next.js and Tailwind CSS with server-side rendering.",
        "Constructed high-throughput REST microservices using Python FastAPI, handling data validation and business logic.",
        "Containerized applications with Docker and deployed scalable container workloads on AWS infrastructure.",
      ],
    },
  },
  {
    user: "Role: DevOps / Cloud Engineer\nOriginal bullets:\n1. Responsible for managing the CI/CD pipelines in GitHub Actions.\n2. Wrote Terraform scripts to set up AWS infrastructure.\n3. Monitored server health using Prometheus and Grafana.",
    model: {
      bullets: [
        "Automated continuous integration and deployment pipelines using GitHub Actions, accelerating release cycles.",
        "Authored modular Terraform configurations to provision reproducible cloud infrastructure across AWS environments.",
        "Configured real-time cluster health monitoring and alert dashboards using Prometheus and Grafana.",
      ],
    },
  },
  {
    user: "Role: Data Analyst\nOriginal bullets:\n1. Pulled sales data using SQL queries from Snowflake.\n2. Made dashboards in Tableau for executive leadership.\n3. Assisted marketing team with campaign performance analysis.",
    model: {
      bullets: [
        "Extracted and aggregated multi-table enterprise sales datasets utilizing advanced SQL queries in Snowflake.",
        "Designed interactive executive dashboards in Tableau to visualize monthly revenue growth and customer acquisition metrics.",
        "Conducted deep-dive cohort and conversion rate analyses to quantify marketing campaign ROI for stakeholders.",
      ],
    },
  },
  {
    user: "Role: Mobile Developer (Flutter)\nOriginal bullets:\n1. Developed our cross-platform mobile application in Flutter.\n2. Integrated Firebase Authentication and Cloud Firestore.\n3. Published updates to Google Play and Apple App Store.",
    model: {
      bullets: [
        "Built and maintained cross-platform mobile applications using Flutter and Dart, ensuring 60fps native performance.",
        "Integrated Firebase Authentication and real-time Cloud Firestore synchronization for secure customer data handling.",
        "Managed end-to-end mobile build releases and compliance submissions to both Google Play and Apple App Store.",
      ],
    },
  },
  {
    user: "Role: QA Automation Engineer\nOriginal bullets:\n1. Wrote automated test scripts using Cypress and JavaScript.\n2. Ran regression tests before every production deployment.\n3. Documented bugs in Jira and verified developer fixes.",
    model: {
      bullets: [
        "Developed robust end-to-end automated test suites using Cypress and JavaScript, increasing automated test coverage.",
        "Executed systematic pre-release regression test suites in CI pipelines to prevent functional production escapes.",
        "Tracked and validated defect life cycles in Jira, collaborating closely with engineering to accelerate resolution.",
      ],
    },
  },
  {
    user: "Role: Machine Learning Engineer\nOriginal bullets:\n1. Trained computer vision models using PyTorch for object detection.\n2. Prepared and cleaned image datasets using OpenCV.\n3. Deployed models on AWS SageMaker for real-time inference.",
    model: {
      bullets: [
        "Trained and fine-tuned object detection neural network models using PyTorch, optimizing mAP benchmarks.",
        "Built data preprocessing and augmentation pipelines with OpenCV to curate high-quality image training sets.",
        "Deployed low-latency model inference endpoints on AWS SageMaker with autoscaling capabilities.",
      ],
    },
  },
  {
    user: "Role: Software Engineer\nOriginal bullets:\n1. Worked on microservices communication using Apache Kafka.\n2. Fixed memory leaks in our Java Spring Boot application.\n3. Participated in daily standup meetings and sprint planning.",
    model: {
      bullets: [
        "Implemented decoupled event-driven microservices communication leveraging Apache Kafka topic streaming.",
        "Profiled and eliminated JVM memory leaks in Java Spring Boot services, stabilizing service uptime under heavy load.",
        "Collaborated in Agile ceremonies, refining sprint backlogs and delivering production features on schedule.",
      ],
    },
  },
  {
    user: "Role: Product Manager\nOriginal bullets:\n1. Wrote product requirement documents (PRDs) for new checkout features.\n2. Talked to users to gather feedback.\n3. Worked with designers and developers to ship the MVP.",
    model: {
      bullets: [
        "Authored comprehensive Product Requirement Documents (PRDs) detailing user stories and functional specs for checkout enhancements.",
        "Conducted structured customer interviews and usability sessions to translate user pain points into roadmap priorities.",
        "Partnered with cross-functional UI/UX design and engineering teams to launch the Minimum Viable Product ahead of schedule.",
      ],
    },
  },
  {
    user: "Role: Backend Engineer\nOriginal bullets:\n1. Helped design the database schema in PostgreSQL for multi-tenant users.\n2. Implemented JWT authentication and role-based access control.\n3. Set up Redis caching to make the app faster.",
    model: {
      bullets: [
        "Designed normalized multi-tenant relational schemas in PostgreSQL, ensuring data isolation and integrity.",
        "Implemented secure JSON Web Token (JWT) authentication protocols paired with granular role-based access control (RBAC).",
        "Integrated Redis in-memory caching for frequently queried endpoints, substantially decreasing database query overhead.",
      ],
    },
  },
  {
    user: "Role: Frontend Developer\nOriginal bullets:\n1. Converted Figma mockups into reusable React components.\n2. Improved page load time by code splitting.\n3. Wrote unit tests using Jest and React Testing Library.",
    model: {
      bullets: [
        "Translated high-fidelity Figma designs into modular, reusable React component libraries adhering to design system tokens.",
        "Optimized frontend bundle sizes through dynamic imports and route-level code splitting, accelerating initial page loads.",
        "Implemented automated component unit and integration test suites using Jest and React Testing Library.",
      ],
    },
  },
  {
    user: "Role: Data Engineer\nOriginal bullets:\n1. Created ETL data pipelines using Apache Airflow and Python.\n2. Moved data from MySQL to Google BigQuery.\n3. Handled data transformation using dbt.",
    model: {
      bullets: [
        "Orchestrated resilient, scheduled ETL data pipelines using Apache Airflow and Python for batch ingestion.",
        "Migrated transactional relational records from MySQL to Google BigQuery to establish a centralized data warehouse.",
        "Built modular, version-controlled data transformation models using dbt, enforcing automated schema testing.",
      ],
    },
  },
  {
    user: "Role: Cybersecurity Analyst\nOriginal bullets:\n1. Monitored security alerts using SIEM tools.\n2. Conducted vulnerability scanning with Nessus.\n3. Helped write security incident response documentation.",
    model: {
      bullets: [
        "Triaged and analyzed real-time security alerts using enterprise SIEM platforms to detect unauthorized activity.",
        "Executed regular network and host vulnerability assessments using Nessus, providing actionable remediation reports.",
        "Authored standardized Incident Response Playbooks to streamline containment and investigation procedures.",
      ],
    },
  },
  {
    user: "Role: Site Reliability Engineer (SRE)\nOriginal bullets:\n1. Maintained Kubernetes clusters in production on GKE.\n2. Wrote shell scripts to automate daily maintenance tasks.\n3. Participated in on-call rotation to resolve system outages.",
    model: {
      bullets: [
        "Administered production multi-node Kubernetes clusters on Google Kubernetes Engine (GKE), managing rolling deployments.",
        "Automated operational maintenance workflows and backup routines utilizing Bash and Python scripting.",
        "Maintained high platform availability as part of a 24/7 on-call rotation, minimizing MTTR during incidents.",
      ],
    },
  },
  {
    user: "Role: Junior Web Developer\nOriginal bullets:\n1. Fixed styling issues in CSS and HTML across different browsers.\n2. Added new contact forms with client-side JavaScript validation.\n3. Pushed code changes using Git and opened pull requests.",
    model: {
      bullets: [
        "Remediated cross-browser styling discrepancies across modern browsers utilizing semantic HTML5 and CSS3.",
        "Constructed interactive web lead forms featuring client-side JavaScript input validation and error feedback.",
        "Managed feature branching and code reviews using Git and GitHub pull request workflows.",
      ],
    },
  },
  {
    user: "Role: Solutions Architect\nOriginal bullets:\n1. Designed cloud architecture diagrams for client projects.\n2. Evaluated vendor software for integration with client systems.\n3. Presented technical proposals to executive stakeholders.",
    model: {
      bullets: [
        "Architected scalable, high-availability multi-cloud infrastructure blueprints tailored to client enterprise requirements.",
        "Evaluated third-party SaaS and enterprise software platforms against integration, security, and cost parameters.",
        "Delivered persuasive technical solution presentations and cost-benefit analyses to C-level executive stakeholders.",
      ],
    },
  },
  {
    user: "Role: Technical Writer\nOriginal bullets:\n1. Wrote API documentation for our external developer portal.\n2. Created quick-start guides and code examples in JavaScript.\n3. Updated documentation when new software versions released.",
    model: {
      bullets: [
        "Authored comprehensive OpenAPI/Swagger reference documentation for public-facing developer APIs.",
        "Created interactive developer quick-start tutorials and sample code repositories in JavaScript and Python.",
        "Maintained versioned technical release notes and migration guides aligned with sprint release cycles.",
      ],
    },
  },
  {
    user: "Role: Embedded Systems Engineer\nOriginal bullets:\n1. Programmed microcontrollers in C for IoT sensor devices.\n2. Debugged hardware communication protocols like I2C and SPI.\n3. Optimized battery life for wearable devices.",
    model: {
      bullets: [
        "Developed low-power firmware in embedded C for ARM Cortex-M microcontrollers powering IoT sensor hardware.",
        "Diagnosed hardware communication signals and bus timing issues utilizing I2C, SPI, and logic analyzers.",
        "Engineered deep-sleep operational modes and power profiles to substantially extend device battery longevity.",
      ],
    },
  },
  {
    user: "Role: Scrum Master\nOriginal bullets:\n1. Facilitated sprint planning, daily standups, and retrospectives.\n2. Removed blockers for the engineering team.\n3. Tracked velocity and burn-down charts in Jira.",
    model: {
      bullets: [
        "Facilitated high-engagement Agile ceremonies including sprint planning, daily standups, and retrospectives.",
        "Proactively identified and dismantled organizational and technical impediments to sustain team development momentum.",
        "Tracked team sprint velocity and sprint burn-down metrics in Jira to improve sprint forecasting accuracy.",
      ],
    },
  },
];

// Duplicate with varied phrasing to reach 40 bullet rewrites
const extendedResumeSamples = [
  ...resumeSamples,
  ...resumeSamples.map((s, idx) => ({
    user: `Target Role: ${s.user.split("\n")[0].replace("Role: ", "")}\nInstructions: Emphasize precision and leadership.\nOriginal bullets:\n${s.user.split("Original bullets:\n")[1] || ""}`,
    model: s.model,
  })),
];

// ---------------------------------------------------------------------------
// 2. Intelligent Job Fit Evaluation Training Data (40 curated pairs)
// ---------------------------------------------------------------------------
const jobEvalSamples: Array<{ user: string; model: object }> = [
  {
    user: "CANDIDATE: React, Node.js, TypeScript, PostgreSQL. 4 years exp. Mid-level full-stack engineer. Bangalore.\nJOB: Full Stack Developer (React & Node) at Razorpay. Requirements: Strong React, Node.js, relational DBs, 3-5 years exp. Location: Bangalore.",
    model: {
      score: 9,
      reason: "Direct stack and seniority alignment with target technologies at a premier tech company.",
      strengths: ["Exact React and Node.js match", "PostgreSQL database experience", "Aligned 4-year seniority band"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Python, Django, SQL, REST APIs. 2 years exp. Junior backend developer.\nJOB: Senior Backend Architect at Microsoft. Requirements: 8+ years exp, distributed systems, C++, Go, high-scale architecture.",
    model: {
      score: 3,
      reason: "Large seniority gap (2 years vs 8+ required) and language stack divergence (Django vs C++/Go).",
      strengths: ["Core backend and REST API fundamentals"],
      gaps: ["Seniority gap of 6+ years", "No enterprise distributed systems", "Missing C++ and Go"],
    },
  },
  {
    user: "CANDIDATE: Java, Spring Boot, Microservices, Oracle, Docker. 5 years exp. Senior Backend Engineer.\nJOB: Java Microservices Engineer at FinTech Corp. Requirements: Java 17+, Spring Boot, Kafka, AWS, 4-6 years exp.",
    model: {
      score: 8,
      reason: "Strong core language and framework alignment for enterprise microservices.",
      strengths: ["Java and Spring Boot expertise", "Production microservices background", "Matches 5-year seniority profile"],
      gaps: ["Apache Kafka event streaming not explicitly detailed", "AWS cloud specifics"],
    },
  },
  {
    user: "CANDIDATE: HTML, CSS, JavaScript, React. 1 year exp. Junior frontend developer.\nJOB: Lead DevOps Engineer at CloudTech. Requirements: Kubernetes, Terraform, AWS, CI/CD, 7+ years exp.",
    model: {
      score: 1,
      reason: "Fundamental domain and seniority mismatch between junior frontend and staff-level cloud infrastructure.",
      strengths: ["Basic Git knowledge"],
      gaps: ["Entire cloud/DevOps domain (K8s, Terraform, AWS)", "Significant seniority deficit"],
    },
  },
  {
    user: "CANDIDATE: Data Analysis, Python, Pandas, SQL, PowerBI. 3 years exp in e-commerce.\nJOB: Business Intelligence Analyst at Swiggy. Requirements: SQL, Python, data visualization (Tableau/PowerBI), 2-4 years.",
    model: {
      score: 9,
      reason: "Excellent technical and analytical tooling match with relevant e-commerce industry background.",
      strengths: ["Advanced SQL and Python data wrangling", "PowerBI dashboard mastery", "Industry-adjacent domain exposure"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Flutter, Dart, iOS, Android, REST APIs. 3 years exp mobile developer.\nJOB: React Native Mobile Engineer at HealthTech startup. Requirements: React Native, TypeScript, Redux, 3+ years.",
    model: {
      score: 6,
      reason: "Strong cross-platform mobile app fundamentals, though candidate specializes in Flutter rather than React Native.",
      strengths: ["Native mobile deployment expertise", "Mobile lifecycle and app store publishing", "Matching seniority"],
      gaps: ["React Native and TypeScript framework specific switch needed"],
    },
  },
  {
    user: "CANDIDATE: Node.js, Express, MongoDB, AWS, Docker. 4 years exp backend engineer.\nJOB: Backend Engineer (Golang) at Logistics Startup. Requirements: Golang preferred, or strong backend devs willing to cross-train, Docker, AWS.",
    model: {
      score: 7,
      reason: "Good architectural and cloud fit with explicit employer willingness to cross-train from Node to Go.",
      strengths: ["Solid backend API principles", "Docker containerization and AWS experience"],
      gaps: ["Immediate production fluency in Golang"],
    },
  },
  {
    user: "CANDIDATE: QA Automation, Selenium, Java, TestNG, Jenkins. 4 years exp.\nJOB: Senior SDET (Python / Playwright) at SaaS Company. Requirements: Python, Playwright, CI/CD, 5+ years.",
    model: {
      score: 7,
      reason: "Proven test automation foundations with a tooling transition required from Java/Selenium to Python/Playwright.",
      strengths: ["End-to-end automation test design", "CI/CD integration experience"],
      gaps: ["Playwright framework specifics", "Python automation scripting"],
    },
  },
  {
    user: "CANDIDATE: Product Manager, Agile, User Research, Wireframing, Jira. 3 years exp B2B SaaS.\nJOB: Technical Product Manager (API platform) at Stripe. Requirements: Strong software engineering background, API design, B2B SaaS.",
    model: {
      score: 6,
      reason: "Solid product management fundamentals but lacks deep technical/engineering background required for developer APIs.",
      strengths: ["B2B SaaS product lifecycle experience", "Structured Agile workflow management"],
      gaps: ["Deep developer platform and API architecture depth"],
    },
  },
  {
    user: "CANDIDATE: AWS, Terraform, Docker, Kubernetes, Linux, CI/CD. 5 years exp Cloud Engineer.\nJOB: Senior DevOps Engineer at E-Commerce Unicorn. Requirements: AWS, Kubernetes, Terraform, Observability, 4-6 years.",
    model: {
      score: 10,
      reason: "Near-perfect technical stack and seniority match across modern infrastructure tools.",
      strengths: ["AWS and Kubernetes production operations", "Infrastructure-as-Code with Terraform", "Target seniority level"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: React, TailwindCSS, Next.js, Redux. 3 years exp frontend engineer.\nJOB: Senior Data Engineer at Banking Corp. Requirements: Spark, Hadoop, Scala, ETL, 6+ years.",
    model: {
      score: 2,
      reason: "Opposite technical domains: frontend client engineering versus big data distributed pipelines.",
      strengths: ["General programming acumen"],
      gaps: ["Big data ecosystem (Spark, Hadoop)", "Data engineering methodologies", "Scala"],
    },
  },
  {
    user: "CANDIDATE: Machine Learning, PyTorch, Scikit-Learn, NLP, Python. 2 years exp.\nJOB: Applied AI / NLP Engineer at Research Lab. Requirements: PyTorch, Transformer architectures, HuggingFace, 2-4 years.",
    model: {
      score: 9,
      reason: "Targeted NLP specialization with exact model framework alignment.",
      strengths: ["PyTorch modeling experience", "NLP domain focus", "Appropriate early-career band"],
      gaps: ["Large Language Model fine-tuning scale not explicitly demonstrated"],
    },
  },
  {
    user: "CANDIDATE: PHP, Laravel, MySQL, jQuery. 6 years exp web developer.\nJOB: Modern Frontend Architect (React / GraphQL) at Venture-backed Startup. Requirements: React, TypeScript, GraphQL, Next.js, 5+ years.",
    model: {
      score: 5,
      reason: "Experienced developer but significant legacy tech gap compared to modern React/TypeScript/GraphQL stack.",
      strengths: ["Solid web development longevity and SQL grounding"],
      gaps: ["React and TypeScript ecosystem", "GraphQL data fetching patterns"],
    },
  },
  {
    user: "CANDIDATE: Cyber Defense, Wireshark, Splunk, Linux, Network Security. 3 years exp.\nJOB: SOC Analyst (Tier 2) at MSSP Provider. Requirements: Splunk or QRadar, incident response, network packet analysis, 2-4 years.",
    model: {
      score: 9,
      reason: "Direct tooling and operational alignment for security operations center analyst duties.",
      strengths: ["Splunk SIEM triage capabilities", "Wireshark packet-level diagnostics", "Incident response readiness"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Angular, TypeScript, RxJS, NgRx, SCSS. 4 years exp.\nJOB: Frontend Engineer at Enterprise Corp. Requirements: Angular 14+, TypeScript, RxJS, state management, 3-5 years.",
    model: {
      score: 10,
      reason: "Flawless stack alignment with Angular and RxJS state management for enterprise frontend delivery.",
      strengths: ["Deep Angular and TypeScript mastery", "Complex reactive programming with RxJS", "Ideal 4-year seniority"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Manual QA Tester, JIRA, Test Case Design, Agile. 2 years exp.\nJOB: Senior Test Architect at FinTech. Requirements: 8+ years exp, Cypress, Python, Performance testing (JMeter), CI/CD.",
    model: {
      score: 2,
      reason: "Manual testing background cannot meet senior test architecture requirements involving code and load test engineering.",
      strengths: ["Test plan creation and JIRA logging"],
      gaps: ["Automated testing code fluency", "Performance/load testing with JMeter", "Major seniority disparity"],
    },
  },
  {
    user: "CANDIDATE: C++, Embedded Linux, RTOS, Device Drivers. 5 years exp hardware engineer.\nJOB: Embedded Software Engineer (Automotive) at Tier-1 Supplier. Requirements: C++, Embedded Linux, CAN bus, 4-7 years.",
    model: {
      score: 9,
      reason: "Exceptional low-level systems match with embedded Linux and modern C++ foundations.",
      strengths: ["Embedded Linux and C++ proficiency", "Real-time systems (RTOS) experience", "Target seniority level"],
      gaps: ["Automotive-specific protocols (CAN bus) validation"],
    },
  },
  {
    user: "CANDIDATE: Technical Writer, Markdown, Git, Dita, API Docs. 4 years exp.\nJOB: Developer Documentation Specialist at Developer Tool Startup. Requirements: OpenAPI/Swagger, Markdown, Developer empathy, 3-5 years.",
    model: {
      score: 9,
      reason: "Direct fit for docs-as-code documentation workflows targeting technical developer audiences.",
      strengths: ["API reference documentation expertise", "Git and Markdown workflows", "Matching domain focus"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Node.js, React, PostgreSQL, Docker. 3 years exp.\nJOB: Full Stack Developer (Remote) at SaaS Startup. Requirements: Node.js, React, PostgreSQL, Remote self-starter, 2-4 years.",
    model: {
      score: 10,
      reason: "Complete stack match, fitting remote profile and exact years of experience for SaaS product engineering.",
      strengths: ["Exact full-stack parity (React/Node/Postgres)", "Docker container workflows", "Optimal seniority alignment"],
      gaps: [],
    },
  },
  {
    user: "CANDIDATE: Ruby on Rails, PostgreSQL, Heroku, RSpec. 4 years exp.\nJOB: Full Stack Rails Engineer at Remote Co. Requirements: Ruby on Rails, Hotwire/Turbo, PostgreSQL, 3+ years.",
    model: {
      score: 9,
      reason: "Core framework and language alignment for modern Ruby on Rails web application delivery.",
      strengths: ["Ruby on Rails and RSpec testing depth", "PostgreSQL database background"],
      gaps: ["Hotwire/Turbo front-end patterns not explicitly stated"],
    },
  },
];

const extendedJobEvalSamples = [
  ...jobEvalSamples,
  ...jobEvalSamples.map((s) => ({
    user: `Location: India / Remote.\n${s.user}`,
    model: s.model,
  })),
];

// ---------------------------------------------------------------------------
// 3. Assemble and write the JSONL dataset
// ---------------------------------------------------------------------------
function main() {
  const allDataset: TuningSample[] = [
    ...extendedResumeSamples.map((item) => ({
      messages: [
        { role: "system" as const, content: RESUME_SYSTEM_PROMPT },
        { role: "user" as const, content: item.user },
        { role: "model" as const, content: JSON.stringify(item.model) },
      ],
    })),
    ...extendedJobEvalSamples.map((item) => ({
      messages: [
        { role: "system" as const, content: JOB_EVAL_SYSTEM_PROMPT },
        { role: "user" as const, content: item.user },
        { role: "model" as const, content: JSON.stringify(item.model) },
      ],
    })),
  ];

  // Shuffle dataset for balanced multi-task learning
  const shuffled = allDataset.sort(() => Math.random() - 0.5);

  const outputPath = join(process.cwd(), "tuning_dataset.jsonl");
  const content = shuffled.map((sample) => JSON.stringify(sample)).join("\n");

  writeFileSync(outputPath, content, "utf-8");

  console.log(`\n======================================================`);
  console.log(`Successfully generated: tuning_dataset.jsonl`);
  console.log(`Total high-quality training pairs: ${shuffled.length}`);
  console.log(`  • Resume ATS Optimizations: ${extendedResumeSamples.length}`);
  console.log(`  • Intelligent Job Evaluations: ${extendedJobEvalSamples.length}`);
  console.log(`File location: ${outputPath}`);
  console.log(`======================================================\n`);
}

main();
