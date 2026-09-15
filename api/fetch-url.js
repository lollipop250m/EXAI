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

    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL'
      });
    }

    const hostname =
      parsed.hostname.toLowerCase();

    /*
      Για ασφάλεια δεν επιτρέπουμε οποιοδήποτε
      URL να χρησιμοποιεί το EXAI σαν proxy.
    */

    const allowedHosts = [

      'chatgpt.com',
      'www.chatgpt.com',

      'chat.openai.com',
      'www.chat.openai.com',

      'g.co',
      'gemini.google.com',

      'claude.ai',
      'www.claude.ai'

    ];

    const allowed =
      allowedHosts.some(host =>
        hostname === host ||
        hostname.endsWith('.' + host)
      );

    if (!allowed) {

      return res.status(403).json({
        error:
          'Αυτό το URL δεν υποστηρίζεται ακόμα. Δοκίμασε ένα shared link από ChatGPT, Gemini ή Claude.'
      });

    }

    const response = await fetch(url, {

      method: 'GET',

      headers: {

        'User-Agent':
          'Mozilla/5.0 (compatible; EXAI/2.0; +https://exai-eight.vercel.app)',

        'Accept':
          'text/html,application/xhtml+xml'

      },

      redirect: 'follow'

    });

    if (!response.ok) {

      return res.status(502).json({
        error:
          `Η σελίδα επέστρεψε HTTP ${response.status}.`
      });

    }

    const contentType =
      response.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) {

      return res.status(400).json({
        error:
          'Το URL δεν επέστρεψε HTML σελίδα.'
      });

    }

    const html =
      await response.text();

    /*
      Αφαιρούμε στοιχεία που δεν χρειάζονται.
    */

    let text = html

      .replace(/<script[\s\S]*?<\/script>/gi, ' ')

      .replace(/<style[\s\S]*?<\/style>/gi, ' ')

      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')

      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')

      .replace(/<br\s*\/?>/gi, '\n')

      .replace(/<\/p>/gi, '\n')

      .replace(/<\/div>/gi, '\n')

      .replace(/<\/li>/gi, '\n')

      .replace(/<[^>]+>/g, ' ')

      .replace(/&nbsp;/gi, ' ')

      .replace(/&amp;/gi, '&')

      .replace(/&lt;/gi, '<')

      .replace(/&gt;/gi, '>')

      .replace(/&quot;/gi, '"')

      .replace(/&#39;/gi, "'")

      .replace(/\s+\n/g, '\n')

      .replace(/\n\s+/g, '\n')

      .replace(/[ \t]{2,}/g, ' ')

      .replace(/\n{3,}/g, '\n\n')

      .trim();

    if (!text) {

      return res.status(422).json({
        error:
          'Η σελίδα δεν περιείχε αναγνώσιμο κείμενο.'
      });

    }

    return res.status(200).json({
      text
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        'Σφάλμα κατά την ανάγνωση του URL.'
    });

  }

      }
