export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({
        error: 'URL is required'
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL'
      });
    }

    const hostname =
      parsedUrl.hostname.toLowerCase();

    /*
      ==========================================
      CHATGPT SHARED LINK
      ==========================================
    */

    if (
      hostname === 'chatgpt.com' ||
      hostname === 'www.chatgpt.com'
    ) {

      if (!parsedUrl.pathname.startsWith('/share/')) {

        return res.status(400).json({
          error: 'Δεν είναι ChatGPT shared conversation URL.'
        });

      }

      const shareId =
        parsedUrl.pathname
          .split('/share/')[1]
          ?.split('/')[0];

      if (!shareId) {
        return res.status(400).json({
          error: 'Δεν βρέθηκε το ChatGPT shared ID.'
        });
      }

      /*
        Το ChatGPT shared page δεν επιστρέφει
        τη συνομιλία ως απλό HTML.

        Ζητάμε πρώτα τη σελίδα με browser-like
        headers.
      */

      const response = await fetch(
        `https://chatgpt.com/share/${shareId}`,
        {
          method: 'GET',

          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',

            'Accept':
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

            'Accept-Language':
              'en-US,en;q=0.9',

            'Cache-Control':
              'no-cache'
          },

          redirect: 'follow'
        }
      );

      if (!response.ok) {

        return res.status(502).json({
          error:
            `Το ChatGPT επέστρεψε HTTP ${response.status}.`
        });

      }

      const html =
        await response.text();


      /*
        ==========================================
        1. ΨΑΧΝΟΥΜΕ ΓΙΑ ΕΝΣΩΜΑΤΩΜΕΝΑ JSON DATA
        ==========================================
      */

      let conversationData = null;


      /*
        Next.js / React data
      */

      const dataMatches = [
        ...html.matchAll(
          /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
        )
      ];


      for (const match of dataMatches) {

        try {

          const json =
            JSON.parse(match[1]);

          const found =
            findConversationData(json);

          if (found) {

            conversationData = found;
            break;

          }

        } catch {
          // συνεχίζουμε
        }

      }


      /*
        ==========================================
        2. ΨΑΧΝΟΥΜΕ ΓΙΑ JSON ΣΤΟ HTML
        ==========================================
      */

      if (!conversationData) {

        const possibleJson =
          extractJsonObjects(html);

        for (const candidate of possibleJson) {

          try {

            const json =
              JSON.parse(candidate);

            const found =
              findConversationData(json);

            if (found) {

              conversationData = found;
              break;

            }

          } catch {
            // συνεχίζουμε
          }

        }

      }


      /*
        ==========================================
        3. ΑΝ ΒΡΕΘΗΚΕ CONVERSATION DATA
        ==========================================
      */

      if (conversationData) {

        const messages =
          extractMessages(conversationData);

        if (messages.length) {

          const text =
            messages
              .map(message => {

                const label =
                  message.role === 'user'
                    ? 'You'
                    : 'ChatGPT';

                return `${label}:\n${message.text}`;

              })
              .join('\n\n');


          if (text.trim()) {

            return res.status(200).json({
              text
            });

          }

        }

      }


      /*
        ==========================================
        4. FALLBACK HTML EXTRACTION
        ==========================================
      */

      let text =
        html

          .replace(
            /<script[\s\S]*?<\/script>/gi,
            ' '
          )

          .replace(
            /<style[\s\S]*?<\/style>/gi,
            ' '
          )

          .replace(
            /<svg[\s\S]*?<\/svg>/gi,
            ' '
          )

          .replace(
            /<br\s*\/?>/gi,
            '\n'
          )

          .replace(
            /<\/p>/gi,
            '\n'
          )

          .replace(
            /<\/div>/gi,
            '\n'
          )

          .replace(
            /<[^>]+>/g,
            ' '
          )

          .replace(
            /&nbsp;/gi,
            ' '
          )

          .replace(
            /&amp;/gi,
            '&'
          )

          .replace(
            /&lt;/gi,
            '<'
          )

          .replace(
            /&gt;/gi,
            '>'
          )

          .replace(
            /&quot;/gi,
            '"'
          )

          .replace(
            /&#39;/gi,
            "'"
          )

          .replace(
            /\s+\n/g,
            '\n'
          )

          .replace(
            /\n\s+/g,
            '\n'
          )

          .replace(
            /[ \t]{2,}/g,
            ' '
          )

          .replace(
            /\n{3,}/g,
            '\n\n'
          )

          .trim();


      /*
        Αν έχουμε μόνο τίτλο / λίγη πληροφορία,
        δεν το θεωρούμε επιτυχημένο import.
      */

      if (
        !text ||
        text.length < 200
      ) {

        return res.status(422).json({
          error:
            'Το ChatGPT shared link άνοιξε, αλλά η συνομιλία δεν ήταν διαθέσιμη ως δεδομένα για εισαγωγή.'
        });

      }


      return res.status(200).json({
        text
      });

    }


    /*
      ==========================================
      GEMINI / CLAUDE
      ==========================================
    */

    return res.status(403).json({
      error:
        'Προς το παρόν το URL import υποστηρίζει ChatGPT shared links.'
    });


  } catch (error) {

    console.error(
      'EXAI URL IMPORT ERROR:',
      error
    );

    return res.status(500).json({
      error:
        'Σφάλμα κατά την ανάγνωση του URL.'
    });

  }

}


