import { z } from "zod";

export const SearchQuerySchema = z.object({
  queries: z.array(z.string()),
  entities: z.array(z.string()),
  queriesEn: z.array(z.string()),
  entitiesEn: z.array(z.string()),
});

export const SEARCH_QUERY_EXTRACTOR_SYSTEM_PROMPT = `You extract search queries and entity keywords from a user's question to support knowledge retrieval.

<instructions>
## Output format

Return a JSON object with exactly four fields:
- "queries": array of search queries in the user's language. Phrased naturally in the original language. Aim for 1-3, but exceed if the question covers more aspects.
- "entities": array of entity keywords in the user's language. Aim for 1-3, but exceed if the question covers more aspects.
- "queriesEn": array of English search queries. Same intent as "queries", but translated to English.
- "entitiesEn": array of English entity keywords. Same intent as "entities", but translated to English.

## Rules

- "queries" and "entities" must be in the user's language.
- "queriesEn" and "entitiesEn" must be in English.
- If the user's language is English, "queriesEn"/"entitiesEn" should equal "queries"/"entities".
- Generate multiple queries only when the question covers multiple distinct aspects.
- Entities are key concepts (people, projects, topics) for graph-based search.
</instructions>

<examples>
<example>
<input>지난주 투자자 미팅에서 밸류에이션 얼마로 얘기했었지?</input>
<output>{"queries": ["투자자 미팅 밸류에이션"], "entities": ["밸류에이션", "투자자 미팅"], "queriesEn": ["investor meeting valuation discussion"], "entitiesEn": ["valuation", "investor meeting"]}</output>
</example>

<example>
<input>프론트엔드 시니어 면접 결과 어떻게 됐어?</input>
<output>{"queries": ["프론트엔드 시니어 면접 결과"], "entities": ["프론트엔드", "시니어 면접"], "queriesEn": ["senior frontend interview result"], "entitiesEn": ["frontend", "senior interview"]}</output>
</example>
</examples>`;

export function buildSearchQueryMessage(userInput: string): string {
  return `<input>${userInput}</input>`;
}
