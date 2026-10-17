const COURSE_CONFIG = [
  { code: "BUS101", title: "Business Mathematics", file: "bus101-business-mathematics.json", icon: "📐", accent: "Numbers, ratios and business decisions" },
  { code: "BUS102", title: "Statistics", file: "bus102-statistics.json", icon: "📊", accent: "Data, probability and interpretation" },
  { code: "BUS110", title: "Introduction to Business", file: "bus110-introduction-to-business.json", icon: "🏢", accent: "Organizations, markets and management" },
  { code: "BUS115", title: "Entrepreneurship and Small Business Management", file: "bus115-entrepreneurship.json", icon: "💡", accent: "Building and running a small business" },
];

const STORAGE_KEY = "studyhall.practice.v1";
const BANK_REVISION = "cleanup-20261018";
const ASSET_VERSION = "theme-20261018";
const COURSE_CHAPTERS = {
  BUS101: [
    { id: "bus101-ch01", number: 1, title: "Whole Numbers and Decimals", description: "Place value, rounding and decimal calculations." },
    { id: "bus101-ch02", number: 2, title: "Fractions", description: "Fraction types, divisibility, mixed numbers, calculations and decimal conversions." },
    { id: "bus101-ch03", number: 3, title: "Percents", description: "Percent conversions, part, base, rate, increases and decreases." },
    { id: "bus101-ch04", number: 4, title: "Equations and Formulas", description: "Solving equations, translating words into equations and application problems." },
    { id: "bus101-ch06", number: 6, title: "Payroll", description: "Wages, overtime and commission." },
    { id: "bus101-ch07", number: 7, title: "Mathematics of Buying", description: "Trade and chain discounts, invoices, payment dates and partial payments." },
    { id: "bus101-additional", number: null, title: "Additional practice", description: "Markup, spoilage and break-even questions." },
  ],
};
const app = document.querySelector("#app");
let banks = {};
let store = loadStore();
let currentCourseId = null;
let setupPrefs = null;
let topicSearch = "";
let toastTimer = null;

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeSession: parsed.activeSession || null,
      theme: parsed.theme === "dark" ? "dark" : "light",
      bankRevision: parsed.bankRevision || null,
    };
  } catch {
    return { progress: {}, sessions: [], activeSession: null, theme: "light" };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    showToast("Your browser could not save progress. Check its storage settings.");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function courseByCode(code) { return COURSE_CONFIG.find((course) => course.code === code); }
function getQuestions(code) { return banks[code] || []; }
function getCourseProgress(code) {
  if (!store.progress[code]) store.progress[code] = { questions: {} };
  if (!store.progress[code].questions) store.progress[code].questions = {};
  return store.progress[code].questions;
}
function questionFormats(question) {
  if (question.question_format === "matching") return "matching";
  const type = String(question.type || "").toLowerCase();
  return type === "mcq" || type === "multiple_choice" || type === "multiple-choice" ? "mcq" : "short";
}
function courseUsesChapters(code) { return Boolean(COURSE_CHAPTERS[code]?.length); }
function practiceGroupKey(code, question) {
  const chapters = COURSE_CHAPTERS[code];
  if (chapters) return chapters.some(chapter => chapter.id === question.chapter_id) ? question.chapter_id : "bus101-additional";
  return String(question.topic || "Other").trim() || "Other";
}
function getTopics(code) {
  const counts = new Map();
  for (const question of getQuestions(code)) {
    const topic = practiceGroupKey(code, question);
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  if (courseUsesChapters(code)) return COURSE_CHAPTERS[code].filter(chapter => counts.has(chapter.id)).map(chapter => ({ ...chapter, key: chapter.id, name: chapter.number ? `Chapter ${chapter.number}: ${chapter.title}` : chapter.title, count: counts.get(chapter.id) }));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })).map(([name, count]) => ({ key: name, name, count }));
}
function statsForQuestions(code, questions) {
  const progress = getCourseProgress(code);
  let attempts = 0, correct = 0, wrong = 0;
  for (const question of questions) {
    const record = progress[question.id];
    if (!record || !Array.isArray(record.attempts)) continue;
    for (const attempt of record.attempts) {
      if (typeof attempt.correct !== 'boolean') continue;
      attempts += 1;
      if (attempt.correct) correct += 1;
      else if (attempt.correct === false) wrong += 1;
    }
  }
  return { attempts, correct, wrong, accuracy: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null };
}
function courseStats(code) {
  const questions = getQuestions(code);
  const progress = getCourseProgress(code);
  const attempted = questions.filter((question) => progress[question.id]?.attempts?.some(a=>typeof a.correct==='boolean')).length;
  const stats = statsForQuestions(code, questions);
  const mcqCount = questions.filter((question) => questionFormats(question) === "mcq").length;
  const matchingCount = questions.filter((question) => questionFormats(question) === "matching").length;
  return { total: questions.length, attempted, remaining: Math.max(0, questions.length - attempted), accuracy: stats.accuracy, mcqCount, matchingCount, shortCount: questions.length - mcqCount - matchingCount };
}
function overallStats() {
  let courses = 0, attempted = 0, total = 0, correct = 0, wrong = 0;
  for (const course of COURSE_CONFIG) {
    const stats = courseStats(course.code);
    total += stats.total; attempted += stats.attempted;
    if (stats.attempted) courses += 1;
    const courseAttempts = statsForQuestions(course.code, getQuestions(course.code));
    correct += courseAttempts.correct; wrong += courseAttempts.wrong;
  }
  return { courses, attempted, total, accuracy: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null };
}
function pct(accuracy) { return accuracy == null ? "—" : `${accuracy}%`; }

