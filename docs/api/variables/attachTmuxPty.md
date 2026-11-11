[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / attachTmuxPty

# Variable: attachTmuxPty

> `const` **attachTmuxPty**: (`tmux`, `session`, `opts?`, `onData?`) => `Promise`\<`Result`\<[`PtySession`](../interfaces/PtySession.md), `Error`\>\>

Defined in: baton/dist/baton/pty.d.ts:16

## Parameters

### tmux

#### socketPath?

`string`

#### hasSession

(`name`) => `Promise`\<`boolean`\>

### session

`string`

### opts?

[`PtyOpts`](../interfaces/PtyOpts.md)

### onData?

(`chunk`) => `void`

## Returns

`Promise`\<`Result`\<[`PtySession`](../interfaces/PtySession.md), `Error`\>\>
