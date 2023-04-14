<h1 align="center">
streamwire
</h1>

<p align="center">
<img alt="workflow" src="https://img.shields.io/github/actions/workflow/status/mat-sz/streamwire/tests.yml?branch=main">
<a href="https://npmjs.com/package/streamwire">
<img alt="npm" src="https://img.shields.io/npm/v/streamwire">
<img alt="npm" src="https://img.shields.io/npm/dw/streamwire">
<img alt="NPM" src="https://img.shields.io/npm/l/streamwire">
</a>
</p>

**streamwire** is a node.js package designed to make working with text-based protocols (e.g. SMTP, IMAP) easier.

This works for any Stream that is both Readable and Writable (Duplex), for example: `net.Socket`.

## Installation

streamwire is available on [npm](https://www.npmjs.com/package/streamwire), you can install it with either npm or yarn:

```sh
npm install streamwire
# or:
yarn install streamwire
```

## Example

Simple SMTP client implementation:

```ts
import { Wire } from 'streamwire';
import { connect } from 'net';
const socket = connect({ host: 'example.com', port: 25 });

async function smtpRead(wire: Wire): Promise<[number, string[]]> {
  const lines: string[] = [];

  while (true) {
    const line = await wire.readLine();

    const code = parseInt(line.split('-')[0].split(' ')[0]);
    if (!code || line.length < 4) {
      throw new Error('Invalid server response.');
    }
    const ended = line.charAt(3) !== '-';
    lines.push(line.substring(4));

    if (ended) {
      return [code, lines];
    }
  }
}

async function smtpCommand(
  wire: Wire,
  command: string,
  expectedCode = 250
): Promise<[number, string[]]> {
  wire.writeLine(`${command}\r\n`);
  const response = await smtpRead(wire);
  if (response[0] !== expectedCode) {
    throw new Error('Unexpected response.');
  }

  return response;
}

socket.on('connect', async () => {
  const wire = new Wire(socket);
  const welcome = await smtpRead(wire);
  if (welcome[0] !== 220) {
    throw new Error();
  }

  await smtpCommand(wire, 'EHLO');
  await smtpCommand(wire, 'MAIL FROM:<a@example.com>');
  await smtpCommand(wire, 'RCPT TO:<b@example.com>');
  await smtpCommand(wire, 'DATA', 354);
  await smtpCommand(wire, 'E-mail contents.\r\n.');

  // Success!
});
```