function applyTheme() {
  const dark = store.theme === "dark";
  document.body.classList.toggle("dark-mode", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  const icon = document.querySelector("#theme-icon");
  if (icon) icon.textContent = dark ? "☀" : "☾";
  const toggle = document.querySelector('[data-action="theme"]');
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101714" : "#f4f5f1");
}

function renderHome() {
  currentCourseId = null;
  const overall = overallStats();
  const courseCards = COURSE_CONFIG.map((course) => {
    const stats = courseStats(course.code);
    return `<button class="course-card" data-action="open-course" data-course="${course.code}">
      <div class="course-top"><span class="course-code">${course.code}</span><span class="course-icon">${course.icon}</span></div>
      <h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.accent)}</p>
      <div class="course-stats"><span><strong>${stats.attempted}</strong> answered</span><span><strong>${stats.remaining}</strong> not yet attempted</span><span><strong>${pct(stats.accuracy)}</strong> accuracy</span></div>
      <div class="progress-track" aria-label="${stats.attempted} of ${stats.total} questions attempted"><div class="progress-fill" style="width:${stats.total ? Math.round(stats.attempted / stats.total * 100) : 0}%"></div></div>
    </button>`;
  }).join("");

  const recent = store.sessions.slice(0, 3);
  const recentHtml = recent.length ? `<section class="result-section"><div class="section-heading"><div><h2>Recent practice</h2><p>Your latest sessions on this device.</p></div></div><div class="review-list">${recent.map((session) => {
    const course = courseByCode(session.course);
    const date = session.finishedAt ? new Date(session.finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
    return `<div class="review-card"><h3>${escapeHtml(course?.code || session.course)} · ${escapeHtml(course?.title || "Course")}</h3><p>${session.correct} correct · ${session.wrong} to review · ${session.unanswered} skipped · ${escapeHtml(date)}</p></div>`;
  }).join("")}</div></section>` : "";

  app.innerHTML = `<section class="page-heading"><span class="eyebrow">Study Hall</span><h1>Practice by course</h1><p>Choose a course to set up your practice.</p></section>
    <section class="welcome-grid" aria-label="Overall progress">
      <div class="stat-card"><span class="stat-label">Questions practiced</span><strong>${overall.attempted}<small class="muted" style="font-size:13px;font-weight:600"> / ${overall.total}</small></strong></div>
      <div class="stat-card"><span class="stat-label">Courses started</span><strong>${overall.courses}<small class="muted" style="font-size:13px;font-weight:600"> / ${COURSE_CONFIG.length}</small></strong></div>
      <div class="stat-card"><span class="stat-label">Accuracy across attempts</span><strong>${pct(overall.accuracy)}</strong></div>
    </section>
    <div class="section-heading"><div><h2>Your courses</h2><p>See what you have attempted and what is still new.</p></div><button class="text-button" data-action="reset-progress">Reset this device’s progress</button></div>
    <section class="course-grid">${courseCards}</section>
    <aside class="notice"><span class="notice-icon">✳</span><p>Drawing exercises are for practice on paper. Their model answers are shown so you can compare and mark your own work.</p></aside>
    ${recentHtml}`;
  app.focus();
}

function ensureSetupPrefs(code) {
  const topics = getTopics(code).map((item) => item.key);
  if (!setupPrefs || setupPrefs.code !== code) setupPrefs = { code, topics: new Set(topics), formats: new Set(["mcq", "matching", "short"]), count: Math.min(20, getQuestions(code).length) };
}

function selectedPool(code) {
  ensureSetupPrefs(code);
  const selectedTopics = setupPrefs.topics;
  const selectedFormats = setupPrefs.formats;
  return getQuestions(code).filter((question) => selectedTopics.has(practiceGroupKey(code, question)) && selectedFormats.has(questionFormats(question)));
}

function renderTopicList(code) {
  const root = document.querySelector("#topic-list");
  if (!root) return;
  const topics = getTopics(code).filter((topic) => topic.name.toLowerCase().includes(topicSearch.toLowerCase()));
  const progress = getCourseProgress(code);
  const chapterMode = courseUsesChapters(code);
  if (!topics.length) { root.innerHTML = `<div class="empty-filter">No ${chapterMode ? "chapters" : "topics"} match “${escapeHtml(topicSearch)}”.</div>`; return; }
  root.innerHTML = topics.map((topic) => {
    const topicQuestions = getQuestions(code).filter((question) => practiceGroupKey(code, question) === topic.key);
    const done = topicQuestions.filter((question) => progress[question.id]?.attempts?.some(a=>typeof a.correct==='boolean')).length;
    const stats = statsForQuestions(code, topicQuestions);
    const checked = setupPrefs.topics.has(topic.key) ? "checked" : "";
    const title = chapterMode ? `<span class="chapter-title">${topic.number ? `<span class="chapter-number">Chapter ${topic.number}</span> ` : ""}${escapeHtml(topic.title)}</span><small class="chapter-description">${escapeHtml(topic.description)}</small>` : escapeHtml(topic.name);
    return `<label class="topic-row ${chapterMode ? "chapter-row" : ""}"><input type="checkbox" data-action="topic-toggle" data-topic="${escapeHtml(topic.key)}" ${checked}/><span class="topic-name">${title}<small class="topic-progress">${done} of ${topic.count} attempted · ${pct(stats.accuracy)} accuracy</small></span><span class="topic-count">${topic.count} Q</span></label>`;
  }).join("");
}

function updateSetupCounts(code) {
  const pool = selectedPool(code);
  const mcq = pool.filter((question) => questionFormats(question) === "mcq").length;
  const matching = pool.filter((question) => questionFormats(question) === "matching").length;
  const short = pool.length - mcq - matching;
  const countInput = document.querySelector("#question-count");
  if (countInput) {
    countInput.max = String(Math.max(pool.length, 1));
    countInput.value = String(Math.min(Math.max(1, Number(setupPrefs.count) || 1), Math.max(pool.length, 1)));
    setupPrefs.count = Number(countInput.value);
  }
  const count = document.querySelector("#selected-count");
  if (count) count.innerHTML = `<strong>${pool.length}</strong><span>${mcq} multiple choice · ${matching} matching · ${short} short answer</span>`;
  const start = document.querySelector("#start-practice");
  if (start) start.disabled = pool.length === 0;
  const helper = document.querySelector("#count-hint");
  if (helper) helper.textContent = pool.length ? `Choose up to ${pool.length} questions from your selection.` : `Select at least one ${courseUsesChapters(code) ? "chapter" : "topic"} and question type to continue.`;
}

function renderCourse(code) {
  currentCourseId = code;
  ensureSetupPrefs(code);
  const course = courseByCode(code);
  const questions = getQuestions(code);
  const stats = courseStats(code);
  const wrongQuestions = questions.filter((question) => getCourseProgress(code)[question.id]?.everWrong);
  const mcqAll = questions.filter((question) => questionFormats(question) === "mcq").length;
  const matchingAll = questions.filter((question) => questionFormats(question) === "matching").length;
  const shortAll = questions.length - mcqAll - matchingAll;
  const chapterMode = courseUsesChapters(code);
  const groupLabel = chapterMode ? "chapters" : "topics";
  topicSearch = "";
  app.innerHTML = `<button class="back-link" data-action="home">← All courses</button>
    <div class="course-intro"><div><span class="eyebrow">${course.code} · Course practice</span><h1>${escapeHtml(course.title)}</h1><p>${escapeHtml(course.accent)}. Choose any mix of ${groupLabel} and question types, or practice the whole course.</p></div>${wrongQuestions.length ? `<button class="secondary-button review-link" data-action="review-course" data-course="${course.code}">↻ Review missed questions (${wrongQuestions.length})</button>` : ""}</div>
    <div class="course-stats" style="margin-bottom:20px"><span><strong>${stats.attempted}</strong> attempted</span><span><strong>${stats.remaining}</strong> not yet attempted</span><span><strong>${pct(stats.accuracy)}</strong> accuracy across attempts</span></div>
    <div class="setup-grid">
      <section class="panel"><div class="panel-header"><h2>1. Choose ${groupLabel}</h2><div><button class="link-button" data-action="select-topics" data-value="all">Select all</button><button class="link-button" data-action="select-topics" data-value="none">Clear</button></div></div>
        ${chapterMode ? '<p class="chapter-intro">Choose one chapter, several chapters, or select all for the whole course.</p>' : '<div class="topic-tools"><input class="search-input" id="topic-search" type="search" placeholder="Find a topic" autocomplete="off" /></div>'}<div class="topic-list ${chapterMode ? "chapter-list" : ""}" id="topic-list"></div>
      </section>
      <aside class="panel"><div class="panel-header"><h2>2. Set up practice</h2></div>
        <div class="format-group">
          <label class="format-option"><input type="checkbox" data-action="format-toggle" data-format="mcq" ${setupPrefs.formats.has("mcq") ? "checked" : ""}/><span><strong>Multiple choice</strong><span>${mcqAll} questions in this course</span></span></label>
          <label class="format-option"><input type="checkbox" data-action="format-toggle" data-format="matching" ${setupPrefs.formats.has("matching") ? "checked" : ""}/><span><strong>Matching</strong><span>${matchingAll} questions in this course</span></span></label>
          <label class="format-option"><input type="checkbox" data-action="format-toggle" data-format="short" ${setupPrefs.formats.has("short") ? "checked" : ""}/><span><strong>Short answer</strong><span>${shortAll} questions in this course</span></span></label>
        </div>
        <label class="field-label" for="question-count">Questions in this session</label><input class="number-input" id="question-count" type="number" min="1" max="${questions.length}" value="${Math.min(20, questions.length)}" />
        <p class="count-hint" id="count-hint"></p>
        <div class="summary-box" id="selected-count"></div>
        <button class="primary-button full-width" id="start-practice" data-action="start-practice" data-course="${course.code}">Start practice →</button>
        <p class="light-note">Question order is shuffled. Progress is stored in this browser only.</p>
      </aside>
    </div>`;
  renderTopicList(code);
  updateSetupCounts(code);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matchingChoiceLabels(question) {
  const options = question.options || [];
  const correctLabel = answerStrings(question).map((answer) => options.find((option) => normalizeAnswer(option.label) === normalizeAnswer(answer))?.label).find(Boolean);
  const distractors = shuffle(options.filter((option) => option.label !== correctLabel)).slice(0, 3).map((option) => option.label);
  return shuffle([correctLabel, ...distractors].filter(Boolean));
}

function startSession(code, sourceQuestions, isReview = false, previousHintUsedIds = []) {
  const questions = shuffle(sourceQuestions);
  if (!questions.length) { showToast("No questions are available for that selection yet."); return; }
  const prefs = setupPrefs?.code === code ? setupPrefs : null;
  const desiredCount = isReview ? questions.length : Math.max(1, Number(prefs?.count) || 20);
  const selected = questions.slice(0, Math.min(desiredCount, questions.length));
  const matchingOptionLabels = Object.fromEntries(selected.filter((question) => questionFormats(question) === "matching").map((question) => [question.id, matchingChoiceLabels(question)]));
  store.activeSession = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, course: code, questionIds: selected.map((question) => question.id), index: 0, answers: {}, matchingOptionLabels, hintUsedIds: [], previousHintUsedIds, review: isReview, startedAt: new Date().toISOString() };
  persist();
  renderQuestion();
}

function currentSessionQuestion() {
  const session = store.activeSession;
  if (!session) return null;
  const questions = getQuestions(session.course);
  const id = session.questionIds[session.index];
  return questions.find((question) => String(question.id) === String(id)) || null;
}

function answerStrings(question) {
  const value = question.answer?.value;
  const accepted = Array.isArray(question.answer?.accepted_values) ? question.answer.accepted_values : [];
  return [...new Set([value, ...accepted].filter((item) => item != null && String(item).trim() !== "").map(String))];
}
function answerDisplayStrings(question) {
  const answers = answerStrings(question);
  if (!["matching", "mcq"].includes(questionFormats(question))) return answers;
  return answers.map((answer) => {
    const option = question.options?.find((option) => normalizeAnswer(option.label) === normalizeAnswer(answer));
    if (!option) return answer;
    return questionFormats(question) === "matching" ? option.text : `${option.label}: ${option.text}`;
  });
}

function normalizeAnswer(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().trim()
    .replace(/\$/g, "").replace(/,/g, "").replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ").replace(/[.!?;:]$/, "").trim();
}

const SHORT_ANSWER_CONFIDENCE_THRESHOLD = 0.8;
const SHORT_ANSWER_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "that", "this", "with"]);
const SHORT_ANSWER_SYNONYMS = new Map([
  ["new", "innovative"], ["innovatively", "innovative"], ["innovation", "innovative"],
  ["creates", "create"], ["creating", "create"], ["created", "create"],
  ["introduces", "introduce"], ["introducing", "introduce"], ["introduced", "introduce"],
  ["jobs", "job"], ["products", "product"], ["services", "service"],
]);

