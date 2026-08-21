import { test } from "node:test";
import assert from "node:assert/strict";
import { EXT_BY_MIME, MIME_BY_EXT, sniff } from "@/lib/uploads";

const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);

test("sniff reads the four accepted formats out of their real headers", () => {
  assert.equal(sniff(pad([...Buffer.from("%PDF-1.7")])), "application/pdf");
  assert.equal(sniff(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniff(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  // RIFF....WEBP — the four size bytes in between are whatever the file is long.
  assert.equal(sniff(pad([...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBP")])), "image/webp");
});

test("sniff refuses everything else, whatever it claims to be", () => {
  // The attack this exists for: an .html named .png, or a script named .pdf.
  assert.equal(sniff(pad([...Buffer.from("<!DOCTYPE html>")])), null);
  assert.equal(sniff(pad([0x4d, 0x5a])), null); // .exe
  // HEIC is a deliberate no — an iPhone shot must arrive already transcoded by the picker.
  assert.equal(sniff(pad([0, 0, 0, 0x18, ...Buffer.from("ftypheic")])), null);
  // Too short to hold any of the signatures: refuse rather than read past the end.
  assert.equal(sniff(Buffer.from("%PDF")), null);
});

test("every stored extension maps back to the mime it came from", () => {
  // The serve route picks Content-Type from the extension the upload route wrote, so a gap
  // here would serve a real upload as application/octet-stream.
  for (const [mime, ext] of Object.entries(EXT_BY_MIME)) {
    assert.equal(MIME_BY_EXT[ext], mime);
  }
  assert.equal(MIME_BY_EXT[".jpeg"], "image/jpeg");
});
