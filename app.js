const inputText = document.querySelector("#inputText");
const allowlistText = document.querySelector("#allowlistText");
const blocklistText = document.querySelector("#blocklistText");
const includeDomainsOnly = document.querySelector("#includeDomainsOnly");
const dedupeInput = document.querySelector("#dedupeInput");
const resultsBody = document.querySelector("#resultsBody");
const reportText = document.querySelector("#reportText");
const statusMessage = document.querySelector("#statusMessage");
const dataStatus = document.querySelector("#dataStatus");
const riskState = document.querySelector("#riskState");

const summary = {
  total: document.querySelector("#totalCount"),
  disposable: document.querySelector("#disposableCount"),
  allowed: document.querySelector("#allowedCount"),
  invalid: document.querySelector("#invalidCount"),
};

const disposableDomains = new Set((window.DISPOSABLE_DOMAINS || []).map(normalizeDomain).filter(Boolean));
const compoundSuffixes = new Set([
  "ac.uk",
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.tr",
  "net.au",
  "org.au",
  "org.uk",
]);

const sampleText = [
  "new.signup@mailinator.com",
  "lead@example.com",
  "qa@sub.guerrillamail.com",
  "customer@proton.me",
  "https://10minutemail.com/inbox/demo",
  "invalid@@address",
].join("\n");

let latestResults = [];

dataStatus.textContent = `${disposableDomains.size.toLocaleString()} domains`;

