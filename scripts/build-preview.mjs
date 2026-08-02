/**
 * Inlines the exported database snapshot into the preview page.
 *
 * Keeping this a build step rather than hand-written data is the point: every
 * number on the shared page traces back to a row in the database.
 *
 *   node scripts/build-preview.mjs <template.html> <data.json> <output.html>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [template, data, output] = process.argv.slice(2);

if (!template || !data || !output) {
  console.error(
    "Usage: node scripts/build-preview.mjs <template.html> <data.json> <output.html>",
  );
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(data, "utf8"));

// Trim the payload to what the page actually renders, so the shared file stays
// small and carries no field the preview does not show.
snapshot.requests = snapshot.requests.map((request) => ({
  ...request,
  timeline: request.timeline.slice(0, 40),
}));

const html = readFileSync(template, "utf8").replace(
  "__DEMO_DATA__",
  // `</script>` inside a string literal would close the tag early.
  JSON.stringify(snapshot).replaceAll("</", "<\\/"),
);

writeFileSync(output, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log(`wrote ${output} (${kb} KB, ${snapshot.requests.length} requests)`);
