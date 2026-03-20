import { z } from "zod";

export const SearchQuerySchema = z.object({
  queries: z.array(z.string()),
  entities: z.array(z.string()),
  localQueries: z.array(z.string()),
  localEntities: z.array(z.string()),
});

export const SEARCH_QUERY_EXTRACTOR_SYSTEM_PROMPT = `You extract search queries and entity keywords from a user's question to support knowledge retrieval.

<instructions>
## Output format

Return a JSON object with exactly four fields:
- "queries": array of English search queries. Aim for 1-3, but exceed if the question covers more aspects.
- "entities": array of English entity keywords for graph-based search. Aim for 1-3, but exceed if the question covers more aspects.
- "localQueries": array of search queries in the user's language. Same intent as "queries", but phrased naturally in the original language.
- "localEntities": array of entity keywords in the user's language. Same intent as "entities", but in the original language.

## Rules

- "queries" and "entities" must be in English.
- "localQueries" and "localEntities" must be in the user's language.
- If the user's language is English, "localQueries"/"localEntities" should equal "queries"/"entities".
- Generate multiple queries only when the question covers multiple distinct aspects.
- Entities are key concepts (people, projects, topics) for graph-based search.
</instructions>

<examples>
<example>
<input>지난주 투자자 미팅에서 밸류에이션 얼마로 얘기했었지?</input>
<output>{"queries": ["investor meeting valuation discussion"], "entities": ["valuation", "investor meeting"], "localQueries": ["투자자 미팅 밸류에이션"], "localEntities": ["밸류에이션", "투자자 미팅"]}</output>
</example>

<example>
<input>프론트엔드 시니어 면접 결과 어떻게 됐어?</input>
<output>{"queries": ["senior frontend interview result"], "entities": ["frontend", "senior interview"], "localQueries": ["프론트엔드 시니어 면접 결과"], "localEntities": ["프론트엔드", "시니어 면접"]}</output>
</example>
</examples>`;

export function buildSearchQueryMessage(userInput: string): string {
  return `<input>${userInput}</input>`;
}
