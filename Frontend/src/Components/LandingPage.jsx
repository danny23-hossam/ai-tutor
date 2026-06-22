import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/useAuth";
import "./LandingPage.css";

/* ── Framer Motion variants ─────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 1, 0.5, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ── Feature Data ───────────────────────────────────────── */
const features = [
  {
    icon: "bi-robot",
    color: "orange",
    title: "AI Tutor Chat",
    desc: "Get instant, personalized help from an AI tutor that understands your course material and answers questions in real-time.",
  },
  {
    icon: "bi-lightning-charge-fill",
    color: "purple",
    title: "Smart Flashcards",
    desc: "AI generates interactive flashcards from your lectures and notes, making memorization faster and retention stronger.",
  },
  {
    icon: "bi-play-circle-fill",
    color: "blue",
    title: "Video Summaries",
    desc: "Upload your lectures and get AI-generated video summaries and audio, so you can learn on the go.",
  },
  {
    icon: "bi-clipboard-data-fill",
    color: "green",
    title: "Quizzes & Exams",
    desc: "Test your knowledge with AI-generated quizzes and exams tailored to your learning material.",
  },
  {
    icon: "bi-bell-fill",
    color: "amber",
    title: "Smart Reminders",
    desc: "Never miss a study session. Set smart reminders and build a consistent learning streak.",
  },
  {
    icon: "bi-graph-up-arrow",
    color: "rose",
    title: "Progress Analytics",
    desc: "Track your study time, lesson completion, streaks, and quiz performance all in one dashboard.",
  },
];

/* ── Steps Data ─────────────────────────────────────────── */
const steps = [
  {
    num: 1,
    title: "Upload Your Material",
    desc: "Add lecture notes, PDFs, or slides. Papyrus understands any educational content.",
  },
  {
    num: 2,
    title: "AI Generates Content",
    desc: "Get summaries, flashcards, quizzes, audio lectures, and video explanations — automatically.",
  },
  {
    num: 3,
    title: "Learn & Track Progress",
    desc: "Study smarter with AI-powered tools and track your improvement with real-time analytics.",
  },
];

