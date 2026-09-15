export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({
        error: "Δεν δόθηκε URL."
      });
    }

    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (
      host !== "chatgpt.com" &&
      host !== "www.chatgpt.com" &&
      host !== "chat.openai.com"
    ) {
      return res.status(400).json({
        error: "Αυτή τη στιγμή υποστηρίζονται ChatGPT Share URLs."
      });
    }

    if (!parsed.pathname.startsWith("/share/")) {
      return res.status(400).json({
        error:
          "Το URL πρέπει να είναι δημόσιο ChatGPT Share URL (/share/...)."
      });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error:
          `Το ChatGPT επέστρεψε HTTP ${response.status}.`
      });
    }

    const html = await response.text();

    const conversation = extractChatGPT(html);

    if (!conversation || !conversation.length) {
      return res.status(422).json({
        error:
          "Η σελίδα άνοιξε, αλλά δεν μπόρεσα να εξαγάγω τη συνομιλία."
      });
    }

    const messages = conversation
      .filter(x =>
        x &&
        (x.role === "user" ||
         x.role === "assistant")
      )
      .map(x => ({
        role:
          x.role === "user"
            ? "user"
            : "ai",

        label:
          x.role === "user"
            ? "You"
            : "ChatGPT",

        text:
          cleanText(x.text)
      }))
      .filter(x => x.text);

    if (!messages.length) {
      return res.status(422).json({
        error:
          "Η συνομιλία βρέθηκε αλλά δεν περιείχε αναγνώσιμο κείμενο."
      });
    }

    const text = messages
      .map(x =>
        `${x.label}:\n${x.text}`
      )
      .join("\n\n");

    return res.status(200).json({
      provider: "chatgpt",
      text,
      messages
    });

  } catch (error) {

    console.error(
      "EXAI URL ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "A server error occurred."
    });
  }
}


/* =========================================
   CHATGPT EXTRACTION
========================================= */

