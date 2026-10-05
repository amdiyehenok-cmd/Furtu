import { SINGLE } from './formats';
import type { ToolDefinition } from './types';

const LOCAL = 'local' as const;

export const DEVELOPER_TOOLS: ToolDefinition[] = [
  {
    slug: 'json-formatter',
    category: 'developer',
    name: 'JSON Formatter',
    summary: 'Pretty-print JSON with the indentation you actually want.',
    description:
      'Turn a single line of JSON into something a person can read. Choose two spaces, four spaces or tabs, and optionally sort every key at every depth so two exports of the same object line up for comparison. The result is rebuilt in your browser, so the payload never travels.',
    icon: 'braces',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'indent',
        label: 'Indentation',
        default: '2',
        options: [
          { value: '2', label: '2 spaces' },
          { value: '4', label: '4 spaces' },
          { value: 'tab', label: 'Tab' },
        ],
        help: 'Two spaces is the common convention. Four matches Python and some editor defaults; tabs match Go and Makefiles.',
      },
      {
        kind: 'toggle',
        id: 'sortKeys',
        label: 'Sort keys alphabetically',
        default: false,
        help: 'Applies at every depth, including objects inside arrays. Handy for diffing two responses.',
      },
    ],
    keywords: ['format json', 'json pretty print', 'beautify json', 'json indent', 'prettify json'],
    synonyms: ['pretty print', 'beautify', 'prettify', 'tidy json', 'make json readable', 'json viewer'],
    popular: true,
    faq: [
      {
        q: 'Does formatting change the data?',
        a: 'No. The value is parsed and re-serialised, so the structure, the numbers and the strings are the same. Two things do shift: key order is rebuilt in the order the parser found it, and a number written as 1.0 comes back as 1, because the JavaScript value it becomes is 1. Neither changes what the data means.',
      },
      {
        q: 'Why does my JSON fail to parse when it looks fine?',
        a: 'Three things account for most of it. A trailing comma before a closing brace is not valid JSON. A byte order mark at the start of the file is invisible but forbidden. And a smart quote pasted from a word processor is not a JSON string delimiter. The validator names the line and column, which is usually enough to spot all three.',
      },
      {
        q: 'Can it handle a very large payload?',
        a: 'Yes, up to whatever the browser will hold in memory. A fifty-megabyte response is slow to reformat but works, because the whole thing is parsed once rather than in a loop. Furtu shows the input and output sizes so you can see what happened.',
      },
      {
        q: 'Is my JSON uploaded anywhere?',
        a: 'No. Parsing and re-serialising both use the JSON built into your browser, so the bytes stay in the tab. Nothing is logged, and reloading the page is enough to discard it.',
      },
    ],
    howItWorks: [
      { title: 'Paste your JSON', body: 'Drop in a response body, a config file or a snippet copied from a terminal.' },
      { title: 'Choose the shape', body: 'Pick the indentation width, and turn on key sorting if you are comparing two documents.' },
      { title: 'Take the result', body: 'The formatted JSON appears immediately, with a download button for a file.' },
    ],
    limitations: [
      'Key sorting is applied recursively, which can be wrong for arrays of records where order is meaningful — though the array order itself is always preserved.',
      'Very deeply nested documents are limited by the browser’s own stack, not by Furtu. A thousand levels is fine; ten thousand is not.',
    ],
    related: ['json-validator', 'json-minifier', 'json-to-yaml', 'markdown-preview'],
    mode: LOCAL,
  },
  {
    slug: 'json-validator',
    category: 'developer',
    name: 'JSON Validator',
    summary: 'Check a JSON document and be told exactly where it breaks.',
    description:
      'Find out whether a document is valid JSON, and if it is not, which line and column the parser gave up on. Furtu also reports the shape of what it parsed — how many objects, arrays and keys, and how deep it goes — and warns about the invisible byte order mark that breaks more real files than any syntax error.',
    icon: 'check',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'detectBom',
        label: 'Explain byte order marks',
        default: true,
        help: 'A U+FEFF at the start of a file is invisible, and JSON does not allow it.',
      },
      {
        kind: 'toggle',
        id: 'showStructure',
        label: 'Include a structure summary',
        default: true,
        help: 'Object, array and key counts, plus the deepest nesting level found.',
      },
    ],
    keywords: ['validate json', 'json validator', 'check json', 'json parse error', 'is my json valid'],
    synonyms: ['validate', 'check json', 'lint json', 'test json', 'json error', 'parse error'],
    popular: true,
    faq: [
      {
        q: 'What does a valid result actually tell me?',
        a: 'That the document parses. It does not tell you the values are right for your purpose: a JSON array where you expected an object parses perfectly and breaks your code just as thoroughly. Furtu reports the root type and the shape so you can see that, but validating against a schema is a different job.',
      },
      {
        q: 'How accurate is the line and column?',
        a: 'It comes from the parser’s own position, converted to a line and column by counting newlines up to that point. Some engines report a character offset and some report a line and column, and Furtu prefers the offset because it survives multi-byte characters. When the engine reports neither, the position is derived from the snippet it includes and is labelled as approximate.',
      },
      {
        q: 'Does it check for duplicate keys?',
        a: 'No, and this is a real gap worth naming. JSON.parse accepts a document with the same key twice and silently keeps the last one, because the grammar allows it and the specification says the behaviour is undefined. Catching it needs a second parser, which Furtu does not run. If duplicate keys matter to you, check the source.',
      },
      {
        q: 'Is the document sent anywhere for checking?',
        a: 'No. The browser’s own parser does the work. The privacy banner on this page is driven by a field in the tool definition, not by a policy page, and this tool’s field says local.',
      },
      {
        q: "Is the payload I am validating sent anywhere?",
        a: "No. It is parsed in your browser and discarded when the page closes. That matters when the payload is a captured API response containing tokens or personal data.",
      },
    ],
    howItWorks: [
      { title: 'Paste the document', body: 'The check runs on every keystroke, so the answer is immediate.' },
      { title: 'Read the verdict', body: 'Either a valid result with a shape summary, or the parser’s complaint with the line and column that caused it.' },
      { title: 'Fix the line', body: 'The reported column is the character after the problem, which is where the offending character sits.' },
    ],
    limitations: [
      'Duplicate keys are not reported, and the parser resolves them by keeping the last value.',
      'There is no schema validation here: no required properties, no type checks, no $ref resolution, and no remote schema fetch.',
    ],
    related: ['json-formatter', 'json-minifier', 'json-to-csv', 'yaml-to-json'],
    mode: LOCAL,
  },
  {
    slug: 'json-minifier',
    category: 'developer',
    name: 'JSON Minifier',
    summary: 'Strip every byte of formatting from a JSON document.',
    description:
      'Remove the whitespace that pretty-printing added, and see exactly how many bytes you saved. The output can optionally escape the characters that make JSON dangerous to embed in an HTML page, which is the difference between a response that works and a response that breaks a script tag.',
    icon: 'compress',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'escapeHtml',
        label: 'Escape < > and &',
        default: false,
        help: 'Keeps the JSON valid while making it impossible for a string value to close a <script> tag or open an attribute.',
      },
    ],
    keywords: ['minify json', 'json minifier', 'compress json', 'remove whitespace json', 'json compact'],
    synonyms: ['minify', 'compress json', 'strip whitespace', 'make it smaller', 'json min'],
    faq: [
      {
        q: 'Is the saving real, or is it just whitespace?',
        a: 'Just whitespace — which is most of the difference. JSON has no comments, so there is nothing else to remove without changing the data. Furtu reports the byte count before and after so the figure is measured rather than estimated.',
      },
      {
        q: 'What does escaping < > and & do?',
        a: 'It rewrites them as the Unicode escapes <, > and &. The parsed value is identical, but a string containing a closing script tag can no longer close the surrounding tag. This matters when JSON is embedded in HTML, which is common in server-rendered pages and in analytics snippets.',
      },
      {
        q: 'Does it strip the newline at the end?',
        a: 'No. A trailing newline costs one byte and makes the file behave in terminals and editors, so Furtu keeps it and excludes it from the saving figure.',
      },
      {
        q: 'Can it minify a broken document?',
        a: 'No, and it will not try. A document that does not parse is a document whose meaning is unknown, so Furtu reports the error rather than handing back a plausible-looking fragment.',
      },
      {
        q: "Is my JSON uploaded?",
        a: "No. Minification happens in your browser, so a payload containing secrets or personal data is never transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Paste the JSON', body: 'Formatted or minified, the result is the same.' },
      { title: 'Choose whether to escape', body: 'Only needed when the output is going into an HTML page.' },
      { title: 'Compare the sizes', body: 'Furtu shows the before and after byte counts and the percentage saved.' },
    ],
    limitations: [
      'Only whitespace is removed. Property order, duplicate keys and number formatting are left exactly as parsed.',
      'Minified JSON is unpleasant to read and impossible to diff usefully. Keep a formatted copy somewhere.',
    ],
    related: ['json-formatter', 'json-validator', 'json-to-yaml'],
    mode: LOCAL,
  },
  {
    slug: 'json-to-csv',
    category: 'developer',
    name: 'JSON to CSV',
    summary: 'Turn a JSON array of records into a spreadsheet-ready table.',
    description:
      'Convert an API response into columns and rows. The header is the union of every key in the array, so records that omit a field still line up, and nested objects are flattened one level into dotted column names. Cells that spreadsheet software would execute as a formula are neutralised on the way out.',
    icon: 'download',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'delimiter',
        label: 'Delimiter',
        default: ',',
        options: [
          { value: ',', label: 'Comma (RFC 4180 CSV)' },
          { value: ';', label: 'Semicolon (Excel in many locales)' },
          { value: 'tab', label: 'Tab (TSV)' },
        ],
      },
      {
        kind: 'toggle',
        id: 'flatten',
        label: 'Flatten nested objects one level',
        default: true,
        help: 'An address object becomes address.city and address.postcode columns.',
      },
      {
        kind: 'toggle',
        id: 'quoteAll',
        label: 'Quote every cell',
        default: false,
        help: 'Only needed for tools that misread bare values as a type or as a formula.',
      },
      {
        kind: 'toggle',
        id: 'neutraliseFormulas',
        label: 'Neutralise formula cells',
        default: true,
        help: 'Prefixes a cell starting with =, +, - or @ with an apostrophe so spreadsheets show it as text.',
      },
      {
        kind: 'select',
        id: 'lineEnding',
        label: 'Line endings',
        default: 'crlf',
        options: [
          { value: 'crlf', label: 'CRLF — what RFC 4180 specifies' },
          { value: 'lf', label: 'LF — what Unix tools expect' },
        ],
      },
    ],
    keywords: ['json to csv', 'convert json to csv', 'json to spreadsheet', 'json to excel', 'flatten json'],
    synonyms: ['json2csv', 'to csv', 'spreadsheet', 'tabular', 'columns and rows'],
    faq: [
      {
        q: 'What happens to values that will not fit in a cell?',
        a: 'They are written as JSON text. An array of numbers becomes [1,2,3] and a nested object that flattening did not reach becomes {"a":1}. A cell holds one value, so something has to give, and preserving the data in a form another tool can parse is more useful than dropping it or rendering it as a set of made-up columns.',
      },
      {
        q: 'Why are some cells prefixed with an apostrophe?',
        a: 'Because a cell beginning with =, +, - or @ is executed as a formula by Excel, Sheets and LibreOffice. A name like a HYPERLINK formula in a customer list is a real attack, and the apostrophe forces the spreadsheet to treat it as text. Turn the option off if you are exporting for a program rather than a person.',
      },
      {
        q: 'What if my array mixes objects and plain values?',
        a: 'Furtu says so and puts the plain values in a column called value. The alternative — dropping them — loses data, and the alternative of guessing a column name would be a lie about the shape of the input.',
      },
      {
        q: 'Does it handle a single object rather than an array?',
        a: 'Yes, as a one-row table, because that is almost always what was wanted. A bare string, number or boolean becomes a single cell.',
      },
      {
        q: "Are the records in my JSON uploaded?",
        a: "No. The conversion runs locally. When the records are customer or user data, that is the difference between a tool you can use and a tool you cannot.",
      },
    ],
    howItWorks: [
      { title: 'Paste the JSON', body: 'An array of objects gives the best result; anything else is adapted and the difference is reported.' },
      { title: 'Set the output shape', body: 'Pick the delimiter, decide whether to flatten nested objects, and choose the line ending.' },
      { title: 'Download or copy', body: 'The CSV is quoted per RFC 4180, so a value containing a comma or a newline stays in one cell.' },
    ],
    limitations: [
      'Only one level of nesting is flattened. Deeper objects and all arrays are written as JSON text inside the cell.',
      'Column order follows the first appearance of each key, so it is the union of the array rather than any one record.',
      'A CSV has no types. Everything round-trips as text, so a number in JSON comes back as a string unless you convert it deliberately.',
    ],
    related: ['csv-to-json', 'json-formatter', 'json-to-yaml'],
    mode: LOCAL,
  },
  {
    slug: 'csv-to-json',
    category: 'developer',
    name: 'CSV to JSON',
    summary: 'Parse CSV properly, quotes and embedded newlines included.',
    description:
      'Convert a spreadsheet export into JSON with a parser that follows RFC 4180: quoted fields, doubled quotes, commas and line breaks inside a cell, and CRLF endings. The delimiter is detected when you do not name one, and every value stays a string, because 007 is not the number seven.',
    icon: 'upload',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'delimiter',
        label: 'Delimiter',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Detect automatically' },
          { value: ',', label: 'Comma' },
          { value: ';', label: 'Semicolon' },
          { value: 'tab', label: 'Tab' },
          { value: '|', label: 'Pipe' },
        ],
        help: 'Detection counts separators in the first few records, ignoring anything inside quotes.',
      },
      {
        kind: 'toggle',
        id: 'firstRowIsHeader',
        label: 'First row is the header',
        default: true,
        help: 'Turn this off and columns are named column_1, column_2 and so on.',
      },
      {
        kind: 'toggle',
        id: 'trimValues',
        label: 'Trim values',
        default: false,
        help: 'Removes leading and trailing spaces from every cell. Leading spaces in a header are usually accidental, but they may not be.',
      },
    ],
    keywords: ['csv to json', 'convert csv to json', 'csv parser', 'csv to javascript', 'spreadsheet to json'],
    synonyms: ['csv2json', 'to json', 'parse csv', 'excel to json', 'read csv'],
    faq: [
      {
        q: 'Why not split on commas?',
        a: 'Because a comma inside a quoted cell is data, not a separator. A line like Doe,"London, UK",31 silently becomes three columns instead of two with split, and every column after it is wrong as well. The same applies to a cell containing a line break, which is legal and which plenty of exports produce.',
      },
      {
        q: 'Why are all the values strings?',
        a: 'Because guessing is worse than being honest. "007" as a number becomes 7 and loses its leading zeros; "1e5" becomes 100000; a postcode becomes a number. Everything stays text and you decide the types, which is the same rule every serious CSV importer uses.',
      },
      {
        q: 'What happens when a row is the wrong length?',
        a: 'A short row is padded with empty strings. A long row keeps its extra cells under column_5, column_6 and so on, and Furtu tells you it happened. Discarding the extras loses data; guessing which column they belong to would be a guess.',
      },
      {
        q: 'What about duplicate or empty header names?',
        a: 'The later one is suffixed to _2, and an empty header becomes column_3. Both are reported. Every header name has to be unique for it to become a key, and an empty string is a poor key to hand to anything downstream.',
      },
      {
        q: "Is my CSV file uploaded?",
        a: "No. It is parsed in your browser. A CSV of customers is exactly the kind of file that should never touch a third-party server, and this one never does.",
      },
    ],
    howItWorks: [
      { title: 'Paste the CSV', body: 'Straight from a spreadsheet, an export or a log file.' },
      { title: 'Check the delimiter', body: 'Detection is the default and is shown in the results, so you can confirm it picked what you expected.' },
      { title: 'Take the JSON', body: 'An array of objects, ready to download, with warnings listed for anything unusual in the file.' },
    ],
    limitations: [
      'A quoted field that is never closed is accepted to the end of the file, which is what spreadsheet applications do, and Furtu warns when it happens.',
      'Blank lines in the middle of a file become records of one empty field rather than being skipped, because skipping them would move every row index.',
      'No type inference, no date parsing, and no attempt to interpret quoting styles other than RFC 4180.',
    ],
    related: ['json-to-csv', 'json-formatter', 'yaml-to-json'],
    mode: LOCAL,
  },
  {
    slug: 'json-to-yaml',
    category: 'developer',
    name: 'JSON to YAML',
    summary: 'Convert JSON into the indentation-based format people prefer to read.',
    description:
      'Rewrite a JSON document as YAML, keeping the structure exactly and choosing your indentation. Keys can be sorted for a diffable file, and anchors are deliberately not emitted, because a converter that invents aliases produces something most people did not ask for.',
    icon: 'code',
    workspace: 'text',
    engine: 'yaml',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'indent',
        label: 'Indentation',
        default: '2',
        options: [
          { value: '2', label: '2 spaces' },
          { value: '4', label: '4 spaces' },
        ],
        help: 'YAML allows any consistent indent. Two is conventional; Kubernetes manifests often use two inside a list.',
      },
      {
        kind: 'toggle',
        id: 'sortKeys',
        label: 'Sort keys alphabetically',
        default: false,
        help: 'Makes two versions of the same configuration diffable line by line.',
      },
    ],
    keywords: ['json to yaml', 'convert json to yaml', 'json2yaml', 'yaml converter', 'yml from json'],
    synonyms: ['json2yaml', 'to yaml', 'to yml', 'yaml out'],
    faq: [
      {
        q: 'Will the YAML read back the same?',
        a: 'Yes, with one caveat worth knowing. YAML has more types than JSON: an unquoted 2026-01-01 is read as a date, and yes, no, on and off are read as booleans. Furtu quotes any string that could be misread that way, so a string stays a string in both directions.',
      },
      {
        q: 'Why are there no anchors?',
        a: 'Because repeated sub-objects are written out in full. YAML can express them as an anchor and an alias, but a converter that invents those produces a file whose structure looks different from the JSON, and which strict parsers in other languages handle badly. If you want aliases, that is an editorial decision.',
      },
      {
        q: 'What about empty values?',
        a: 'JSON null becomes a tilde, which is the conventional YAML spelling of null. An empty string is written with quotes so it does not turn into null on the way back in.',
      },
      {
        q: 'Is the conversion done locally?',
        a: 'Yes, with the js-yaml library. The YAML engine is only downloaded when you open a YAML tool, so the other developer tools do not pay for it.',
      },
      {
        q: "Is my JSON uploaded?",
        a: "No. The parser and the YAML writer both run in this tab, so a config payload containing a token is never transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Paste the JSON', body: 'Any valid JSON document: object, array or a bare value.' },
      { title: 'Choose the indentation', body: 'Sort the keys as well if the file will be reviewed in a diff.' },
      { title: 'Save the YAML', body: 'Download it, or copy it straight into a configuration file.' },
    ],
    limitations: [
      'Comments and anchors in the source JSON do not exist, so nothing of that kind survives the round trip.',
      'YAML is not JSON: a long flow-style document becomes block style, which is the point, but the two files will not diff cleanly against each other.',
    ],
    related: ['yaml-to-json', 'json-formatter', 'json-to-csv'],
    mode: LOCAL,
  },
  {
    slug: 'yaml-to-json',
    category: 'developer',
    name: 'YAML to JSON',
    summary: 'Convert a YAML document to JSON, and see where the types shift.',
    description:
      'Turn an indented configuration file into JSON, with a proper line and column when the indentation is wrong. Values YAML resolves to dates or infinities are converted in a way you can see rather than silently becoming null, and multi-document files are handled as a single array.',
    icon: 'code',
    workspace: 'text',
    engine: 'yaml',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'indent',
        label: 'JSON indentation',
        default: '2',
        options: [
          { value: '2', label: '2 spaces' },
          { value: '4', label: '4 spaces' },
        ],
      },
      {
        kind: 'toggle',
        id: 'multiDocument',
        label: 'Multi-document file',
        default: false,
        help: 'Reads every document separated by a document break and writes one array.',
      },
    ],
    keywords: ['yaml to json', 'convert yaml to json', 'yaml2json', 'yml converter', 'yaml parser'],
    synonyms: ['yaml2json', 'to json', 'parse yaml', 'yml to json'],
    faq: [
      {
        q: 'Why is my date now a string?',
        a: 'Because YAML decides that an unquoted 2026-01-01 is a timestamp, while JSON has only strings, numbers, booleans, null, arrays and objects. Furtu writes the date as an ISO 8601 string and tells you how many values were affected. Quote it in the source if you want it to stay text.',
      },
      {
        q: 'What happens to infinite values and not-a-number?',
        a: 'JSON cannot represent them, so they are written as null and counted in the notes. Silently dropping them would be worse: null looks like a value somebody chose.',
      },
      {
        q: 'Why does it fail on a file my editor says is fine?',
        a: 'Because YAML forbids tabs for indentation, and an editor will happily show you a file that mixes a tab and spaces. The error Furtu reports includes the line and column and the nearby text, which is usually the whole diagnosis.',
      },
      {
        q: 'Are anchors and aliases resolved?',
        a: 'Yes. An alias is expanded to the value it refers to, so the JSON is self-contained. The cost is size: a shared block repeated twenty times appears twenty times.',
      },
      {
        q: "Is my YAML uploaded?",
        a: "No. Parsing happens in your browser, which is the point when the file is a Kubernetes manifest or a CI config containing registry credentials.",
      },
    ],
    howItWorks: [
      { title: 'Paste the YAML', body: 'One document, or several separated by a document break if you turn the option on.' },
      { title: 'Read the conversion notes', body: 'Dates, infinite values and very large integers are reported rather than hidden.' },
      { title: 'Take the JSON', body: 'Download it or copy it, with the usual two-space indentation.' },
    ],
    limitations: [
      'YAML tags, custom types and merge keys beyond plain anchors are resolved or ignored rather than preserved; JSON has nowhere to put them.',
      'Very large integers become strings, because JavaScript numbers stop being exact above 2^53.',
    ],
    related: ['json-to-yaml', 'json-formatter', 'json-validator'],
    mode: LOCAL,
  },
  {
    slug: 'xml-formatter',
    category: 'developer',
    name: 'XML Formatter',
    summary: 'Re-indent XML without touching the text inside it.',
    description:
      'Give a machine-generated XML document a readable shape. Attribute values are scanned with quote tracking, so an attribute containing a greater-than sign is not cut in half, and text, entities, comments and CDATA are left exactly as written. Attributes can also be sorted, which makes two exports of the same document diffable.',
    icon: 'workflow',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'indent',
        label: 'Indentation',
        default: '2',
        options: [
          { value: '2', label: '2 spaces' },
          { value: '4', label: '4 spaces' },
          { value: 'tab', label: 'Tab' },
        ],
      },
      {
        kind: 'toggle',
        id: 'sortAttributes',
        label: 'Sort attributes',
        default: false,
        help: 'Attribute order carries no meaning in XML, so sorting is safe and makes diffs readable.',
      },
      {
        kind: 'toggle',
        id: 'collapseWhitespace',
        label: 'Collapse whitespace in text',
        default: true,
        help: 'Turn this off if you care about the exact spacing of the source.',
      },
    ],
    keywords: ['format xml', 'xml pretty print', 'indent xml', 'xml beautifier', 'sort xml attributes'],
    synonyms: ['pretty print xml', 'beautify xml', 'indent', 'tidy xml', 'xml viewer'],
    faq: [
      {
        q: 'Is the document validated?',
        a: 'No. This is a tokeniser, not a validating parser. It notices mismatched and unclosed tags and tells you where, but it does not check the document against a schema, resolve namespaces or verify entities. It re-indents what it is given, and it does not repair the nesting.',
      },
      {
        q: 'Are entities decoded?',
        a: 'No. An ampersand entity stays as written. Decoding would mean choosing a DTD, a schema or nothing at all, and each choice can change the value. Leaving them alone keeps the transformation lossless, which is what a formatter should be.',
      },
      {
        q: 'What about whitespace that matters?',
        a: 'The contents of pre, textarea, script and style elements are never re-wrapped or re-indented, because in those elements whitespace is data. Everywhere else it is collapsed by default, which you can turn off.',
      },
      {
        q: 'Why does it say there are several root elements?',
        a: 'Because a well-formed XML document has exactly one root. Several usually means the file is a concatenation of documents, which is valid in many pipelines but not as a single XML file.',
      },
      {
        q: "Is my XML uploaded?",
        a: "No. Formatting is entirely local, and Furtu makes no outbound requests while doing it — which is also why an XML file cannot make your browser fetch a URL on your network.",
      },
    ],
    howItWorks: [
      { title: 'Paste the XML', body: 'From a build log, an API response, a sitemap or an export.' },
      { title: 'Set the shape', body: 'Choose the indent width, and sort attributes if you want clean diffs.' },
      { title: 'Check the notes', body: 'Unclosed tags, mismatched closes and stray root elements are listed with line numbers.' },
    ],
    limitations: [
      'Not a validating parser: no schema, no namespace resolution, no entity checking, and no repair of broken nesting.',
      'Comments, CDATA and multi-line declarations are carried across unchanged, so a comment written on one line stays on one line.',
    ],
    related: ['json-formatter', 'markdown-preview', 'json-validator'],
    mode: LOCAL,
  },
  {
    slug: 'base64-encoder',
    category: 'developer',
    name: 'Base64 Encoder',
    summary: 'Encode text as Base64 without corrupting anything outside Latin-1.',
    description:
      'Encode any text as Base64, correctly, for anything from a password prompt to a data URI. The text is converted to UTF-8 bytes first, which is what makes emoji, Cyrillic and Chinese survive the round trip. URL-safe output is available for tokens and query strings, and long output can be wrapped the way MIME expects.',
    icon: 'lock',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'urlSafe',
        label: 'URL-safe alphabet',
        default: false,
        help: 'Uses a hyphen and an underscore instead of plus and slash, and drops the padding. This is what tokens and URL components require.',
      },
      {
        kind: 'toggle',
        id: 'lineWrap',
        label: 'Wrap at 76 characters',
        default: false,
        help: 'The MIME convention for encoded content, used by some certificate formats.',
      },
    ],
    keywords: ['base64 encode', 'base64 encoder', 'encode base64', 'text to base64', 'base64 url safe'],
    synonyms: ['base64', 'encode', 'to base64', 'make base64', 'base64 encode text'],
    faq: [
      {
        q: 'Why does Base64 always add a third?',
        a: 'Because it turns three bytes into four characters, so three characters of input become four. A four-byte group encodes to five characters with padding, which is why encoded output is never shorter than the input. Nothing can be done about it: this is the format, not a setting.',
      },
      {
        q: 'Is Base64 encryption?',
        a: 'No, and this matters. Base64 is an encoding with no key: anyone can decode what you encode, instantly. It is useful for putting binary data into text-only places such as a JSON field or a URL. If you need confidentiality, you need encryption, and no amount of encoding provides it.',
      },
      {
        q: 'What is the URL-safe variant for?',
        a: 'For anything that will travel in a URL. The standard alphabet uses a plus and a slash, both of which mean something in a URL — a query separator and a path separator — so the safe variant substitutes a hyphen and an underscore and drops the padding that would need escaping.',
      },
      {
        q: 'How do I encode a file rather than text?',
        a: 'For text, this tool. A data URI such as an inline image is built the same way from the file’s bytes; the JSON tools in Furtu handle the encoding step, and nothing is uploaded to do it.',
      },
    ],
    howItWorks: [
      { title: 'Type or paste the text', body: 'Encoding starts as you type, in the browser.' },
      { title: 'Choose the alphabet', body: 'Standard for MIME and most APIs; URL-safe for tokens and links.' },
      { title: 'Copy the result', body: 'The character count and the byte count are both shown, since they differ.' },
    ],
    limitations: [
      'Base64 is not encryption and provides no confidentiality. Anyone with the text can decode it.',
      'Encoded output is a third larger than the input, which matters in a URL where every character also counts towards a length limit.',
    ],
    related: ['base64-decoder', 'url-encoder', 'hash-generator'],
    mode: LOCAL,
  },
  {
    slug: 'base64-decoder',
    category: 'developer',
    name: 'Base64 Decoder',
    summary: 'Decode Base64 to text, with a clear reason when it will not decode.',
    description:
      'Turn Base64 back into readable text, whether it came from a standard encoder, a URL-safe one, or an API that stripped the padding. When the characters are valid Base64 but the bytes are not valid UTF-8, Furtu says exactly that instead of handing back a screenful of replacement characters.',
    icon: 'key',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'urlSafe',
        label: 'URL-safe input',
        default: false,
        help: 'Accepts a hyphen and an underscore in place of a plus and a slash, as used in tokens.',
      },
      {
        kind: 'toggle',
        id: 'stripWhitespace',
        label: 'Ignore spaces and line breaks',
        default: true,
        help: 'Base64 in an email or a wrapped file is often broken across lines.',
      },
      {
        kind: 'select',
        id: 'charset',
        label: 'Character set',
        default: 'utf-8',
        options: [
          { value: 'utf-8', label: 'UTF-8 — almost always this one' },
          { value: 'latin1', label: 'Latin-1 (ISO-8859-1) — one byte per character' },
        ],
        help: 'UTF-8 is strict: invalid sequences are reported. Latin-1 reads the bytes one for one, which is right for old Western European text.',
      },
    ],
    keywords: ['base64 decode', 'base64 decoder', 'decode base64', 'base64 to text', 'decode base64 url safe'],
    synonyms: ['base64', 'decode', 'from base64', 'base64 to utf8', 'base64 decode text'],
    faq: [
      {
        q: 'What went wrong with my input?',
        a: 'Furtu names the first character that cannot appear in Base64 and its position, and it checks the length: a group is four characters wide, so a total length of one more than a multiple of four is always truncated or wrong. Missing padding on its own is not an error, because plenty of encoders strip it.',
      },
      {
        q: 'Why am I seeing replacement characters?',
        a: 'The Base64 was valid but the bytes it encodes are not valid UTF-8, which usually means the original was Latin-1 or a binary file. Switch the character set to Latin-1 to read it byte for byte, and expect the same text the original encoder started from.',
      },
      {
        q: 'Can it decode a token for me?',
        a: 'It will decode the middle part as text, but use the token decoder for a JWT. That tool shows the header, the payload and the expiry, and it is explicit that a decoded payload is not proof of anything.',
      },
      {
        q: 'Does it handle non-Latin text properly?',
        a: 'Yes. The bytes are decoded as UTF-8 in one step, so multi-byte characters reassemble instead of turning into mojibake. The naive approach of mapping each byte to a character and hoping is what produces strings full of mangled accented letters.',
      },
      {
        q: "Is the encoded data sent anywhere?",
        a: "No. Decoding happens in your browser. Base64 often carries credentials and API keys, so it is never the right thing to paste into a service you have not checked.",
      },
    ],
    howItWorks: [
      { title: 'Paste the Base64', body: 'Wrapped, unpadded and URL-safe inputs are all accepted.' },
      { title: 'Pick the character set', body: 'Leave it on UTF-8 unless the output is obviously Latin-1.' },
      { title: 'Read the result', body: 'Byte count, character count and any decoding problem are shown together.' },
    ],
    limitations: [
      'Binary output is not rendered. A decoded PNG comes back as text, and Furtu will tell you it is not valid UTF-8 rather than pretending.',
      'No encryption is involved in either direction, so a decoded value may be sensitive; nothing is stored, but the text is on your screen.',
    ],
    related: ['base64-encoder', 'jwt-decoder', 'url-decoder'],
    mode: LOCAL,
  },
  {
    slug: 'url-encoder',
    category: 'developer',
    name: 'URL Encoder',
    summary: 'Percent-encode a value or a whole URL, and know which one you needed.',
    description:
      'Escape the characters a URL cannot carry, either as a single component or as a whole address. The distinction between the two escaping functions is the one that breaks most integrations: a component escapes the separators, a URL keeps them so it still parses. Furtu shows which one it used.',
    icon: 'arrow',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'target',
        label: 'What are you encoding?',
        default: 'component',
        options: [
          { value: 'component', label: 'A single value, such as a query parameter' },
          { value: 'url', label: 'A whole URL, path included' },
        ],
        help: 'Component mode escapes the path, query and fragment separators, which is right for one value. URL mode leaves them alone so the address still works.',
      },
      {
        kind: 'toggle',
        id: 'upperCaseHex',
        label: 'Upper-case hex digits',
        default: false,
        help: 'Both forms are legal; some servers accept only one.',
      },
    ],
    keywords: ['url encode', 'percent encoding', 'encodeuricomponent', 'escape url', 'url encoder'],
    synonyms: ['percent encode', 'urlencode', 'encode uri', 'escape characters', 'percent-encode'],
    faq: [
      {
        q: 'When do I need one escaping function and when the other?',
        a: 'The component function for a value that becomes part of a URL — a search term, a redirect target, one query parameter. It escapes the path, query and fragment separators along with everything else, so the value cannot break the structure. The whole-URL function for an address you are assembling, because it leaves those separators intact and the result still parses. Using the wrong one produces a URL that looks right and does not work.',
      },
      {
        q: 'What about plus signs for spaces?',
        a: 'Percent-encoding turns a space into %20, which is correct for a URL path or fragment. An HTML form submitted as form-encoded data uses a literal plus for a space instead, because that is what that encoding has always done. Furtu encodes to %20 and the decoder can read either.',
      },
      {
        q: 'What does the double-encoding warning mean?',
        a: 'The input already contains percent-escapes. Encoding it again turns %20 into %2520, and the server reads that as the literal text %20 rather than a space. That is the most common cause of a value arriving with an escape still in it. Decode first if that is what you meant.',
      },
      {
        q: 'Does it touch the network?',
        a: 'No. The encoding uses the two functions built into the browser, and the result appears immediately without a request.',
      },
      {
        q: "Is the text or URL I encode uploaded?",
        a: "No. Encoding is a pure string operation performed in your browser, so a query parameter containing a token is never transmitted.",
      },
    ],
    howItWorks: [
      { title: 'Paste the value or the URL', body: 'The tool warns if the input is already partly encoded.' },
      { title: 'Choose component or whole URL', body: 'The difference decides whether the separators survive.' },
      { title: 'Copy the result', body: 'The function used is named in the read-out, so you know what happened.' },
    ],
    limitations: [
      'This encodes a value you paste. It does not build a query string, choose a parameter order, or add a signature.',
      'Spaces become %20 rather than a plus, which is right for URLs but not for a form body.',
    ],
    related: ['url-decoder', 'base64-encoder', 'json-formatter'],
    mode: LOCAL,
  },
  {
    slug: 'url-decoder',
    category: 'developer',
    name: 'URL Decoder',
    summary: 'Read a percent-encoded URL, including values encoded more than once.',
    description:
      'Turn percent-escapes back into readable text. Plus signs are treated as spaces because that is what they mean in a query string, and a value that was encoded twice can be unwrapped in steps. An incomplete escape is reported with its exact position rather than as a bare encoding failure.',
    icon: 'chevron',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'plusAsSpace',
        label: 'Read + as a space',
        default: true,
        help: 'Correct for form data and query strings. Turn it off if the plus sign is meant literally.',
      },
      {
        kind: 'toggle',
        id: 'decodeRepeatedly',
        label: 'Decode repeatedly',
        default: false,
        help: 'Unwraps a value that was encoded two or three times, up to four passes.',
      },
    ],
    keywords: ['url decode', 'url decoder', 'percent decode', 'decodeuricomponent', 'unescape url'],
    synonyms: ['percent decode', 'urldecode', 'decode uri', 'unescape', 'decode percent encoding'],
    faq: [
      {
        q: 'Why does plus become a space?',
        a: 'Because in a query string it always has. HTML forms have encoded spaces as a plus since the early web, and everything that reads a form body accepts it. In a path or a fragment a plus is a real plus, which is why this is a toggle rather than a rule.',
      },
      {
        q: 'What if my value is encoded twice?',
        a: 'Some stacks encode a value, put it in a URL, and encode it again on the way out. The server then decodes once and sees %20 rather than a space. Repeated decoding peels that off, and Furtu stops after four passes or as soon as the value stops changing, so it cannot run away on text that is not encoded at all.',
      },
      {
        q: 'Why does it report the position of a bad escape?',
        a: 'A truncated value such as a query ending in %2 is common in a log line that got cut off. Knowing the character position turns a generic failure into something you can find, and the built-in decoder throws without saying where.',
      },
      {
        q: 'Does the decoded text get sent anywhere?',
        a: 'No. It is decoded in the tab and never transmitted, which matters because a URL often contains a token or a reset code.',
      },
    ],
    howItWorks: [
      { title: 'Paste the encoded string', body: 'A full URL, a query string or a single escaped value all work.' },
      { title: 'Decide about plus signs', body: 'Leave the toggle on for query strings, turn it off for a path.' },
      { title: 'Check for leftovers', body: 'Furtu warns if escapes remain, which usually means double encoding.' },
    ],
    limitations: [
      'Repeated decoding is capped at four passes. A deeper stack of encoding needs the same number of manual decodes.',
      'Multi-byte characters are reassembled as UTF-8, so a value encoded as Latin-1 will be reported rather than guessed at.',
    ],
    related: ['url-encoder', 'base64-decoder', 'jwt-decoder'],
    mode: LOCAL,
  },
  {
    slug: 'jwt-decoder',
    category: 'developer',
    name: 'JWT Decoder',
    summary: 'Read a JSON Web Token — and see, clearly, that it proves nothing.',
    description:
      'Split a token into its three parts, decode the header and payload from the URL-safe Base64, and read the expiry as a date. Nothing is verified. Furtu says so on the page, because the contents of a token are whatever the person who made it chose to write, and treating them as proof of identity is the mistake this tool exists to prevent.',
    icon: 'key',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'maskSensitive',
        label: 'Mask values that look like secrets',
        default: true,
        help: 'Replaces payload fields named like a password, key or token with their length, so a screenshot of this page is safer to share.',
      },
    ],
    keywords: ['jwt decoder', 'decode jwt', 'json web token', 'jwt viewer', 'read jwt'],
    synonyms: ['jwt', 'decode token', 'bearer token', 'token inspector', 'jwt payload'],
    faq: [
      {
        q: 'Does Furtu verify the signature?',
        a: 'No, and it cannot. Verifying a signature needs the key: the public key for RS256, or the shared secret for HS256. Verifying with the token’s own key would prove nothing, and Furtu has no key material and makes no request. What it does is decode, and that is a completely different operation from verifying.',
      },
      {
        q: 'So why trust anything it shows?',
        a: 'Treat the contents as a claim rather than a fact. A decoded payload is useful for debugging — which scopes were granted, when it expires, what the issuer says — and worthless as proof. The only trustworthy answer to “is this token valid?” comes from the server that issued it, checked against its key.',
      },
      {
        q: 'What does an unsigned algorithm mean?',
        a: 'That the token is not signed. Anyone can write one, and a server that accepts it accepts a token anyone forged. If you are reviewing a system, that line in the header is worth a conversation.',
      },
      {
        q: 'Why can a token have five parts?',
        a: 'That is an encrypted token. Furtu does not decrypt, because decryption needs a key, and a five-part value here means the payload is not visible to anyone without one.',
      },
      {
        q: "Is my token sent anywhere?",
        a: "No — and this is the most important property this tool has. A token is a live credential for as long as it is valid, so it is decoded in your browser and never transmitted, stored or logged.",
      },
    ],
    howItWorks: [
      { title: 'Paste the token', body: 'A leading “Bearer ” is stripped for you.' },
      { title: 'Read the three parts', body: 'Header, payload and signature, with the URL-safe Base64 decoded and pretty-printed.' },
      { title: 'Check the expiry', body: 'Expiry, issued-at and not-before are shown as readable dates, with how long is left.' },
    ],
    limitations: [
      'The signature is never verified. Nothing here should be used to make an authentication decision.',
      'Encrypted tokens, which have five parts, cannot be read.',
      'A revoked token still looks valid: revocation is recorded on the server, not in the token.',
    ],
    related: ['base64-decoder', 'json-formatter', 'hash-generator'],
    mode: LOCAL,
  },
  {
    slug: 'uuid-generator',
    category: 'developer',
    name: 'UUID Generator',
    summary: 'Generate random v4 UUIDs from the browser’s cryptographic source.',
    description:
      'Create as many version 4 UUIDs as you need, with the version and variant bits set correctly. They come from the platform’s cryptographic random source rather than a general-purpose generator, so they are not predictable from an earlier one, and they are not sequential, so they do not reveal how many records exist.',
    icon: 'hash',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'number',
        id: 'count',
        label: 'How many',
        min: 1,
        max: 1000,
        step: 1,
        default: 5,
        help: 'Up to 1,000 at a time.',
      },
      {
        kind: 'toggle',
        id: 'uppercase',
        label: 'Upper-case hex',
        default: false,
        help: 'The canonical form is lower-case. Upper case is accepted by most systems, not all.',
      },
      {
        kind: 'toggle',
        id: 'braces',
        label: 'Wrap in braces',
        default: false,
        help: 'The braced form found in Microsoft tooling and in some configuration formats.',
      },
    ],
    keywords: ['uuid generator', 'guid generator', 'random uuid', 'uuid v4', 'generate uuid'],
    synonyms: ['guid', 'v4', 'random id', 'unique id', 'identifier generator'],
    faq: [
      {
        q: 'Are these unique?',
        a: 'A v4 identifier carries 122 random bits, which is a one in a billion-billion-billion chance of a collision per pair. The format also fixes a version nibble and a variant nibble, so those bits are not random. For billions of records, collisions are not a practical concern; for the same reasons, do not use one where a secret is needed.',
      },
      {
        q: 'Why not sequential identifiers?',
        a: 'Sequential identifiers leak: the number of records you have, the order they were created, and how fast you are growing. A random identifier reveals none of that. It is also not sortable by time, which is sometimes what you want and sometimes not — an identifier with a timestamp prefix is the answer when order matters.',
      },
      {
        q: 'Where do the random numbers come from?',
        a: 'The platform’s cryptographic random source, which is designed for exactly this. Not the general-purpose pseudo-random generator built into the language, which is fast and fine for shuffling a list and entirely wrong for anything that must not be guessable.',
      },
      {
        q: 'What is the difference between v4 and v7?',
        a: 'A v4 is fully random. A v7 puts a millisecond timestamp in the high bits and random data in the rest, so the identifiers sort by creation time and are still unique. Furtu generates v4 because it is the one every system accepts; if you need time ordering, that is a deliberate choice with a different library.',
      },
      {
        q: "Are the generated IDs uploaded or logged?",
        a: "They come from your browser's own cryptographic random source, so nothing is uploaded and nothing is generated on a server that could see them or count them. Furtu has no record of how many you have made.",
      },
    ],
    howItWorks: [
      { title: 'Set the count', body: 'One identifier, or up to a thousand for seeding a database.' },
      { title: 'Generate', body: 'Sixteen bytes are drawn from the platform source, then the version and variant bits are set.' },
      { title: 'Copy or download', body: 'One identifier per line, ready to paste or save as a file.' },
    ],
    limitations: [
      'Generated values stay in the box until you clear it or reload. Furtu does not clear it for you, because doing so mid-copy is worse than the risk.',
      'A v4 identifier is an identifier, not a secret. Do not use one as a session token or an API key.',
    ],
    related: ['password-generator', 'hash-generator', 'timestamp-converter'],
    mode: LOCAL,
  },
  {
    slug: 'regex-tester',
    category: 'developer',
    name: 'Regular Expression Tester',
    summary: 'Test a pattern against sample text and see every match, group and index.',
    description:
      'Run a regular expression against text you paste, with a list of every match: where it starts, what each group captured, and what each named group holds. A match-count cap and a zero-length guard stop a pattern from locking the tab, and a pattern that will not compile is explained rather than thrown at you.',
    icon: 'search',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      { kind: 'text', id: 'pattern', label: 'Pattern', placeholder: '\\b[A-Z][a-z]+', help: 'Written without the slashes. Furtu adds the global flag, because a list of matches needs it.', maxLength: 2000 },
      {
        kind: 'select',
        id: 'flags',
        label: 'Flags',
        default: 'g',
        options: [
          { value: 'g', label: 'g — all matches' },
          { value: 'gi', label: 'gi — ignore case' },
          { value: 'gm', label: 'gm — ignore case, multiline anchors' },
          { value: 'gim', label: 'gim — ignore case, multiline, dot matches newlines' },
          { value: 'gims', label: 'gims — the above plus dotAll' },
          { value: 'giu', label: 'giu — ignore case, Unicode aware' },
        ],
      },
      { kind: 'toggle', id: 'showGroups', label: 'Show capturing groups', default: true },
      {
        kind: 'number',
        id: 'maxMatches',
        label: 'Maximum matches',
        min: 1,
        max: 5000,
        step: 50,
        default: 1000,
        help: 'Collection stops here so a loose pattern cannot produce a result the browser cannot lay out.',
      },
    ],
    keywords: ['regex tester', 'regular expression tester', 'test regex', 'regex match', 'regexp'],
    synonyms: ['regex', 'regexp', 'pattern tester', 'match regex', 'test regular expression'],
    faq: [
      {
        q: 'Can a pattern freeze the page?',
        a: 'One attempt can. A pattern with a quantifier nested inside a quantifier, applied to a long run of characters that ultimately fails, makes the engine try an exponential number of ways to give up. JavaScript offers no way to interrupt a regular expression that is already running, so Furtu cannot save you from a single attempt — it warns when it sees that shape, and it bounds how many matches it collects. Test destructive patterns on a small sample first.',
      },
      {
        q: 'Why does a pattern matching nothing sometimes hang?',
        a: 'A pattern that can match the empty string leaves the search position exactly where it was, so the next attempt returns the same result and the loop never ends. Furtu advances the position past every zero-length match, and caps the total as well. Both guards are in the code rather than in a timeout, because a timeout would still leave the tab unresponsive.',
      },
      {
        q: 'Which flavour of regex is this?',
        a: 'The one in your browser, which is the JavaScript engine: no lookbehind in older Safari, no possessive quantifiers, no atomic groups, and the Unicode flag changes how a pattern is compiled. Furtu runs the pattern in the same engine that will run your code, which is the point — but a pattern that works in PCRE, Python or Go is not guaranteed to work here.',
      },
      {
        q: 'Why did Furtu add the global flag?',
        a: 'Because a table of matches is meaningless without it: without it, the engine returns the first match and stops. If you asked for no flags at all, Furtu adds the global one and says so, rather than quietly showing you a single hit.',
      },
    ],
    howItWorks: [
      { title: 'Write the pattern', body: 'No slashes, and Furtu adds the flags you did not ask for — with a note when it does.' },
      { title: 'Paste the subject text', body: 'The match list builds as you type, with a cap you control.' },
      { title: 'Read the table', body: 'Match index, matched text, each group, and each named group.' },
    ],
    limitations: [
      'A single catastrophic match attempt cannot be interrupted from JavaScript. Furtu warns about the pattern shape and caps the match count, but a hostile pattern against a large subject can still hang the tab.',
      'The cap stops collection part-way. Furtu says so in the results rather than implying the list is complete.',
    ],
    related: ['text-case-converter', 'json-validator', 'markdown-preview'],
    mode: LOCAL,
  },
  {
    slug: 'timestamp-converter',
    category: 'developer',
    name: 'Timestamp Converter',
    summary: 'Move between Unix seconds, milliseconds and ISO 8601 without guessing.',
    description:
      'Paste a timestamp in any of the three common forms and read it back in all of them, in UTC and in your own time zone, with the offset spelled out. A ten-digit number is read as seconds and a thirteen-digit one as milliseconds, and Furtu tells you which reading it used and what the other one would have meant.',
    icon: 'sun',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'assumeUnit',
        label: 'A bare number is…',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Detect from the number of digits' },
          { value: 'seconds', label: 'Seconds' },
          { value: 'milliseconds', label: 'Milliseconds' },
        ],
        help: 'Detection is right for any current date. Pin it if you are working with something unusual.',
      },
      { kind: 'toggle', id: 'showRelative', label: 'Show how long ago', default: true },
    ],
    keywords: ['timestamp converter', 'unix timestamp', 'epoch converter', 'iso 8601', 'epoch to date'],
    synonyms: ['epoch', 'unix time', 'date converter', 'time converter', 'to iso'],
    faq: [
      {
        q: 'What is the difference between seconds and milliseconds?',
        a: 'The same instant, written with a different unit. 1767225600 and 1767225600000 are one moment. Mixing them up is the commonest timestamp bug, and it produces a date in 1970 or a date fifty thousand years out. Furtu shows both numbers for every input so the pair is never a mystery again.',
      },
      {
        q: 'How does it decide which one you meant?',
        a: 'By magnitude. Around ten digits is the current era in seconds; around thirteen is the current era in milliseconds. Furtu states the reading it used and gives the alternative, so a wrong guess is visible rather than silent. Pin the unit in the control when the guess is not good enough.',
      },
      {
        q: 'What is my time zone?',
        a: 'The one your browser reports, named explicitly with its current offset, which changes with daylight saving. UTC is always shown alongside it, because a timestamp without a zone is not a moment — it is a set of possible moments.',
      },
      {
        q: 'Can it read a date string?',
        a: 'ISO 8601, reliably, because it is a standard. Other formats are matched against the browser’s looser parser, which is not a standard and differs between browsers — Furtu warns when it falls back to that, so you know how much to trust the answer.',
      },
      {
        q: "Is the timestamp I convert uploaded?",
        a: "No. The conversion runs in your browser, so a timestamp taken from an internal system does not disclose anything about that system.",
      },
    ],
    howItWorks: [
      { title: 'Paste a timestamp or a date', body: 'Seconds, milliseconds or an ISO 8601 string.' },
      { title: 'Read it back three ways', body: 'Unix seconds, Unix milliseconds and ISO 8601, plus your local time.' },
      { title: 'Check the zone', body: 'The offset is spelled out, and the relative time is there when you need it.' },
    ],
    limitations: [
      'JavaScript dates run from 271821 BC to 275760 AD. A timestamp outside that range is reported rather than wrapped.',
      'A leap second has no representation in Unix time, so 23:59:60 on a leap day does not appear.',
      'Time zone names come from the browser, and a user can override them, so the local reading follows the machine rather than a fixed table.',
    ],
    related: ['unit-converter', 'file-size-converter', 'json-formatter'],
    mode: LOCAL,
  },
  {
    slug: 'hash-generator',
    category: 'developer',
    name: 'Hash Generator',
    summary: 'Hash text with SHA-256, SHA-384, SHA-512 or SHA-1.',
    description:
      'Compute a cryptographic hash of the text you paste, using the Web Crypto implementation already in your browser. All four algorithms can be compared side by side, which is the quickest way to see that the length of the digest says nothing about the quality of the hash.',
    icon: 'shield',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'algorithm',
        label: 'Algorithm',
        default: 'SHA-256',
        options: [
          { value: 'SHA-256', label: 'SHA-256 — the sensible default' },
          { value: 'SHA-384', label: 'SHA-384' },
          { value: 'SHA-512', label: 'SHA-512' },
          { value: 'SHA-1', label: 'SHA-1 — legacy only' },
          { value: 'all', label: 'All four, for comparison' },
        ],
      },
      {
        kind: 'select',
        id: 'case',
        label: 'Hex case',
        default: 'lower',
        options: [
          { value: 'lower', label: 'Lower-case, as conventionally written' },
          { value: 'upper', label: 'Upper-case, as some systems output' },
        ],
      },
    ],
    keywords: ['hash generator', 'sha256', 'sha-256 generator', 'md5 alternative', 'checksum'],
    synonyms: ['hash', 'sha256', 'digest', 'checksum', 'fingerprint'],
    faq: [
      {
        q: 'Is SHA-1 safe to use?',
        a: 'No, not for anything that has to resist an attacker. Practical collisions against SHA-1 have been demonstrated, and chosen-prefix collisions are cheap enough to buy. Version control still uses it to identify objects, and that is fine — nothing there depends on collision resistance. For signatures, certificates, download integrity or anything adversarial, use SHA-256 or better.',
      },
      {
        q: 'Can I use this to hash a password?',
        a: 'No. A plain hash is fast on purpose, and a fast hash is exactly what a password cracker wants. Passwords need a slow, salted function such as Argon2, scrypt or bcrypt, which is a different tool. As a checksum for a downloaded file or a cache key, this is the right tool.',
      },
      {
        q: 'Why is the output different on another machine?',
        a: 'It should not be. SHA-256 of the same UTF-8 text is the same everywhere, on every platform. If two machines disagree, the inputs differ — a trailing newline, a different line ending, a non-breaking space, or a different text encoding are the usual causes. Furtu encodes UTF-8 and reports the byte count, which makes that easy to check.',
      },
      {
        q: 'What happens if the page is not served over HTTPS?',
        a: 'Web Crypto is only available in a secure context, so Furtu says so plainly instead of producing nothing. It needs HTTPS, or HTTP on localhost.',
      },
      {
        q: "Is the text I hash uploaded?",
        a: "No. The digest is computed with the Web Crypto API in your browser. This is why Furtu will hash a licence key or a password hash comparison, but you should still not paste a real password anywhere.",
      },
    ],
    howItWorks: [
      { title: 'Paste the text', body: 'Encoded as UTF-8 first, so non-ASCII input hashes the same as it does anywhere else.' },
      { title: 'Choose the algorithm', body: 'Or pick all four to see the digests together.' },
      { title: 'Copy the digest', body: 'Lower or upper case, and the byte count of the input is shown beside it.' },
    ],
    limitations: [
      'No keyed hash, no salting, no key stretching, and no file hashing. This is a plain one-way digest of text.',
      'SHA-1 is offered for compatibility with older systems, not because it should be used.',
    ],
    related: ['base64-encoder', 'password-generator', 'uuid-generator'],
    mode: LOCAL,
  },
  {
    slug: 'color-converter',
    category: 'developer',
    name: 'Colour Converter',
    summary: 'Convert HEX, RGB, HSL and HSV in both directions.',
    description:
      'Paste a colour in any of the common notations and read it back in all the others, with the channels, the nearest named colour and the contrast ratio against white and black. Alpha is carried through the whole conversion, so a translucent colour does not quietly become opaque.',
    icon: 'palette',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'inputFormat',
        label: 'Read the input as',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Detect automatically' },
          { value: 'hex', label: 'HEX' },
          { value: 'rgb', label: 'RGB' },
          { value: 'hsl', label: 'HSL' },
          { value: 'hsv', label: 'HSV' },
        ],
      },
      { kind: 'number', id: 'decimals', label: 'Decimal places', min: 0, max: 6, step: 1, default: 2, help: 'For the HSL and HSV percentages.' },
      {
        kind: 'color',
        id: 'swatch',
        label: 'Colour picker',
        default: '#2563eb',
        help: 'Used when the text box is empty, so you can pick a colour visually.',
      },
      { kind: 'toggle', id: 'includeNamed', label: 'Show the nearest named colour', default: true },
    ],
    keywords: ['colour converter', 'color converter', 'hex to rgb', 'rgb to hsl', 'hsl to hex'],
    synonyms: ['color', 'colour', 'hex', 'rgb', 'hsl', 'palette'],
    faq: [
      {
        q: 'What is the difference between HSL and HSV?',
        a: 'Both are two-dimensional ways of describing a colour with a hue, and they differ in what the two numbers mean. In HSL the second number is lightness, where zero is black and full is white. In HSV it is brightness, where full is fully saturated colour, so pure red is full and a pale red is also full at lower saturation. HSL is what CSS uses; HSV is what design tools show, because a saturation and brightness slider feels more predictable.',
      },
      {
        q: 'Why does the contrast figure ignore transparency?',
        a: 'Because contrast depends on what is behind the colour, and Furtu cannot know that. A half-transparent black over white and over black give completely different results. Use the opaque value for the calculation and check the composite by eye.',
      },
      {
        q: 'Is the nearest named colour the same colour?',
        a: 'No, unless it says the match is exact. A named colour is a fixed point in a continuous space, so “nearest” is a distance in RGB and can still be visibly different. It is a useful label for communication — the blue one — and a bad source for a specification.',
      },
      {
        q: 'Which colour space is this?',
        a: 'sRGB, because that is what every screen and every browser uses unless it is told otherwise. Wider-gamut spaces hold colours sRGB cannot, and converting between them changes the numbers; Furtu does not claim to do that.',
      },
      {
        q: "Is anything sent when I convert a colour?",
        a: "No. It is arithmetic on three numbers, performed in your browser. There is nothing about a colour worth sending, and nothing is sent.",
      },
    ],
    howItWorks: [
      { title: 'Paste a colour', body: 'Any of the four notations, or use the picker when the box is empty.' },
      { title: 'Read every notation', body: 'HEX, RGB, RGBA, HSL, HSLA and HSV, with alpha preserved.' },
      { title: 'Check the contrast', body: 'The ratio against white and black, with the AA verdict for body text.' },
    ],
    limitations: [
      'sRGB only. Wide-gamut values, and any conversion between sRGB, Display P3 and Rec. 2020, are out of scope.',
      'Named colours are a short common list rather than the full CSS set, so an unusual colour will be reported as nearest to a coarse approximation.',
    ],
    related: ['markdown-preview', 'base64-encoder', 'text-cleaner'],
    mode: LOCAL,
  },
  {
    slug: 'text-case-converter',
    category: 'developer',
    name: 'Text Case Converter',
    summary: 'Eleven case styles, including camelCase, snake_case and CONSTANT_CASE.',
    description:
      'Convert a phrase between the naming conventions that keep reappearing in code, configuration and headings. Words are split on punctuation and on existing camelCase humps, so an all-caps compound followed by an underscore becomes four words rather than one, and all eleven styles are shown at once so you can pick with the result in front of you.',
    icon: 'type',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'variant',
        label: 'Style',
        default: 'title',
        options: [
          { value: 'sentence', label: 'Sentence case' },
          { value: 'lower', label: 'lowercase' },
          { value: 'upper', label: 'UPPERCASE' },
          { value: 'title', label: 'Title Case' },
          { value: 'camel', label: 'camelCase' },
          { value: 'pascal', label: 'PascalCase' },
          { value: 'snake', label: 'snake_case' },
          { value: 'kebab', label: 'kebab-case' },
          { value: 'constant', label: 'CONSTANT_CASE' },
          { value: 'alternating', label: 'aLtErNaTiNg' },
          { value: 'inverse', label: 'iNVERSE cASE' },
        ],
      },
      {
        kind: 'toggle',
        id: 'showAll',
        label: 'Show every style',
        default: true,
        help: 'Turn this off to output only the style selected above.',
      },
    ],
    keywords: ['case converter', 'text case', 'camelcase converter', 'snake case', 'title case'],
    synonyms: ['capitalise', 'uppercase', 'lowercase', 'camel case', 'pascal case', 'kebab case'],
    faq: [
      {
        q: 'How does it decide where the words are?',
        a: 'On whitespace and punctuation — spaces, hyphens, underscores, slashes, dots and commas — and on letter-case changes inside a word, so an all-caps compound followed by a capital splits into two words. An apostrophe inside a word is kept, so a contraction stays one word rather than becoming two.',
      },
      {
        q: 'Which Title Case is this?',
        a: 'The editorial one: the first and last word are capitalised, and short articles, prepositions and conjunctions are not unless they start or end the title. That is a convention, not a standard, and a second convention capitalises every word. The choice is a matter of house style, which is why the tool shows you the words it found as well as the result.',
      },
      {
        q: 'What happens to the punctuation?',
        a: 'It is treated as a word boundary and dropped from the identifier styles, because snake_case and kebab-case cannot carry a comma. The text styles — sentence, lower, upper, title — work on the original string and keep their punctuation.',
      },
      {
        q: 'Does it handle languages other than English?',
        a: 'It handles them consistently but not linguistically. Capitalisation rules differ by language: German nouns stay capitalised, Turkish has two forms of the letter i, and scripts without case are unaffected by the case styles and pass through unchanged. Splitting into words is a guess outside languages that put spaces between words.',
      },
      {
        q: "Is my text uploaded?",
        a: "No. Re-casing is a local string operation, so a column of customer names or an internal identifier never leaves the page.",
      },
    ],
    howItWorks: [
      { title: 'Paste a phrase', body: 'Any style, any language, in any of the eleven conventions.' },
      { title: 'Compare the styles', body: 'All eleven are listed together by default.' },
      { title: 'Narrow the output', body: 'Turn off “show every style” to get only the one you selected.' },
    ],
    limitations: [
      'Word splitting is a heuristic for scripts that do not separate words with spaces, and for run-together capitals in English.',
      'No locale-aware capitalisation rules: German nouns, Turkish dotted i and similar conventions are not applied.',
    ],
    related: ['text-cleaner', 'word-counter', 'regex-tester'],
    mode: LOCAL,
  },
  {
    slug: 'markdown-preview',
    category: 'developer',
    name: 'Markdown Preview',
    summary: 'See your Markdown rendered — safely, with nothing able to execute.',
    description:
      'Render a documented subset of Markdown as HTML: headings, emphasis, lists, code, block quotes, links and rules. Furtu builds React elements and lets React escape the text, so raw HTML in your source is shown as characters and a javascript: link loses its target. Nothing is fetched and no image is loaded, because a preview that makes requests is not a local preview.',
    icon: 'text',
    workspace: 'text',
    engine: 'text',
    input: null,
    limits: SINGLE,
    controls: [
      {
        kind: 'toggle',
        id: 'lineBreaks',
        label: 'Single newlines become line breaks',
        default: false,
        help: 'The convention used by issue trackers. Off, paragraphs are joined the way strict Markdown joins them.',
      },
      {
        kind: 'toggle',
        id: 'autoLinks',
        label: 'Turn bare URLs into links',
        default: false,
        help: 'Off, a URL is text. On, http and https addresses become links, subject to the same scheme check as an explicit link.',
      },
      {
        kind: 'toggle',
        id: 'stripHtml',
        label: 'Show the source instead of the preview',
        default: false,
        help: 'Useful for checking which constructs the preview did not support.',
      },
    ],
    keywords: ['markdown preview', 'md preview', 'render markdown', 'markdown viewer', 'md to html'],
    synonyms: ['markdown', 'md', 'preview', 'readme', 'render md'],
    faq: [
      {
        q: 'Why is my HTML showing as text?',
        a: 'On purpose. Markdown allows raw HTML, and rendering it would mean pasting a document could inject a script, a style sheet or a tracking pixel into the page. Furtu escapes every HTML tag it finds and tells you how many there were, so you can see what was in the source without it becoming part of the page.',
      },
      {
        q: 'Why do my images not appear?',
        a: 'A preview that loads an image makes a request, and that request tells somebody else which address read the document and from where. Furtu shows the alternative text instead. For an image that already exists on disk, the image tools in Furtu are the honest route.',
      },
      {
        q: 'Which Markdown does it support?',
        a: 'A deliberate subset: headings, paragraphs, ordered and unordered lists, block quotes, horizontal rules, fenced code blocks with a language label, inline code, bold, italic, bold-italic, strikethrough, links, autolinks, backslash escapes and hard line breaks. Tables, footnotes, reference links, task lists, definition lists, underlined headings and raw HTML are not rendered — each appears as its own text rather than as something broken.',
      },
      {
        q: 'What is this safe against?',
        a: 'Injection, specifically. Tags can only come from the list above, because that is the only way this renderer creates an element; every piece of text is escaped by React when it is rendered; and a link target is checked against an allow-list of http, https, mailto and tel, plus relative paths and fragments. A javascript: or data: URL keeps its text and loses its target. Furtu never assigns your input to a raw markup sink.',
      },
      {
        q: "Is my Markdown uploaded?",
        a: "No. It is parsed in your browser. If you are previewing an unreleased README or a draft announcement, it stays on your device.",
      },
    ],
    howItWorks: [
      { title: 'Paste Markdown', body: 'The subset above is rendered as you type.' },
      { title: 'Read the notes', body: 'Unsupported HTML, dropped links and unclosed fences are reported.' },
      { title: 'Toggle the source', body: 'Switch to the plain text to see exactly what was in the document.' },
    ],
    limitations: [
      'The supported subset is small on purpose. Tables, footnotes, reference links, task lists, underlined headings and raw HTML are not implemented.',
      'No syntax highlighting inside code blocks. The language is shown as a label and the text is left alone.',
      'The output is static HTML, so anything interactive — a script, a form, an embedded video — is out of scope.',
    ],
    notes: [
      {
        title: 'Why Furtu will not render raw HTML',
        body: 'A Markdown preview is the one place where pasted text, an HTML parser and script execution meet. The safe way to do it is not to sanitise an HTML string after the fact, which is where filter bypasses come from, but to never build an element the parser did not ask for. This renderer constructs React elements from a fixed list of tags and lets React escape every text node and every attribute, so a script tag in the source is a handful of visible characters and nothing more. Link targets go through a scheme allow-list as well, because a link is the one attribute that can act without a script tag at all.',
      },
    ],
    related: ['xml-formatter', 'json-formatter', 'text-cleaner'],
    mode: LOCAL,
  },
];
