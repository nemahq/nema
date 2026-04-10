import { z } from "zod";

import { ENTITY_TYPES } from "@nema-io/shared";

export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extractor that identifies key entities from document text.

<instructions>
## Output format

Return a JSON object with one field:
- "entities": array of objects, each with "type", "name", and "nameEn" fields.

## Entity types

${ENTITY_TYPES.join(", ")}

## Rules

1. Extract only entities explicitly mentioned in the text. Do not infer entities not present.
2. "name": Keep the entity name in its original language as it appears in the text.
3. "nameEn": Normalized English name. Use proper nouns when applicable.
4. If the text is already in English, "name" and "nameEn" should be the same.
5. Prefer specific names over generic descriptions (e.g., "React" not "frontend framework").
6. Aim for 3-10 entities, but adjust based on content density.
</instructions>

<examples>
<example>
<body>세쿼이아 캐피탈과 투자자 미팅을 했다. 반응은 비교적 긍정적이었으나 밸류에이션에 대해 다소 pushback을 받았다.</body>
<output>{"entities": [{"type": "Organization", "name": "세쿼이아 캐피탈", "nameEn": "Sequoia Capital"}, {"type": "Event", "name": "투자자 미팅", "nameEn": "investor meeting"}, {"type": "Topic", "name": "밸류에이션", "nameEn": "valuation"}]}</output>
</example>

<example>
<body>Interviewed a senior frontend candidate. Technical skills were adequate. Communication was somewhat lacking. System design was slightly disappointing.</body>
<output>{"entities": [{"type": "Event", "name": "frontend interview", "nameEn": "frontend interview"}, {"type": "Topic", "name": "hiring", "nameEn": "hiring"}, {"type": "Topic", "name": "frontend", "nameEn": "frontend"}]}</output>
</example>
</examples>`;

export const EntityExtractionSchema = z.object({
  entities: z.array(
    z.object({
      type: z.enum(ENTITY_TYPES),
      name: z.string().min(1),
      nameEn: z.string().min(1),
    }),
  ),
});

export function buildEntityExtractionMessage(body: string): string {
  return `<body>${body}</body>`;
}
