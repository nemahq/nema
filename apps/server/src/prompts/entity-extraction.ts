import { z } from "zod";

import { ENTITY_TYPES } from "@nema-io/shared";

export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extractor that identifies key entities from document text.

<instructions>
## Output format

Return a JSON object with one field:
- "entities": array of objects, each with "type" and "name" fields.

## Entity types

Each type has a specific scope. Do not extract entities outside these definitions.
Keep in sync with ENTITY_TYPES from @nema-io/shared.

- Person: Real names or titles referring to a specific individual (e.g., "Dr. Lee", "김철수")
- Organization: Companies, teams, institutions, communities (e.g., "Google", "Marketing Team")
- Topic: Tech stacks, domain terms, specialized concepts. Excludes common/generic nouns (e.g., "React", "valuation")
- Event: Named events, recurring meetings, milestones. Excludes one-off actions (e.g., "Sprint Review", "Series A")
- Project: Ongoing projects, products, service names (e.g., "Nema", "Checkout Redesign")
- Location: Proper place names (e.g., "San Francisco", "강남역")

## Rules

1. Extract only entities explicitly mentioned in the text. Do not infer or synthesize entities not present.
2. "name": Keep the entity name as a noun phrase in its original language as it appears in the text.
3. Prefer specific names over generic descriptions (e.g., "React" not "frontend framework").
4. If no meaningful entities exist, return an empty array.

## Do NOT extract

- Common/generic nouns: food, emotions, weather, time expressions (e.g., "pasta", "hunger", "Monday")
- Full sentences or clauses — entity names must be noun phrases only
- Names synthesized or rephrased from the original text — use the exact expression from the source
- One-off actions or states that would not meaningfully recur across documents
</instructions>

<examples>
<example>
<body>세쿼이아 캐피탈과 투자자 미팅을 했다. 반응은 비교적 긍정적이었으나 밸류에이션에 대해 다소 pushback을 받았다.</body>
<output>{"entities": [{"type": "Organization", "name": "세쿼이아 캐피탈"}, {"type": "Topic", "name": "밸류에이션"}]}</output>
<note>"투자자 미팅을 했다" is a one-off action, not an Event. "긍정적", "pushback" are sentiment expressions, not entities.</note>
</example>

<example>
<body>Interviewed a senior frontend candidate. Technical skills were adequate. Communication was somewhat lacking. System design was slightly disappointing.</body>
<output>{"entities": [{"type": "Topic", "name": "frontend"}]}</output>
<note>"frontend interview", "hiring" are synthesized — neither appears in the source text. "technical skills", "communication" are generic evaluation criteria, not entities.</note>
</example>

<example>
<body>오늘 점심에 파스타 먹고, 오후에 React Native 마이그레이션 회의했다. 배고팠는데 환타 마시니까 좀 나았음.</body>
<output>{"entities": [{"type": "Topic", "name": "React Native"}]}</output>
<note>"파스타", "환타" are common nouns (food/drink). "배고팠는데" is an emotion. "마이그레이션 회의했다" is a one-off action, not an Event.</note>
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
