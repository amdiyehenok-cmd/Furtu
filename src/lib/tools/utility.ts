import { SINGLE } from './formats';
import type { ToolDefinition } from './types';

const LOCAL = 'local' as const;

export const UTILITY_TOOLS: ToolDefinition[] = [
  {
    slug: 'word-counter',
    category: 'utility',
    name: 'Word Counter',
    summary: 'Count words, characters, sentences and paragraphs, with a reading time.',
    description:
      'Measure a piece of writing the way an editor would: words, characters with and without spaces, sentences, paragraphs, reading time at your own pace, and the words that appear most often once the filler is out of the way. Everything is counted in the browser, so an unpublished draft stays unpublished.',
    icon: 'text',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'number',
        id: 'readingSpeed',
        label: 'Reading speed',
        min: 60,
        max: 1000,
        step: 10,
        default: 200,
        suffix: 'words per minute',
        help: 'About 200 for adult reading of general prose; lower for technical material, higher for skimming.',
      },
      {
        kind: 'number',
        id: 'topWords',
        label: 'Words to list',
        min: 1,
        max: 20,
        step: 1,
        default: 5,
        help: 'The most frequent words, ignoring the common short ones that tell you nothing.',
      },
    ],
    keywords: ['word counter', 'count words', 'word count', 'character count', 'reading time'],
    synonyms: ['count words', 'essay length', 'reading time', 'how many words', 'text stats'],
    popular: true,
    faq: [
      {
        q: 'How are words counted?',
        a: 'By whitespace. Anything separated by a space, a tab or a line break is a word, which is how word processors do it. So a hyphenated pair counts as one word, and a number with a thousands separator counts as one, while some other tools count both halves.',
      },
      {
        q: 'Why is the sentence count approximate?',
        a: 'Because there is no reliable way to count sentences in a string. A full stop inside an abbreviation, a decimal number like 3.14, or a bullet fragment with no full stop at all each break a naive counter. Furtu splits on a full stop, an exclamation mark, a question mark and an ellipsis followed by whitespace, which handles ordinary prose well and says so rather than claiming precision it does not have.',
      },
      {
        q: 'How accurate is the reading time?',
        a: 'It is a division: words divided by words per minute. It assumes steady reading at that pace, which is a best case. Any real reading involves rereading a hard sentence, looking a word up, or stopping, so treat the number as a floor and set your own speed to see how much it moves.',
      },
      {
        q: 'Is my draft uploaded?',
        a: 'No. Counting is arithmetic on a string, done in the tab. Nothing is transmitted, and the text is only in memory while the page is open.',
      },
    ],
    howItWorks: [
      { title: 'Paste the text', body: 'The figures update as you type, in the browser.' },
      { title: 'Set your reading pace', body: 'A technical paper is slower to read than a blog post, and the estimate should say so.' },
      { title: 'Check the vocabulary', body: 'The most frequent words usually show exactly which idea the piece is circling.' },
    ],
    limitations: [
      'Sentence counting is a heuristic and will be thrown by abbreviations, decimals and lists.',
      'Reading time is a division, not a measurement. It knows nothing about difficulty or the reader.',
      'Frequent-word counting excludes short common words, so a piece built on one preposition will look thinner than it reads.',
    ],
    related: ['character-counter', 'lorem-ipsum-generator', 'text-cleaner'],
    mode: LOCAL,
  },
  {
    slug: 'character-counter',
    category: 'utility',
    name: 'Character Counter',
    summary: 'Count characters against a limit, in whichever unit the limit uses.',
    description:
      'A counter built for limits rather than for prose. It reports characters, code units, code points, graphemes and UTF-8 bytes at once, because they disagree the moment anything outside plain ASCII is involved, and shows how much room is left in whatever limit you are working to.',
    icon: 'type',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'number',
        id: 'limit',
        label: 'Limit',
        min: 0,
        max: 1000000,
        step: 10,
        default: 280,
        help: 'The number the platform, form field or database column will enforce. 280 for a post, 160 for a single SMS segment, 60 for a subject line worth reading.',
      },
      {
        kind: 'select',
        id: 'countAs',
        label: 'Count as',
        default: 'graphemes',
        options: [
          { value: 'graphemes', label: 'Graphemes — what a person sees as a character' },
          { value: 'units', label: 'UTF-16 code units — what most JavaScript counts' },
          { value: 'bytes', label: 'UTF-8 bytes — what a file or a column limit uses' },
        ],
        help: 'The remaining figure follows this choice, so match it to the system that will reject you.',
      },
    ],
    keywords: ['character counter', 'character limit', 'count characters', 'post character count', 'text limit'],
    synonyms: ['char count', 'limit', 'length check', 'how many characters', 'count with spaces'],
    faq: [
      {
        q: 'Why does the same string have four different lengths?',
        a: 'Because there are four different questions. UTF-8 bytes are what a file takes up. Code points are the characters of the Unicode standard, so an accented letter is one. Code units are what JavaScript strings measure, so a character outside the basic plane takes two. Graphemes are what a reader perceives, so an accented letter is one and a family emoji is one. They are the same number only when the text is pure ASCII.',
      },
      {
        q: 'What does a platform actually count?',
        a: 'It depends on the platform and it is worth checking rather than assuming. Most count something close to code points, some count UTF-16 units, and a few bill by weighted length, where an emoji or a CJK character costs two. When the limit is a hard database column, bytes are what matter. Set the unit to match, and leave a margin.',
      },
      {
        q: 'How are graphemes counted when the browser cannot?',
        a: 'With the international text segmenter where it is available, which is every current browser. Without it, Furtu falls back to code points and says so in the read-out, because the difference is invisible until you paste an emoji.',
      },
      {
        q: 'Is this the same as the word counter?',
        a: 'No, and the difference is deliberate. This tool is about a limit and the several ways a string can be measured against one. The word counter is about prose: sentences, paragraphs, reading time and vocabulary.',
      },
      {
        q: "Is the text I am counting uploaded?",
        a: "No. Counting happens as you type in your browser, so you can check a draft of an announcement, a private message or an unreleased title without it being transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Set the limit', body: 'Whatever the platform or field will enforce.' },
      { title: 'Choose the unit', body: 'The remaining figure follows it, and every other measure is shown alongside.' },
      { title: 'Watch the remainder', body: 'Furtu says plainly how far over you are, if you are.' },
    ],
    limitations: [
      'Weighted-length rules, where some characters cost two, are not implemented. Check the platform’s own guidance for those.',
      'The limit is a number, not a rule: it does not know about forbidden words, mandatory fields or a server-side tokeniser.',
    ],
    related: ['word-counter', 'text-cleaner', 'unit-converter'],
    mode: LOCAL,
  },
  {
    slug: 'text-cleaner',
    category: 'utility',
    name: 'Text Cleaner',
    summary: 'Fix the invisible damage in pasted text, one step at a time.',
    description:
      'Text copied from a PDF, an email or a word processor arrives with trailing spaces, mixed line endings, non-breaking spaces and zero-width characters that break searches and diffs. Each repair is a separate toggle, and Furtu lists what it changed and why.',
    icon: 'spark',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      { kind: 'toggle', id: 'normaliseLineEndings', label: 'Normalise line endings', default: true, help: 'CRLF, CR and LF all become LF.' },
      {
        kind: 'toggle',
        id: 'removeInvisible',
        label: 'Remove invisible characters',
        default: true,
        help: 'Zero-width characters, soft hyphens, non-breaking spaces, directional marks and byte order marks. These are why a search for a visible word sometimes finds nothing.',
      },
      { kind: 'toggle', id: 'stripHtml', label: 'Strip HTML tags', default: false, help: 'Removes the markup and the contents of any script or style element.' },
      { kind: 'toggle', id: 'trimTrailing', label: 'Trim trailing whitespace', default: true, help: 'Spaces and tabs at the end of each line.' },
      { kind: 'toggle', id: 'collapseBlankLines', label: 'Collapse blank lines', default: true, help: 'Three or more newlines in a row become one blank line.' },
      { kind: 'toggle', id: 'collapseSpaces', label: 'Collapse repeated spaces', default: false, help: 'Within a line only. Turn this on carefully if the spacing is deliberate, as it is in ASCII art and hand-aligned tables.' },
    ],
    keywords: ['text cleaner', 'clean text', 'remove extra spaces', 'remove line breaks', 'strip html'],
    synonyms: ['tidy text', 'clean up', 'fix whitespace', 'remove invisible characters', 'normalise text'],
    faq: [
      {
        q: 'What are the invisible characters?',
        a: 'They are real code points that occupy no width: a soft hyphen, zero-width characters, directional marks, bidirectional overrides that can reverse how a line displays, and a byte order mark. A non-breaking space is also invisible, as a space. Each is named with its code point in the notes, so you can see which one was in your text.',
      },
      {
        q: 'Does stripping HTML decode the entities?',
        a: 'No. The tags go and the entities stay, as written. Decoding them means choosing a character set and accepting that a bare ampersand is not always an entity, and getting it wrong corrupts text that was fine. If you need the characters, the document tools make that decision explicitly.',
      },
      {
        q: 'Is it safe to collapse repeated spaces?',
        a: 'For prose, yes. For anything where spacing is structure — ASCII art, a hand-aligned table, a signature block, poetry — no, and that is why the toggle is off by default. The other five steps do not change what the text means.',
      },
      {
        q: 'Why is the trailing newline removed?',
        a: 'Because a stray newline at the end of a copied fragment is almost never intentional, and it breaks a byte-for-byte comparison with an expected value. It is a final tidy-up rather than one of the toggles, and it is named in the notes when it happens.',
      },
      {
        q: "Is the text I am cleaning uploaded?",
        a: "No. Cleaning is local, which is the point — the text people clean is usually text lifted from a paid report, a competitor page or a private document.",
      },
    ],
    howItWorks: [
      { title: 'Paste the text', body: 'Straight from a document, a PDF or a terminal.' },
      { title: 'Choose the repairs', body: 'Six toggles, each independent, and each reported only when it changed something.' },
      { title: 'Read the changes', body: 'The notes name the code points involved, so a stubborn character can be tracked down.' },
    ],
    limitations: [
      'HTML entity references are left as written rather than decoded.',
      'Nothing is repaired beyond whitespace, invisible characters and tags: encoding problems inside the bytes need the source fixed first.',
    ],
    related: ['word-counter', 'remove-duplicate-lines', 'text-case-converter'],
    mode: LOCAL,
  },
  {
    slug: 'remove-duplicate-lines',
    category: 'utility',
    name: 'Remove Duplicate Lines',
    summary: 'Drop repeated lines, keeping either the first or the last copy.',
    description:
      'De-duplicate a list without reordering it. Keep the first occurrence or the last, decide whether the comparison cares about case, and decide whether leading spaces are part of the line or just noise from a copy and paste. Furtu reports how many lines went and how many unique ones remain.',
    icon: 'layers',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'keep',
        label: 'Keep the…',
        default: 'first',
        options: [
          { value: 'first', label: 'First occurrence of each line' },
          { value: 'last', label: 'Last occurrence of each line' },
        ],
        help: 'Last is what you want when a later line overrides an earlier one, which is how a settings file behaves.',
      },
      { kind: 'toggle', id: 'caseSensitive', label: 'Case-sensitive', default: false, help: 'Off, Apple and apple are the same line.' },
      {
        kind: 'toggle',
        id: 'ignoreWhitespace',
        label: 'Ignore surrounding spaces',
        default: true,
        help: 'Off, an indented value and the same value unindented are different lines.',
      },
    ],
    keywords: ['remove duplicate lines', 'deduplicate lines', 'unique lines', 'sort unique', 'delete duplicates'],
    synonyms: ['dedupe', 'remove duplicates', 'unique lines', 'distinct lines', 'strip repeats'],
    faq: [
      {
        q: 'What counts as the same line?',
        a: 'With the default settings, a line matches another that differs only in case or in leading and trailing spaces. Turn the toggles off for an exact comparison. Neither is wrong; they answer different questions, and which one is right depends on whether the whitespace is data.',
      },
      {
        q: 'Does it sort the result?',
        a: 'No. Order is preserved, which is usually what you want from a de-duplicator and is what makes the sort-lines tool a separate step. Use it in sequence if you want both.',
      },
      {
        q: 'What about empty lines?',
        a: 'They are kept, and they count as lines. A file with forty blank lines will report one unique blank line rather than dropping them, because silently removing lines is a surprise in a tool whose job is removing specific lines.',
      },
      {
        q: 'How large can the input be?',
        a: 'A set of keys is held in memory for the comparison, so a few hundred thousand lines is comfortable and the result is exact. Beyond that the browser, not Furtu, runs out of room.',
      },
      {
        q: "Are the lines in my list uploaded?",
        a: "No. De-duplication runs in your browser, so a list of email addresses or customer IDs stays on your device.",
      },
    ],
    howItWorks: [
      { title: 'Paste the list', body: 'One entry per line, in any order.' },
      { title: 'Set the comparison', body: 'Case, surrounding whitespace, and which copy to keep.' },
      { title: 'Check the counts', body: 'Lines in, lines out and how many were removed.' },
    ],
    limitations: [
      'Lines are compared whole. Two entries that differ only in internal spacing are different lines.',
      'The final newline is preserved when the input had one, so a de-duplicated file still ends the way the original did.',
    ],
    related: ['sort-lines', 'text-cleaner', 'json-to-csv'],
    mode: LOCAL,
  },
  {
    slug: 'sort-lines',
    category: 'utility',
    name: 'Sort Lines',
    summary: 'Put a list in order, the way a person expects rather than the way a computer does.',
    description:
      'Sort a list of lines ascending or descending, with natural ordering that puts 2 before 10, an optional case-insensitive comparison, and options to drop duplicates and empty lines on the way. Sorting runs through the browser’s own collator, so accents and punctuation are handled the way your language handles them.',
    icon: 'menu',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'order',
        label: 'Order',
        default: 'asc',
        options: [
          { value: 'asc', label: 'A to Z, lowest first' },
          { value: 'desc', label: 'Z to A, highest first' },
        ],
      },
      {
        kind: 'toggle',
        id: 'natural',
        label: 'Natural order for numbers',
        default: true,
        help: '2 before 10. Without it, 10 comes before 2 because 1 is the smaller character.',
      },
      { kind: 'toggle', id: 'caseSensitive', label: 'Case-sensitive', default: false, help: 'Off, apple and Banana sort together. On, every capital letter sorts before every lower-case one.' },
      { kind: 'toggle', id: 'dedupe', label: 'Remove duplicates while sorting', default: false },
      { kind: 'toggle', id: 'removeEmpty', label: 'Drop empty lines', default: false },
    ],
    keywords: ['sort lines', 'alphabetise list', 'sort text lines', 'natural sort', 'sort list alphabetically'],
    synonyms: ['sort', 'alphabetise', 'alphabetize', 'order lines', 'sort a list'],
    faq: [
      {
        q: 'What is natural order?',
        a: 'Sorting that compares numbers as numbers. Plain sorting compares characters, so 10 comes before 2 because 1 sorts before 2. Natural order splits the text into runs of digits and letters and compares each part by its value, which gives the order a person expects from a version list or a set of measurements.',
      },
      {
        q: 'How are accents and punctuation handled?',
        a: 'Through the browser’s own collator for your language, so an accented letter sorts next to the plain one rather than at the end of the alphabet as a byte comparison would put it. Furtu does not strip accents, because in some languages they distinguish words.',
      },
      {
        q: 'Should I use case-sensitive sorting?',
        a: 'Not usually. With it on, every capital letter sorts before every lower-case letter, so Zebra comes before apple, which is rarely what anyone wants. Case-insensitive comparison is the default for that reason.',
      },
      {
        q: 'Is it a stable sort?',
        a: 'It is not guaranteed to be, and the browser does not promise it. For lines that compare as equal — two different lines with the same sort key, such as two accented variants in a base collation — their relative order can change. De-duplicating afterwards is the reliable way to collapse those.',
      },
      {
        q: "Is my list uploaded?",
        a: "No. Sorting is a local operation, so a list of internal identifiers is never transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Paste the list', body: 'One item per line.' },
      { title: 'Set the comparison', body: 'Direction, natural ordering, case, and whether to drop duplicates or blank lines.' },
      { title: 'Take the sorted list', body: 'Download it, or copy it straight into the file you are editing.' },
    ],
    limitations: [
      'The order of lines that compare as equal is not guaranteed to be stable.',
      'Sorting is on whole lines. To sort by a field within each line, extract that field first, or use the regular expression tester to work out what to keep.',
    ],
    related: ['remove-duplicate-lines', 'text-cleaner', 'word-counter'],
    mode: LOCAL,
  },
  {
    slug: 'password-generator',
    category: 'utility',
    name: 'Password Generator',
    summary: 'Make strong passwords from the platform’s cryptographic random source.',
    description:
      'Generate one password or a hundred, with a length and character set you choose. Every password contains at least one character from each type you selected, and the result is shuffled without bias using the platform random source. A general-purpose pseudo-random generator is never involved, because a predictable password is not a password.',
    icon: 'lock',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      { kind: 'number', id: 'length', label: 'Length', min: 4, max: 128, step: 1, default: 20, suffix: 'characters', help: 'Sixteen is already beyond brute force for most sites. Longer only helps if the site stores the whole thing.' },
      { kind: 'number', id: 'count', label: 'How many', min: 1, max: 100, step: 1, default: 1, help: 'Useful for a batch import or a set of test accounts.' },
      { kind: 'toggle', id: 'lowercase', label: 'Lower-case letters', default: true },
      { kind: 'toggle', id: 'uppercase', label: 'Upper-case letters', default: true },
      { kind: 'toggle', id: 'digits', label: 'Digits', default: true },
      { kind: 'toggle', id: 'symbols', label: 'Symbols', default: true },
      {
        kind: 'toggle',
        id: 'excludeAmbiguous',
        label: 'Drop characters that look alike',
        default: true,
        help: 'Removes the lower-case l, the capital I, the digit one, the capital O, the digit zero and the lower-case o. Worth it for anything read aloud or copied by hand.',
      },
    ],
    keywords: ['password generator', 'strong password', 'random password', 'secure password', 'passphrase generator'],
    synonyms: ['password', 'random password', 'generate password', 'passphrase', 'secure password'],
    faq: [
      {
        q: 'Why is this safer than a generator built in the language?',
        a: 'Because the general-purpose pseudo-random generator built into JavaScript is a deterministic sequence, and an attacker who has seen enough of its output can recover the state and predict every value after it, which makes the password a matter of when rather than whether. Furtu uses the platform’s cryptographic random source, and discards the values that would otherwise favour the start of the alphabet, so every character is equally likely.',
      },
      {
        q: 'How strong is the password?',
        a: 'Furtu shows the estimate: length multiplied by the base-two logarithm of the alphabet size. Twenty characters from a 78-symbol alphabet is about 124 bits, which is far beyond any realistic search. The real weakness is rarely the password — it is reuse, and a site that stores it badly.',
      },
      {
        q: 'Why does it force one of each character type?',
        a: 'Because a random twenty-character string occasionally comes out as all digits, and a site with a complexity rule will reject that. Furtu draws one character from each selected type first, fills the rest from the whole alphabet, then shuffles so the position of each character reveals nothing about how it was built.',
      },
      {
        q: 'Where should I store these?',
        a: 'In a password manager, one entry per site, never reused. A generated password is only as strong as the storage around it: a spreadsheet or a chat message undoes everything the generator did.',
      },
      {
        q: "Is my generated password uploaded or sent anywhere?",
        a: "No, and that is the only acceptable answer for this tool. Passwords are generated from your browser's own random source, so nothing is uploaded: there is no server that has seen it, logged it, or could hand it over.",
      },
    ],
    howItWorks: [
      { title: 'Set the length and the alphabet', body: 'More character types means a larger alphabet and more bits per character.' },
      { title: 'Generate', body: 'Each password gets at least one of every type you enabled, then an unbiased shuffle.' },
      { title: 'Store it properly', body: 'Copy it into your password manager, then clear the box. Furtu does not clear it for you, because that would race with a copy.' },
    ],
    limitations: [
      'Furtu cannot tell a site’s rules. Some systems cap the length at 64 or 72 characters, and some reject every symbol.',
      'A generated password is still a shared secret if you put it anywhere shared. A password manager is the storage, not a spreadsheet.',
      'The text stays in the box until you clear it or reload the page.',
    ],
    notes: [
      {
        title: 'Entropy, briefly',
        body: 'The number Furtu reports is length × log2(alphabet size), which is the size of the space an attacker has to search. It assumes every character is equally likely and that the password is used once against a system that stores it properly. A twenty-character password from a 78-symbol alphabet is around 124 bits, which is why length beats complexity symbols: four extra characters add 25 bits, while swapping a letter for a symbol adds less than one.',
      },
    ],
    related: ['uuid-generator', 'hash-generator', 'character-counter'],
    mode: LOCAL,
  },
  {
    slug: 'qr-code-generator',
    category: 'utility',
    name: 'QR Code Generator',
    summary: 'Build a QR code as a PNG, drawn in the browser.',
    description:
      'Turn a link, a Wi-Fi detail, a vCard or any text into a QR code you can download as a PNG. Choose the size, the quiet zone and the error correction, and read the contrast warning before printing. The encoder runs in this tab, so the content of the code is never sent anywhere.',
    icon: 'qr',
    workspace: 'text',
    engine: 'qr',
    input: null,
    limits: SINGLE,
    controls: [
      { kind: 'number', id: 'size', label: 'Image size', min: 128, max: 2048, step: 64, default: 512, suffix: 'px', help: 'For print, generate large and let the printer scale down. A code enlarged after encoding gets soft edges and stops scanning reliably.' },
      { kind: 'number', id: 'margin', label: 'Quiet zone', min: 0, max: 16, step: 1, default: 4, suffix: 'modules', help: 'The clear border around the code. The specification asks for four; two is the practical minimum.' },
      {
        kind: 'select',
        id: 'errorLevel',
        label: 'Error correction',
        default: 'medium',
        options: [
          { value: 'low', label: 'Low (7%) — smallest code' },
          { value: 'medium', label: 'Medium (15%) — the usual choice' },
          { value: 'quartile', label: 'Quartile (25%) — good for printing' },
          { value: 'high', label: 'High (30%) — survives damage' },
        ],
        help: 'Higher correction means a denser code for the same content.',
      },
      { kind: 'toggle', id: 'includeMargin', label: 'Include the quiet zone', default: true, help: 'Leave this on unless something else is adding the border for you.' },
      { kind: 'color', id: 'dark', label: 'Foreground', default: '#0F172A' },
      { kind: 'color', id: 'light', label: 'Background', default: '#FFFFFF' },
    ],
    keywords: ['qr code generator', 'qr generator', 'create qr code', 'qr code png', 'barcode generator'],
    synonyms: ['qr', 'qrcode', 'make a qr code', 'barcode', 'wifi qr'],
    faq: [
      {
        q: 'What can a QR code hold?',
        a: 'Any text: a URL, a vCard, a Wi-Fi password in the standard format, a calendar event, a plain sentence. Capacity is roughly 2,900 characters at the lowest error correction and about 1,300 at the highest, because the correction data takes up room in the same symbol.',
      },
      {
        q: 'Will it scan from a phone?',
        a: 'Usually, at the sizes above. The factors that break scanning are a code smaller than about 2 cm, a low contrast between the two colours, a quiet zone that is too small, and a code printed on a busy background. Furtu warns about each of those, and about a light-on-dark code, which many scanners refuse even when the contrast is technically fine.',
      },
      {
        q: 'Is my data uploaded?',
        a: 'No. The code is drawn by a library in this page, and the PNG is produced in the same tab. Nothing about the content is transmitted, which matters when the content is a Wi-Fi password or an internal link.',
      },
      {
        q: 'Why is there no transparent background?',
        a: 'Because a QR code needs a light quiet zone to be read, and a transparent PNG on a dark page inverts it. The background colour is a control instead, so you can match a brand colour — and read the contrast warning before printing.',
      },
    ],
    howItWorks: [
      { title: 'Enter the content', body: 'A link, a Wi-Fi detail, a vCard, or any text at all.' },
      { title: 'Set the shape and the correction', body: 'Size, quiet zone and how much damage the code should survive.' },
      { title: 'Download the PNG', body: 'Read the warnings first — they are the difference between a code that scans and one that does not.' },
    ],
    limitations: [
      'The PNG is fully opaque. A transparent background is not offered, because a QR code on a dark background inverts and stops scanning.',
      'Very long content needs a dense symbol that is hard to scan at a reasonable print size.',
      'No batch generation and no SVG output; the download is a PNG at the size you choose.',
    ],
    related: ['base64-encoder', 'url-encoder', 'unit-converter'],
    mode: LOCAL,
  },
  {
    slug: 'file-size-converter',
    category: 'utility',
    name: 'File Size Converter',
    summary: 'Convert between bytes, kilobytes, mebibytes and bits, without guessing MB.',
    description:
      'Parse a human size like 1.5MB, 500 KiB or 1e6 and see it in every other unit, with the binary and decimal readings both shown. MB and MiB are different units with different numbers, and the difference is 2.4% by the time you reach the gibibyte — Furtu surfaces that rather than picking one for you.',
    icon: 'download',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'base',
        label: 'Ambiguous units mean…',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Decimal, and warn about the other reading' },
          { value: 'decimal', label: 'Decimal — kB, MB, GB are multiples of 1,000' },
          { value: 'binary', label: 'Binary — KiB, MiB, GiB are multiples of 1,024' },
        ],
        help: 'Auto assumes the SI meaning, which is what the prefix means, and tells you what the binary reading would be.',
      },
      { kind: 'number', id: 'decimals', label: 'Decimal places', min: 0, max: 8, step: 1, default: 3 },
    ],
    keywords: ['file size converter', 'bytes to mb', 'mb to kb', 'kb to bytes', 'gigabytes to megabytes'],
    synonyms: ['file size', 'bytes', 'megabytes', 'size converter', 'kb mb gb'],
    faq: [
      {
        q: 'Is MB the same as MiB?',
        a: 'No. MB is decimal: 1 MB is 1,000,000 bytes, as the SI prefixes require. MiB is binary: 1 MiB is 1,048,576 bytes, which is 1,024 KiB of 1,024 bytes. The gap is small for megabytes and large for gigabytes — a 1 TB drive is 1,099,511,627,776 bytes, and dividing that by a million gives 1,099 GB, not 1,000. That gap is why a drive never looks as big as it was advertised.',
      },
      {
        q: 'What does 100 Mbps mean in MB?',
        a: 'Bits, not bytes: 100 megabits per second is 12.5 megabytes per second, because a byte is eight bits. A connection advertised in megabits per second is therefore a different number of bytes per second from the one suggested, and a 100 Mbps line moves a 1 GB file in about 80 seconds at the full rate.',
      },
      {
        q: 'What happens to 1e6?',
        a: 'It is read as a number with no unit. Furtu treats it as bytes and says so, and 1e6 bytes is 1 MB decimal or 976.5625 KiB binary. Scientific notation is useful for a byte count from a script and uselessly ambiguous without a unit, so Furtu never supplies one silently.',
      },
      {
        q: 'Why does a 256 GB drive show as 238 GB?',
        a: 'Because the label is decimal and the operating system reports binary. 256,000,000,000 bytes is 238.4 GiB. It is a labelling convention, not a missing chunk of storage, and this converter shows both numbers side by side so the arithmetic is visible.',
      },
      {
        q: "Is anything uploaded when I convert a size?",
        a: "No. It is arithmetic on a number you typed, done in your browser. Furtu does not read a file's size from your disk, because the tool never asks for a file.",
      },
    ],
    howItWorks: [
      { title: 'Type a size', body: 'A number with or without a unit: 1.5MB, 500 KiB, 2 GB, 1e6.' },
      { title: 'Choose how to read an ambiguous unit', body: 'Or let Furtu read it as decimal and warn about the binary alternative.' },
      { title: 'Read every unit', body: 'Bits and bytes, decimal and binary, all at once.' },
    ],
    limitations: [
      'Bits are shown as a value, not a transfer rate. Sustained throughput depends on protocol overhead and is never the full line rate.',
      'Ambiguous single-letter units such as K or M are assumed decimal, which is a guess that is flagged in the notes.',
    ],
    related: ['unit-converter', 'mime-type-lookup', 'json-formatter'],
    mode: LOCAL,
  },
  {
    slug: 'unit-converter',
    category: 'utility',
    name: 'Unit Converter',
    summary: 'Convert length, mass, temperature, speed, area, volume, time and data size.',
    description:
      'Type a value and its unit and get every other unit in that category at once, which is more useful than picking a target from a dropdown. Temperature is handled as an offset rather than a ratio, imperial and US liquid measures are listed separately, and data size covers both the SI and the binary prefixes.',
    icon: 'workflow',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'category',
        label: 'Category',
        default: 'length',
        options: [
          { value: 'data', label: 'Data size — bits, bytes, SI and binary' },
          { value: 'length', label: 'Length' },
          { value: 'mass', label: 'Mass' },
          { value: 'temperature', label: 'Temperature' },
          { value: 'time', label: 'Time' },
          { value: 'speed', label: 'Speed' },
          { value: 'area', label: 'Area' },
          { value: 'volume', label: 'Volume' },
        ],
        help: 'The conversion table follows this. With nothing typed, the base unit is used.',
      },
      { kind: 'number', id: 'decimals', label: 'Decimal places', min: 0, max: 10, step: 1, default: 6, help: 'Lower it for everyday figures; extra decimals on a conversion do not mean extra accuracy.' },
    ],
    keywords: ['unit converter', 'convert units', 'length converter', 'temperature converter', 'celsius to fahrenheit'],
    synonyms: ['units', 'convert', 'measurement', 'imperial', 'metric'],
    faq: [
      {
        q: 'Why show every unit rather than one answer?',
        a: 'Because you rarely know which unit the other system wants. Converting to a single target means a second round trip every time the target changes; showing the whole table means the value you need is already there, and a quick comparison between them is possible at a glance.',
      },
      {
        q: 'Which pint is in the volume table?',
        a: 'Both, named. The US liquid pint is 473 mL and the imperial pint is 568 mL, so the same word is a fifth larger in Britain. The same applies to fluid ounces, cups, quarts, gallons and tablespoons. Neither is the “right” one; the correct answer depends on which side of the Atlantic the recipe came from.',
      },
      {
        q: 'Why is a month not listed exactly?',
        a: 'Because it is not. Months run from 28 to 31 days and years from 365 to 366, so a month cannot be a fixed number of seconds. Furtu uses 30.4375 days for a month and 365.25 days for a year and says so in the note under the table, because a number with a stated assumption is more useful than no number.',
      },
      {
        q: 'Which definition of an inch is used?',
        a: 'The international one: exactly 25.4 mm, agreed in 1959. The US survey inch, still used in some surveying, is very slightly different, and the difference accumulates over long distances. The imperial foot here is 0.3048 m exactly.',
      },
      {
        q: "Is my measurement uploaded?",
        a: "No. Conversion is local arithmetic. Nothing about a measurement is transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Choose a category', body: 'Data size, length, mass, temperature, time, speed, area or volume.' },
      { title: 'Type a value and a unit', body: '100 km/h, 20 C, 1.5 GB, or a bare number for the base unit.' },
      { title: 'Read the whole table', body: 'Every unit in the category, with the conversion factors and the caveats underneath.' },
    ],
    limitations: [
      'Months and years use fixed averages — 30.4375 and 365.25 days — which is wrong for any particular calendar date.',
      'Imperial and US units are both listed but never reconciled. A “gallon” is ambiguous, and the table says which one it is showing.',
      'No currencies, no fuel economy expressed as distance per volume, and no cooking measures that vary by recipe.',
    ],
    related: ['file-size-converter', 'percentage-calculator', 'timestamp-converter'],
    mode: LOCAL,
  },
  {
    slug: 'percentage-calculator',
    category: 'utility',
    name: 'Percentage Calculator',
    summary: 'Work out a percentage of a number, a share, or a change.',
    description:
      'The three percentage questions that come up constantly, with the arithmetic shown rather than just the answer: what one percentage of a number is, what share one number is of another, and what changed between two values. Results keep more decimals than you need, because rounding early is how percentage arguments go wrong.',
    icon: 'plus',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: 'Question',
        default: 'of',
        options: [
          { value: 'of', label: 'What is one percentage of a number?' },
          { value: 'is', label: 'One number is what percentage of another?' },
          { value: 'change', label: 'Percentage change between two values' },
        ],
      },
      {
        kind: 'number',
        id: 'x',
        label: 'X',
        min: -1000000000,
        max: 1000000000,
        step: 0.01,
        default: 15,
        suffix: '%',
        help: 'The percentage in the first question, the amount in the second, the new value in the third.',
      },
      {
        kind: 'number',
        id: 'y',
        label: 'Y',
        min: -1000000000,
        max: 1000000000,
        step: 0.01,
        default: 200,
        help: 'The amount the percentage applies to.',
      },
    ],
    keywords: ['percentage calculator', 'percent calculator', 'percentage change', 'percent of', 'increase calculator'],
    synonyms: ['percent', 'percentage', 'per cent', 'change', 'what percent'],
    faq: [
      {
        q: 'Why is a 50% rise not undone by a 50% fall?',
        a: 'Because the base changes. A hundred that rises by 50% is 150; a 50% fall on 150 is 75. To return to a hundred you need a fall of a third. This is the commonest mistake with percentages, and Furtu prints the reversing figure whenever a change is an increase.',
      },
      {
        q: 'Why is there no answer when the base is zero?',
        a: 'Because the share of zero is undefined, not infinite, and a change from zero has no percentage. Both cases return an explanation instead of a number, since infinity in a spreadsheet cell is a value that quietly poisons every formula around it.',
      },
      {
        q: 'Do percentages of percentages add up?',
        a: 'No. A 20% rise followed by a 20% fall is not a round trip — it is 1.2 × 0.8 = 0.96, so you have lost 4%. The base has moved each time, and Furtu shows the multiplication rather than leaving it implicit.',
      },
      {
        q: 'Why so many decimal places?',
        a: 'Because the exact value is usually not a tidy number, and rounding first compounds the error. Fifteen per cent of 233 is 34.95 exactly, while sixteen per cent of 233 is 37.28, and neither is 37. Furtu shows what the arithmetic produced, and the significant figures are yours to decide.',
      },
      {
        q: "Are my numbers uploaded?",
        a: "No. The calculation runs in your browser, so a margin figure or a salary number stays on your device.",
      },
    ],
    howItWorks: [
      { title: 'Ask the question', body: 'A percentage of a number, a share of a number, or a change between two numbers.' },
      { title: 'Enter the two values', body: 'Negative numbers are fine, and needed for a fall.' },
      { title: 'Read the working', body: 'The result, the remainder, and the fraction behind it.' },
    ],
    limitations: [
      'No compound interest, tax, VAT or discount chains. Those are a different calculation, and pretending otherwise produces quiet errors.',
      'The result is exact for the decimal values you enter, not for a rounded version of them.',
    ],
    related: ['unit-converter', 'word-counter', 'file-size-converter'],
    mode: LOCAL,
  },
  {
    slug: 'lorem-ipsum-generator',
    category: 'utility',
    name: 'Lorem Ipsum Generator',
    summary: 'Classic placeholder text in the quantity and shape you need.',
    description:
      'Generate filler by paragraph, by sentence or by exact word count, with an option to open with the familiar Lorem ipsum line. The text is drawn from the platform’s cryptographic random source, so every visit produces a different shape — which is the point, since identical filler hides layout problems rather than exposing them.',
    icon: 'file',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'amountType',
        label: 'Measure the amount in',
        default: 'paragraphs',
        options: [
          { value: 'paragraphs', label: 'Paragraphs' },
          { value: 'sentences', label: 'Sentences' },
          { value: 'words', label: 'An exact number of words' },
        ],
      },
      { kind: 'number', id: 'amount', label: 'How many', min: 1, max: 200, step: 1, default: 3 },
      {
        kind: 'toggle',
        id: 'startWithLorem',
        label: 'Open with the classic Latin opening',
        default: true,
        help: 'Some design systems expect the first words to be exactly that.',
      },
    ],
    keywords: ['lorem ipsum generator', 'placeholder text', 'dummy text', 'filler text', 'sample text'],
    synonyms: ['lorem ipsum', 'placeholder', 'dummy text', 'filler', 'sample copy'],
    faq: [
      {
        q: 'Why is it Latin gibberish rather than English?',
        a: 'Because it is traditional, and because it is neutral. A designer reading a paragraph of real English starts judging the writing; a paragraph of lorem ipsum gets judged on layout, which is what a layout is for. It is also why the classic text is discouraged for public pages: readers who know the phrase assume you never replaced it.',
      },
      {
        q: 'Is the word count exact?',
        a: 'Exactly, when the measure is words — Furtu produces precisely the number you asked for. For paragraphs and sentences the length of each is randomised, because uniform lengths are precisely what hides a layout problem. The produced counts are reported so you can see what you got.',
      },
      {
        q: 'Does the text repeat between visits?',
        a: 'No. It is drawn from the platform’s cryptographic random source, so the sequence differs each time. If you need the same filler every time, for a test that must be repeatable, generate it once and paste the result into your fixture.',
      },
      {
        q: 'Can I use it in production?',
        a: 'Not as a substitute for copy. It is unreadable, it is recognisable, and it is a legal risk if it reaches a published page. It belongs in a layout and nowhere else.',
      },
      {
        q: "Is anything sent to generate the text?",
        a: "No. The words are assembled in your browser from a list compiled into the page, so the generator works offline and records nothing.",
      },
    ],
    howItWorks: [
      { title: 'Choose what to measure', body: 'Paragraphs, sentences, or an exact word count.' },
      { title: 'Set the amount', body: 'Up to 200 of whatever you chose.' },
      { title: 'Copy it into the mock-up', body: 'Download it as a text file, or copy the box.' },
    ],
    limitations: [
      'Paragraph and sentence lengths are randomised, so the total word count varies when you did not ask for words.',
      'The vocabulary is the classic Latin passage, roughly seventy words long, reused. There is no English, technical or industry-specific variant.',
    ],
    related: ['word-counter', 'character-counter', 'markdown-preview'],
    mode: LOCAL,
  },
  {
    slug: 'mime-type-lookup',
    category: 'utility',
    name: 'MIME Type Lookup',
    summary: 'Find the MIME type behind a file extension, and what it means.',
    description:
      'Paste a file name or an extension and get the MIME type, its category, what the format actually is, the extensions it gets confused with, and what Furtu can do with it. The table ships inside the page, so the lookup works offline and a file name never leaves the tab.',
    icon: 'search',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'match',
        label: 'Look up by',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Whatever the input looks like' },
          { value: 'mime', label: 'A MIME type, such as image/webp' },
          { value: 'extension', label: 'A file name or extension' },
        ],
        help: 'Auto handles both, and a leading dot is optional.',
      },
    ],
    keywords: ['mime type', 'mime type lookup', 'file extension', 'content type', 'what is this file'],
    synonyms: ['mime', 'content type', 'file type', 'extension', 'media type'],
    faq: [
      {
        q: 'Why does a PNG sometimes arrive as plain text?',
        a: 'Because the type comes from two places and they can disagree. The browser guesses from the extension; a server announces what it believes the file is in the content-type header, and that is what wins. A misconfigured upload endpoint serving a PNG as plain text is common, and it is why a download can produce a file that will not open until it is renamed.',
      },
      {
        q: 'Is there one official list?',
        a: 'There is an IANA registry, and it is smaller than most people expect. Everything else is convention: the MDN list, the widely copied server configuration, and the platform-specific tables that disagree with each other. Which is why a miss in Furtu’s table is normal rather than an error, and why the tool says so.',
      },
      {
        q: 'Why is plain text the right type for a script file?',
        a: 'Because the old application/javascript type was never registered, so browsers and CDNs sent it anyway and the standard was eventually fixed to the text one. Most of the ecosystem ignores the difference, and some older applications still insist on the old one.',
      },
      {
        q: 'Can it identify a file by its contents?',
        a: 'No, and it is worth being clear about that. This reads the name you paste. Identifying a file by its magic bytes is a different job; the tools that accept uploads do that as they read them.',
      },
    ],
    howItWorks: [
      { title: 'Paste a file name or a type', body: 'Several lines at once, up to twenty, and each is looked up separately.' },
      { title: 'Read the entry', body: 'Type, category, what the format is, and the extensions it is confused with.' },
      { title: 'Check the neighbours', body: 'The confusion list is usually the useful part when a type is not what you expected.' },
    ],
    limitations: [
      'The table covers the formats that matter in practice, not every registered type. A miss is reported plainly rather than guessed at.',
      'Only the name is read. Nothing is opened, inspected or identified by its contents.',
    ],
    related: ['file-size-converter', 'json-formatter', 'url-decoder'],
    mode: LOCAL,
  },
];