const LandingPage = () => {
  const { authStatus } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  // Apply saved dark mode preference
  useEffect(() => {
    if (localStorage.getItem("darkmode") === "true") {
      document.body.classList.add("darkmode");
    } else {
      document.body.classList.remove("darkmode");
    }
  }, []);

  // Scroll listener for sticky nav
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-page">
      <Helmet>
        {/* The Pipe symbol | looks cleaner in Google than a dash — */}
        <title>PapyrusAI | Your AI-Powered Study Companion</title>

        <meta
          name="description"
          content="Master any subject with Papyrus AI. Automatically generate smart flashcards, summaries, and interactive quizzes from your lectures. Study smarter, not harder."
        />

        <meta
          name="keywords"
          content="AI tutor, AI study tools, flashcard generator, lecture summarizer, Papyrus AI, exam preparation, online learning"
        />

        <link rel="canonical" href="https://papyrusai.me/" />

        {/* Open Graph (Facebook/LinkedIn) */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://papyrusai.me/" />
        <meta
          property="og:title"
          content="PapyrusAI | Your AI-Powered Study Companion"
        />
        <meta
          property="og:description"
          content="Transform your course materials into interactive lessons with AI. Summaries, flashcards, and quizzes in seconds."
        />
        <meta property="og:image" content="https://papyrusai.me/og-image.png" />
        <meta property="og:site_name" content="PapyrusAI" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@PapyrusAI" />
        <meta name="twitter:title" content="PapyrusAI | AI-Powered Learning" />
        <meta
          name="twitter:description"
          content="The ultimate AI tool for students. Generate study materials from your notes automatically."
        />
        <meta
          name="twitter:image"
          content="https://papyrusai.me/og-image.png"
        />
      </Helmet>

      {/* ═══ Navigation ═══════════════════════════════════════ */}
      <nav
        className={`landing-nav${scrolled ? " landing-nav--scrolled" : ""}`}
        aria-label="Main navigation"
      >
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand" aria-label="Papyrus home">
            <div className="landing-brand-logo" aria-hidden="true">
              P
            </div>
            <span className="landing-brand-name">Papyrus</span>
          </Link>

          <div className="landing-nav-actions">
            <Link to={authStatus === 'authed' ? "/home" : "/login"} className="landing-btn-ghost">
              {authStatus === 'authed' ? "Dashboard" : "Sign In"}
            </Link>
            {authStatus !== 'authed' && (
              <Link to="/register" className="landing-btn-primary">
                Get Started Free
                <i className="bi bi-arrow-right" aria-hidden="true"></i>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═════════════════════════════════════════════ */}
      <section className="landing-hero" aria-label="Hero">
        <motion.div
          className="landing-hero-inner"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} custom={0}>
            <div className="landing-hero-badge">
              <span
                className="landing-hero-badge-dot"
                aria-hidden="true"
              ></span>
              Powered by AI
            </div>
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1}>
            Learn Smarter,{" "}
            <span className="landing-hero-accent">Not Harder</span>
            <span className="sr-only"> with Papyrus AI Tutoring Platform</span>
          </motion.h1>

          <motion.p variants={fadeUp} custom={2}>
            Upload your lectures and let AI create summaries, flashcards,
            quizzes, and video explanations — so you can focus on what matters:
            understanding.
          </motion.p>

          <motion.div className="landing-hero-cta" variants={fadeUp} custom={3}>
            {authStatus === 'authed' ? (
              <Link
                to="/home"
                className="landing-btn-primary landing-btn-lg"
                id="hero-cta-dashboard"
              >
                Go to Dashboard
                <i className="bi bi-arrow-right" aria-hidden="true"></i>
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="landing-btn-primary landing-btn-lg"
                  id="hero-cta-register"
                >
                  Start Learning Free
                  <i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
                <Link
                  to="/login"
                  className="landing-btn-ghost landing-btn-lg"
                  id="hero-cta-login"
                >
                  I have an account
                </Link>
              </>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ Social Proof ════════════════════════════════════ */}
      <motion.section
        className="landing-trust"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        aria-label="Platform highlights"
      >
        <div className="landing-trust-inner">
          <motion.p className="landing-trust-label" variants={fadeUp}>
            Built for Students Who Want to Excel
          </motion.p>
          <div className="landing-trust-grid">
            {[
              { value: "AI", desc: "Powered Platform" },
              { value: "6+", desc: "Learning Tools" },
              { value: "24/7", desc: "AI Tutor Access" },
              { value: "100%", desc: "Free to Start" },
            ].map((item, i) => (
              <motion.div
                className="landing-trust-item"
                key={i}
                variants={fadeUp}
                custom={i}
              >
                <span className="landing-trust-value">{item.value}</span>
                <span className="landing-trust-desc">{item.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ═══ Features ════════════════════════════════════════ */}
      <section className="landing-features" id="features" aria-label="Features">
        <div className="landing-features-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
          >
            <motion.p className="landing-section-eyebrow" variants={fadeUp}>
              Features
            </motion.p>
            <motion.h2 className="landing-section-title" variants={fadeUp}>
              Everything You Need to Ace Your Studies
            </motion.h2>
            <motion.p className="landing-section-subtitle" variants={fadeUp}>
              From AI-generated content to smart analytics — Papyrus transforms
              how you learn.
            </motion.p>
          </motion.div>

          <motion.div
            className="landing-features-grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
          >
            {features.map((f, i) => (
              <motion.div
                className="landing-feature-card"
                key={i}
                variants={fadeUp}
                custom={i}
              >
                <div
                  className={`landing-feature-icon landing-feature-icon--${f.color}`}
                >
                  <i className={`bi ${f.icon}`} aria-hidden="true"></i>
                </div>
                <h3 className="landing-feature-title">{f.title}</h3>
                <p className="landing-feature-desc">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ How It Works ════════════════════════════════════ */}
      <section
        className="landing-how"
        id="how-it-works"
        aria-label="How it works"
      >
        <div className="landing-how-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
          >
            <motion.p className="landing-section-eyebrow" variants={fadeUp}>
              How It Works
            </motion.p>
            <motion.h2 className="landing-section-title" variants={fadeUp}>
              Start Learning in 3 Simple Steps
            </motion.h2>
            <motion.p className="landing-section-subtitle" variants={fadeUp}>
              Upload your material, and let Papyrus do the heavy lifting.
            </motion.p>
          </motion.div>

          <motion.div
            className="landing-steps-grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
          >
            {steps.map((s, i) => (
              <motion.div
                className="landing-step"
                key={i}
                variants={fadeUp}
                custom={i}
              >
                <div className="landing-step-number">{s.num}</div>
                <h3 className="landing-step-title">{s.title}</h3>
                <p className="landing-step-desc">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═════════════════════════════════════════════ */}
      <section className="landing-cta" aria-label="Call to action">
        <motion.div
          className="landing-cta-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
        >
          <motion.h2 className="landing-cta-title" variants={fadeUp}>
            Ready to Transform Your Learning?
          </motion.h2>
          <motion.p className="landing-cta-desc" variants={fadeUp} custom={1}>
            Join students who are studying smarter with Papyrus.
            <br />
            It's free to get started — no credit card required.
          </motion.p>
          <motion.div variants={fadeUp} custom={2}>
            <Link
              to="/register"
              className="landing-btn-white"
              id="cta-bottom-register"
            >
              Get Started Free
              <i className="bi bi-arrow-right" aria-hidden="true"></i>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ Footer ══════════════════════════════════════════ */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-footer-logo" aria-hidden="true">
              P
            </div>
            <span className="landing-footer-name">Papyrus</span>
          </div>
          <p className="landing-footer-copy">
            © {new Date().getFullYear()} Papyrus. All rights reserved.
          </p>
          <div className="landing-footer-links">
            <Link to={authStatus === 'authed' ? "/home" : "/login"} className="landing-footer-link">
              {authStatus === 'authed' ? "Dashboard" : "Sign In"}
            </Link>
            {authStatus !== 'authed' && (
              <Link to="/register" className="landing-footer-link">
                Sign Up
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
