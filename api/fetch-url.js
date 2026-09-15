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

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        error: "Το URL δεν είναι έγκυρο."
      });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (
      hostname !== "chatgpt.com" &&
      hostname !== "www.chatgpt.com" &&
      hostname !== "chat.openai.com"
    ) {
      return res.status(400).json({
        error: "Αυτή τη στιγμή υποστηρίζεται ChatGPT Share URL."
      });
    }

    if (!parsedUrl.pathname.startsWith("/share/")) {
      return res.status(400).json({
        error:
          "Χρειάζεται δημόσιο ChatGPT Share URL που ξεκινά με /share/."
      });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error:
          `Το ChatGPT επέστρεψε HTTP ${response.status}.`
      });
    }

    const html = await response.text();

    /*
     * ==========================================
     * CHATGPT SHARE - REACT FLIGHT PAYLOAD
     * ==========================================
     */

    const payload = extractPayload(html);

    if (!payload) {
      return res.status(422).json({
        error:
          "Βρέθηκε η σελίδα του ChatGPT αλλά δεν βρέθηκε το conversation payload."
      });
    }

    const resolved = resolveValue(payload, 0);

    const messages = findMessages(resolved);

    if (!messages.length) {
      return res.status(422).json({
        error:
          "Βρέθηκε το ChatGPT payload αλλά δεν βρέθηκαν μηνύματα."
      });
    }

    const cleanMessages = messages
      .map(message => {
        const role =
          message.role === "user"
            ? "user"
            : "ai";

        const label =
          role === "user"
            ? "You"
            : "ChatGPT";

        return {
          role,
          label,
          text: String(message.text || "").trim()
        };
      })
      .filter(message => message.text);

    if (!cleanMessages.length) {
      return res.status(422).json({
        error:
          "Τα μηνύματα βρέθηκαν αλλά δεν περιείχαν κείμενο."
      });
    }

    const text = cleanMessages
      .map(message =>
        `${message.label}:\n${message.text}`
      )
      .join("\n\n");

    return res.status(200).json({
      provider: "chatgpt",
      text,
      messages: cleanMessages
    });

  } catch (error) {

    console.error("EXAI FETCH URL ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "A server error occurred while reading the URL."
    });
  }
}


/*
 * ==========================================
 * EXTRACT REACT FLIGHT PAYLOAD
 * ==========================================
 */

function extractPayload(html) {

  const scripts =
    html.match(
      /<script[^>]*>[\s\S]*?<\/script>/gi
    ) || [];

  for (const script of scripts) {

    const match =
      script.match(
        /streamController\.enqueue\("([\s\S]*?)"\)/
      );

    if (!match) continue;

    try {

      const escaped = match[1];

      const decoded =
        JSON.parse(`"${escaped}"`);

      const data =
        JSON.parse(decoded);

      if (Array.isArray(data)) {
        return data;
      }

    } catch (error) {

      console.log(
        "Payload decode failed:",
        error.message
      );

    }
  }

  return null;
}


/*
 * ==========================================
 * REACT FLIGHT RESOLVER
 * ==========================================
 */

function resolveValue(data, index, seen = new Set()) {

  if (
    index < 0 ||
    index >= data.length
  ) {
    return null;
  }

  if (seen.has(index)) {
    return null;
  }

  seen.add(index);

  const value = data[index];

  if (typeof value === "string") {

    /*
     * React Flight references sometimes
     * start with a number.
     */

    if (/^\d+$/.test(value)) {

      const ref =
        Number(value);

      if (
        ref >= 0 &&
        ref < data.length &&
        ref !== index
      ) {
        return resolveValue(
          data,
          ref,
          new Set(seen)
        );
      }
    }

    return value;
  }

  if (
    typeof value === "number"
  ) {

    return resolveValue(
      data,
      value,
      new Set(seen)
    );
  }

  if (Array.isArray(value)) {

    return value.map(
      (item, i) => {

        if (
          typeof item === "number" &&
          item >= 0 &&
          item < data.length
        ) {
          return resolveValue(
            data,
            item,
            new Set(seen)
          );
        }

        return item;
      }
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {

    const result = {};

    for (
      const [key, item]
      of Object.entries(value)
    ) {

      let resolvedItem = item;

      if (
        typeof item === "number" &&
        item >= 0 &&
        item < data.length
      ) {

        resolvedItem =
          resolveValue(
            data,
            item,
            new Set(seen)
          );
      }

      result[key] = resolvedItem;
    }

    return result;
  }

  return value;
}


/*
 * ==========================================
 * FIND CONVERSATION MESSAGES
 * ==========================================
 */

function findMessages(root) {

  const results = [];

  walk(root, results);

  return results;
}


function walk(value, results) {

  if (!value) return;

  if (Array.isArray(value)) {

    for (const item of value) {
      walk(item, results);
    }

    return;
  }

  if (
    typeof value !== "object"
  ) {
    return;
  }


  /*
   * Common ChatGPT message shape
   */

  if (
    value.author &&
    typeof value.author === "object" &&
    typeof value.content === "object"
  ) {

    const role =
      value.author.role;

    const parts =
      extractText(value.content);

    if (
      (role === "user" ||
       role === "assistant") &&
      parts
    ) {

      results.push({
        role,
        text: parts
      });

    }
  }


  /*
   * Alternative message shape
   */

  if (
    value.role &&
    value.content
  ) {

    const role =
      value.role;

    const parts =
      extractText(value.content);

    if (
      (role === "user" ||
       role === "assistant") &&
      parts
    ) {

      results.push({
        role,
        text: parts
      });

    }
  }


  for (
    const child
    of Object.values(value)
  ) {

    walk(child, results);

  }
}


/*
 * ==========================================
 * EXTRACT TEXT
 * ==========================================
 */

function extractText(content) {

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {

    return content
      .map(extractText)
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
    typeof content.text === "string"
  ) {
    return content.text;
  }


  if (
    typeof content.parts !== "undefined"
  ) {

    return extractText(
      content.parts
    );

  }


  if (
    typeof content.value !== "undefined"
  ) {

    return extractText(
      content.value
    );

  }


  return "";
        }
