# illustrator-mcp

An implementation of MCP server for Adobe Illustrator.
It enables text, image, and path manipulation and information retrieval.
This tool only works on macOS.

## Usage

Add the following to your MCP client configuration file.

```json
{
  "mcpServers": {
    "illustrator": {
      "command": "node",
      "args": [
        "~/Documents/web/illustrator-mcp/build/index.js"
      ]
    }
  }
}
```

## Development

```bash
yarn
yarn test
```

## Illustrator Update Smoke Test

Run this test set every time Illustrator or macOS is updated.

```bash
yarn build
yarn test
yarn test:smoke
```

Prerequisites for `test:smoke`:

- Adobe Illustrator is running on macOS.
- Terminal/Cursor has permission to control Illustrator (Automation/Accessibility).

`test:smoke` validates these runtime operations in order:

- `health_check` (runtime + capabilities)
- `create_document`
- `layer_manage` (`create` / `list`)
- `create_rects`
- `export_artifact` (SVG and SVGZ)

The smoke script writes:

- `tmp-smoke.svg`
- `tmp-smoke-compressed.svgz`

You can override output paths with environment variables:

- `SMOKE_SVG_PATH`
- `SMOKE_SVGZ_PATH`

Temporary script directory can also be overridden:

- `ILLUSTRATOR_MCP_TMP_DIR`

## Manual E2E Checklist (for failures)

If `yarn test:smoke` fails, run this checklist in your MCP client and confirm each response:

1. `create_document` -> should include `Document created.`
2. `health_check` -> should include `appVersion`
3. `layer_manage` with `create` -> should include your layer name
4. `layer_manage` with `list` -> should include the created layer
5. `create_rects` -> should include `Created successfully.`
6. `export_artifact` (`compressed: false`) -> `.svg` file exists
7. `export_artifact` (`compressed: true`) -> `.svgz` file exists

## Export Behavior Notes

- Export logic is centralized in `src/features/export.ts`.
- Timeout/file-existence fallback is preserved:
  - if Illustrator response times out but artifact exists, the tool returns a warning and treats export as completed.
- For SVG with `compressed: true`, output path is normalized to `.svgz`.
- Runtime diagnostics and update profile are available via:
  - `health_check`
  - `get_capabilities`

## Halftone Vector (MVP)

- Tool: `halftone_vector`
- Input: UUID of a linked placed image item (`targetUuid`)
- Output: A grouped set of vector dots (`groupUuid`, `dotCount`)

Important notes:

- This MVP currently targets linked image files (not embedded-only raster items).
- Use conservative settings first (`dotSpacing` around `2mm`, `maxDots` around `2500`) to avoid heavy artwork.
- Quality tuning parameters:
  - `contrast` (`-100` to `100`)
  - `gamma` (`0.1` to `5`)
  - `dotScale` (`0` to `3`)
  - `backgroundThreshold` (`0` to `1`, default `0.06`)

## Image Inspection

- Tool: `inspect_image`
- Purpose: Read placed-image pixel size and return scaling recommendations before running heavy effects.
- Baseline strategy:
  - default baseline: `1200px` (long edge)
  - returns `scaleFactor` and suggested `dotSpacing` / `minDotSize` / `maxDotSize`
- This is advisory only; manual parameter overrides remain fully supported.
