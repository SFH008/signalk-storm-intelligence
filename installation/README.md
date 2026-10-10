# Storm Intelligence installation downloads

## Version 2.4.1

- [Download the sharing ZIP](2.4.1/storm-intelligence-2.4.1-share.zip) — plugin tarball, installation guide, checksums and release details.
- [Download the npm tarball](2.4.1/signalk-storm-intelligence-2.4.1.tgz).
- [Installation instructions](2.4.1/INSTALL.md).
- [Release and verification details](2.4.1/RELEASE.json).
- [SHA-256 checksums](2.4.1/SHA256SUMS).

The plugin requires an existing Signal K Server, Node.js 20+ and internet access
for npm dependencies. This distribution contains the committed 2.4.1 runtime
with installation documentation; unfinished RDT research is excluded.

Verify the extracted files from the version directory:

```bash
sha256sum -c SHA256SUMS
```

These artifacts are included in the Git repository for sharing. They are not
part of the npm package's published file list. Keep each released version in
its own directory so existing downloads and checksums remain stable.