/* ==========================================
   FIND CONVERSATION DATA
========================================== */

function findConversationData(value) {

  if (!value || typeof value !== 'object') {
    return null;
  }


  /*
    Συνηθισμένα ονόματα που μπορεί να περιέχουν
    conversation data.
  */

  const possibleKeys = [
    'conversation',
    'messages',
    'mapping',
    'current_node',
    'message',
    'data'
  ];


  for (const key of possibleKeys) {

    if (value[key]) {

      const found =
        findConversationData(value[key]);

      if (found) {
        return found;
      }

    }

  }


  /*
    Έλεγχος αν το ίδιο object μοιάζει
    ήδη με conversation message.
  */

  if (
    value.role ||
    value.author ||
    value.content
  ) {

    return value;

  }


  /*
    Recursive search
  */

  for (const key of Object.keys(value)) {

    const child =
      value[key];

    if (
      child &&
      typeof child === 'object'
    ) {

      const found =
        findConversationData(child);

      if (found) {
        return found;
      }

    }

  }

  return null;

}


/* ==========================================
   EXTRACT MESSAGES
========================================== */

function extractMessages(data) {

  const messages = [];


  /*
    Mapping-style ChatGPT data
  */

  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.mapping
  ) {

    const mapping =
      data.mapping;

    for (const nodeId of Object.keys(mapping)) {

      const node =
        mapping[nodeId];

      if (!node || !node.message) {
        continue;
      }

      const message =
        node.message;

      const role =
        message.author?.role ||
        message.role;

      if (
        role !== 'user' &&
        role !== 'assistant'
      ) {
        continue;
      }

      const text =
        extractMessageText(
          message.content
        );

      if (!text) {
        continue;
      }

      messages.push({
        role,
        text
      });

    }

    return messages;

  }


  /*
    Array-style messages
  */

  if (Array.isArray(data)) {

    for (const item of data) {

      const role =
        item?.author?.role ||
        item?.role;

      if (
        role !== 'user' &&
        role !== 'assistant'
      ) {
        continue;
      }

      const text =
        extractMessageText(
          item.content || item
        );

      if (!text) {
        continue;
      }

      messages.push({
        role,
        text
      });

    }

    return messages;

  }


  /*
    Single message
  */

  if (
    data &&
    typeof data === 'object'
  ) {

    const role =
      data.author?.role ||
      data.role;

    const text =
      extractMessageText(
        data.content || data
      );

    if (
      (
        role === 'user' ||
        role === 'assistant'
      ) &&
      text
    ) {

      messages.push({
        role,
        text
      });

    }

  }

  return messages;

}


/* ==========================================
   MESSAGE TEXT
========================================== */

function extractMessageText(content) {

  if (!content) {
    return '';
  }


  if (typeof content === 'string') {
    return content.trim();
  }


  if (Array.isArray(content)) {

    return content
      .map(item =>
        extractMessageText(item)
      )
      .filter(Boolean)
      .join('\n')
      .trim();

  }


  if (
    typeof content === 'object'
  ) {

    if (
      typeof content.parts !== 'undefined'
    ) {

      return extractMessageText(
        content.parts
      );

    }

    if (
      typeof content.text === 'string'
    ) {

      return content.text.trim();

    }

    if (
      typeof content.content === 'string'
    ) {

      return content.content.trim();

    }

  }

  return '';

}


/* ==========================================
   JSON EXTRACTION FALLBACK
========================================== */

function extractJsonObjects(html) {

  const results = [];

  const regex =
    /<script[^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {

    const content =
      match[1].trim();

    if (
      content.startsWith('{') ||
      content.startsWith('[')
    ) {

      results.push(content);

    }

  }

  return results;

  }