function normalizeDomain(value) {
  if (!value) return "";
  let domain = String(value).trim().toLowerCase();
  domain = domain.replace(/^mailto:/, "");
  domain = domain.replace(/^@+/, "");
  domain = domain.replace(/^[<("'`]+|[>)"',.;:!?`]+$/g, "");

  if (/^https?:\/\//i.test(domain)) {
    try {
      domain = new URL(domain).hostname;
    } catch {
      return "";
    }
  }

  domain = domain.replace(/\.$/, "");
  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }
  return domain;
}

function parseEmail(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return null;

  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= trimmed.length - 1) return null;

  const local = trimmed.slice(0, atIndex);
  const domain = normalizeDomain(trimmed.slice(atIndex + 1));
  if (!local || local.length > 64 || !isValidDomain(domain)) return null;

  return { local, domain, email: `${local}@${domain}` };
}

function isValidDomain(domain) {
  if (!domain || domain.length > 253 || !domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") || domain.endsWith("-")) {
    return false;
  }
  if (domain.includes("..")) return false;
  return domain.split(".").every((label) => /^[a-z0-9-]{1,63}$/.test(label) && !label.startsWith("-") && !label.endsWith("-"));
}

function parseEntry(rawValue) {
  let value = String(rawValue || "").trim();
  value = value.replace(/^[<("'`]+|[>)"',.;:!?`]+$/g, "");
  if (!value) return null;

  const email = parseEmail(value);
  if (email) {
    return {
      raw: value,
      type: "email",
      display: email.email,
      domain: email.domain,
      valid: true,
    };
  }

  if (!includeDomainsOnly.checked) {
    return {
      raw: value,
      type: "unknown",
      display: value,
      domain: "",
      valid: false,
    };
  }

  let domain = normalizeDomain(value);
  if (domain.includes("/")) {
    try {
      domain = normalizeDomain(new URL(`https://${value}`).hostname);
    } catch {
      domain = "";
    }
  }

  return {
    raw: value,
    type: "domain",
    display: domain || value,
    domain,
    valid: isValidDomain(domain),
  };
}

function extractEntries(text) {
  const rawParts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const entries = [];
  const seen = new Set();

  rawParts.forEach((part) => {
    const entry = parseEntry(part);
    if (!entry) return;
    const key = `${entry.type}:${entry.display.toLowerCase()}`;
    if (dedupeInput.checked && seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  });

  return entries;
}

function parseDomainList(text) {
  return new Set(
    text
      .split(/[\s,;]+/)
      .map(normalizeDomain)
      .filter(isValidDomain),
  );
}

function getDomainLevels(domain) {
  const parts = domain.split(".");
  const lastTwo = parts.slice(-2).join(".");
  const suffixLength = compoundSuffixes.has(lastTwo) ? 2 : 1;
  if (parts.length <= suffixLength) return [domain];

  const levels = [];
  const stopAt = parts.length - suffixLength;
  for (let index = 0; index < stopAt; index += 1) {
    levels.push(parts.slice(index).join("."));
  }
  return levels.length ? levels : [domain];
}

function checkEntry(entry, allowlist, customBlocklist) {
  if (!entry.valid) {
    return {
      ...entry,
      disposable: false,
      outcome: "Invalid",
      reason: "invalid_entry",
      matchedDomain: "",
    };
  }

  const levels = getDomainLevels(entry.domain);

  for (const level of levels) {
    if (allowlist.has(level)) {
      return {
        ...entry,
        disposable: false,
        outcome: "Allowed",
        reason: "allowlist",
        matchedDomain: level,
      };
    }
  }

  for (const level of levels) {
    if (customBlocklist.has(level)) {
      return {
        ...entry,
        disposable: true,
        outcome: "Disposable",
        reason: "custom_blocklist",
        matchedDomain: level,
      };
    }
  }

  for (const level of levels) {
    if (disposableDomains.has(level)) {
      return {
        ...entry,
        disposable: true,
        outcome: "Disposable",
        reason: level === entry.domain ? "blocklist" : "subdomain_match",
        matchedDomain: level,
      };
    }
  }

  return {
    ...entry,
    disposable: false,
    outcome: "Clean",
    reason: "not_found",
    matchedDomain: "",
  };
}

function runCheck() {
  const entries = extractEntries(inputText.value);
  const allowlist = parseDomainList(allowlistText.value);
  const customBlocklist = parseDomainList(blocklistText.value);
  latestResults = entries.map((entry) => checkEntry(entry, allowlist, customBlocklist));

  renderResults();
}

function renderResults() {
  const total = latestResults.length;
  const disposable = latestResults.filter((result) => result.disposable).length;
  const allowed = latestResults.filter((result) => result.reason === "allowlist").length;
  const invalid = latestResults.filter((result) => result.reason === "invalid_entry").length;

  summary.total.textContent = total.toLocaleString();
  summary.disposable.textContent = disposable.toLocaleString();
  summary.allowed.textContent = allowed.toLocaleString();
  summary.invalid.textContent = invalid.toLocaleString();

  if (!total) {
    resultsBody.innerHTML = '<tr><td colspan="5">Load the sample or paste a list to start.</td></tr>';
    riskState.textContent = "No input";
    statusMessage.textContent = "Paste emails, domains, or URLs to check.";
    reportText.value = "";
    return;
  }

  const riskRatio = disposable / total;
  riskState.textContent = riskRatio >= 0.5 ? "High risk" : disposable ? "Review needed" : "Looks clean";
  statusMessage.textContent = `${total.toLocaleString()} entries checked. ${disposable.toLocaleString()} disposable match${disposable === 1 ? "" : "es"} found.`;

  resultsBody.innerHTML = latestResults
    .map((result) => {
      const badgeClass =
        result.outcome === "Disposable" ? "badge badge-warning" : result.outcome === "Invalid" ? "badge badge-muted" : "badge badge-good";
      return `
        <tr>
          <td>${escapeHtml(result.display)}</td>
          <td>${escapeHtml(result.domain || "-")}</td>
          <td><span class="${badgeClass}">${escapeHtml(result.outcome)}</span></td>
          <td>${escapeHtml(result.matchedDomain || "-")}</td>
          <td>${escapeHtml(formatReason(result.reason))}</td>
        </tr>
      `;
    })
    .join("");

  reportText.value = buildReport();
}

function formatReason(reason) {
  return String(reason || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildReport() {
  const lines = [];
  const date = new Date().toLocaleString();
  const disposable = latestResults.filter((result) => result.disposable);
  const invalid = latestResults.filter((result) => result.reason === "invalid_entry");

  lines.push("TempMail Shelf report");
  lines.push(`Generated: ${date}`);
  lines.push(`Bundled disposable domains: ${disposableDomains.size.toLocaleString()}`);
  lines.push("");
  lines.push(`Checked: ${latestResults.length}`);
  lines.push(`Disposable matches: ${disposable.length}`);
  lines.push(`Invalid entries: ${invalid.length}`);
  lines.push("");

  if (disposable.length) {
    lines.push("Disposable or temporary matches");
    disposable.forEach((result) => {
      lines.push(`- ${result.display} -> ${result.matchedDomain} (${formatReason(result.reason)})`);
    });
    lines.push("");
  }

  if (invalid.length) {
    lines.push("Invalid entries");
    invalid.forEach((result) => {
      lines.push(`- ${result.raw}`);
    });
    lines.push("");
  }

  lines.push("Full results");
  latestResults.forEach((result) => {
    lines.push(`${result.display}, ${result.domain || "-"}, ${result.outcome}, ${result.matchedDomain || "-"}, ${formatReason(result.reason)}`);
  });

  return lines.join("\n");
}

async function copyReport() {
  if (!reportText.value) {
    statusMessage.textContent = "Nothing to copy yet.";
    return;
  }

  try {
    await navigator.clipboard.writeText(reportText.value);
    statusMessage.textContent = "Report copied.";
  } catch {
    reportText.select();
    document.execCommand("copy");
    statusMessage.textContent = "Report copied using browser fallback.";
  }
}

function downloadCsv() {
  if (!latestResults.length) {
    statusMessage.textContent = "Nothing to download yet.";
    return;
  }

  const rows = [
    ["entry", "type", "domain", "outcome", "matched_domain", "reason"],
    ...latestResults.map((result) => [
      result.display,
      result.type,
      result.domain,
      result.outcome,
      result.matchedDomain,
      result.reason,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tempmail-shelf-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.querySelector("#sampleButton").addEventListener("click", () => {
  inputText.value = sampleText;
  allowlistText.value = "proton.me";
  blocklistText.value = "risky-mail.test";
  runCheck();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  inputText.value = "";
  allowlistText.value = "";
  blocklistText.value = "";
  latestResults = [];
  renderResults();
});

document.querySelector("#checkButton").addEventListener("click", runCheck);
document.querySelector("#copyButton").addEventListener("click", copyReport);
document.querySelector("#downloadButton").addEventListener("click", downloadCsv);
[inputText, allowlistText, blocklistText, includeDomainsOnly, dedupeInput].forEach((element) => {
  element.addEventListener("input", runCheck);
  element.addEventListener("change", runCheck);
});

runCheck();
