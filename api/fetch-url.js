import { fetchChatGptShare } from "chatgpt-share-parser";

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

    /*
     * =========================
     * CHATGPT
     * =========================
     */

    if (
      hostname === "chatgpt.com" ||
      hostname === "www.chatgpt.com" ||
      hostname === "chat.openai.com"
    ) {
      if (!parsedUrl.pathname.startsWith("/share/")) {
        return res.status(400).json({
          error:
            "Για ChatGPT χρειάζεται δημόσιο Share URL (/share/...)."
        });
      }

      const chat = await fetchChatGptShare(url);

      if (
        !chat ||
        !Array.isArray(chat.replies) ||
        !chat.replies.length
      ) {
        return res.status(422).json({
          error:
            "Το ChatGPT share link δεν περιείχε διαθέσιμη συνομιλία."
        });
      }

      const messages = chat.replies
        .filter(message =>
          message.type === "user" ||
          message.type === "assistant"
        )
        .map(message => ({
          role:
            message.type === "user"
              ? "user"
              : "ai",

          label:
            message.type === "user"
              ? "You"
              : "ChatGPT",

          text:
            String(message.statement || "").trim()
        }))
        .filter(message => message.text);

      if (!messages.length) {
        return res.status(422).json({
          error:
            "Βρέθηκε η σελίδα αλλά δεν βρέθηκαν μηνύματα."
        });
      }

      const text = messages
        .map(message =>
          `${message.label}:\n${message.text}`
        )
        .join("\n\n");

      return res.status(200).json({
        provider: "chatgpt",
        title: chat.title || "ChatGPT Conversation",
        text,
        messages
      });
    }


    /*
     * =========================
     * CLAUDE
     * =========================
     */

    if (
      hostname === "claude.ai" ||
      hostname === "www.claude.ai"
    ) {
      return res.status(422).json({
        error:
          "Το Claude δεν παρέχει αυτή τη στιγμή έναν αντίστοιχο δημόσιο server-side share parser. Για Claude URL θα προσθέσουμε browser-based importer."
      });
    }


    /*
     * =========================
     * GEMINI
     * =========================
     */

    if (
      hostname === "gemini.google.com" ||
      hostname === "www.gemini.google.com"
    ) {
      return res.status(422).json({
        error:
          "Το Gemini δεν μπορεί να διαβαστεί αξιόπιστα με απλό server fetch. Θα χρησιμοποιηθεί browser-based importer."
      });
    }


    /*
     * =========================
     * UNSUPPORTED
     * =========================
     */

    return res.status(400).json({
      error:
        "Το EXAI δεν υποστηρίζει ακόμη αυτό το AI URL. Υποστηρίζονται ChatGPT share links και σύντομα Claude/Gemini."
    });

  } catch (error) {

    console.error("EXAI URL IMPORT ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Αποτυχία ανάγνωσης της συνομιλίας."
    });
  }
        }