function answerMeaningTokens(value) {
  const words = String(value ?? "").normalize("NFKD").toLocaleLowerCase()
    .replace(/[’‘]/g, "'").match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(words.map((token) => SHORT_ANSWER_SYNONYMS.get(token) || token)
    .filter((token) => !SHORT_ANSWER_STOP_WORDS.has(token)));
}

function shortAnswerConfidence(response, question) {
  const responseNormalized = normalizeAnswer(response);
  const accepted = answerStrings(question);
  if (accepted.some((answer) => normalizeAnswer(answer) === responseNormalized)) return 1;

  const responseTokens = answerMeaningTokens(response);
  if (!responseTokens.size) return 0;
  return Math.max(0, ...accepted.map((answer) => {
    if (hasWordingConflict(response, answer)) return 0;
    const answerTokens = answerMeaningTokens(answer);
    if (!answerTokens.size) return 0;
    const shared = [...responseTokens].filter((token) => answerTokens.has(token)).length;
    return (2 * shared) / (responseTokens.size + answerTokens.size);
  }));
}

// Similar wording is not a semantic probability. Contradictions always need human review.
function hasWordingConflict(response, answer) {
  const clean = (value) => normalizeAnswer(value).replace(/\bcan't\b/g, 'cannot').replace(/n['’]t\b/g, ' not');
  const actual = clean(response), expected = clean(answer);
  const riskWords = /\b(?:no|not|never|none|neither|without|except|cannot|false|wrong|incorrect|always|only|impossible)\b/g;
  const markers = (value) => (value.match(riskWords) || []).sort().join('|');
  if (markers(actual) !== markers(expected)) return true;
  const numbers = (value) => (value.match(/\d+(?:\.\d+)?%?/g) || []).sort().join('|');
  if (numbers(actual) !== numbers(expected)) return true;
  const opposites = [['increase','decrease'], ['higher','lower'], ['profit','loss'], ['assets','liabilities'], ['buyer','seller'], ['franchisor','franchisee'], ['franchiser','franchisee']];
  return opposites.some((pair) => pair.some((word, index) => new RegExp(`\\b${word}\\b`).test(actual) && !new RegExp(`\\b${word}\\b`).test(expected) && new RegExp(`\\b${pair[1-index]}\\b`).test(expected)));
}

