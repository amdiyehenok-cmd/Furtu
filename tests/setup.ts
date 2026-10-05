/**
 * Shared test setup.
 *
 * jsdom supplies the DOM the document operations need, but its `File` and
 * `Blob` predate `arrayBuffer()`, which every operation uses to read an upload
 * and every sample generator uses to hand its bytes back. Node's own
 * implementations are complete, so they replace jsdom's while `DOMParser` is
 * left alone — the combination a real browser provides.
 */
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

Object.assign(globalThis, { Blob: NodeBlob, File: NodeFile });
