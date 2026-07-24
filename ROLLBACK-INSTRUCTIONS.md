# Source Rollback Instructions

`APPLY-PATCH.ps1` creates a sibling backup folder named similar to:

```text
F:\pos-sezapos-PATCH-BACKUP-20260723-231500
```

To restore source files, copy that folder's contents back into the project root and select **Replace files in the destination**. New files that did not exist before the patch must be removed manually using `PATCH-FILES.json` and the manifest.

Database changes are not automatically rolled back. Use the database backup/checkpoint created before migration or a reviewed forward migration.
