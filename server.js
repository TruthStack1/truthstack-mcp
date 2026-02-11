#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VAULT_API_URL = process.env.VAULT_API_URL || "https://api.truthstack.co";
const VAULT_API_KEY = process.env.VAULT_API_KEY;
if (!VAULT_API_KEY) { console.error("ERROR: VAULT_API_KEY required"); process.exit(1); }

async function vaultFetch(path, options = {}) {
  const r = await fetch(`${VAULT_API_URL}${path}`, { ...options, headers: { "X-API-Key": VAULT_API_KEY, "Content-Type": "application/json", ...options.headers } });
  if (!r.ok) { const t = await r.text(); throw new Error(`Vault API error ${r.status}: ${t}`); }
  return r.json();
}
async function searchCompounds(q, limit = 10) { return vaultFetch(`/api/compounds/search?q=${encodeURIComponent(q)}&limit=${limit}`); }
async function getCompound(id) { return vaultFetch(`/api/compounds/${encodeURIComponent(id)}`); }
async function getCompoundInteractions(id) { return vaultFetch(`/api/compounds/${encodeURIComponent(id)}/interactions`); }
async function checkInteractions(supps, meds) { return vaultFetch("/api/interactions/check", { method: "POST", body: JSON.stringify({ supplements: supps, medications: meds }) }); }
async function getDrugProfile(id) { return vaultFetch(`/api/drugs/${encodeURIComponent(id)}`); }

async function buildExplanation(supplementName, drugName) {
  const sr = await searchCompounds(supplementName, 1);
  const compound = sr?.results?.[0];
  if (!compound) return { supplement: supplementName, drug: drugName, explanation: `Could not resolve "${supplementName}".`, severity: "UNKNOWN", confidence: "low" };
  const compoundId = compound.compound_id;
  const interactions = await getCompoundInteractions(compoundId);
  const di = (interactions?.interactions || []).filter(i => i.target_id?.toLowerCase().includes(drugName.toLowerCase()) || i.target_name?.toLowerCase().includes(drugName.toLowerCase()));
  let drugProfile = null;
  try { drugProfile = await getDrugProfile(drugName.toLowerCase().replace(/\s+/g, "_")); } catch(e) {}
  if (di.length === 0 && !drugProfile) return { supplement: supplementName, drug: drugName, resolved_compound: compoundId, explanation: `No known interactions found between ${compound.name} and ${drugName}. This does not guarantee safety.`, severity: "LOW", confidence: "low", evidence_count: 0 };
  const faers = di.filter(i => i.source_origin === "OPENFDA");
  const research = di.filter(i => i.source_origin !== "OPENFDA");
  const totalFaers = faers.reduce((s, f) => s + (f.metadata?.report_count || 0), 0);
  let severity = "LOW";
  const sevs = di.map(i => i.severity);
  if (sevs.includes("CRITICAL")) severity = "CRITICAL";
  else if (sevs.includes("HIGH") || sevs.includes("MAJOR")) severity = "HIGH";
  else if (sevs.includes("MODERATE")) severity = "MODERATE";
  let cypMech = "";
  if (drugProfile?.profile?.cyp_pathways) {
    const cyps = drugProfile.profile.cyp_pathways;
    const allDrug = [...(cyps.metabolized_by||[]),...(cyps.inhibits||[]),...(cyps.induces||[])];
    const cd = await getCompound(compoundId);
    const compCyps = cd?.compound?.data?.cyp_pathways || [];
    const shared = [...new Set(allDrug.filter(c => compCyps.includes(c)))];
    if (shared.length > 0) cypMech = `Shared CYP450 pathway(s): ${shared.join(", ")}. ${compound.name} may alter how ${drugName} is metabolized.`;
  }
  const parts = [`Interaction between ${compound.name} and ${drugName}:`, `Severity: ${severity}`];
  if (totalFaers > 0) parts.push(`FDA Adverse Event Reports: ${totalFaers} serious report(s) in FAERS.`);
  if (cypMech) parts.push(`Mechanism: ${cypMech}`);
  const mechs = research.map(i => i.mechanism || i.description).filter(Boolean);
  if (mechs.length > 0) parts.push(`Research: ${mechs.join(". ")}`);
  const recs = [...new Set(di.map(i => i.recommendation).filter(Boolean))];
  if (recs.length > 0) parts.push(`Recommendation: ${recs.join(". ")}`);
  return { supplement: supplementName, drug: drugName, resolved_compound: compoundId, compound_name: compound.name, severity, explanation: parts.join("\n\n"), confidence: totalFaers > 10 ? "high" : totalFaers > 0 ? "medium" : "low", evidence_count: di.length, faers_report_count: totalFaers, has_cyp_conflict: cypMech !== "" };
}

