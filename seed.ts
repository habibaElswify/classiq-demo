import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.resolve('./classiq.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema creation ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
      CHECK (role IN ('student', 'teacher', 'admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    teacher_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
      CHECK (role IN ('student', 'teacher', 'admin')),
    UNIQUE (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'processing'
      CHECK (status IN ('processing', 'trained', 'error')),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL UNIQUE,
    study_mode TEXT NOT NULL DEFAULT 'direct'
      CHECK (study_mode IN ('socratic', 'direct', 'practice')),
    help_level TEXT NOT NULL DEFAULT 'full'
      CHECK (help_level IN ('minimal', 'guided', 'full')),
    blocked_topics TEXT NOT NULL DEFAULT '',
    require_show_work INTEGER NOT NULL DEFAULT 0,
    only_course_materials INTEGER NOT NULL DEFAULT 0,
    block_assignment_solutions INTEGER NOT NULL DEFAULT 0,
    exam_mode INTEGER NOT NULL DEFAULT 0,
    redirect_message TEXT NOT NULL DEFAULT 'This topic is not available right now. Please focus on the assigned materials.',
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    metadata TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── Clear existing data (reverse dependency order) ───────────────────────────
db.exec(`
  DELETE FROM analytics;
  DELETE FROM chat_messages;
  DELETE FROM chat_sessions;
  DELETE FROM course_rules;
  DELETE FROM materials;
  DELETE FROM enrollments;
  DELETE FROM courses;
  DELETE FROM users;
`);

// ── Hash password ────────────────────────────────────────────────────────────
const passwordHash = bcrypt.hashSync('password123', 12);

// ── Users ────────────────────────────────────────────────────────────────────
const insertUser = db.prepare(
  `INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)`
);

insertUser.run(1, 'prof.johnson@bellevuecollege.edu', 'Prof. Johnson', passwordHash, 'teacher');
insertUser.run(2, 'habiba@bellevuecollege.edu', 'Habiba El-Swify', passwordHash, 'student');
insertUser.run(3, 'admin@bellevuecollege.edu', 'System Admin', passwordHash, 'admin');
insertUser.run(4, 'alex.chen@bellevuecollege.edu', 'Alex Chen', passwordHash, 'student');
insertUser.run(5, 'maria.garcia@bellevuecollege.edu', 'Maria Garcia', passwordHash, 'student');

// ── Courses ──────────────────────────────────────────────────────────────────
const insertCourse = db.prepare(
  `INSERT INTO courses (id, name, code, teacher_id) VALUES (?, ?, ?, ?)`
);

insertCourse.run(1, 'Software Engineering & Analysis', 'CSS370', 1);
insertCourse.run(2, 'Data Structures & Algorithms', 'CSS343', 1);

// ── Enrollments ──────────────────────────────────────────────────────────────
const insertEnrollment = db.prepare(
  `INSERT INTO enrollments (user_id, course_id, role) VALUES (?, ?, ?)`
);

// Teacher in both courses
insertEnrollment.run(1, 1, 'teacher');
insertEnrollment.run(1, 2, 'teacher');
// Habiba in both courses
insertEnrollment.run(2, 1, 'student');
insertEnrollment.run(2, 2, 'student');
// Alex and Maria in CSS370 only
insertEnrollment.run(4, 1, 'student');
insertEnrollment.run(5, 1, 'student');

// ── Course Rules ─────────────────────────────────────────────────────────────
const insertRules = db.prepare(
  `INSERT INTO course_rules (course_id, study_mode, help_level, blocked_topics, redirect_message) VALUES (?, ?, ?, ?, ?)`
);

insertRules.run(
  1,
  'socratic',
  'guided',
  JSON.stringify(['Exam answers', 'Homework solutions', 'Grade disputes', 'Final project code']),
  'This topic is restricted. Please visit Prof. Johnson during office hours for assistance.'
);

insertRules.run(
  2,
  'direct',
  'full',
  JSON.stringify(['Exam answers', 'Assignment solutions']),
  'This topic is not available right now. Please focus on the assigned materials.'
);

// ── Materials ────────────────────────────────────────────────────────────────
const insertMaterial = db.prepare(
  `INSERT INTO materials (course_id, filename, content_text, status) VALUES (?, ?, ?, ?)`
);

const syllabus = `CSS 370 - Software Engineering & Analysis
Bellevue College - Winter 2026
Instructor: Prof. Johnson

Course Description:
This course covers the fundamentals of software engineering, including requirements analysis,
design methodologies, cost estimation, security analysis, and project management using Agile/Scrum.

Sprint Schedule:
  Sprint 1 (Weeks 1-2): Introduction to Software Engineering & Agile/Scrum
    - Software development life cycles (Waterfall, Agile, Spiral)
    - Scrum roles: Product Owner, Scrum Master, Development Team
    - Artifacts: Product Backlog, Sprint Backlog, Increment
    - Ceremonies: Sprint Planning, Daily Standup, Sprint Review, Retrospective

  Sprint 2 (Weeks 2-3): Requirements Engineering
    - Functional vs Non-functional requirements
    - User stories and acceptance criteria
    - Use case diagrams and descriptions
    - Requirements traceability matrix

  Sprint 3 (Weeks 3-4): Use Case Modeling & Domain Modeling
    - Identifying actors and use cases
    - Domain model class diagrams
    - Noun/verb analysis for discovering classes and methods

  Sprint 4 (Weeks 5-6): UML & Design Patterns
    - Class diagrams, sequence diagrams, activity diagrams
    - SOLID principles
    - Common design patterns: Singleton, Observer, Factory, Strategy

  Sprint 5 (Weeks 6-7): Testing & Quality Assurance
    - Unit testing, integration testing, system testing
    - Test-driven development (TDD)
    - Code coverage metrics
    - Defect tracking and management

  Sprint 6 (Weeks 7-8): Configuration Management & CI/CD
    - Version control best practices
    - Branching strategies (GitFlow, trunk-based)
    - Continuous Integration and Continuous Deployment pipelines

  Sprint 7 (Weeks 8-9): ICONIX Process & Robustness Analysis
    - The 7 steps of ICONIX
    - Robustness diagrams: boundary, control, entity objects
    - Mapping robustness diagrams to sequence diagrams

  Sprint 8 (Weeks 9-10): Security Analysis
    - CIA Triad: Confidentiality, Integrity, Availability
    - STRIDE threat model
    - DREAD risk scoring
    - Data Flow Diagrams for threat analysis

  Sprint 9 (Weeks 10-11): Cost Estimation
    - Estimation methods: Expert Judgment, Analogous, Parametric, Bottom-Up
    - Planning Poker and Wideband Delphi
    - Financial analyses: Break-Even, Payback Period, NPV, ROI, TCO

  Sprint 10 (Weeks 11-12): Final Project Presentations
    - Team presentations of semester-long project
    - Peer evaluations
    - Final retrospective

Grading Breakdown:
  Sprint Deliverables (10 sprints): 50%
  Midterm Exam: 15%
  Final Exam: 15%
  Class Participation & Peer Reviews: 10%
  Final Project Presentation: 10%

Academic Integrity:
  All work must be original. Using AI assistants is allowed for learning and studying,
  but submitting AI-generated work as your own is a violation of the academic integrity policy.

Office Hours: Tuesdays & Thursdays 2:00-3:30 PM, Room D-110
Email: prof.johnson@bellevuecollege.edu`;

const iconixSlides = `Sprint 7: ICONIX Process & Robustness Analysis
CSS 370 - Software Engineering & Analysis

What is ICONIX?
ICONIX is a minimalist, use-case-driven object modeling process that bridges the gap
between use cases and code. It was developed by Doug Rosenberg and combines elements
of RUP, XP, and Agile methodologies into a streamlined approach.

The 7 Steps of the ICONIX Process:
  Step 1: Functional Requirements - Identify what the system must do
  Step 2: Domain Modeling - Create a class diagram of real-world concepts
  Step 3: Use Case Descriptions - Write detailed behavioral descriptions
  Step 4: Robustness Analysis - Validate use cases against domain model
  Step 5: Sequence Diagrams - Define detailed object interactions
  Step 6: Class Diagram Updates - Refine with methods and attributes
  Step 7: Implementation & Testing - Code and verify

Robustness Diagram Symbols:
  Boundary Objects (circle with line on left):
    - Represent the interface between the system and the outside world
    - Examples: screens, forms, dialogs, menus, APIs
    - Users interact ONLY through boundary objects

  Entity Objects (circle with line on bottom):
    - Represent persistent data / domain concepts
    - Examples: Student, Course, Order, Account
    - Map directly to domain model classes

  Control Objects (circle with arrow):
    - Represent business logic and coordination
    - Examples: RegistrationController, PaymentProcessor
    - They mediate between boundary and entity objects

Communication Rules for Robustness Diagrams:
  Rule 1: Actors can ONLY talk to Boundary objects
  Rule 2: Boundary objects can talk to Control objects and other Boundary objects
  Rule 3: Entity objects can talk to Control objects
  Rule 4: Control objects can talk to both Boundary and Entity objects
  Rule 5: Entity objects CANNOT talk directly to Boundary objects
  Rule 6: Actors CANNOT talk directly to Control or Entity objects

Why These Rules Matter:
  - They enforce proper separation of concerns
  - They ensure the UI layer never directly accesses data
  - They guarantee business logic is centralized in controllers
  - Violations indicate design flaws that should be corrected

Mapping Robustness Diagrams to Sequence Diagrams:
  1. Each control object becomes a method call or a controller class
  2. Each boundary object maps to a UI component or API endpoint
  3. Each entity object maps to a data access call or repository method
  4. The flow through the robustness diagram defines the message sequence
  5. Return values flow back through the same path

Example - Student Registration:
  Actor: Student
  Boundary: RegistrationForm
  Control: RegistrationController, ValidationService
  Entity: Student, Course, Enrollment
  Flow: Student -> RegistrationForm -> RegistrationController -> ValidationService
        -> Student (lookup) -> Course (check capacity) -> Enrollment (create)

Sequence Diagram Construction from Robustness:
  - Place objects across the top (left to right: actor, boundary, controls, entities)
  - Draw activation bars showing when each object is active
  - Messages flow left-to-right for requests, right-to-left for responses
  - Use fragments (alt, loop, opt) for conditional and iterative behavior

Key Takeaways:
  - ICONIX provides just enough modeling without excessive documentation
  - Robustness analysis catches design errors early and cheaply
  - The mapping from robustness to sequence diagrams is mechanical and traceable
  - Every use case should have a robustness diagram before coding begins`;

const securitySlides = `Sprint 8: Security Analysis & Threat Modeling
CSS 370 - Software Engineering & Analysis

The CIA Triad - Foundation of Information Security:
  Confidentiality:
    - Ensuring information is accessible only to authorized parties
    - Techniques: encryption, access controls, authentication
    - Example: Only enrolled students can view course grades

  Integrity:
    - Ensuring information is accurate and has not been tampered with
    - Techniques: checksums, digital signatures, version control
    - Example: Grades cannot be modified without proper authorization

  Availability:
    - Ensuring information and systems are accessible when needed
    - Techniques: redundancy, backups, load balancing, DDoS protection
    - Example: The learning management system is available during finals week

The Three Tenets of Secure Design:
  Tenet 1: Minimize Attack Surface
    - Reduce the number of entry points an attacker can exploit
    - Disable unnecessary features and services
    - Apply principle of least privilege

  Tenet 2: Defense in Depth
    - Layer multiple security controls
    - No single point of failure for security
    - If one layer fails, others still protect the system

  Tenet 3: Fail Securely
    - When errors occur, default to a secure state
    - Do not reveal sensitive information in error messages
    - Log failures for security monitoring

STRIDE Threat Model:
  S - Spoofing Identity:
    - Pretending to be someone or something else
    - Countermeasure: Strong authentication (MFA, certificates)
    - Example: An attacker logs in using stolen credentials

  T - Tampering with Data:
    - Unauthorized modification of data
    - Countermeasure: Integrity checks, digital signatures, audit logs
    - Example: Modifying grades in the database directly

  R - Repudiation:
    - Denying having performed an action
    - Countermeasure: Audit trails, logging, digital signatures
    - Example: A student claims they never submitted a late assignment

  I - Information Disclosure:
    - Exposing information to unauthorized parties
    - Countermeasure: Encryption, access controls, data classification
    - Example: Student records visible to unauthorized users

  D - Denial of Service:
    - Making a system unavailable to legitimate users
    - Countermeasure: Rate limiting, load balancing, CDN
    - Example: Flooding the exam submission server during finals

  E - Elevation of Privilege:
    - Gaining capabilities beyond what is authorized
    - Countermeasure: Least privilege, input validation, sandboxing
    - Example: A student account gaining teacher-level access

STRIDE-DFD Mapping:
  Data Flow Diagrams (DFDs) are used to map STRIDE threats to system components:
    - External Entities: vulnerable to Spoofing, Repudiation
    - Data Flows: vulnerable to Tampering, Information Disclosure, Denial of Service
    - Data Stores: vulnerable to Tampering, Information Disclosure, Denial of Service, Repudiation
    - Processes: vulnerable to ALL STRIDE categories

DREAD Risk Scoring (each scored 1-10):
  D - Damage Potential: How much damage if exploited?
  R - Reproducibility: How easy to reproduce the attack?
  E - Exploitability: How easy to launch the attack?
  A - Affected Users: How many users are impacted?
  D - Discoverability: How easy to discover the vulnerability?

  Overall DREAD Score = (D + R + E + A + D) / 5
  Risk Levels: Low (1-3), Medium (4-6), High (7-10)

Threat Response Strategies:
  Accept: Acknowledge the risk and take no action (low impact/probability)
  Mitigate: Implement controls to reduce risk
  Transfer: Shift risk to a third party (insurance, cloud providers)
  Avoid: Eliminate the feature or change design to remove the threat

Key Takeaways:
  - Security must be considered from the design phase, not bolted on later
  - STRIDE provides a systematic way to identify threats
  - DREAD helps prioritize which threats to address first
  - Every data flow in a DFD should be analyzed for potential threats`;

const costEstimationSlides = `Sprint 9: Cost Estimation & Financial Analysis
CSS 370 - Software Engineering & Analysis

Why Cost Estimation Matters:
  - Projects fail most often due to poor estimation, not poor coding
  - Accurate estimates enable better planning, budgeting, and stakeholder trust
  - Underestimation leads to death marches; overestimation wastes resources

Three Categories of Software Costs:
  Category 1: Development Costs
    - Personnel salaries and benefits
    - Hardware and software licenses
    - Training and onboarding
    - Office space and utilities

  Category 2: Operational Costs
    - Server hosting and cloud infrastructure
    - Maintenance and bug fixes
    - Customer support
    - Monitoring and incident response

  Category 3: Hidden/Indirect Costs
    - Technical debt repayment
    - Opportunity costs (what else could the team build?)
    - Integration and migration costs
    - Compliance and regulatory requirements

Estimation Methods:
  Expert Judgment:
    - Relies on experience of senior team members
    - Quick but subjective and prone to bias
    - Best for: early-stage ballpark estimates

  Analogous Estimation:
    - Based on actual costs of similar past projects
    - Requires good historical data
    - Best for: organizations with mature project records

  Parametric Estimation:
    - Uses mathematical models (e.g., COCOMO, Function Points)
    - Input parameters: size, complexity, team experience
    - Best for: well-understood project types with reliable metrics

  Bottom-Up Estimation:
    - Decompose project into smallest tasks, estimate each
    - Most accurate but most time-consuming
    - Best for: detailed planning after requirements are clear

Planning Poker (Agile Estimation):
  Process:
    1. Product owner presents a user story
    2. Team discusses requirements and complexity
    3. Each member privately selects a card (Fibonacci: 1, 2, 3, 5, 8, 13, 21)
    4. All cards revealed simultaneously
    5. High and low estimators explain their reasoning
    6. Re-vote until consensus is reached
  Benefits:
    - Avoids anchoring bias
    - Leverages diverse perspectives
    - Builds shared understanding of scope

Cost/Benefit Analysis Methods:

  Break-Even Analysis:
    - Point where total revenue equals total cost
    - Break-Even Point = Fixed Costs / (Revenue per Unit - Variable Cost per Unit)
    - Projects should reach break-even within a reasonable timeframe
    - Example: If development costs $100K and monthly revenue is $10K with
      $2K monthly costs, break-even = $100K / ($10K - $2K) = 12.5 months

  Payback Period:
    - Time required to recover the initial investment
    - Simple Payback = Initial Investment / Annual Net Cash Flow
    - Shorter payback periods indicate lower risk
    - Does NOT account for time value of money

  Cash-Flow Analysis:
    - Tracks all money flowing in and out over the project lifecycle
    - Cumulative cash flow shows when the project becomes profitable
    - Helps identify periods of high expenditure for budgeting
    - Presented as a table or chart over time

  Net Present Value (NPV):
    - Accounts for the time value of money (a dollar today > a dollar tomorrow)
    - NPV = Sum of [Cash Flow / (1 + discount rate)^year] - Initial Investment
    - NPV > 0: project adds value; NPV < 0: project destroys value
    - Preferred method for comparing projects of different durations
    - Example: With 10% discount rate, $10K received in year 2 = $10K / 1.21 = $8,264 today

  Return on Investment (ROI):
    - ROI = (Net Profit / Cost of Investment) x 100%
    - Simple and widely understood metric
    - Does not account for time or risk
    - Example: Invest $50K, gain $75K -> ROI = ($25K / $50K) x 100% = 50%

  Total Cost of Ownership (TCO):
    - Full lifecycle cost: development + deployment + operations + retirement
    - Includes hidden costs like training, migration, and technical debt
    - Critical for build-vs-buy decisions
    - Cloud vs on-premise decisions often hinge on TCO analysis

Key Takeaways:
  - Always estimate in ranges, not single numbers
  - Use multiple estimation methods and triangulate
  - Financial metrics (NPV, ROI, TCO) guide project selection
  - Re-estimate regularly as more information becomes available
  - Planning Poker combines expertise with bias reduction`;

insertMaterial.run(1, 'Syllabus_CSS370_Winter2026.pdf', syllabus, 'trained');
insertMaterial.run(1, 'Sprint7_ICONIX_Slides.pdf', iconixSlides, 'trained');
insertMaterial.run(1, 'Sprint8_Security_Slides.pdf', securitySlides, 'trained');
insertMaterial.run(1, 'Sprint9_CostEstimation_Slides.pdf', costEstimationSlides, 'trained');

// ── Sample Chat Data ─────────────────────────────────────────────────────────
const insertSession = db.prepare(
  `INSERT INTO chat_sessions (id, course_id, user_id, title) VALUES (?, ?, ?, ?)`
);
const insertMessage = db.prepare(
  `INSERT INTO chat_messages (session_id, course_id, user_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)`
);

// Session 1: Habiba asking about STRIDE in CSS370
insertSession.run(1, 1, 2, 'Understanding STRIDE Threats');

insertMessage.run(
  1, 1, 2, 'user',
  'Can you explain what STRIDE is and how each category relates to a real-world example in a web application?',
  null
);

insertMessage.run(
  1, 1, 2, 'assistant',
  `Great question! Let me walk you through STRIDE, which is a threat modeling framework used to systematically identify security threats.

STRIDE stands for six categories of threats:

1. **Spoofing Identity** - An attacker pretends to be a legitimate user. For a web app, this could be someone using stolen session cookies to impersonate another user.

2. **Tampering with Data** - Unauthorized modification of data. For example, an attacker could use SQL injection to modify records in the database.

3. **Repudiation** - A user denies performing an action. Without proper logging, a malicious user could delete records and claim they never did it.

4. **Information Disclosure** - Sensitive data is exposed. A misconfigured API endpoint might return other users' personal information.

5. **Denial of Service** - Making the system unavailable. An attacker could flood your login endpoint with requests, preventing legitimate users from accessing the system.

6. **Elevation of Privilege** - Gaining unauthorized access levels. A student account exploiting a vulnerability to gain admin access.

When analyzing threats, you map STRIDE categories to your Data Flow Diagram components. Processes are vulnerable to all six categories, while data stores and data flows have specific vulnerability patterns.

Would you like me to walk through how DREAD scoring helps prioritize these threats?`,
  JSON.stringify([
    { filename: 'Sprint8_Security_Slides.pdf', excerpt: 'STRIDE Threat Model: S - Spoofing Identity...' }
  ])
);

// Session 2: Alex in CSS370
insertSession.run(2, 1, 4, 'ICONIX Process Overview');

insertMessage.run(
  2, 1, 4, 'user',
  'What are the communication rules for robustness diagrams?',
  null
);

insertMessage.run(
  2, 1, 4, 'assistant',
  `The robustness diagram communication rules define how the three types of objects can interact with each other. Here are the key rules:

1. **Actors** can ONLY communicate with **Boundary objects** - they cannot directly access controllers or entities.

2. **Boundary objects** can communicate with **Control objects** and other **Boundary objects**.

3. **Entity objects** can communicate with **Control objects**.

4. **Control objects** can communicate with both **Boundary** and **Entity** objects - they serve as the central coordinators.

5. **Entity objects CANNOT** communicate directly with **Boundary objects** - this enforces separation between UI and data.

6. **Actors CANNOT** communicate directly with **Control** or **Entity** objects.

These rules are important because they enforce proper separation of concerns in your design. If you find yourself violating these rules, it usually indicates a design flaw that should be corrected before moving to implementation.

Think of it like this: the user talks to the screen (boundary), the screen talks to the logic (control), and the logic talks to the data (entity). Data never talks directly to the screen.

Would you like to see how these map to a sequence diagram?`,
  JSON.stringify([
    { filename: 'Sprint7_ICONIX_Slides.pdf', excerpt: 'Communication Rules for Robustness Diagrams...' }
  ])
);

// ── Analytics ────────────────────────────────────────────────────────────────
const insertAnalytics = db.prepare(
  `INSERT INTO analytics (course_id, user_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?)`
);

// Generate 50 chat_message analytics entries
const studentIds = [2, 4, 5];
const topics = [
  'STRIDE threats', 'ICONIX process', 'robustness diagrams', 'cost estimation',
  'security analysis', 'sprint planning', 'use cases', 'sequence diagrams',
  'DREAD scoring', 'CIA triad', 'NPV calculation', 'planning poker'
];

for (let i = 0; i < 50; i++) {
  const userId = studentIds[i % studentIds.length];
  const topic = topics[i % topics.length];
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  const hour = String(Math.floor(Math.random() * 14) + 8).padStart(2, '0');
  const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const timestamp = `2026-02-${day} ${hour}:${minute}:00`;

  insertAnalytics.run(
    1,
    userId,
    'chat_message',
    JSON.stringify({ topic, session_id: (i % 2) + 1 }),
    timestamp
  );
}

// A few material_upload analytics entries
insertAnalytics.run(1, 1, 'material_upload', JSON.stringify({ filename: 'Syllabus_CSS370_Winter2026.pdf', status: 'trained' }), '2026-01-06 09:00:00');
insertAnalytics.run(1, 1, 'material_upload', JSON.stringify({ filename: 'Sprint7_ICONIX_Slides.pdf', status: 'trained' }), '2026-02-17 10:30:00');
insertAnalytics.run(1, 1, 'material_upload', JSON.stringify({ filename: 'Sprint8_Security_Slides.pdf', status: 'trained' }), '2026-02-24 10:30:00');
insertAnalytics.run(1, 1, 'material_upload', JSON.stringify({ filename: 'Sprint9_CostEstimation_Slides.pdf', status: 'trained' }), '2026-03-03 10:30:00');

db.close();

// ── Success output ───────────────────────────────────────────────────────────
console.log('\n=== ClassIQ Database Seeded Successfully ===\n');
console.log('Demo accounts (all with password: password123):');
console.log('  Teacher:  prof.johnson@bellevuecollege.edu');
console.log('  Student:  habiba@bellevuecollege.edu');
console.log('  Admin:    admin@bellevuecollege.edu');
console.log('\nAdditional students:');
console.log('  alex.chen@bellevuecollege.edu');
console.log('  maria.garcia@bellevuecollege.edu');
console.log('\nCourses: CSS370 (Software Engineering), CSS343 (Data Structures)');
console.log('Materials: 4 trained documents for CSS370');
console.log('Chat sessions: 2 sample sessions with messages');
console.log('Analytics: 54 entries (50 chat + 4 uploads)\n');
