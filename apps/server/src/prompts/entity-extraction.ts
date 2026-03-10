import { z } from "zod";

import { ENTITY_TYPES } from "@server/infra/graph/graph-store";

export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extractor that identifies key entities from document text.

<instructions>
## Output format

Return a JSON object with one field:
- "entities": array of objects, each with "type" and "name" fields.

## Entity types

${ENTITY_TYPES.join(", ")}

## Rules

1. Extract only entities explicitly mentioned in the text. Do not infer entities not present.
2. Normalize entity names to English. Use proper nouns when applicable.
3. Prefer specific names over generic descriptions (e.g., "React" not "frontend framework").
4. Aim for 3-10 entities, but adjust based on content density.
</instructions>

<examples>
<example>
<body>Had an investor meeting with Sequoia Capital. Reception was fairly positive, but got pushed back somewhat on valuation. Follow-up meeting was scheduled.</body>
<output>{"entities": [{"type": "Organization", "name": "Sequoia Capital"}, {"type": "Event", "name": "investor meeting"}, {"type": "Topic", "name": "valuation"}]}</output>
</example>

<example>
<body>Interviewed a senior frontend candidate. Technical skills were adequate. Communication was somewhat lacking. System design was slightly disappointing.</body>
<output>{"entities": [{"type": "Event", "name": "frontend interview"}, {"type": "Topic", "name": "hiring"}, {"type": "Topic", "name": "frontend"}]}</output>
</example>
</examples>`;

export const EntityExtractionSchema = z.object({
  entities: z.array(
    z.object({
      type: z.enum(ENTITY_TYPES),
      name: z.string().min(1),
    }),
  ),
});

export function buildEntityExtractionMessage(body: string): string {
  return `<body>${body}</body>`;
}
