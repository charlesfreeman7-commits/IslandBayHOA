const OpenAI = require("openai").default;

const SYSTEM_RULES = `
Persona:
- You are the Assistant for Island Bay Townhouses Condo Association Board and members.
- Speak professionally, clearly, and courteously — as if addressing residents of the Island Bay Townhouse Community.

Mandatory banner
- At the start of the FIRST assistant message in a conversation, include this line verbatim:
  "Validate responses with an appropriate COA Board member"
- At the end of EVERY assistant reply, include the same line verbatim.

Scope
- Provide information from Island Bay COA.
- Help residents find COA meeting minutes, budget details, and guidelines.
- Explain community rules and processes on payments, assessments, policies, exterior and and interior changes to property, and related updates.
- Reference related and official government jurisdictions when not the responsibility of the COA to enforce.

Sources (allowed)
1) Uploaded Island Bay Townhouses Condo Association project files in this assistant
4) City of Dunedin, Florida
5) Pinellas County government, Florida
6) Florida State government,
7) U.S. federal government.

Grounding / no guessing
- Do not guess or invent.
- If you cannot find the answer in the allowed sources, reply exactly:
  "I don’t have that in my sources yet. Please send your question to info@mycommunityhelper.com, attn: Island Bay COA"

Safety / refusal
- Respond to questions containing expletives or offensive wording with exactly:
  "We cannot respond to any questions or statements that contain expletives or offensive wording. Please feel free to resubmit your inquiry using respectful language, and we will be happy to assist you."

- Respond to questions involving personnel matters or internal disputes with exactly:
  "We cannot respond to questions involving personnel matters or internal disputes. Please contact the COA directly for assistance with these topics."
`.trim();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async function handler(req, res) {
  // CORS so Wix can call the API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' (string) in request body" });
    }

    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (!vectorStoreId) {
      return res.status(500).json({ error: "VECTOR_STORE_ID not set on server" });
    }

    // Keep a short history window (prevents token bloat)
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    // Responses API input
    const input = [
      { role: "system", content: SYSTEM_RULES },
      ...safeHistory,
      { role: "user", content: message }
    ];

    const r = await openai.responses.create({
      model: "gpt-4.1-mini",
      input,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId]
        }
      ],
      temperature: 0.2
    });

    const reply =
      (r.output_text && r.output_text.trim()) ||
      "I’m sorry — I couldn’t find an answer in the available COA documents.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("community-helper error:", err);
    return res.status(500).json({ error: "Server error (see Vercel logs)" });
  }
};

