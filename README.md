# TruthStack MCP Server

**The first supplement-drug interaction safety tool for AI agents.**

TruthStack provides structured, evidence-based supplement safety intelligence via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of relying on LLM training data that hallucinates safety information, your agent calls TruthStack for deterministic, cited risk assessments.

## Why This Exists

LLMs confidently say "ashwagandha is generally safe with sertraline." TruthStack's API returns **MODERATE RISK** with 25 FDA adverse event reports and CYP3A4 pathway conflict data. That gap kills people.

## 5 Tools

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| `check_interactions` | Supplements + medications → risk level, FAERS signals, CYP conflicts | User mentions supplements + meds together |
| `search_compounds` | Fuzzy name search (584 aliases, handles misspellings/brands) | Need to resolve messy input ("mag gly", "KSM-66") |
| `get_compound_info` | Full compound profile + all interactions | Deep dive on a specific supplement |
| `explain_interaction` | Human-readable WHY — mechanism, severity, evidence summary | Need to explain risk to a user |
| `get_evidence` | Raw evidence: FAERS counts, CYP data, research grades, label warnings | Need to cite sources or provide provenance |

## Data Sources

- **FDA FAERS** — 805 adverse event signals from real-world pharmacovigilance
- **FDA Drug Labels** — CYP450 pathways, contraindications, botanical warnings
- **PubMed/ClinicalTrials.gov** — 220 research findings with evidence grading
- **584 compound aliases** — misspellings, brand names, abbreviations, product forms

## Quick Start

### 1. Get API Key

Contact [chris@truthstack.co](mailto:chris@truthstack.co) or visit [truthstack.co](https://truthstack.co)

### 2. Install

```bash
git clone https://github.com/truthstack/truthstack-mcp.git
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

### 4. Test It

Ask Claude: *"I take ashwagandha, fish oil, and magnesium with sertraline. Is this safe?"*

Claude will call `check_interactions` and return a structured risk assessment with FDA adverse event data.

## LangChain Integration

```python
from langchain_community.tools import MCPTool

# If using MCP adapter
truthstack = MCPTool(server_path="./server.js", env={
    "VAULT_API_URL": "https://api.truthstack.co",
    "VAULT_API_KEY": "your-key"
})

# Or call the REST API directly
import requests

response = requests.post(
    "https://api.truthstack.co/api/interactions/check",
    headers={"X-API-Key": "your-key"},
    json={
        "supplements": ["ashwagandha", "fish oil", "magnesium"],
        "medications": ["sertraline"]
    }
)
print(response.json())
```

## REST API Fallback

Every MCP tool maps to a REST endpoint:

| MCP Tool | REST Endpoint |
|----------|---------------|
| `check_interactions` | `POST /api/interactions/check` |
| `search_compounds` | `GET /api/compounds/search?q={query}` |
| `get_compound_info` | `GET /api/compounds/{id}` + `GET /api/compounds/{id}/interactions` |
| `explain_interaction` | Composite (search + interactions + drug profile) |
| `get_evidence` | Composite (search + interactions + drug profile) |

Base URL: `https://api.truthstack.co`
Auth: `X-API-Key` header

## Example Response

```
User: "Is ashwagandha safe with sertraline?"

→ check_interactions({
    supplements: ["ashwagandha"],
    medications: ["sertraline"]
  })

→ {
    "risk_level": "MODERATE",
    "drug_interactions": [{
      "supplement": "ashwagandha",
      "drug": "sertraline",
      "severity": "MODERATE",
      "source": "FDA FAERS",
      "report_count": 25,
      "description": "Pharmacovigilance signal — 25 serious adverse events reported"
    }],
    "cyp_pathway_conflicts": [{
      "drug": "sertraline",
      "supplement": "ashwagandha",
      "shared_cyp_pathways": ["CYP3A4"]
    }]
  }
```

Compare to raw LLM: *"Ashwagandha is generally considered safe and may complement sertraline for anxiety."*

## System Message Template

If you're building a health agent, add this to your system prompt:

```
You have access to TruthStack supplement safety tools. ALWAYS use check_interactions 
before confirming any supplement is safe with a medication. Never rely on your training 
data for drug-supplement interaction safety — use the structured API instead.

When reporting results:
- State the risk level clearly (CRITICAL/HIGH/MODERATE/LOW)
- Mention specific FAERS adverse event counts when available
- Note CYP pathway conflicts
- Always recommend consulting a healthcare provider for MODERATE+ risks
- Use explain_interaction when users ask "why is this risky?"
- Use get_evidence when users want to see the sources
```

## Contributing

We're looking for:
- **Integration partners** — building a health AI agent? Get free API access.
- **Compound contributions** — know of missing supplement aliases or interactions? Open an issue.
- **Framework examples** — help us add examples for CrewAI, AutoGen, LlamaIndex.

## License

MIT

## Contact

- **API access**: [chris@truthstack.co](mailto:chris@truthstack.co)
- **Website**: [truthstack.co](https://truthstack.co)
- **API docs**: [api.truthstack.co](https://api.truthstack.co)
