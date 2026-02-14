# TruthStack MCP Server

**Structured supplement interaction and evidence data for AI agents via the Model Context Protocol.**

TruthStack provides machine-readable reference data about dietary supplements and their documented interactions with prescription medications. Instead of relying on LLM training data — which frequently hallucinates supplement information — your agent calls TruthStack for structured, cited evidence from published literature and FDA adverse event reports.

> **Important:** This is informational reference data only. It is not medical advice, not a medical device, and not intended to diagnose, treat, cure, or prevent any disease. Always consult a healthcare provider before making changes to supplements or medications. Our database covers a growing set of compounds and may not be exhaustive.

## What It Returns

| Tool | What It Returns | When to Use |
|------|----------------|-------------|
| `check_interactions` | Evidence on supplement + medication combinations: reported signals, CYP pathway data, evidence balance | User mentions supplements + meds together |
| `search_compounds` | Fuzzy name resolution (584 aliases, handles misspellings and brand names) | Need to resolve messy input ("mag gly", "KSM-66") |
| `get_compound_info` | Full compound profile + all documented interactions | Deep dive on a specific supplement |
| `explain_interaction` | Human-readable explanation: mechanism, evidence summary, published sources | User asks "why might this be a concern?" |
| `get_evidence_balance` | Raw evidence: FAERS report counts, CYP data, research grades, evidence balance | Need to cite sources or provide provenance |

## Data Sources

- **FDA FAERS** — 805 adverse event reporting signals from pharmacovigilance data
- **FDA Drug Labels** — CYP450 pathways, contraindications, botanical warnings
- **PubMed / ClinicalTrials.gov** — 220 research findings with evidence grading
- **584 compound aliases** — misspellings, brand names, abbreviations, product forms

## Quick Start

### 1. Get API Key

Contact [chris@truthstack.co](mailto:chris@truthstack.co) or visit [truthstack.co](https://truthstack.co)

### 2. Install

```bash
git clone https://github.com/TruthStack1/truthstack-mcp.git
cd truthstack-mcp
npm install
```

### 3. Configure Claude Desktop

Edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "truthstack": {
      "command": "node",
      "args": ["/path/to/truthstack-mcp/server.js"],
      "env": {
        "VAULT_API_URL": "https://api.truthstack.co",
        "VAULT_API_KEY": "your-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see TruthStack tools available in the tool picker.

### 4. Try It

Ask Claude: *"What does published research say about taking ashwagandha with sertraline?"*

Claude will call `check_interactions` and return structured evidence including FDA adverse event report counts and CYP pathway data.

## REST API

Every MCP tool maps to a REST endpoint:

| MCP Tool | REST Endpoint |
|----------|--------------|
| `check_interactions` | `POST /api/interactions/check` |
| `search_compounds` | `GET /api/compounds/search?q={query}` |
| `get_compound_info` | `GET /api/compounds/{id}` |
| `explain_interaction` | Composite endpoint |
| `get_evidence_balance` | Composite endpoint |

Base URL: `https://api.truthstack.co` · Auth: `X-API-Key` header · Docs: `https://api.truthstack.co/docs`

## Intended Use & Limitations

- **This is a reference data API**, not a medical device or clinical decision support system
- Returns structured summaries of published research and adverse event reporting data
- **Not exhaustive** — our database covers a growing but incomplete set of compounds and interactions
- **Cannot see your full medical history** — results reflect only the substances you specify
- **Does not diagnose, prescribe, or recommend treatments**
- **Does not replace pharmacists, physicians, or institutional drug interaction systems**
- Outputs should be presented to end users with appropriate context and limitations

## System Message Guidance

If building a health-aware agent, consider including guidance like:

```
You have access to TruthStack reference data tools. When users ask about
supplement and medication combinations, use check_interactions to look up
published evidence rather than relying on training data alone.

When presenting results:
- State what the evidence shows, not what is "safe" or "unsafe"
- Mention FDA adverse event report counts when available
- Note CYP pathway considerations
- Always recommend discussing findings with a healthcare provider
- Make clear this is reference data, not medical advice
- Use explain_interaction when users want to understand the evidence
```

## Contributing

We're looking for:
- **Integration partners** — building a health-aware AI agent? Get free API access
- **Compound contributions** — know of missing supplement aliases or interactions? Open an issue
- **Framework examples** — help us add examples for CrewAI, AutoGen, LlamaIndex

## License

MIT

## Contact

- **API access**: [chris@truthstack.co](mailto:chris@truthstack.co)
- **Website**: [truthstack.co](https://truthstack.co)
- **API docs**: [api.truthstack.co](https://api.truthstack.co)

---

*TruthStack provides structured reference data about dietary supplements for informational and educational purposes only. It does not provide medical advice, diagnosis, or treatment. Not a medical device. Not cleared or approved by the FDA. Always consult a qualified healthcare provider before making changes to supplements or medications.*
