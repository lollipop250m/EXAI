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

importBtn.onclick = async () => {

  status.textContent = 'Διαβάζω τη συνομιλία…';

  try {

    let text = input.value.trim();

    // Αν έχει επιλεγεί αρχείο, το διαβάζουμε
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

    const users = conversation.filter(m => m.role === 'user').length;
    const ai = conversation.filter(m => m.role === 'ai').length;

    userCount.textContent = users;
    aiCount.textContent = ai;
    totalCount.textContent = conversation.length;

    preview.style.display = 'block';
    exportBtn.disabled = false;

    status.textContent = 'Η συνομιλία αναγνωρίστηκε ✓';

  } catch (error) {

    console.error(error);
    status.textContent = 'Κάτι πήγε στραβά.';

  }

};


fileInput.addEventListener('change', async () => {

  if (!fileInput.files.length) return;

  try {

    const text = await fileInput.files[0].text();

    input.value = text;

    status.textContent = 'Το αρχείο φορτώθηκε ✓';

  } catch {

    status.textContent = 'Δεν μπορώ να διαβάσω αυτό το αρχείο.';

  }

});


function parseConversation(text) {

  const blocks = text
    .split(/\n{2,}/)
    .map(x => x.trim())
    .filter(Boolean);

  return blocks.map(block => {

    let role = 'message';

    if (/^(you|user|εσύ)\s*:/i.test(block)) {

      role = 'user';

    } else if (
      /^(assistant|ai|chatgpt|claude|gemini|perplexity|grok)\s*:/i.test(block)
    ) {

      role = 'ai';

    }

    const cleaned = block.replace(
      /^([^:]{1,40}):\s*/,
      ''
    );

    return {
      role,
      text: cleaned
    };

  });

}


exportBtn.onclick = async () => {

  if (!conversation.length) return;

  exportBtn.disabled = true;

  status.textContent = 'Δημιουργώ το Word…';

  try {

    const blob = makeDocx(
      conversation,
      'EXAI Conversation'
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;
    a.download = 'EXAI-Conversation.docx';

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);

    status.textContent = 'Το Word δημιουργήθηκε ✓';

  } catch (error) {

    console.error(error);

    status.textContent = 'Κάτι πήγε στραβά.';

  } finally {

    exportBtn.disabled = false;

  }

};


function esc(s) {

  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

}


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
      message.role === 'user'
        ? 'You'
        : message.role === 'ai'
        ? 'AI'
        : 'Message';

    body += `
<w:p>
<w:r>
<w:rPr><w:b/></w:rPr>
<w:t>${label}</w:t>
</w:r>
</w:p>
`;

    const lines = message.text.split('\n');

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


function zip(entries) {

  const enc = new TextEncoder();

  const chunks = [];
  const central = [];

  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {

    const n = enc.encode(name);
    const d = enc.encode(content);

    const crc = crc32(d);

    const local =
      new Uint8Array(
        30 + n.length + d.length
      );

    const v =
      new DataView(local.buffer);

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

    local.set(n, 30
