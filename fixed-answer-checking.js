(function (root) {
  "use strict";

  const numberSource = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
  const unsignedSource = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  const valuePattern = new RegExp(`^(${numberSource})(?:\\s+(${unsignedSource})\\s*[/]\\s*(${unsignedSource})|\\s*[/]\\s*(${numberSource}))?\\s*(%)?$`, "i");
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const vulgarFractions = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅐": "1/7", "⅑": "1/9", "⅒": "1/10", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

  function normalize(value) {
    return String(value ?? "").replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (fraction) => ` ${vulgarFractions[fraction]}`)
      .normalize("NFKC").toLowerCase().replace(/[−–—]/g, "-").replace(/[⁄÷]/g, "/")
      .replace(/[’‘]/g, "'").replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
      .replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  }

  function canonicalText(value) {
    return normalize(value).replace(/\bapproximately\b|\bapprox\.?\b/g, "")
      .replace(/[$£€]/g, "").replace(/\s*([=:;,/])\s*/g, "$1").replace(/\s+/g, " ").trim();
  }

  function textAliases(value) {
    const text = canonicalText(value).replace(/\s+distribution$/, "");
    if (/^(?:approximately )?symmetric(?:al)?(?: by mean and median)?$/.test(text)) return "symmetric";
    if (/^(?:(?:positively|positive)(?: \(right\))? skewed|positively skewed \(right-skewed\)|right[ -]skewed|skewed (?:to the )?right|right|positive skew)$/.test(text)) return "right-skewed";
    if (/^(?:(?:negatively|negative)(?: \(left\))? skewed|negatively skewed \(left-skewed\)|left[ -]skewed|skewed (?:to the )?left|left|negative skew)$/.test(text)) return "left-skewed";
    if (/^(?:qualitative \(categorical\)|qualitative|categorical)(?: variable)?$/.test(text)) return "categorical";
    if (/^(?:bar chart|bar graph)$/.test(text)) return "bar chart";
    if (/^(?:cumulative frequency polygon \(ogive\)|cumulative frequency polygon|ogive|cumulative frequency graph)$/.test(text)) return "ogive";
    if (/^(?:proper fraction|proper)$/.test(text)) return "proper fraction";
    if (/^(?:improper fraction|improper)$/.test(text)) return "improper fraction";
    if (/^(?:mixed fraction|mixed number)$/.test(text)) return "mixed number";
    if (/^(?:not (?:specified|given|provided|stated)|unspecified|cannot be determined)$/.test(text)) return "not specified";
    return text;
  }

  function parseValue(value) {
    const text = normalize(value).replace(/[$£€]/g, "").trim();
    const match = text.match(valuePattern);
    if (!match) return null;
    let number = Number(match[1]);
    if (match[2] != null) {
      if (Number(match[3]) === 0) return null;
      number = Math.sign(number || 1) * (Math.abs(number) + Number(match[2]) / Number(match[3]));
    } else if (match[4] != null) {
      if (Number(match[4]) === 0) return null;
      number /= Number(match[4]);
    }
    const percent = Boolean(match[5]);
    if (percent) number /= 100;
    return Number.isFinite(number) ? { number, percent, raw: text } : null;
  }

  function canonicalLabel(value) {
    return canonicalText(value).replace(/\b(?:sample|population|cash|amount|paid|price|the|of|total|end|period|last|date|deadline)\b/g, " ")
      .replace(/standard deviation/g, "sd").replace(/coefficient (?:of )?variation/g, "cv")
      .replace(/arithmetic mean/g, "mean").replace(/net/g, "net")
      .replace(/minimum/g, "min").replace(/maximum/g, "max").replace(/frequencies/g, "frequency")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function parseDate(text) {
    const months = monthNames.map((month) => `${month}|${month.slice(0, 3)}`).join("|");
    const first = text.match(new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    const second = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${months})\\.?\\b`));
    if (!first && !second) return null;
    const found = first || second;
    const month = first ? found[1] : found[2];
    const day = Number(first ? found[2] : found[1]);
    const index = monthNames.findIndex((name) => name === month || name.startsWith(month));
    if (index < 0 || day < 1 || day > 31) return null;
    return { kind: "date", value: `${index + 1}-${day}`, label: canonicalLabel(text.slice(0, found.index).replace(/[=:]+$/, "")) };
  }

  const unitPattern = /\s*(dollars?(?:\s*(?:per|\/)\s*hour)?|usd|cents?|hours?|hrs?|h|minutes?|mins?|miles?|mi|pounds?|lbs?|boards?|units?|widgets?|students?|items?|sandwiches?|magazines?|trucks?|packages?|computers?|batteries|employees?|families|customers?|days?|months?|years?|billions?|millions?|per sandwich|per hour|\/\s*(?:hour|hr))\s*$/i;

  function parsePart(value, expectedKind) {
    let text = normalize(value).replace(/[$£€]/g, "").replace(/^approximately\s+|\s+approximately$/g, "").trim();
    const date = parseDate(text);
    if (date) return date;
    // Parentheses in these answers repeat the same time in hours and minutes.
    if (/\b(?:hours?|hrs?|h|minutes?|mins?)\s*\(/.test(text)) text = text.replace(/\s*\([^)]*\)\s*$/, "");
    const time = text.match(new RegExp(`^(${numberSource}(?:\\s+${unsignedSource}/${unsignedSource})?)\\s*(hours?|hrs?|h)(?:\\s+(?:and\\s+)?(${numberSource})\\s*(minutes?|mins?))?$`));
    if (time) {
      const hours = parseValue(time[1]);
      const minutes = time[3] == null ? 0 : Number(time[3]);
      if (hours && Number.isFinite(minutes)) return { kind: "time", number: hours.number * 60 + minutes, label: "", percent: false };
    }
    const minutesOnly = text.match(new RegExp(`^(${numberSource})\\s*(?:minutes?|mins?)$`));
    if (minutesOnly) return { kind: "time", number: Number(minutesOnly[1]), label: "", percent: false };
    const unknown = text.match(/^(.*?)(not (?:specified|given|provided|stated)|unspecified|cannot be determined)$/);
    if (unknown) return { kind: "text", value: "not specified", label: canonicalLabel(unknown[1]) };

    const raw = String(value).normalize("NFKC").toLowerCase().replace(/[−–—]/g, "-").replace(/[$£€]/g, "").trim();
    let rawBody = raw;
    let label = "";
    const labelled = raw.match(/^(.+?)\s*[:=]\s*(.+)$/) || raw.match(/^(q[1-3]|d[1-9])\s+(.+)$/);
    if (labelled) {
      label = canonicalLabel(labelled[1]);
      rawBody = labelled[2];
      text = normalize(rawBody);
    }
    // Frequency tables sometimes store a whole row of values in one field.
    const listPrefix = rawBody.match(/^([^\d+\-]*)([\d+\-].*)$/);
    const listBody = listPrefix ? listPrefix[2] : rawBody;
    const listLabel = label || canonicalLabel(listPrefix?.[1] || "");
    if (listBody.includes(",") && (expectedKind === "list" || /midpoint|frequen|cum|sorted/.test(listLabel))) {
      const values = listBody.split(/,\s*/).map(parseValue);
      if (values.length > 1 && values.every(Boolean)) return { kind: "list", values, label: listLabel };
    }

    let unit = text.match(unitPattern)?.[0] || "";
    if (unit) text = text.slice(0, -unit.length).trim();
    const start = text.search(/[+\-]?(?:\d|\.\d)/);
    if (start >= 0) {
      const prefix = text.slice(0, start).trim().replace(/[=:]+$/, "").trim();
      const suffix = text.slice(start);
      const parsed = parseValue(suffix);
      if (parsed && !/[0-9]/.test(prefix) && !/\b(?:not|wrong|incorrect|maybe|or)\b/.test(prefix)) {
        return { kind: "number", ...parsed, label: label || canonicalLabel(prefix), unit: unit.trim(), money: /[$£€]/.test(String(value)) };
      }
    }
    return { kind: "text", value: textAliases(text), label };
  }

  function splitParts(value) {
    const text = String(value ?? "").replace(/\r/g, "").trim();
    const semicolonParts = text.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean);
    return semicolonParts;
  }

  function equivalentNumber(actual, expected, question) {
    let expectedValue = expected.number;
    let actualValue = actual.number;
    if (expected.kind === "time" && actual.kind === "number") actualValue *= 60;
    if (expected.kind === "number" && actual.kind === "time") {
      const unit = question.grading?.unit || question.answer?.unit || '';
      const context = `${question.topic || ''} ${question.question || ''}`.toLowerCase();
      if (/^(?:min|minutes?)$/.test(unit) || /\bminutes?\b/.test(context) && !/[$£€]|wage|salary|dollars?/.test(context)) {
        // Times are parsed in minutes. A plain key for a minutes question is already in minutes.
      } else if (/^(?:h|hours?)$/.test(unit)) actualValue /= 60;
      else return false;
    }
    if (expected.percent && !actual.percent && Math.abs(actualValue - expectedValue * 100) < 1e-9) return true;
    const rounding = question.grading?.decimalPlaces;
    let tolerance = Math.max(1, Math.abs(expectedValue)) * 1e-10;
    if (Number.isInteger(rounding) && rounding >= 0) tolerance = Math.max(tolerance, 0.5 * 10 ** -rounding * (expected.percent ? 0.01 : 1));
    return Math.abs(actualValue - expectedValue) < tolerance;
  }

  function equivalentPart(actual, expected, question, checkLabels) {
    if (checkLabels && actual.label && expected.label && actual.label !== expected.label) return false;
    if (expected.kind === "list") return actual.kind === "list" && actual.values.length === expected.values.length && expected.values.every((part, index) => equivalentNumber(actual.values[index], part, question));
    if (expected.kind === "date") return actual.kind === "date" && actual.value === expected.value;
    if (expected.kind === "text") return actual.kind === "text" && actual.value === expected.value;
    if (!["number", "time"].includes(actual.kind)) return false;
    if (expected.percent && (actual.unit || actual.money)) return false;
    if (actual.unit && expected.unit && canonicalUnit(actual.unit) !== canonicalUnit(expected.unit)) return false;
    const questionText = `${question.topic || ""} ${question.question || ""}`.toLowerCase();
    const moneyContext = expected.money || /[$£€]|dollars?|hourly wage|stock prices?/.test(questionText);
    if (actual.money && !moneyContext) return false;
    if (actual.unit && !expected.unit) {
      const unit = canonicalUnit(actual.unit);
      if (unit.includes("money")) { if (!moneyContext) return false; }
      else if (!canonicalUnit(questionText).includes(unit.replace(/^\//, ""))) return false;
    }
    if (actual.label && !expected.label && !/^(?:[a-z]|answer(?: is)?|result(?: is)?)$/.test(actual.label)) {
      const context = canonicalLabel(`${question.topic || ""} ${question.question?.slice(-250) || ""}`);
      if (!context.includes(actual.label)) return false;
    }
    return equivalentNumber(actual, expected, question);
  }

  function canonicalUnit(unit) {
    return unit.replace(/\b(?:dollars?|usd)\b/g, "money").replace(/\b(?:per|\/)\s*(?:hour|hr)\b/g, "/hour")
      .replace(/\blbs?\b/g, "pound").replace(/\bmi\b/g, "mile").replace(/ies\b/g, "y").replace(/s\b/g, "").replace(/\s+/g, "");
  }

  function matches(response, expected, question) {
    if (normalize(response) === normalize(expected)) return true;
    const expectedParts = splitParts(expected).map(parsePart);
    let actualParts = splitParts(response).map((part, index) => parsePart(part, expectedParts[index]?.kind));
    // For simple lists, students may use commas instead of semicolons.
    if (expectedParts.length > 1 && actualParts.length === 1 && /^[\d\s.,%+\-/]+$/.test(response)) {
      actualParts = response.split(/,\s*/).map(parsePart);
    }
    if (actualParts.length !== expectedParts.length) return false;
    return expectedParts.every((part, index) => equivalentPart(actualParts[index], part, question, expectedParts.length > 1));
  }

  function check(response, question) {
    const answers = [question.answer?.value, ...(question.answer?.accepted_values || []), ...(question.grading?.acceptedAnswers || [])]
      .filter((answer) => answer != null && String(answer).trim() !== "").map(String);
    if (!answers.length) return { status: "unavailable" };
    return { status: answers.some((answer) => matches(response, answer, question)) ? "correct" : "incorrect" };
  }

  root.FixedAnswerChecking = { check };
  if (typeof module !== "undefined" && module.exports) module.exports = root.FixedAnswerChecking;
})(globalThis);
