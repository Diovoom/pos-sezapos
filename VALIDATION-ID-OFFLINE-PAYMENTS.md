# Validation result

- TypeScript/TSX syntax transpilation: passed for all changed source files.
- Full `npm ci`: not completed in this container because its internal package mirror does not provide `zod-to-json-schema@3.25.2`.
- No dependency versions or lockfile entries were changed by this patch.
- Real ID/PDF417 behavior must be verified with the physical scanner.
- Real payment pairing must be verified with configured provider credentials and compatible hardware.
