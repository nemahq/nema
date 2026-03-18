import { z } from "zod";

export const SearchQuerySchema = z.object({
  queries: z.array(z.string()),
  entities: z.array(z.string()),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SEARCH_QUERY_EXTRACTOR_SYSTEM_PROMPT = `You extract search queries and entity keywords from a user's question to support knowledge retrieval.

<instructions>
## Output format

Return a JSON object with exactly two fields:
- "queries": array of English search queries. Aim for 1-3, but exceed if the question covers more aspects.
- "entities": array of English entity keywords for graph-based search. Aim for 1-3, but exceed if the question covers more aspects.

## Rules

- All queries and entities must be in English.
- Generate multiple queries only when the question covers multiple distinct aspects.
- Entities are key concepts (people, projects, topics) for graph-based search.
</instructions>

<examples>
<example>
<input>지난주 투자자 미팅에서 밸류에이션 얼마로 얘기했었지?</input>
<output>{"queries": ["investor meeting valuation discussion"], "entities": ["valuation", "investor meeting"]}</output>
</example>

<example>
<input>프론트엔드 시니어 면접 결과 어떻게 됐어?</input>
<output>{"queries": ["senior frontend interview result"], "entities": ["frontend", "senior interview"]}</output>
</example>
</examples>`;

export function buildSearchQueryMessage(userInput: string): string {
  return `<input>${userInput}</input>`;
}