async function buildEvidence(supplementName, drugName) {
  const sr = await searchCompounds(supplementName, 1);
  const compound = sr?.results?.[0];
  if (!compound) return { supplement: supplementName, drug: drugName, evidence_items: [], error: `Could not resolve "${supplementName}".` };
  const compoundId = compound.compound_id;
  const interactions = await getCompoundInteractions(compoundId);
  const di = (interactions?.interactions || []).filter(i => i.target_id?.toLowerCase().includes(drugName.toLowerCase()) || i.target_name?.toLowerCase().includes(drugName.toLowerCase()));
  let drugProfile = null;
  try { drugProfile = await getDrugProfile(drugName.toLowerCase().replace(/\s+/g, "_")); } catch(e) {}
  const items = [];
  for (const s of di.filter(i => i.source_origin === "OPENFDA")) {
    items.push({ type: "FAERS_SIGNAL", source: "FDA FAERS", description: `${s.metadata?.report_count || 0} serious adverse event reports`, severity: s.severity, report_count: s.metadata?.report_count || 0, signal_score: s.combined_confidence, caveat: "FAERS reports are voluntary and do not prove causation." });
  }
  for (const f of di.filter(i => i.source_origin !== "OPENFDA")) {
    items.push({ type: "RESEARCH_FINDING", source: f.source_origin || "Research", description: f.mechanism || f.description || "Interaction documented", severity: f.severity, evidence_grade: f.evidence_grade || "not_graded", recommendation: f.recommendation || null });
  }
  if (drugProfile?.profile?.cyp_pathways) {
    const cyps = drugProfile.profile.cyp_pathways;
    const cd = await getCompound(compoundId);
    const compCyps = cd?.compound?.data?.cyp_pathways || [];
    const allDrug = [...(cyps.metabolized_by||[]),...(cyps.inhibits||[]),...(cyps.induces||[])];
    const shared = [...new Set(allDrug.filter(c => compCyps.includes(c)))];
    if (shared.length > 0) items.push({ type: "CYP_PATHWAY_CONFLICT", source: "FDA drug label + compound data", shared_pathways: shared, clinical_significance: "Shared CYP pathways may alter drug metabolism." });
  }
  return { supplement: supplementName, drug: drugName, resolved_compound: compoundId, compound_name: compound.name, evidence_items: items, total_evidence_count: items.length, evidence_types: [...new Set(items.map(e => e.type))] };
}

const server = new Server({ name: "truthstack", version: "2.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "check_interactions", description: "Check if supplements are safe with medications. Returns risk level, FDA adverse event data, CYP450 conflicts. Use when user mentions supplements + meds.", inputSchema: { type: "object", properties: { supplements: { type: "array", items: { type: "string" }, description: "Supplement names (handles brands, abbreviations, misspellings)" }, medications: { type: "array", items: { type: "string" }, description: "Medication names (generic or brand)" } }, required: ["supplements", "medications"] } },
    { name: "search_compounds", description: "Fuzzy search for supplement compounds. 584 aliases across 95 compounds. Resolves misspellings, brands, abbreviations.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Search query" }, limit: { type: "number", description: "Max results (default 5)" } }, required: ["query"] } },
    { name: "get_compound_info", description: "Get detailed compound profile with interactions, research findings, and aliases.", inputSchema: { type: "object", properties: { compound_id: { type: "string", description: "Compound ID from search_compounds" } }, required: ["compound_id"] } },
    { name: "explain_interaction", description: "Human-readable explanation of WHY an interaction is risky. Returns mechanism, severity, evidence summary.", inputSchema: { type: "object", properties: { supplement: { type: "string", description: "Supplement name" }, drug: { type: "string", description: "Drug name" } }, required: ["supplement", "drug"] } },
    { name: "get_evidence", description: "Raw evidence bundle: FAERS counts, CYP data, research grades, label warnings. For citing sources.", inputSchema: { type: "object", properties: { supplement: { type: "string", description: "Supplement name" }, drug: { type: "string", description: "Drug name" } }, required: ["supplement", "drug"] } },
    { name: "get_safety_signals", description: "Get FDA adverse event safety signals (CAERS) for a supplement. Returns PRR analysis, signal strength, category alerts for hepatic/cardiac/bleeding/renal risks.", inputSchema: { type: "object", properties: { compound: { type: "string", description: "Supplement name (e.g. turmeric, kava, green_tea_extract)" } }, required: ["compound"] } },
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result;
    switch (name) {
      case "check_interactions":
        if (!args.supplements || !args.medications) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide 'supplements' (array) and 'medications' (array)", example: { supplements: ["ashwagandha"], medications: ["sertraline"] } }) }], isError: true };
        result = await checkInteractions(args.supplements, args.medications);
        break;
      case "search_compounds":
        if (!args.query) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide 'query' string" }) }], isError: true };
        result = await searchCompounds(args.query, args.limit || 5);
        break;
      case "get_compound_info":
        if (!args.compound_id) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide 'compound_id'" }) }], isError: true };
        const [comp, ints] = await Promise.all([getCompound(args.compound_id), getCompoundInteractions(args.compound_id)]);
        result = { ...comp, interactions: ints?.interactions || [] };
        break;
      case "explain_interaction":
        if (!args.supplement || !args.drug) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide 'supplement' and 'drug'" }) }], isError: true };
        result = await buildExplanation(args.supplement, args.drug);
        break;
      case "get_evidence":
        if (!args.supplement || !args.drug) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide 'supplement' and 'drug'" }) }], isError: true };
        result = await buildEvidence(args.supplement, args.drug);
        break;
      case "get_safety_signals":
        if (!args.compound) return { content: [{ type: "text", text: JSON.stringify({ error: "Provide compound string" }) }], isError: true };
        result = await vaultFetch("/api/safety/profile/" + encodeURIComponent(args.compound));
        break;
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TruthStack MCP Server v2 running (6 tools, stdio transport)");
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
