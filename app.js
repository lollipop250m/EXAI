const input = document.getElementById('input');
const fileInput = document.getElementById('file');
const importBtn = document.getElementById('import');
const exportBtn = document.getElementById('export');
const status = document.getElementById('status');
const preview = document.getElementById('preview');

const urlInput = document.getElementById('urlInput');
const urlImportBtn = document.getElementById('urlImport');

const userCount = document.getElementById('userCount');
const aiCount = document.getElementById('aiCount');
const totalCount = document.getElementById('totalCount');

let conversation = [];


/* =========================
   IMPORT
========================= */

importBtn.onclick = async () => {

  status.textContent = 'Διαβάζω τη συνομιλία…';

  try {

    let text = input.value.trim();

    if (!text && fileInput.files.length) {
      text = await fileInput.files[0].text();
    }

    if (!text) {
      status.textContent = 'Βάλε πρώτα μια συνομιλία ή διάλεξε αρχείο.';
      return;
    }

    conversation = parseConversation(text);

    if (!conversation.length) {
      status.textContent = 'Δεν μπόρεσα να βρω μηνύματα.';
      return;
    }

    const users =
      conversation.filter(m => m.role === 'user').length;

    const ai =
      conversation.filter(m => m.role === 'ai').length;

    userCount.textContent = users;
    aiCount.textContent = ai;
    totalCount.textContent = conversation.length;

    preview.style.display = 'block';
    exportBtn.disabled = false;

    status.textContent =
      `Η συνομιλία αναγνωρίστηκε ✓ (${conversation.length} μηνύματα)`;

  } catch (error) {

    console.error(error);
    status.textContent = 'Κάτι πήγε στραβά.';

  }

};


/* =========================
   FILE IMPORT
========================= */

fileInput.addEventListener('change', async () => {

  if (!fileInput.files.length) return;

  try {

    const file = fileInput.files[0];
    const text = await file.text();

    input.value = text;

    status.textContent =
      `Το αρχείο φορτώθηκε ✓ (${file.name})`;

  } catch {

    status.textContent =
      'Δεν μπορώ να διαβάσω αυτό το αρχείο.';

  }

});


/* =========================
   URL IMPORT
========================= */

urlImportBtn.onclick = async () => {

  const url = urlInput.value.trim();

  if (!url) {
    status.textContent = 'Βάλε πρώτα το URL της συνομιλίας.';
    return;
  }

  try {

    new URL(url);

  } catch {

    status.textContent = 'Το URL δεν είναι έγκυρο.';
    return;

  }

  urlImportBtn.disabled = true;

  status.textContent =
    'Διαβάζω τη συνομιλία από το URL…';

  try {

    const response = await fetch('/api/fetch-url', {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        url
      })

    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Δεν μπόρεσα να διαβάσω το URL.'
      );
    }

    if (!data.text) {
      throw new Error(
        'Δεν βρέθηκε περιεχόμενο συνομιλίας στο URL.'
      );
    }

    input.value = data.text;

    conversation = parseConversation(data.text);

    if (!conversation.length) {

      status.textContent =
        'Βρήκα τη σελίδα, αλλά δεν μπόρεσα να αναγνωρίσω τη συνομιλία.';

      return;

    }

    const users =
      conversation.filter(
        m => m.role === 'user'
      ).length;

    const ai =
      conversation.filter(
        m => m.role === 'ai'
      ).length;

    userCount.textContent = users;
    aiCount.textContent = ai;
    totalCount.textContent = conversation.length;

    preview.style.display = 'block';

    exportBtn.disabled = false;

    status.textContent =
      `Η συνομιλία φορτώθηκε από URL ✓ (${conversation.length} μηνύματα)`;

  } catch (error) {

    console.error(error);

    status.textContent =
      error.message ||
      'Δεν μπόρεσα να διαβάσω αυτό το URL.';

  } finally {

    urlImportBtn.disabled = false;

  }

};


/* =========================
   EXAI IMPORTER
========================= */

function parseConversation(text) {

  text = cleanImportedText(text);

  const patterns = [

    {
      regex:
        /(?:^|\n)\s*(You|User|Εσύ)\s*:\s*/gi,
      role: 'user'
    },

    {
      regex:
        /(?:^|\n)\s*(Assistant|AI|ChatGPT|Claude|Gemini|Perplexity|Grok)\s*:\s*/gi,
      role: 'ai'
    }

  ];


  const markers = [];

  for (const pattern of patterns) {

    let match;

    while ((match = pattern.regex.exec(text)) !== null) {

      markers.push({
        index: match.index,
        end: pattern.regex.lastIndex,
        role: pattern.role,
        label: match[1]
      });

    }

  }


  markers.sort((a, b) => a.index - b.index);


  if (markers.length) {

    const result = [];

    for (let i = 0; i < markers.length; i++) {

      const marker = markers[i];

      const start = marker.end;

      const end =
        i + 1 < markers.length
          ? markers[i + 1].index
          : text.length;

      const content =
        text.slice(start, end).trim();

      if (!content) continue;

      result.push({
        role: marker.role,
        text: content,
        label: normalizeLabel(marker.label)
      });

    }

    if (result.length) {
      return result;
    }

  }


  return parseBlocks(text);

}


