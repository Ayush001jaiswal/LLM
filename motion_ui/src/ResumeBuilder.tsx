import { useState } from "react";
import "./ResumeBuilder.css";
import {
  aiEnhanceBullet,
  aiGenerateSummary,
  createResumeFromBuilder,
  downloadResume,
  renderResumeDirect,
  updateResumeFromBuilder,
} from "./api.resume";
import type {
  AtsReport,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  ResumeData,
  ResumeFormat,
  ResumeTemplateId,
} from "./api.resume";

export interface TemplateMeta {
  id: ResumeTemplateId;
  name: string;
  category: string;
  badge: string;
  description: string;
  fontPreview: string;
  accentColor: string;
}

export const INDUSTRY_TEMPLATES: TemplateMeta[] = [
  {
    id: "modern_tech",
    name: "Silicon Valley Tech",
    category: "FAANG, Top AI Startups & Tech Giants",
    badge: "⭐ Tech #1 Standard",
    description: "High-density clean sans-serif with left-aligned header, tech skill matrix, and Google XYZ impact bullets.",
    fontPreview: "Inter / Helvetica Sans",
    accentColor: "#1E3A8A",
  },
  {
    id: "classic",
    name: "Ivy League / Harvard Classic",
    category: "Finance, Consulting & Academia",
    badge: "🏛️ Academic & ATS Gold",
    description: "Traditional serif layout with centered header, strict horizontal dividers, and 100% legacy ATS pass rate.",
    fontPreview: "Times New Roman / Garamond",
    accentColor: "#111827",
  },
  {
    id: "executive",
    name: "Executive & Engineering Leadership",
    category: "Staff+, Tech Leads & Directors",
    badge: "💼 Senior & Leadership",
    description: "Sleek navy header accents, spotlight executive summary, and structured competency sections for senior roles.",
    fontPreview: "Calibri / Modern Clean",
    accentColor: "#0F2942",
  },
  {
    id: "compact",
    name: "Startup 1-Page Fast-Track",
    category: "High-Growth Startups & Scaleups",
    badge: "📄 Guaranteed 1-Page",
    description: "Maximized space utilization with compact padding and dense layout to fit extensive experience onto 1 page.",
    fontPreview: "Arial / Compact Sans",
    accentColor: "#0F172A",
  },
  {
    id: "creative",
    name: "Modern Product & Design Tech",
    category: "Full-Stack, UI/UX & Design Engineers",
    badge: "🎨 Contemporary Elegance",
    description: "Contemporary styling with emerald accents, balanced whitespace, and crisp modern typography.",
    fontPreview: "Trebuchet / Clean Sans",
    accentColor: "#0D9488",
  },
];

