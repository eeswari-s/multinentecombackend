// Puppeteer v25's package entry is ESM-only (`export * from 'puppeteer-core'`).
// Node's own require() has native require(esm) interop for this (confirmed
// working outside Jest via a standalone smoke test — see pdfRenderer.js's
// real usage), but Jest's CommonJS-only module loader doesn't replicate
// that interop and fails to parse the file. Since ANY test file that
// transitively requires app.js pulls in pdfService -> pdfRenderer ->
// puppeteer, this manual mock (auto-applied by Jest for every test file,
// no per-file jest.mock() needed) is a project-wide necessity, not just a
// PDF-test concern.
//
// This only replaces Puppeteer's own internals, which are a well-tested
// third-party library — real end-to-end rendering is verified separately
// via a plain `node` smoke test outside Jest.
module.exports = {
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake-test-pdf-content')),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
};
