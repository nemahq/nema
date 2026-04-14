import { z } from "zod";

export const ENTITY_RESOLUTION_SYSTEM_PROMPT = `You are an entity resolver that determines if newly extracted entities match any existing entities in a knowledge graph.

<instructions>
## Task

Given a list of newly extracted entities and their candidate matches from the knowledge graph, determine if each new entity refers to the same real-world concept as one of the candidates.

## Output format

Return a JSON object with one field:
- "resolutions": array of objects, each with "extractedName", "extractedType", and "matchedName" fields.
  - "extractedName": the name of the newly extracted entity (exactly as provided).
  - "extractedType": the type of the newly extracted entity (exactly as provided).
  - "matchedName": the name of the matching existing entity, or null if no match.

## Rules

1. Two entities match if they refer to the same real-world concept, even if:
   - They use different languages ("쌀국수" = "Pho")
   - One is more specific ("React" = "React.js")
   - One uses an abbreviation ("NYC" = "New York City")
   - They have minor spelling differences
2. Two entities do NOT match if:
   - They are genuinely different concepts, even if names are similar
   - They share a name but refer to different things (e.g., "Python" the language vs "Python" the snake — use the type to disambiguate)
3. When in doubt, do NOT match. False negatives (missed dedup) are less harmful than false positives (wrong merge).
4. Only match within the same entity type — a Person and an Organization with similar names are different entities.
</instructions>`;

export const EntityResolutionSchema = z.object({
  resolutions: z.array(
    z.object({
      extractedName: z.string().min(1),
      extractedType: z.string().min(1),
      matchedName: z.string().nullable(),
    }),
  ),
});

export function buildEntityResolutionMessage(
  entries: Array<{
    extractedName: string;
    extractedType: string;
    candidates: Array<{ name: string; score: number }>;
  }>,
): string {
  const items = entries
    .map((entry) => {
      const candidateList = entry.candidates
        .map((c) => `  - "${c.name}" (similarity: ${c.score.toFixed(2)})`)
        .join("\n");
      return `Entity: "${entry.extractedName}" (type: ${entry.extractedType})\nCandidates:\n${candidateList}`;
    })
    .join("\n\n");

  return `<entities>\n${items}\n</entities>`;
}