const PRESETS: Record<string, { role: string; data: ResumeData }> = {
  fullstack: {
    role: "Senior Full Stack Engineer",
    data: {
      contact: {
        name: "Alex Morgan",
        email: "alex.morgan@example.com",
        phone: "+1 (555) 382-9102",
        location: "San Francisco, CA (Open to Remote)",
        links: ["linkedin.com/in/alexmorgan", "github.com/alexmorgan", "alexmorgan.dev"],
      },
      summary:
        "Senior Full Stack Engineer with 5+ years of experience architecting high-scale distributed web applications. Specialist in TypeScript, React, Node.js, and cloud-native systems serving millions of daily active users.",
      experience: [
        {
          title: "Senior Full Stack Engineer",
          company: "Vanguard Tech Systems",
          location: "San Francisco, CA",
          start: "2022",
          end: "Present",
          bullets: [
            "Architected and delivered event-driven microservices processing 45M+ daily transactions with 99.99% uptime using Node.js, TypeScript, and Kafka.",
            "Accelerated core web application performance by 42% (LCP reduced from 2.8s to 1.1s) by migrating frontend architecture to React 19 and Next.js SSR.",
            "Engineered automated CI/CD pipeline reducing production release cycle from 3 days to 25 minutes across 14 decoupled micro-frontends.",
          ],
        },
        {
          title: "Software Engineer",
          company: "Nexus Cloud Software",
          location: "Austin, TX",
          start: "2019",
          end: "2022",
          bullets: [
            "Developed real-time analytics dashboard with React, GraphQL, and WebSockets, increasing daily active user engagement by 35%.",
            "Designed and optimized PostgreSQL schema with Redis caching, slashing peak database query latency by 55%.",
            "Mentored 6 junior engineers and authored engineering standard guidelines adopted by 40+ engineering team members.",
          ],
        },
      ],
      education: [
        {
          school: "University of California, Berkeley",
          degree: "B.S.",
          field: "Computer Science",
          start: "2015",
          end: "2019",
          details: ["Dean's Honors List (3.8 GPA)", "Teaching Assistant for CS 61B Data Structures"],
        },
      ],
      projects: [
        {
          name: "Motion AI Hiring Agent",
          tech: "TypeScript, React, Node.js, Gemini API, PostgreSQL",
          bullets: [
            "Built autonomous AI multi-agent workflow matching candidates to 10,000+ live jobs with sub-second ATS parsing and vector similarity.",
          ],
        },
      ],
      skills: [
        { label: "Languages", items: ["TypeScript", "JavaScript", "Python", "Go", "SQL"] },
        { label: "Frontend", items: ["React", "Next.js", "Redux", "Tailwind CSS", "HTML5/CSS3", "Web Vitals"] },
        { label: "Backend & DB", items: ["Node.js", "Express", "PostgreSQL", "Redis", "GraphQL", "Prisma"] },
        { label: "Cloud & DevOps", items: ["Docker", "Kubernetes", "AWS (ECS, S3, RDS)", "GitHub Actions", "CI/CD"] },
      ],
      certifications: ["AWS Certified Solutions Architect – Associate", "Meta Certified Full-Stack Developer"],
      achievements: [
        "1st Place Winner – Bay Area Hackathon 2023 (120+ competing engineering teams)",
      ],
      other: [],
    },
  },
  ai_engineer: {
    role: "AI / Machine Learning Engineer",
    data: {
      contact: {
        name: "Jordan Lee",
        email: "jordan.lee@example.com",
        phone: "+1 (415) 890-2341",
        location: "New York, NY",
        links: ["linkedin.com/in/jordanlee-ai", "github.com/jordanlee", "huggingface.co/jordanlee"],
      },
      summary:
        "AI / Machine Learning Engineer with 4+ years building production LLM systems, RAG pipelines, and fine-tuning open-source models. Proven track record deploying scalable inference endpoints serving 500k+ daily queries.",
      experience: [
        {
          title: "Senior AI Engineer",
          company: "Synthetix AI",
          location: "New York, NY",
          start: "2023",
          end: "Present",
          bullets: [
            "Architected hybrid RAG system utilizing Qdrant vector database and hybrid dense-sparse retrieval, lifting answer recall by 28% and reducing hallucination by 40%.",
            "Fine-tuned Llama-3 8B and Mistral models using LoRA/QLoRA on domain-specific datasets, outperforming baseline GPT-4 on structured JSON benchmarks.",
            "Optimized vLLM serving cluster on AWS A100 GPUs, cutting p99 inference latency by 3.2x while reducing monthly cloud compute expenses by $45,000.",
          ],
        },
        {
          title: "Machine Learning Engineer",
          company: "Cognitive Labs",
          location: "Boston, MA",
          start: "2020",
          end: "2023",
          bullets: [
            "Trained and deployed deep learning recommendation models in PyTorch serving 2M+ active consumers.",
            "Built automated data labeling and model monitoring pipeline with MLflow and Airflow, reducing model drift detection time from weeks to hours.",
          ],
        },
      ],
      education: [
        {
          school: "Carnegie Mellon University",
          degree: "M.S.",
          field: "Computational Data Science",
          start: "2018",
          end: "2020",
          details: ["Graduate Research in Distributed LLM Training", "Published at NeurIPS Workshop"],
        },
      ],
      projects: [
        {
          name: "AgentGraph",
          tech: "Python, PyTorch, LangGraph, Ollama, ChromaDB",
          bullets: [
            "Open-source multi-agent planning library with 2.4k GitHub stars and 15k monthly PyPI downloads.",
          ],
        },
      ],
      skills: [
        { label: "AI & ML", items: ["PyTorch", "Hugging Face", "vLLM", "LangChain", "LlamaIndex", "LoRA", "RAG"] },
        { label: "Data & Systems", items: ["Python", "FastAPI", "Vector DBs (Qdrant, Pinecone)", "PostgreSQL", "Docker"] },
        { label: "Cloud & Tooling", items: ["AWS (SageMaker, EC2)", "MLflow", "Weights & Biases", "Kubernetes", "CUDA"] },
      ],
      certifications: ["Deep Learning Specialization – DeepLearning.AI"],
      achievements: ["Published research author at NeurIPS Workshop on Generative Workflows"],
      other: [],
    },
  },
};

