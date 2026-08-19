/**
 * Turning a browser "Copy as cURL" into a replayable request.
 *
 * Trybe has no public API, so stage 1 rides on the same private JSON endpoint
 * its own creator-search UI calls. Capturing that from DevTools and replaying
 * it is far steadier than driving the DOM: the shape of a JSON response
 * changes on a deploy cadence measured in months, while CSS selectors change
 * whenever someone touches a stylesheet.
 *
 * The parser is intentionally tolerant. A cURL line copied from Chrome,
 * Firefox, or Safari differs in quoting and in which flags appear, and the
 * person pasting it should not have to care which browser they used.
 */

export type RequestSpec = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

/**
 * Splits a shell-ish command into tokens, honouring single quotes, double
 * quotes, backslash escapes, and the line continuations browsers insert.
 */
function tokenize(input: string): string[] {
  // Join continuations first so the tokenizer never sees a stray backslash-EOL.
  const text = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (char === '\\' && quote === '"' && i + 1 < text.length) {
        current += text[++i];
        continue;
      }
      // Inside single quotes, shells treat everything literally — including
      // the backslashes in a JSON body, which is exactly why browsers pick
      // single quotes for --data-raw.
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
      continue;
    }

    if (char === '\\' && i + 1 < text.length) {
      current += text[++i];
      started = true;
      continue;
    }

    current += char;
    started = true;
  }

  if (started || current) tokens.push(current);
  return tokens.filter((token) => token.length > 0 || token === '');
}

/** Flags that carry a value we don't need but must not mistake for the URL. */
const IGNORED_WITH_VALUE = new Set([
  '--connect-timeout', '--max-time', '--retry', '--proxy', '-x',
  '--cert', '--key', '--cacert', '--resolve', '--interface',
]);

/** Valueless flags, dropped outright. */
const IGNORED_FLAGS = new Set([
  '--compressed', '-s', '--silent', '-k', '--insecure', '-L', '--location',
  '-i', '--include', '-v', '--verbose', '--http1.1', '--http2', '-g', '--globoff',
  '--no-buffer', '-N', '-f', '--fail',
]);

/**
 * Parses a cURL command into a spec fetch() can replay.
 *
 * Throws rather than guessing when there is no URL — a silently empty request
 * would fail much later, during sourcing, with a far less obvious message.
 */
export function parseCurl(command: string): RequestSpec {
  const tokens = tokenize(command.trim());
  if (tokens[0] !== 'curl') {
    // Tolerate a leading shell prompt or `$ ` that came along with the paste.
    const start = tokens.indexOf('curl');
    if (start === -1) throw new Error('Not a cURL command — expected the text to contain `curl`.');
    tokens.splice(0, start);
  }

  const headers: Record<string, string> = {};
  let url = '';
  let method = '';
  let body: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '-H' || token === '--header') {
      const raw = tokens[++i] ?? '';
      const split = raw.indexOf(':');
      if (split > 0) {
        const name = raw.slice(0, split).trim();
        const value = raw.slice(split + 1).trim();
        // Hop-by-hop and length headers are recomputed by fetch; copying them
        // across produces requests the server rejects as malformed.
        if (!/^(content-length|host|connection|accept-encoding)$/i.test(name)) {
          headers[name] = value;
        }
      }
      continue;
    }

    if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] ?? '';
      continue;
    }

    if (token === '-X' || token === '--request') {
      method = (tokens[++i] ?? '').toUpperCase();
      continue;
    }

    if (
      token === '-d' || token === '--data' || token === '--data-raw' ||
      token === '--data-binary' || token === '--data-ascii'
    ) {
      body = tokens[++i] ?? '';
      continue;
    }

    if (token === '--url') {
      url = tokens[++i] ?? '';
      continue;
    }

    if (IGNORED_WITH_VALUE.has(token)) { i++; continue; }
    if (IGNORED_FLAGS.has(token)) continue;
    if (token.startsWith('-')) {
      // Unknown flag. If the next token isn't a flag it's probably its value.
      if (tokens[i + 1] && !tokens[i + 1].startsWith('-')) i++;
      continue;
    }

    if (!url) url = token;
  }

  if (!url) throw new Error('Could not find a URL in that cURL command.');

  return {
    url,
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers,
    body,
  };
}

/**
 * Header names whose values are credentials. Used to redact the spec before
 * it is printed anywhere a log might keep it.
 */
const SECRET_HEADERS = /^(cookie|authorization|x-csrf-token|x-xsrf-token|x-api-key)$/i;

export function redactSpec(spec: RequestSpec): RequestSpec {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(spec.headers)) {
    headers[name] = SECRET_HEADERS.test(name) ? `<redacted ${value.length} chars>` : value;
  }
  return { ...spec, headers, body: spec.body ? `<${spec.body.length} chars>` : undefined };
}