/* =========================
   BLOCK PARSER
========================= */

function parseBlocks(text) {

  const blocks =
    text
      .split(/\n{2,}/)
      .map(x => x.trim())
      .filter(Boolean);

  if (!blocks.length) return [];

  return blocks.map((block, index) => {

    let role = 'message';
    let label = 'Message';
    let cleaned = block;


    if (
      /^(you|user|εσύ)\s*:?\s*/i.test(block)
    ) {

      role = 'user';
      label = 'You';

      cleaned =
        block.replace(
          /^(you|user|εσύ)\s*:?\s*/i,
          ''
        );

    }


    else if (
      /^(assistant|ai|chatgpt|claude|gemini|perplexity|grok)\s*:?\s*/i.test(block)
    ) {

      role = 'ai';

      const match =
        block.match(
          /^(assistant|ai|chatgpt|claude|gemini|perplexity|grok)/i
        );

      label =
        normalizeLabel(match ? match[1] : 'AI');

      cleaned =
        block.replace(
          /^(assistant|ai|chatgpt|claude|gemini|perplexity|grok)\s*:?\s*/i,
          ''
        );

    }


    else {

      if (index % 2 === 0) {
        role = 'user';
        label = 'You';
      } else {
        role = 'ai';
        label = 'AI';
      }

    }


    return {
      role,
      text: cleaned,
      label
    };

  });

}


/* =========================
   CLEAN TEXT
========================= */

function cleanImportedText(text) {

  return String(text)

    .replace(/\r\n/g, '\n')

    .replace(/\r/g, '\n')

    .replace(/\u200B/g, '')

    .replace(/\n{4,}/g, '\n\n')

    .trim();

}


/* =========================
   LABEL NORMALIZATION
========================= */

function normalizeLabel(label) {

  const value =
    String(label || '').toLowerCase();

  if (
    value === 'you' ||
    value === 'user' ||
    value === 'εσύ'
  ) {
    return 'You';
  }

  if (value === 'chatgpt') {
    return 'ChatGPT';
  }

  if (value === 'claude') {
    return 'Claude';
  }

  if (value === 'gemini') {
    return 'Gemini';
  }

  if (value === 'perplexity') {
    return 'Perplexity';
  }

  if (value === 'grok') {
    return 'Grok';
  }

  if (
    value === 'assistant' ||
    value === 'ai'
  ) {
    return 'AI';
  }

  return label || 'Message';

}


/* =========================
   WORD EXPORT
========================= */

exportBtn.onclick = async () => {

  if (!conversation.length) return;

  exportBtn.disabled = true;

  status.textContent =
    'Δημιουργώ το Word…';

  try {

    const blob = await makeDocx(
      conversation,
      'EXAI Conversation'
    );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;

    a.download =
      'EXAI-Conversation.docx';

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);

    status.textContent =
      'Το Word δημιουργήθηκε ✓';

  } catch (error) {

    console.error(error);

    status.textContent =
      'Κάτι πήγε στραβά.';

  } finally {

    exportBtn.disabled = false;

  }

};


/* =========================
   DOCX
========================= */

async function makeDocx(messages, title) {

  if (typeof docx === 'undefined') {
    throw new Error('Η βιβλιοθήκη DOCX δεν φορτώθηκε.');
  }

  const {
    Document,
    Paragraph,
    TextRun,
    HeadingLevel,
    Packer
  } = docx;

  const children = [];


  /* =========================
     TITLE
  ========================= */

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE
    })
  );


  /* =========================
     MESSAGES
  ========================= */

  messages.forEach(message => {

    const label =
      message.label ||
      (
        message.role === 'user'
          ? 'You'
          : message.role === 'ai'
          ? 'AI'
          : 'Message'
      );


    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            bold: true
          })
        ],
        spacing: {
          before: 240,
          after: 80
        }
      })
    );


    const lines =
      String(message.text || '')
        .split('\n');


    lines.forEach(line => {

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line || ' '
            })
          ],
          spacing: {
            after: 100
          }
        })
      );

    });

  });


  /* =========================
     DOCUMENT
  ========================= */

  const document =
    new Document({

      title: title,

      description:
        'Conversation exported by EXAI',

      creator:
        'EXAI',

      sections: [
        {
          children
        }
      ]

    });


  return await Packer.toBlob(document);

}
