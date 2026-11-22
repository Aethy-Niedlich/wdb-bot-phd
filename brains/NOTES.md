# Fixture Notes

Changes to real rows in MANIFEST.json must be documented here with the path and a one-line why.

- brains/primary.json: manifest row added; the previous commit was missing the separating comma, which broke JSON.parse and failed both the manifest pre-banner check and Fixture Bootstrap's precondition. Hashes/bytes re-verified against the files (8 rows OK).