function showSelfAssessment(question, response, button, prompt) {
  const answers = answerStrings(question);
  const explanation = question.explanation ? `<div class="explanation"><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</div>` : "";
  const answer = answers.length ? answers.join("\n\n") : "No model answer was supplied for this question.";
  const container = document.querySelector(".text-answer-form");
  if (container) container.insertAdjacentHTML("beforeend", `<div class="answer-feedback self"><span class="feedback-title">${escapeHtml(prompt)}</span><p>Compare your response with the model answer and explanation, then choose how to mark it.</p><div class="model-answer">${escapeHtml(answer)}</div>${explanation}<div class="control-group" style="margin-top:12px"><button class="primary-button" data-action="self-mark" data-value="true">I got it right</button><button class="secondary-button" data-action="self-mark" data-value="false">I need to review it</button></div></div>`);
  button.disabled = true;
  button.textContent = "Compare with model answer";
}

function isLongAnswer(question) {
  return questionFormats(question) === "short" && question.grading?.mode !== "fixed" && Math.max(...answerStrings(question).map((answer) => answer.length), 0) > 115;
}

function explanationHtml(question) {
  return question.explanation ? `<div class="explanation"><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</div>` : "";
}

function renderDataTable(table) {
  return `<div class="table-scroll" tabindex="0"><table class="question-data-table">${table.caption ? `<caption>${escapeHtml(table.caption)}</caption>` : ''}<thead><tr>${table.headers.map(h=>`<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((cell,index)=>index===0?`<th scope="row">${escapeHtml(cell)}</th>`:`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderDiagram(diagram) {
  if (!diagram) return '';
  if (diagram.kind === 'porter') return `<figure class="model-diagram porter-diagram" aria-label="Porter's five competitive forces"><div class="porter-top">Threat of new entrants<br><span aria-hidden="true">↓</span></div><div class="porter-middle"><div>Supplier bargaining power <span aria-hidden="true">→</span></div><strong>Rivalry among<br>existing competitors</strong><div><span aria-hidden="true">←</span> Buyer bargaining power</div></div><div class="porter-bottom"><span aria-hidden="true">↑</span><br>Threat of substitutes</div><figcaption>All four outside forces put pressure on the industry at the centre.</figcaption></figure>`;
  if (diagram.kind === 'venn') return `<figure class="model-diagram"><svg viewBox="0 0 520 240" role="img" aria-label="Venn diagram: drama only ${diagram.left}, both ${diagram.both}, social only ${diagram.right}, neither ${diagram.neither}"><rect x="10" y="10" width="500" height="220" rx="8" fill="none" stroke="currentColor"/><circle cx="205" cy="118" r="85" fill="var(--diagram-fill, #e6f4ed)" stroke="currentColor"/><circle cx="315" cy="118" r="85" fill="var(--diagram-fill, #e6f4ed)" fill-opacity=".6" stroke="currentColor"/><g fill="currentColor" text-anchor="middle" font-size="18"><text x="168" y="40">Drama</text><text x="352" y="40">Social</text><text x="175" y="125">${diagram.left}</text><text x="260" y="125">${diagram.both}</text><text x="345" y="125">${diagram.right}</text><text x="449" y="211">${diagram.neither}</text></g></svg><figcaption>The number outside the circles belongs to neither club.</figcaption></figure>`;
  if (diagram.kind === 'boxplot') {
    const [min,q1,median,q3,max] = diagram.values;
    const pad=(max-min)*.12||1, low=min-pad, high=max+pad;
    const x=v=>45+(v-low)/(high-low)*510;
    return `<figure class="model-diagram"><svg viewBox="0 0 600 190" role="img" aria-label="Box plot: minimum ${min}, Q1 ${q1}, median ${median}, Q3 ${q3}, maximum ${max}"><g stroke="currentColor" fill="none" stroke-width="2"><path d="M${x(min)} 65 H${x(max)} M${x(min)} 45 V85 M${x(max)} 45 V85"/><rect x="${x(q1)}" y="35" width="${x(q3)-x(q1)}" height="60" fill="var(--diagram-fill, #e6f4ed)"/><path d="M${x(median)} 35 V95 M45 132 H555"/></g>${diagram.values.map((v,i)=>`<g fill="currentColor" stroke="currentColor"><path d="M${x(v)} 128 V137"/><text x="${x(v)}" y="${i%2?178:157}" stroke="none" text-anchor="middle" font-size="15">${escapeHtml(v)}</text></g>`).join('')}</svg><figcaption>Whiskers show the minimum and maximum; the box spans Q1 to Q3.</figcaption></figure>`;
  }
  if (diagram.kind === 'ogive') {
    const maxX=Math.max(...diagram.points.map(p=>p[0])),maxY=Math.max(...diagram.points.map(p=>p[1]));
    const x=v=>65+v/maxX*470,y=v=>260-v/maxY*220;
    return `<figure class="model-diagram"><svg viewBox="0 0 600 330" role="img" aria-label="Cumulative frequency polygon through ${diagram.points.map(p=>p.join(',')).join('; ')}"><path d="M65 30 V260 H550" stroke="currentColor" fill="none"/><polyline points="${diagram.points.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}" stroke="currentColor" stroke-width="3" fill="none"/>${diagram.points.map(p=>`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4" fill="currentColor"/><text x="${x(p[0])}" y="${y(p[1])-10}" fill="currentColor" text-anchor="middle" font-size="14">(${p.join(', ')})</text>`).join('')}<text x="300" y="310" text-anchor="middle" fill="currentColor">${escapeHtml(diagram.xLabel)}</text><text transform="translate(20 155) rotate(-90)" text-anchor="middle" fill="currentColor">${escapeHtml(diagram.yLabel)}</text></svg><figcaption>Join consecutive cumulative totals with straight lines.</figcaption></figure>`;
  }
  return '';
}

function questionContentHtml(question) {
  const p = question.presentation;
  if (!p) return `<div class="question-text">${escapeHtml(question.question)}</div>`;
  return `<div class="question-introduction">${escapeHtml(p.introduction)}</div>${(p.tables||[]).map(renderDataTable).join('')}${renderDiagram(p.diagram)}<div class="question-text">${escapeHtml(p.prompt)}</div>`;
}

function modelAnswerHtml(question) {
  return question.answer_table ? renderDataTable(question.answer_table) : `<div class="model-answer"><strong>Answer:</strong> ${escapeHtml(answerDisplayStrings(question).join(' / '))}</div>${renderDiagram(question.model_diagram)}`;
}

function saveAnswer(question, response, correct, selfAssessed = false) {
  const session = store.activeSession;
  const courseProgress = getCourseProgress(session.course);
  const previous = courseProgress[question.id] || { attempts: [], everWrong: false };
  const attempt = { response: String(response ?? ""), correct: Boolean(correct), selfAssessed, gradingRevision: BANK_REVISION, at: new Date().toISOString() };
  previous.attempts.push(attempt);
  if (attempt.correct === false) previous.everWrong = true;
  previous.lastCorrect = attempt.correct;
  courseProgress[question.id] = previous;
  session.answers[question.id] = attempt;
  persist();
}

function attemptFeedback(question, attempt) {
  if (!attempt) return "";
  const correctAnswers = answerDisplayStrings(question);
  const answerMarkup = correctAnswers.length ? modelAnswerHtml(question) : "";
  const explain = explanationHtml(question);
  if (attempt.selfAssessed) {
    return `<div class="answer-feedback ${attempt.correct ? "correct" : "incorrect"}"><span class="feedback-title">${attempt.correct ? "Marked correct — nice work." : "Added to your review list."}</span>${answerMarkup}${explain}</div>`;
  }
  return `<div class="answer-feedback ${attempt.correct ? "correct" : "incorrect"}"><span class="feedback-title">${attempt.correct ? "Correct!" : "Not quite. Review the answer below."}</span>${answerMarkup}${explain}</div>`;
}

function renderQuestion() {
  const session = store.activeSession;
  if (!session) { renderHome(); return; }
  const question = currentSessionQuestion();
  if (!question) { store.activeSession = null; persist(); renderHome(); return; }
  const course = courseByCode(session.course);
  const savedAnswer = session.answers?.[question.id];
  const progressPct = Math.round((session.index + 1) / session.questionIds.length * 100);
  const sessionAnswered = Object.keys(session.answers || {}).length;
  const format = questionFormats(question);
  const typeName = question.practice_mode === "drawing" ? "Drawing practice" : format === "matching" ? "Matching" : format === "mcq" ? "Multiple choice" : "Short answer";
  const sourceWarning = question.student_notice ? `<aside class="source-flag">${escapeHtml(question.student_notice)}</aside>` : "";
  const previousHintNote = (session.previousHintUsedIds || []).some((id) => String(id) === String(question.id))
    ? `<aside class="hint-used-note">💡 You used a hint on this question in your previous attempt.</aside>` : "";
  const options = format === "matching" ? renderMatchingQuestion(question, savedAnswer) : format === "mcq" ? `<div class="options-list">${(question.options || []).map((option, index) => {
    const label = option.label || String.fromCharCode(65 + index);
    let stateClass = "";
    if (savedAnswer) {
      const selected = normalizeAnswer(savedAnswer.response) === normalizeAnswer(label);
      const expected = answerStrings(question).some((answer) => normalizeAnswer(answer) === normalizeAnswer(label));
      if (expected) stateClass = "correct";
      else if (selected) stateClass = "incorrect";
    }
    return `<button class="answer-option ${stateClass}" data-action="answer-mcq" data-label="${escapeHtml(label)}" ${savedAnswer ? "disabled" : ""}><span class="option-label">${escapeHtml(label)}</span><span>${escapeHtml(option.text || "")}</span></button>`;
  }).join("")}</div>` : renderShortAnswer(question, savedAnswer);
  const feedback = savedAnswer ? attemptFeedback(question, savedAnswer) : "";
  const showHint = question.hint ? `<details class="hint-details"><summary>💡 Show hint</summary><p>${escapeHtml(question.hint)}</p></details>` : `<details class="hint-details"><summary>💡 Hint</summary><p>No hint is available for this question.</p></details>`;

  app.innerHTML = `<div class="quiz-topline"><div class="quiz-course"><span class="course-icon">${course.icon}</span><div><h2>${escapeHtml(course.code)} · ${escapeHtml(course.title)}</h2><small>${session.review ? "Reviewing missed questions" : escapeHtml(question.topic || "Practice")}</small></div></div><div class="quiz-meta"><span>✓ ${sessionAnswered} answered</span><span>Q ${session.index + 1} / ${session.questionIds.length}</span></div></div>
    <div class="quiz-progress"><div class="progress-fill" style="width:${progressPct}%"></div></div>
    <section class="question-card"><div class="question-number"><span>Question ${session.index + 1} of ${session.questionIds.length} · ${escapeHtml(question.topic || "General")}</span><span class="question-type">${typeName}</span></div>
      ${sourceWarning}${previousHintNote}${questionContentHtml(question)}${options}${feedback}${showHint}
      <div class="quiz-controls"><div class="control-group"><button class="secondary-button" data-action="previous-question" ${session.index === 0 ? "disabled" : ""}>← Previous</button><button class="secondary-button" data-action="next-question">${session.index === session.questionIds.length - 1 ? "Finish →" : "Next →"}</button></div><button class="text-button" data-action="finish-session">Finish session</button></div>
    </section>`;
}

function renderMatchingQuestion(question, savedAnswer) {
  const session = store.activeSession;
  session.matchingOptionLabels ||= {};
  if (!session.matchingOptionLabels[question.id]) {
    session.matchingOptionLabels[question.id] = matchingChoiceLabels(question);
    persist();
  }
  const choices = (session.matchingOptionLabels[question.id] || []).map((sourceLabel, index) => {
    const option = (question.options || []).find((item) => normalizeAnswer(item.label) === normalizeAnswer(sourceLabel));
    if (!option) return "";
    const selected = savedAnswer && [option.label, option.text].some((value) => normalizeAnswer(savedAnswer.response) === normalizeAnswer(value));
    const expected = answerStrings(question).some((answer) => normalizeAnswer(answer) === normalizeAnswer(option.label));
    const stateClass = savedAnswer ? expected ? "correct" : selected ? "incorrect" : "" : "";
    const displayLabel = String.fromCharCode(65 + index);
    return `<button class="answer-option ${stateClass}" data-action="answer-matching" data-label="${escapeHtml(option.label)}" data-option-text="${escapeHtml(option.text || "")}" ${savedAnswer ? "disabled" : ""}><span class="option-label">${displayLabel}</span><span>${escapeHtml(option.text || "")}</span></button>`;
  }).join("");
  return `${question.matching_instruction ? `<p class="matching-instruction">${escapeHtml(question.matching_instruction)}</p>` : ""}<div class="options-list">${choices}</div>`;
}

function renderShortAnswer(question, savedAnswer) {
  if (question.practice_mode === 'drawing') {
    return `<div class="text-answer-form drawing-practice"><aside class="practice-notice"><strong>Practise this drawing on your own, on paper.</strong><p>This site cannot check a drawing. The correct model is shown below so you can compare your work. It counts towards your score only after you choose a marking button.</p></aside>${savedAnswer?'':`<section class="drawing-model"><h3>Model answer</h3>${modelAnswerHtml(question)}${explanationHtml(question)}<p>After practising, choose how to mark your attempt:</p><div class="control-group"><button class="primary-button" data-action="self-mark" data-value="true">I got it right</button><button class="secondary-button" data-action="self-mark" data-value="false">I need to review it</button></div></section>`}</div>`;
  }
  if (question.response_fields) {
    const values=savedAnswer?.response.split(';').map(s=>s.trim())||[];
    const field=(index)=>`<input class="answer-cell" type="text" inputmode="decimal" id="response-field-${index}" aria-label="${escapeHtml(question.response_fields[index].label)}" value="${escapeHtml(values[index]||'')}" ${savedAnswer?'disabled':''}/>`;
    const inputs=question.response_table ? `<div class="table-scroll" tabindex="0"><table class="question-data-table response-table"><caption>Fill the calculated columns</caption><thead><tr>${question.response_table.headers.map(h=>`<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${question.response_table.rows.map(row=>`<tr>${row.map(c=>`<td>${typeof c==='object'?field(c.field):escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="response-fields">${question.response_fields.map((f,i)=>`<label for="response-field-${i}">${escapeHtml(f.label)}${field(i)}</label>`).join('')}</div>`;
    return `<div class="text-answer-form">${inputs}${savedAnswer?'':'<button class="primary-button" data-action="submit-short-answer">Check answer</button>'}</div>`;
  }
  if (question.grading?.mode === "fixed") {
    const hasAnswer = answerStrings(question).length > 0;
    const formatNote = question.grading?.multipleResults ? `<p class="muted" style="margin:0;font-size:13px">Enter all requested results in order, separated by semicolons.</p>` : "";
    const unavailable = !hasAnswer ? `<p class="source-flag">This question is missing a verified answer key and cannot be scored.</p>` : "";
    return `<div class="text-answer-form"><label class="field-label" for="short-response" style="margin-top:0">Your answer</label>${formatNote}<textarea class="answer-input" id="short-response" placeholder="Type your answer…" ${savedAnswer || !hasAnswer ? "disabled" : ""}>${escapeHtml(savedAnswer?.response || "")}</textarea>${unavailable}${savedAnswer || !hasAnswer ? "" : `<button class="primary-button" data-action="submit-short-answer">Check answer</button>`}</div>`;
  }
  if (isLongAnswer(question)) {
    return `<div class="text-answer-form"><p class="muted" style="margin:0;font-size:13px">Write your response first. Then compare it with the model answer and mark your attempt.</p><textarea class="answer-input" id="short-response" placeholder="Write your answer here…" ${savedAnswer ? "disabled" : ""}>${escapeHtml(savedAnswer?.response || "")}</textarea>${savedAnswer ? "" : `<button class="primary-button" data-action="reveal-model-answer">Show model answer</button>`}</div>`;
  }
  return `<div class="text-answer-form"><label class="field-label" for="short-response" style="margin-top:0">Your answer</label><textarea class="answer-input" id="short-response" placeholder="Type your answer…" ${savedAnswer ? "disabled" : ""}>${escapeHtml(savedAnswer?.response || "")}</textarea>${savedAnswer ? "" : `<button class="primary-button" data-action="submit-short-answer">Check answer</button>`}</div>`;
}

function currentResponse() {
  const question=currentSessionQuestion();
  if(question?.practice_mode==='drawing')return 'Independent drawing practice (self-assessed)';
  if(question?.response_fields){
    const values=question.response_fields.map((_,i)=>document.querySelector(`#response-field-${i}`)?.value?.trim()||'');
    return values.every(Boolean)?values.join('; '):'';
  }
  return document.querySelector("#short-response")?.value?.trim() || "";
}

function moveQuestion(delta) {
  const session = store.activeSession;
  if (!session) return;
  const next = session.index + delta;
  if (next < 0) return;
  if (next >= session.questionIds.length) { finishSession(); return; }
  session.index = next;
  persist();
  renderQuestion();
}

function finishSession() {
  const session = store.activeSession;
  if (!session) return;
  const questions = session.questionIds.map((id) => getQuestions(session.course).find((question) => String(question.id) === String(id))).filter(Boolean);
  const attempts = questions.map((question) => session.answers?.[question.id]).filter(Boolean);
  const correct = attempts.filter((attempt) => attempt.correct === true).length;
  const wrong = attempts.filter((attempt) => attempt.correct === false).length;
  const selfAssessed = attempts.filter((attempt) => attempt.selfAssessed).length;
  const unanswered = questions.length - attempts.length;
  const wrongIds = questions.filter((question) => session.answers?.[question.id]?.correct === false).map((question) => question.id);
  const finished = { id: session.id, course: session.course, questionIds: questions.map(q=>q.id), total: questions.length, answered: attempts.length, correct, wrong, selfAssessed, unanswered, accuracy: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null, wrongIds, hintUsedIds: [...(session.hintUsedIds || [])], answers: { ...(session.answers || {}) }, finishedAt: new Date().toISOString() };
  store.sessions.unshift(finished);
  store.sessions = store.sessions.slice(0, 50);
  store.activeSession = null;
  persist();
  renderResults(finished, questions);
}

function renderResults(session, sessionQuestions) {
  const course = courseByCode(session.course);
  const wrongQuestions = sessionQuestions.filter((question) => session.wrongIds.includes(question.id));
  const wrongHtml = wrongQuestions.length ? wrongQuestions.map((question) => {
    const attempt = session.answers?.[question.id];
    return `<article class="review-card"><h3>${escapeHtml(question.presentation?.prompt || question.question)}</h3><p><strong>Your response:</strong> ${escapeHtml(attempt?.response || "Not saved")}</p>${modelAnswerHtml(question)}${question.explanation ? `<p><strong>Why:</strong> ${escapeHtml(question.explanation)}</p>` : ""}</article>`;
  }).join("") : `<div class="empty-state"><strong>No missed questions in this session.</strong>You can revisit any topic from the course page.</div>`;
  const hintQuestions = sessionQuestions.filter((question) => (session.hintUsedIds || []).some((id) => String(id) === String(question.id)));
  const hintQuestionIds = hintQuestions.map((question) => question.id);
  const hintHtml = hintQuestions.length ? hintQuestions.map((question) => {
    const attempt = session.answers?.[question.id];
    const resultLabel = !attempt ? "Not answered" : attempt.correct ? "Correct" : "Missed";
    return `<article class="review-card hint-review-card"><h3>${escapeHtml(question.presentation?.prompt || question.question)}</h3><p><strong>Result:</strong> ${resultLabel}</p><p><strong>Your response:</strong> ${escapeHtml(attempt?.response || "Not answered")}</p>${modelAnswerHtml(question)}${question.explanation ? `<p><strong>Why:</strong> ${escapeHtml(question.explanation)}</p>` : ""}</article>`;
  }).join("") : `<div class="empty-state"><strong>No hints used in this session.</strong>Questions appear here when you open their hint.</div>`;
  const accuracy = session.accuracy == null ? "—" : `${session.accuracy}%`;
  let headline = "Session complete.";
  if (session.answered > 0 && session.accuracy === 100) headline = session.unanswered ? "All answered correctly." : "Perfect score!";
  else if (session.accuracy != null && session.accuracy >= 85) headline = "Excellent work.";
  else if (session.accuracy != null && session.accuracy >= 70) headline = "Strong progress.";
  else if (session.accuracy != null && session.accuracy >= 50) headline = "Keep building on that.";
  else if (session.answered > 0) headline = "A good start. Review and try again.";
  app.innerHTML = `<button class="back-link" data-action="home">← Home</button>
    <section class="result-hero"><div><span class="eyebrow">Session complete · ${escapeHtml(course.code)}</span><h1>${headline}</h1><p>${session.answered} of ${session.total} questions answered. Here’s your recap.</p></div><div class="score-ring"><strong>${accuracy}</strong></div></section>
    <section class="result-stats"><div class="result-stat"><span>Questions in session</span><strong>${session.total}</strong></div><div class="result-stat good"><span>Correct</span><strong>${session.correct}</strong></div><div class="result-stat bad"><span>Missed</span><strong>${session.wrong}</strong></div><div class="result-stat"><span>Not answered</span><strong>${session.unanswered}</strong></div></section>
    ${session.selfAssessed ? `<p class="light-note">${session.selfAssessed} response${session.selfAssessed === 1 ? " was" : "s were"} self-assessed and included in this accuracy.</p>` : ""}
    <div class="result-actions"><button class="primary-button" data-action="retry-missed" data-course="${course.code}" ${wrongQuestions.length ? "" : "disabled"}>↻ Practice missed questions (${wrongQuestions.length})</button><button class="secondary-button" data-action="open-course" data-course="${course.code}">Choose more practice</button><button class="secondary-button" data-action="home">Back to courses</button></div>
    <section class="retry-choice panel" id="retry-choice" hidden><div class="section-heading"><div><h2>Choose what to retry</h2><p>You can include questions where you used a hint, even if you answered them correctly.</p></div></div><div class="result-actions"><button class="primary-button" data-action="start-retry" data-course="${course.code}" data-mode="missed">Missed questions only (${wrongQuestions.length})</button><button class="secondary-button" data-action="start-retry" data-course="${course.code}" data-mode="include-hints" ${hintQuestionIds.length ? "" : "disabled"}>Include hint-used questions (${hintQuestionIds.length})</button><button class="text-button" data-action="cancel-retry">Cancel</button></div></section>
    <section class="result-section"><div class="section-heading"><div><h2>Questions to review</h2><p>Review the correct answer and explanation, then try them again.</p></div></div><div class="review-list">${wrongHtml}</div></section>
    <section class="result-section"><div class="section-heading"><div><h2>Hints used (${hintQuestions.length})</h2><p>Review each question where you opened a hint, along with your response and the answer.</p></div></div><div class="review-list">${hintHtml}</div></section>`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function reconcileStoredPractice() {
  const firstUpgrade = store.bankRevision !== BANK_REVISION;
  function recheck(question, attempt) {
    if (!attempt || !firstUpgrade || attempt.gradingRevision === BANK_REVISION) return attempt;
    const previous = { correct: attempt.correct, response: attempt.response };
    if (question.practice_mode === 'drawing') {
      if (!attempt.selfAssessed) { attempt.correct = null; attempt.needsReview = true; }
    } else if (questionFormats(question) === 'mcq') {
      const option = question.options.find(o=>[o.label,o.text,`${o.label}) ${o.text}`,`${o.label}. ${o.text}`].some(v=>normalizeAnswer(v)===normalizeAnswer(attempt.response)));
      if (option) { attempt.response=option.label; attempt.correct=answerStrings(question).some(a=>normalizeAnswer(a)===normalizeAnswer(option.label)); }
      else { attempt.correct=null; attempt.needsReview=true; }
    } else if (questionFormats(question) === 'matching') {
      const option = question.options.find(o=>[o.label,o.text].some(v=>normalizeAnswer(v)===normalizeAnswer(attempt.response)));
      if (option) attempt.correct=answerStrings(question).some(a=>normalizeAnswer(a)===normalizeAnswer(option.label));
      else { attempt.correct=null; attempt.needsReview=true; }
    } else if (question.grading?.mode === 'fixed') {
      // An old answer containing only part of a now-completed problem must be attempted again.
      if (question.response_fields && question.grading_revision && attempt.response?.split(';').length !== question.response_fields.length) {
        attempt.correct=null; attempt.needsReview=true;
      } else {
        const result=FixedAnswerChecking.check(attempt.response,question);
        attempt.correct=result.status==='unavailable'?null:result.status==='correct';
      }
    } else if (!attempt.selfAssessed && shortAnswerConfidence(attempt.response,question)<SHORT_ANSWER_CONFIDENCE_THRESHOLD) {
      attempt.correct=null;attempt.needsReview=true;
    }
    if (previous.correct!==attempt.correct || previous.response!==attempt.response) attempt.previousAssessment=previous;
    attempt.gradingRevision=BANK_REVISION;
    return attempt;
  }
  for(const course of COURSE_CONFIG) {
    const questions=getQuestions(course.code), progress=getCourseProgress(course.code);
    for(const question of questions) {
      const record=progress[question.id];
      if(!Array.isArray(record?.attempts))continue;
      record.attempts.forEach(a=>recheck(question,a));
      record.everWrong=record.attempts.some(a=>a.correct===false);
      record.lastCorrect=record.attempts.filter(a=>typeof a.correct==='boolean').at(-1)?.correct??null;
    }
  }
  function reconcileSession(session, active) {
    const questions=getQuestions(session.course), byId=new Map(questions.map(q=>[String(q.id),q]));
    const previousId=session.questionIds?.[session.index];
    if(Array.isArray(session.questionIds))session.questionIds=session.questionIds.filter(key=>byId.has(String(key)));
    const oldAnswerCount=Object.keys(session.answers||{}).length;
    session.answers=Object.fromEntries(Object.entries(session.answers||{}).filter(([key,a])=>{
      const question=byId.get(String(key));
      return question && typeof recheck(question,a)?.correct==='boolean';
    }));
    for(const key of ['hintUsedIds','previousHintUsedIds','wrongIds']) if(Array.isArray(session[key]))session[key]=session[key].filter(key=>byId.has(String(key)));
    if(active){
      session.index=Math.max(0,session.questionIds?.indexOf(previousId)??0);
      return Boolean(session.questionIds?.length);
    }
    const attempts=Object.values(session.answers);
    session.correct=attempts.filter(a=>a.correct===true).length;
    session.wrong=attempts.filter(a=>a.correct===false).length;
    session.answered=attempts.length;
    session.selfAssessed=attempts.filter(a=>a.selfAssessed).length;
    session.wrongIds=Object.entries(session.answers).filter(([,a])=>a.correct===false).map(([key])=>key);
    session.total=session.questionIds?.length??Math.max(attempts.length,(session.total||0)-(oldAnswerCount-attempts.length));
    session.unanswered=session.total-session.answered;
    session.accuracy=session.answered?Math.round(session.correct/session.answered*100):null;
    return session.total>0;
  }
  if(store.activeSession && !reconcileSession(store.activeSession,true))store.activeSession=null;
  if(firstUpgrade)store.sessions=store.sessions.filter(s=>reconcileSession(s,false));
  store.bankRevision=BANK_REVISION;
  persist();
}

async function loadBanks() {
  try {
    const embedded = document.querySelector("#question-bank-data");
    if (embedded) {
      banks = JSON.parse(embedded.textContent);
    } else {
      const entries = await Promise.all(COURSE_CONFIG.map(async (course) => {
        const response = await fetch(`data/${course.file}?v=${ASSET_VERSION}`);
        if (!response.ok) throw new Error(`Could not load ${course.code}`);
        const questions = await response.json();
        return [course.code, questions];
      }));
      banks = Object.fromEntries(entries);
    }
    reconcileStoredPractice();
    applyTheme();
    if (store.activeSession?.course && store.activeSession.questionIds?.length) {
      renderQuestion();
    } else {
      store.activeSession = null;
      persist();
      renderHome();
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="panel" style="margin:55px auto;max-width:640px;text-align:center"><span class="eyebrow">Site files need a local server</span><h1 style="font-size:32px">The question banks couldn’t load.</h1><p class="muted">Open this site through GitHub Pages or a local web server. Opening <code>index.html</code> directly can prevent the browser from loading the JSON files.</p><p class="muted">Check that the four JSON files are inside the <code>data</code> folder.</p></section>`;
  }
}

document.addEventListener("click", (event) => {
  const hintSummary = event.target.closest(".hint-details > summary");
  if (hintSummary && store.activeSession) {
    const details = hintSummary.parentElement;
    const question = currentSessionQuestion();
    if (details && !details.open && question) {
      store.activeSession.hintUsedIds ||= [];
      if (!store.activeSession.hintUsedIds.some((id) => String(id) === String(question.id))) {
        store.activeSession.hintUsedIds.push(question.id);
        persist();
      }
    }
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const code = button.dataset.course || currentCourseId;

  if (action === "home") { if (store.activeSession && !confirm("Leave this session? Your answers so far will be saved on this device.")) return; if (store.activeSession) { store.activeSession = null; persist(); } renderHome(); return; }
  if (action === "theme") { store.theme = store.theme === "dark" ? "light" : "dark"; persist(); applyTheme(); return; }
  if (action === "open-course") { if (store.activeSession && !confirm("Leave this session? Your answers so far will be saved on this device.")) return; if (store.activeSession) { store.activeSession = null; persist(); } setupPrefs = null; renderCourse(button.dataset.course); return; }
  if (action === "reset-progress") { if (confirm("Clear all saved practice progress and session summaries from this browser? This cannot be undone.")) { store.progress = {}; store.sessions = []; store.activeSession = null; persist(); renderHome(); showToast("This browser’s progress has been cleared."); } return; }
  if (action === "select-topics") { ensureSetupPrefs(code); setupPrefs.topics = button.dataset.value === "all" ? new Set(getTopics(code).map((topic) => topic.key)) : new Set(); renderCourse(code); return; }
  if (action === "start-practice") { startSession(code, selectedPool(code), false); return; }
  if (action === "review-course") { const missed = getQuestions(code).filter((question) => getCourseProgress(code)[question.id]?.everWrong); startSession(code, missed, true); return; }
  if (action === "answer-mcq") {
    const question = currentSessionQuestion();
    if (!question || store.activeSession.answers?.[question.id]) return;
    const label = button.dataset.label;
    const correct = answerStrings(question).some((answer) => normalizeAnswer(answer) === normalizeAnswer(label));
    saveAnswer(question, label, correct);
    renderQuestion(); return;
  }
  if (action === "answer-matching") {
    const question = currentSessionQuestion();
    if (!question || store.activeSession.answers?.[question.id]) return;
    const sourceLabel = button.dataset.label;
    const response = button.dataset.optionText || sourceLabel;
    const correct = answerStrings(question).some((answer) => normalizeAnswer(answer) === normalizeAnswer(sourceLabel));
    saveAnswer(question, response, correct);
    renderQuestion(); return;
  }
  if (action === "submit-short-answer") {
    const question = currentSessionQuestion();
    const response = currentResponse();
    if (!question || !response) { showToast("Type an answer before checking it."); return; }
    if (store.activeSession.answers?.[question.id]) return;
    if (question.grading?.mode === "fixed") {
      const result = FixedAnswerChecking.check(response, question);
      if (result.status === "unavailable") {
        showToast("This question is missing a verified answer key and has not been scored.");
        return;
      }
      saveAnswer(question, response, result.status === "correct");
      renderQuestion();
      return;
    }
    const confidence = shortAnswerConfidence(response, question);
    if (confidence >= SHORT_ANSWER_CONFIDENCE_THRESHOLD) {
      saveAnswer(question, response, true);
      renderQuestion();
      return;
    }
    showSelfAssessment(question, response, button, "I’m not confident enough to mark this automatically.");
    return;
  }
  if (action === "reveal-model-answer") {
    const question = currentSessionQuestion();
    const response = currentResponse();
    if (question?.grading?.mode === "fixed") return;
    if (!question || !response) { showToast("Write your response before revealing the model answer."); return; }
    showSelfAssessment(question, response, button, "Compare your response with the model answer.");
    return;
  }
  if (action === "self-mark") {
    const question = currentSessionQuestion();
    const response = currentResponse();
    if (!question || question.grading?.mode === "fixed" || store.activeSession.answers?.[question.id]) return;
    saveAnswer(question, response, button.dataset.value === "true", true);
    renderQuestion(); return;
  }
  if (action === "previous-question") { moveQuestion(-1); return; }
  if (action === "next-question") { moveQuestion(1); return; }
  if (action === "finish-session") { finishSession(); return; }
  if (action === "retry-missed") { const panel = document.querySelector("#retry-choice"); if (panel) { panel.hidden = false; panel.scrollIntoView({ behavior: "smooth", block: "nearest" }); } return; }
  if (action === "cancel-retry") { const panel = document.querySelector("#retry-choice"); if (panel) panel.hidden = true; return; }
  if (action === "start-retry") {
    const previous = store.sessions[0];
    const missedIds = previous?.wrongIds || [];
    const hintIds = previous?.hintUsedIds || [];
    const includeHints = button.dataset.mode === "include-hints";
    const selectedIds = new Set(missedIds.map(String));
    if (includeHints) hintIds.forEach((id) => selectedIds.add(String(id)));
    const retryQuestions = getQuestions(code).filter((question) => selectedIds.has(String(question.id)));
    startSession(code, retryQuestions, true, includeHints ? hintIds : []);
    return;
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  const action = target.dataset.action;
  if (action === "topic-toggle") {
    ensureSetupPrefs(currentCourseId);
    if (target.checked) setupPrefs.topics.add(target.dataset.topic); else setupPrefs.topics.delete(target.dataset.topic);
    updateSetupCounts(currentCourseId);
  } else if (action === "format-toggle") {
    ensureSetupPrefs(currentCourseId);
    if (target.checked) setupPrefs.formats.add(target.dataset.format); else setupPrefs.formats.delete(target.dataset.format);
    updateSetupCounts(currentCourseId);
  } else if (target.id === "question-count") {
    ensureSetupPrefs(currentCourseId);
    setupPrefs.count = Math.max(1, Number(target.value) || 1);
    updateSetupCounts(currentCourseId);
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "topic-search" && currentCourseId) {
    topicSearch = event.target.value;
    const start = event.target.selectionStart;
    renderTopicList(currentCourseId);
    event.target.focus();
    event.target.setSelectionRange(start, start);
  }
});

applyTheme();
loadBanks();