interface ResumeBuilderProps {
  initialData?: ResumeData;
  initialRole?: string;
  initialResumeId?: number | null;
  onSaved?: (resumeId: number) => void;
  onBack?: () => void;
  onMatchJobs?: (resumeId: number) => void;
}

export default function ResumeBuilder({
  initialData,
  initialRole = "Full Stack Engineer",
  initialResumeId = null,
  onSaved,
  onBack,
  onMatchJobs,
}: ResumeBuilderProps) {
  const [templateId, setTemplateId] = useState<ResumeTemplateId>("modern_tech");
  const [targetRole, setTargetRole] = useState(initialRole);
  const [filename, setFilename] = useState("My_Professional_Resume");
  const [jobDescription, setJobDescription] = useState("");
  const [data, setData] = useState<ResumeData>(
    initialData || PRESETS.fullstack.data
  );

  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "split">("split");
  const [savedResumeId, setSavedResumeId] = useState<number | null>(initialResumeId);
  const [report, setReport] = useState<AtsReport | null>(null);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [enhancingBulletKey, setEnhancingBulletKey] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Helper to compute quick live metrics for the preview
  const allBullets = [
    ...data.experience.flatMap((e) => e.bullets),
    ...data.projects.flatMap((p) => p.bullets),
  ];
  const numberedBullets = allBullets.filter((b) => /\d+/.test(b)).length;
  const quantifiedPercent =
    allBullets.length > 0 ? Math.round((numberedBullets / allBullets.length) * 100) : 0;

  // Contact field updates
  const updateContact = (field: keyof ResumeData["contact"], value: any) => {
    setData((prev) => ({
      ...prev,
      contact: { ...prev.contact, [field]: value },
    }));
  };

  // Experience handlers
  const updateExperience = (index: number, field: keyof ExperienceEntry, value: any) => {
    setData((prev) => {
      const exp = [...prev.experience];
      exp[index] = { ...exp[index], [field]: value };
      return { ...prev, experience: exp };
    });
  };

  const addExperience = () => {
    setData((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        {
          title: "Software Engineer",
          company: "Company Name",
          location: "Location",
          start: "2023",
          end: "Present",
          bullets: ["Engineered scalable features delivering high performance."],
        },
      ],
    }));
  };

  const removeExperience = (index: number) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  };

  const updateBullet = (expIndex: number, bulletIndex: number, text: string) => {
    setData((prev) => {
      const exp = [...prev.experience];
      const bullets = [...exp[expIndex].bullets];
      bullets[bulletIndex] = text;
      exp[expIndex] = { ...exp[expIndex], bullets };
      return { ...prev, experience: exp };
    });
  };

  const addBullet = (expIndex: number) => {
    setData((prev) => {
      const exp = [...prev.experience];
      exp[expIndex] = {
        ...exp[expIndex],
        bullets: [...exp[expIndex].bullets, "Accelerated system performance by 25% through optimizations."],
      };
      return { ...prev, experience: exp };
    });
  };

  const removeBullet = (expIndex: number, bulletIndex: number) => {
    setData((prev) => {
      const exp = [...prev.experience];
      exp[expIndex] = {
        ...exp[expIndex],
        bullets: exp[expIndex].bullets.filter((_, i) => i !== bulletIndex),
      };
      return { ...prev, experience: exp };
    });
  };

  // Project handlers
  const addProject = () => {
    setData((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          name: "Project Name",
          tech: "React, TypeScript, Node.js",
          bullets: ["Built end-to-end full stack application serving active users."],
        },
      ],
    }));
  };

  const updateProject = (index: number, field: keyof ProjectEntry, value: any) => {
    setData((prev) => {
      const p = [...prev.projects];
      p[index] = { ...p[index], [field]: value };
      return { ...prev, projects: p };
    });
  };

  const removeProject = (index: number) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  };

  // Skill category handlers
  const updateSkillCategory = (index: number, label: string) => {
    setData((prev) => {
      const s = [...prev.skills];
      s[index] = { ...s[index], label };
      return { ...prev, skills: s };
    });
  };

  const updateSkillItems = (index: number, itemsString: string) => {
    const items = itemsString
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    setData((prev) => {
      const s = [...prev.skills];
      s[index] = { ...s[index], items };
      return { ...prev, skills: s };
    });
  };

  const addSkillGroup = () => {
    setData((prev) => ({
      ...prev,
      skills: [...prev.skills, { label: "Tools & Libraries", items: ["Git", "Jest", "Figma"] }],
    }));
  };

  const removeSkillGroup = (index: number) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  };

  // Education handlers
  const addEducation = () => {
    setData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          school: "University Name",
          degree: "B.S.",
          field: "Computer Science",
          start: "2018",
          end: "2022",
          details: ["Graduated with Honors"],
        },
      ],
    }));
  };

  const updateEducation = (index: number, field: keyof EducationEntry, value: any) => {
    setData((prev) => {
      const edu = [...prev.education];
      edu[index] = { ...edu[index], [field]: value };
      return { ...prev, education: edu };
    });
  };

  const removeEducation = (index: number) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  // AI Actions
  const handleEnhanceBullet = async (expIndex: number, bulletIndex: number) => {
    const key = `exp_${expIndex}_${bulletIndex}`;
    const rawBullet = data.experience[expIndex]?.bullets[bulletIndex];
    if (!rawBullet) return;

    setEnhancingBulletKey(key);
    setErrorMessage("");
    try {
      const company = data.experience[expIndex]?.company || "";
      const result = await aiEnhanceBullet(rawBullet, targetRole, `Role at ${company}`);
      updateBullet(expIndex, bulletIndex, result.enhanced);
      setStatusMessage(`✨ Enhanced bullet with action verb: "${result.actionVerb}"!`);
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      setErrorMessage("Could not enhance bullet: " + (err as Error).message);
    } finally {
      setEnhancingBulletKey(null);
    }
  };

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    setErrorMessage("");
    try {
      const res = await aiGenerateSummary(targetRole, data.experience, data.skills);
      setData((prev) => ({ ...prev, summary: res.summary }));
      setStatusMessage("✨ Generated executive summary tailored to your target role!");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      setErrorMessage("Could not generate summary: " + (err as Error).message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage("");
    try {
      if (savedResumeId) {
        const res = await updateResumeFromBuilder(savedResumeId, {
          data,
          targetRole,
          jobDescription,
        });
        setReport(res.report);
        setStatusMessage("✅ Resume updated successfully!");
        onSaved?.(savedResumeId);
      } else {
        const res = await createResumeFromBuilder({
          filename,
          targetRole,
          jobDescription,
          templateId,
          data,
        });
        setSavedResumeId(res.id);
        setReport(res.report);
        setStatusMessage("✅ Resume saved to your account!");
        onSaved?.(res.id);
      }
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      setErrorMessage("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (format: ResumeFormat) => {
    setDownloading(true);
    setErrorMessage("");
    try {
      if (savedResumeId) {
        await downloadResume(savedResumeId, format, filename, templateId);
      } else {
        await renderResumeDirect(data, format, templateId);
      }
    } catch (err) {
      setErrorMessage("Download failed: " + (err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const loadPreset = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      setData(preset.data);
      setTargetRole(preset.role);
      setStatusMessage(`✨ Loaded ${preset.role} template profile!`);
      setTimeout(() => setStatusMessage(""), 3500);
    }
  };

  const currentTemplate =
    INDUSTRY_TEMPLATES.find((t) => t.id === templateId) || INDUSTRY_TEMPLATES[0];

  return (
    <div className="rb-container">
      {/* ---------- Top Navigation Bar ---------- */}
      <header className="rb-topbar">
        <div className="rb-topbar-left">
          {onBack && (
            <button className="rb-btn-ghost" onClick={onBack}>
              ← Back
            </button>
          )}
          <div>
            <h1 className="rb-title">Resume Builder & Industry Templates</h1>
            <p className="rb-subtitle">
              Format your experience with recruiter-approved templates for top tech, finance & startups.
            </p>
          </div>
        </div>

        <div className="rb-topbar-actions">
          {/* View Toggles */}
          <div className="rb-view-toggle">
            <button
              className={activeTab === "edit" ? "active" : ""}
              onClick={() => setActiveTab("edit")}
            >
              ✏️ Editor
            </button>
            <button
              className={activeTab === "split" ? "active" : ""}
              onClick={() => setActiveTab("split")}
            >
              ◫ Split View
            </button>
            <button
              className={activeTab === "preview" ? "active" : ""}
              onClick={() => setActiveTab("preview")}
            >
              👁️ Preview
            </button>
          </div>

          <button
            className="rb-btn-secondary"
            onClick={() => handleDownload("docx")}
            disabled={downloading}
            title="Download Word Document (100% ATS Friendly)"
          >
            📄 DOCX
          </button>
          <button
            className="rb-btn-primary"
            onClick={() => handleDownload("pdf")}
            disabled={downloading}
            title="Download PDF in active template"
          >
            {downloading ? "Generating..." : "📥 Download PDF"}
          </button>
          <button
            className="rb-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "💾 Save"}
          </button>
          {savedResumeId && onMatchJobs && (
            <button
              className="rb-btn-match"
              onClick={() => onMatchJobs(savedResumeId)}
              title="Find live market openings matching this resume"
            >
              🚀 Match Jobs
            </button>
          )}
        </div>
      </header>

      {/* Status Messages */}
      {statusMessage && <div className="rb-alert success">{statusMessage}</div>}
      {errorMessage && <div className="rb-alert error">{errorMessage}</div>}

      {/* ---------- Template Selection Carousel / Grid ---------- */}
      <section className="rb-template-bar">
        <div className="rb-template-bar-header">
          <h3>Choose Industry Accepted Style</h3>
          <div className="rb-presets">
            <span className="rb-presets-label">Quick Starter Profiles:</span>
            <button onClick={() => loadPreset("fullstack")}>Full Stack Engineer</button>
            <button onClick={() => loadPreset("ai_engineer")}>AI / ML Engineer</button>
          </div>
        </div>

        <div className="rb-template-cards">
          {INDUSTRY_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className={`rb-template-card ${templateId === tpl.id ? "selected" : ""}`}
              onClick={() => setTemplateId(tpl.id)}
            >
              <div className="rb-tpl-badge">{tpl.badge}</div>
              <h4>{tpl.name}</h4>
              <div className="rb-tpl-category">{tpl.category}</div>
              <p>{tpl.description}</p>
              <div className="rb-tpl-footer">
                <span className="rb-tpl-font">🔤 {tpl.fontPreview}</span>
                <span
                  className="rb-tpl-color-dot"
                  style={{ backgroundColor: tpl.accentColor }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Main Workspace (Editor + Live Preview) ---------- */}
      <div className={`rb-workspace ${activeTab}`}>
        {/* LEFT COLUMN: The Interactive Editor Form */}
        {(activeTab === "edit" || activeTab === "split") && (
          <div className="rb-editor-panel">
            {/* Target Role & Filename */}
            <div className="rb-card">
              <h3>Role & Target Settings</h3>
              <div className="rb-grid-2">
                <label className="rb-field">
                  <span>Target Job Role</span>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Senior Backend Engineer"
                  />
                </label>
                <label className="rb-field">
                  <span>Resume Title / Filename</span>
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="e.g. Ayush_Jaiswal_Resume"
                  />
                </label>
              </div>
              <label className="rb-field" style={{ marginTop: "10px" }}>
                <span>Target Job Description (Optional - for ATS keyword coverage checks)</span>
                <textarea
                  rows={2}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste target job requirements to check keyword alignment..."
                />
              </label>
            </div>

            {/* Contact Information */}
            <div className="rb-card">
              <h3>Contact Details</h3>
              <div className="rb-grid-2">
                <label className="rb-field">
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={data.contact.name}
                    onChange={(e) => updateContact("name", e.target.value)}
                  />
                </label>
                <label className="rb-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={data.contact.email}
                    onChange={(e) => updateContact("email", e.target.value)}
                  />
                </label>
                <label className="rb-field">
                  <span>Phone</span>
                  <input
                    type="text"
                    value={data.contact.phone}
                    onChange={(e) => updateContact("phone", e.target.value)}
                  />
                </label>
                <label className="rb-field">
                  <span>Location</span>
                  <input
                    type="text"
                    value={data.contact.location}
                    onChange={(e) => updateContact("location", e.target.value)}
                  />
                </label>
              </div>
              <label className="rb-field" style={{ marginTop: "12px" }}>
                <span>Web Links (LinkedIn, GitHub, Portfolio - comma separated)</span>
                <input
                  type="text"
                  value={data.contact.links.join(", ")}
                  onChange={(e) =>
                    updateContact(
                      "links",
                      e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                    )
                  }
                />
              </label>
            </div>

            {/* Professional Summary */}
            <div className="rb-card">
              <div className="rb-card-header">
                <h3>Executive Professional Summary</h3>
                <button
                  className="rb-ai-action-btn"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? "✨ Writing..." : "✨ AI Write Summary"}
                </button>
              </div>
              <textarea
                rows={3}
                value={data.summary}
                onChange={(e) => setData({ ...data, summary: e.target.value })}
                placeholder="2-3 impactful sentences highlighting your experience, core domains, and technical leadership..."
              />
            </div>

            {/* Work Experience */}
            <div className="rb-card">
              <div className="rb-card-header">
                <h3>Work Experience</h3>
                <button className="rb-btn-small" onClick={addExperience}>
                  + Add Experience
                </button>
              </div>

              {data.experience.map((exp, expIdx) => (
                <div key={expIdx} className="rb-entry-block">
                  <div className="rb-entry-header">
                    <strong>
                      {exp.title} {exp.company ? `@ ${exp.company}` : ""}
                    </strong>
                    <button
                      className="rb-del-btn"
                      onClick={() => removeExperience(expIdx)}
                      title="Delete this role"
                    >
                      ×
                    </button>
                  </div>

                  <div className="rb-grid-2">
                    <label className="rb-field">
                      <span>Job Title</span>
                      <input
                        type="text"
                        value={exp.title}
                        onChange={(e) => updateExperience(expIdx, "title", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Company</span>
                      <input
                        type="text"
                        value={exp.company}
                        onChange={(e) => updateExperience(expIdx, "company", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Location</span>
                      <input
                        type="text"
                        value={exp.location}
                        onChange={(e) => updateExperience(expIdx, "location", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Dates (Start – End)</span>
                      <div className="rb-grid-2" style={{ gap: "6px" }}>
                        <input
                          type="text"
                          value={exp.start}
                          onChange={(e) => updateExperience(expIdx, "start", e.target.value)}
                          placeholder="2021"
                        />
                        <input
                          type="text"
                          value={exp.end}
                          onChange={(e) => updateExperience(expIdx, "end", e.target.value)}
                          placeholder="Present"
                        />
                      </div>
                    </label>
                  </div>

                  <div className="rb-bullets-section">
                    <span className="rb-subhead">
                      Impact Bullets (Google XYZ: Accomplished [X] by doing [Z] with metrics [Y])
                    </span>
                    {exp.bullets.map((b, bIdx) => {
                      const key = `exp_${expIdx}_${bIdx}`;
                      const isEnhancing = enhancingBulletKey === key;
                      return (
                        <div key={bIdx} className="rb-bullet-row">
                          <span className="rb-bullet-dot">•</span>
                          <textarea
                            rows={2}
                            value={b}
                            onChange={(e) => updateBullet(expIdx, bIdx, e.target.value)}
                          />
                          <button
                            className="rb-ai-btn"
                            onClick={() => handleEnhanceBullet(expIdx, bIdx)}
                            disabled={isEnhancing}
                            title="Rewrite in Google XYZ impact formula with metrics"
                          >
                            {isEnhancing ? "..." : "✨ AI"}
                          </button>
                          <button
                            className="rb-bullet-del"
                            onClick={() => removeBullet(expIdx, bIdx)}
                            title="Remove bullet"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    <button
                      className="rb-btn-link"
                      onClick={() => addBullet(expIdx)}
                    >
                      + Add Bullet
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Technical Skills */}
            <div className="rb-card">
              <div className="rb-card-header">
                <h3>Technical Skills Categories</h3>
                <button className="rb-btn-small" onClick={addSkillGroup}>
                  + Add Category
                </button>
              </div>

              {data.skills.map((skillGroup, sIdx) => (
                <div key={sIdx} className="rb-skill-row">
                  <input
                    type="text"
                    style={{ width: "30%" }}
                    value={skillGroup.label}
                    onChange={(e) => updateSkillCategory(sIdx, e.target.value)}
                    placeholder="Category (e.g. Languages)"
                  />
                  <input
                    type="text"
                    style={{ flex: 1 }}
                    value={skillGroup.items.join(", ")}
                    onChange={(e) => updateSkillItems(sIdx, e.target.value)}
                    placeholder="Comma-separated items (e.g. TypeScript, Python, Go)"
                  />
                  <button
                    className="rb-del-btn"
                    onClick={() => removeSkillGroup(sIdx)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Education */}
            <div className="rb-card">
              <div className="rb-card-header">
                <h3>Education</h3>
                <button className="rb-btn-small" onClick={addEducation}>
                  + Add Education
                </button>
              </div>

              {data.education.map((edu, eduIdx) => (
                <div key={eduIdx} className="rb-entry-block">
                  <div className="rb-entry-header">
                    <strong>
                      {edu.degree} {edu.field} – {edu.school}
                    </strong>
                    <button
                      className="rb-del-btn"
                      onClick={() => removeEducation(eduIdx)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="rb-grid-2">
                    <label className="rb-field">
                      <span>Degree</span>
                      <input
                        type="text"
                        value={edu.degree}
                        onChange={(e) => updateEducation(eduIdx, "degree", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Field of Study</span>
                      <input
                        type="text"
                        value={edu.field}
                        onChange={(e) => updateEducation(eduIdx, "field", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>University / School</span>
                      <input
                        type="text"
                        value={edu.school}
                        onChange={(e) => updateEducation(eduIdx, "school", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Years</span>
                      <div className="rb-grid-2" style={{ gap: "6px" }}>
                        <input
                          type="text"
                          value={edu.start}
                          onChange={(e) => updateEducation(eduIdx, "start", e.target.value)}
                          placeholder="2016"
                        />
                        <input
                          type="text"
                          value={edu.end}
                          onChange={(e) => updateEducation(eduIdx, "end", e.target.value)}
                          placeholder="2020"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* Projects */}
            <div className="rb-card">
              <div className="rb-card-header">
                <h3>Projects & Highlights</h3>
                <button className="rb-btn-small" onClick={addProject}>
                  + Add Project
                </button>
              </div>

              {data.projects.map((proj, pIdx) => (
                <div key={pIdx} className="rb-entry-block">
                  <div className="rb-entry-header">
                    <strong>{proj.name}</strong>
                    <button
                      className="rb-del-btn"
                      onClick={() => removeProject(pIdx)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="rb-grid-2">
                    <label className="rb-field">
                      <span>Project Name</span>
                      <input
                        type="text"
                        value={proj.name}
                        onChange={(e) => updateProject(pIdx, "name", e.target.value)}
                      />
                    </label>
                    <label className="rb-field">
                      <span>Technologies Used</span>
                      <input
                        type="text"
                        value={proj.tech}
                        onChange={(e) => updateProject(pIdx, "tech", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="rb-bullets-section">
                    <span className="rb-subhead">Key Details / Outcome:</span>
                    <textarea
                      rows={2}
                      value={proj.bullets[0] || ""}
                      onChange={(e) => updateProject(pIdx, "bullets", [e.target.value])}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: Real-Time Live Preview in Selected Template */}
        {(activeTab === "preview" || activeTab === "split") && (
          <div className="rb-preview-panel">
            {/* Live Metrics Header */}
            <div className="rb-metrics-strip">
              <div className="rb-metric-pill">
                <strong>Template:</strong> {currentTemplate.name}
              </div>
              <div className="rb-metric-pill">
                <strong>Quantified Bullets:</strong> {quantifiedPercent}%
              </div>
              {report && (
                <div className="rb-metric-pill score">
                  <strong>ATS Readiness:</strong> {report.score}/100
                </div>
              )}
            </div>

            {/* The A4 Canvas Sheet */}
            <div className={`rb-sheet rb-theme-${templateId}`}>
              {/* Header */}
              <div className="rb-paper-header">
                <h1 className="rb-paper-name">{data.contact.name || "Your Name"}</h1>
                <div className="rb-paper-contact">
                  {[
                    data.contact.email,
                    data.contact.phone,
                    data.contact.location,
                    ...data.contact.links,
                  ]
                    .filter(Boolean)
                    .join("  |  ")}
                </div>
              </div>

              {/* Summary */}
              {data.summary && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">SUMMARY</h2>
                  <p className="rb-paper-summary">{data.summary}</p>
                </section>
              )}

              {/* Skills */}
              {data.skills.length > 0 && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">TECHNICAL SKILLS</h2>
                  <div className="rb-paper-skills">
                    {data.skills.map((s, idx) => (
                      <div key={idx} className="rb-paper-skill-line">
                        <strong>{s.label}: </strong>
                        <span>{s.items.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Experience */}
              {data.experience.length > 0 && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">WORK EXPERIENCE</h2>
                  {data.experience.map((exp, idx) => (
                    <div key={idx} className="rb-paper-job">
                      <div className="rb-paper-job-row1">
                        <span className="rb-paper-job-title">{exp.title}</span>
                        <span className="rb-paper-job-dates">
                          {[exp.start, exp.end].filter(Boolean).join(" – ")}
                        </span>
                      </div>
                      <div className="rb-paper-job-row2">
                        <span className="rb-paper-job-company">{exp.company}</span>
                        <span className="rb-paper-job-location">{exp.location}</span>
                      </div>
                      <ul className="rb-paper-bullets">
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}

              {/* Projects */}
              {data.projects.length > 0 && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">PROJECTS</h2>
                  {data.projects.map((proj, idx) => (
                    <div key={idx} className="rb-paper-project">
                      <div className="rb-paper-project-title">
                        <strong>{proj.name}</strong>
                        {proj.tech && <span>  |  {proj.tech}</span>}
                      </div>
                      <ul className="rb-paper-bullets">
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}

              {/* Education */}
              {data.education.length > 0 && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">EDUCATION</h2>
                  {data.education.map((edu, idx) => (
                    <div key={idx} className="rb-paper-edu">
                      <div className="rb-paper-job-row1">
                        <strong>
                          {[edu.degree, edu.field].filter(Boolean).join(", ")} – {edu.school}
                        </strong>
                        <span className="rb-paper-job-dates">
                          {[edu.start, edu.end].filter(Boolean).join(" – ")}
                        </span>
                      </div>
                      {edu.details.length > 0 && (
                        <ul className="rb-paper-bullets">
                          {edu.details.map((d, dIdx) => (
                            <li key={dIdx}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Certifications & Achievements */}
              {(data.certifications.length > 0 || data.achievements.length > 0) && (
                <section className="rb-paper-section">
                  <h2 className="rb-paper-heading">HONORS & CERTIFICATIONS</h2>
                  <ul className="rb-paper-bullets">
                    {[...data.certifications, ...data.achievements].map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