function extractChatGPT(html) {

  /*
   * Modern ChatGPT uses React Router /
   * React Server Components streaming.
   *
   * The payload may be split across
   * several enqueue() calls.
   */

  const chunks = [];

  const patterns = [
    /__reactRouterContext\.streamController\.enqueue\((["'][\s\S]*?["'])\)/g,
    /streamController\.enqueue\((["'][\s\S]*?["'])\)/g
  ];

  for (const regex of patterns) {

    let match;

    while ((match = regex.exec(html)) !== null) {

      try {

        const value =
          JSON.parse(match[1]);

        if (typeof value === "string") {
          chunks.push(value);
        }

      } catch {
        // Ignore malformed chunk
      }
    }
  }

  if (chunks.length) {

    const stream =
      chunks.join("");

    const parsed =
      parseFlightStream(stream);

    if (parsed) {

      const messages =
        findConversationMessages(parsed);

      if (messages.length) {
        return messages;
      }
    }
  }


  /*
   * Legacy Next.js fallback
   */

  const nextMatch =
    html.match(
      /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
    );

  if (nextMatch) {

    try {

      const data =
        JSON.parse(nextMatch[1]);

      const messages =
        findConversationMessages(data);

      if (messages.length) {
        return messages;
      }

    } catch {
      // Ignore legacy parse errors
    }
  }


  /*
   * Generic JSON script fallback
   */

  const scripts =
    html.match(
      /<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi
    ) || [];

  for (const script of scripts) {

    const content =
      script
        .replace(/^<script[^>]*>/i, "")
        .replace(/<\/script>$/i, "");

    try {

      const data =
        JSON.parse(content);

      const messages =
        findConversationMessages(data);

      if (messages.length) {
        return messages;
      }

    } catch {
      // Continue
    }
  }

  return [];
}


/* =========================================
   REACT FLIGHT DECODER
========================================= */

function parseFlightStream(stream) {

  const records =
    stream.split(/\n/);

  const table = [];

  for (const record of records) {

    if (!record) continue;

    const colon =
      record.indexOf(":");

    if (colon === -1) continue;

    const id =
      parseInt(
        record.slice(0, colon),
        10
      );

    if (Number.isNaN(id)) continue;

    let value =
      record.slice(colon + 1);

    /*
     * React Flight frequently has
     * special prefixes.
     */

    if (
      value.startsWith("T")
    ) {
      value = value.slice(1);
    }

    try {

      if (
        value.startsWith("\"")
      ) {

        value =
          JSON.parse(value);

      } else {

        value =
          JSON.parse(value);

      }

    } catch {

      /*
       * Some records are plain strings.
       */

      try {

        value =
          JSON.parse(
            `"${value
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')}"`
          );

      } catch {

        continue;
      }
    }

    table[id] = value;
  }

  if (!table.length) {
    return null;
  }

  return resolveReferences(
    table,
    table
  );
}


/* =========================================
   RESOLVE REFERENCES
========================================= */

function resolveReferences(
  root,
  table,
  seen = new Set()
) {

  if (typeof root === "string") {

    /*
     * Flight references can look like
     * "$1", "$2", etc.
     */

    if (
      /^\$\d+$/.test(root)
    ) {

      const id =
        parseInt(
          root.slice(1),
          10
        );

      if (
        !seen.has(id) &&
        table[id] !== undefined
      ) {

        const next =
          new Set(seen);

        next.add(id);

        return resolveReferences(
          table[id],
          table,
          next
        );
      }
    }

    return root;
  }


  if (Array.isArray(root)) {

    return root.map(item =>
      resolveReferences(
        item,
        table,
        seen
      )
    );
  }


  if (
    root &&
    typeof root === "object"
  ) {

    const result = {};

    for (
      const [key, value]
      of Object.entries(root)
    ) {

      result[key] =
        resolveReferences(
          value,
          table,
          seen
        );
    }

    return result;
  }


  return root;
}


/* =========================================
   FIND CONVERSATION
========================================= */

function findConversationMessages(
  root
) {

  const results = [];

  walk(
    root,
    results,
    new Set()
  );

  /*
   * Remove duplicates.
   */

  const unique = [];

  const seen = new Set();

  for (const item of results) {

    const key =
      `${item.role}|${item.text}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}


function walk(
  value,
  results,
  visited
) {

  if (!value) return;

  if (
    typeof value === "object"
  ) {

    if (visited.has(value)) {
      return;
    }

    visited.add(value);
  }


  if (Array.isArray(value)) {

    for (const item of value) {

      walk(
        item,
        results,
        visited
      );
    }

    return;
  }


  if (
    typeof value !== "object"
  ) {
    return;
  }


  /*
   * New conversation shape
   */

  if (
    value.author &&
    typeof value.author === "object"
  ) {

    const role =
      value.author.role;

    if (
      role === "user" ||
      role === "assistant"
    ) {

      const text =
        extractContent(
          value.content
        );

      if (text) {

        results.push({
          role,
          text
        });
      }
    }
  }


  /*
   * Another common shape
   */

  if (
    value.role === "user" ||
    value.role === "assistant"
  ) {

    const text =
      extractContent(
        value.content
      );

    if (text) {

      results.push({
        role: value.role,
        text
      });
    }
  }


  /*
   * Recursive search.
   */

  for (
    const child
    of Object.values(value)
  ) {

    walk(
      child,
      results,
      visited
    );
  }
}


/* =========================================
   CONTENT EXTRACTION
========================================= */

function extractContent(
  content
) {

  if (
    typeof content === "string"
  ) {
    return content;
  }

  if (
    Array.isArray(content)
  ) {

    return content
      .map(item =>
        extractContent(item)
      )
      .filter(Boolean)
      .join("\n");
  }

  if (
    !content ||
    typeof content !== "object"
  ) {
    return "";
  }


  if (
    Array.isArray(content.parts)
  ) {

    return content.parts
      .map(item =>
        extractContent(item)
      )
      .filter(Boolean)
      .join("\n");
  }


  if (
    typeof content.text === "string"
  ) {
    return content.text;
  }


  if (
    typeof content.value === "string"
  ) {
    return content.value;
  }


  if (
    content.content
  ) {

    return extractContent(
      content.content
    );
  }


  return "";
}


/* =========================================
   CLEAN
========================================= */

function cleanText(text) {

  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u200B/g, "")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
          }
