const input = document.getElementById('input');
const fileInput = document.getElementById('file');
const importBtn = document.getElementById('import');
const exportBtn = document.getElementById('export');
const status = document.getElementById('status');
const preview = document.getElementById('preview');

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
   EXAI IMPORTER
========================= */

function parseConversation(text) {

  text = cleanImportedText(text);

  /*
    Πρώτα προσπαθούμε να βρούμε
    ξεκάθαρα User / Assistant messages.
  */

  const patterns = [

    /*
      You:
      Assistant:
    */

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


  /*
    Βρίσκουμε όλους τους πιθανούς
    message headers.
  */

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


  /*
    Ταξινόμηση με βάση τη θέση
    μέσα στο κείμενο.
  */

  markers.sort((a, b) => a.index - b.index);


  /*
    Αν βρέθηκαν γνωστά message headers,
    δημιουργούμε messages.
  */

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


  /*
    Αν δεν βρέθηκαν headers,
    δοκιμάζουμε blocks.
  */

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


    /*
      User
    */

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


    /*
      AI
    */

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


    /*
      Αν δεν γνωρίζουμε τον ρόλο,
      προσπαθούμε να καταλάβουμε
      από τη σειρά των blocks.
    */

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

    /*
      Windows line endings
    */
    .replace(/\r\n/g, '\n')

    /*
      Old Mac line endings
    */
    .replace(/\r/g, '\n')

    /*
      Zero-width characters
    */
    .replace(/\u200B/g, '')

    /*
      Excessive empty lines
    */
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

    const blob = makeDocx(
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
   ESCAPE XML
========================= */

function esc(s) {

  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

}


/* =========================
   DOCX
========================= */

function makeDocx(messages, title) {

  const files = {};

  files['[Content_Types].xml'] = `
<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels"
ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml"
ContentType="application/xml"/>
<Override PartName="/word/document.xml"
ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`;

  files['_rels/.rels'] = `
<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship
Id="rId1"
Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
Target="word/document.xml"/>
</Relationships>
`;

  let body = `
<w:p>
<w:r>
<w:rPr><w:b/></w:rPr>
<w:t>${esc(title)}</w:t>
</w:r>
</w:p>
`;


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


    body += `
<w:p>
<w:r>
<w:rPr><w:b/></w:rPr>
<w:t>${esc(label)}</w:t>
</w:r>
</w:p>
`;


    const lines =
      message.text.split('\n');


    lines.forEach(line => {

      body += `
<w:p>
<w:r>
<w:t xml:space="preserve">${esc(line)}</w:t>
</w:r>
</w:p>
`;

    });

  });


  files['word/document.xml'] = `
<?xml version="1.0"?>

<w:document
xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">

<w:body>

${body}

<w:sectPr/>

</w:body>

</w:document>
`;

  return new Blob(
    [zip(files)],
    {
      type:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  );

}


/* =========================
   ZIP
========================= */

function zip(entries) {

  const enc =
    new TextEncoder();

  const chunks = [];
  const central = [];

  let offset = 0;


  for (
    const [name, content]
    of Object.entries(entries)
  ) {

    const n =
      enc.encode(name);

    const d =
      enc.encode(content);

    const crc =
      crc32(d);


    const local =
      new Uint8Array(
        30 + n.length + d.length
      );

    const v =
      new DataView(
        local.buffer
      );


    p32(v, 0, 0x04034b50);
    p16(v, 4, 20);
    p16(v, 6, 0);
    p16(v, 8, 0);
    p16(v, 10, 0);
    p16(v, 12, 0);

    p32(v, 14, crc);
    p32(v, 18, d.length);
    p32(v, 22, d.length);

    p16(v, 26, n.length);
    p16(v, 28, 0);

    local.set(n, 30);
    local.set(
      d,
      30 + n.length
    );

    chunks.push(local);


    const q =
      new Uint8Array(
        46 + n.length
      );

    const w =
      new DataView(
        q.buffer
      );


    p32(w, 0, 0x02014b50);

    p16(w, 4, 20);
    p16(w, 6, 20);
    p16(w, 8, 0);
    p16(w, 10, 0);
    p16(w, 12, 0);
    p16(w, 14, 0);

    p32(w, 16, crc);
    p32(w, 20, d.length);
    p32(w, 24, d.length);

    p16(w, 28, n.length);
    p16(w, 30, 0);
    p16(w, 32, 0);
    p16(w, 34, 0);
    p16(w, 36, 0);

    p32(w, 38, 0);
    p32(w, 42, offset);

    q.set(n, 46);

    central.push(q);

    offset +=
      local.length;

  }


  const centralSize =
    central.reduce(
      (a, b) => a + b.length,
      0
    );


  const end =
    new Uint8Array(22);

  const v =
    new DataView(
      end.buffer
    );


  p32(
    v,
    0,
    0x06054b50
  );

  p16(v, 4, 0);
  p16(v, 6, 0);

  p16(
    v,
    8,
    central.length
  );

  p16(
    v,
    10,
    central.length
  );

  p32(
    v,
    12,
    centralSize
  );

  p32(
    v,
    16,
    offset
  );

  p16(v, 20, 0);


  return new Blob(
    [
      ...chunks,
      ...central,
      end
    ],
    {
      type:
        'application/zip'
    }
  );

}


/* =========================
   BINARY HELPERS
========================= */

function p16(v, o, n) {

  v.setUint16(
    o,
    n,
    true
  );

}


function p32(v, o, n) {

  v.setUint32(
    o,
    n >>> 0,
    true
  );

}


/* =========================
   CRC32
========================= */

function crc32(bytes) {

  let c =
    0xffffffff;


  for (const b of bytes) {

    c ^= b;


    for (
      let i = 0;
      i < 8;
      i++
    ) {

      c =
        (c >>> 1) ^
        (
          (c & 1)
            ? 0xedb88320
            : 0
        );

    }

  }


  return (
    c ^ 0xffffffff
  ) >>> 0;

      }
