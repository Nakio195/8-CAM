import { describe, expect, it } from "vitest";
import fr from "@ui/i18n/fr.json";
import en from "@ui/i18n/en.json";
import { HELP_GROUPS, HELP_TOPICS } from "@ui/help/topics";

// Specification 6.11: every parameter, button and indicator has a complete, non generic help text
const CATALOGS: Record<string, Record<string, string>> = { fr, en };

describe("help texts", () =>
{
    for (const [language, catalog] of Object.entries(CATALOGS))
    {
        it(`gives every topic a title and a real explanation in ${language}`, () =>
        {
            const problems: string[] = [];
            for (const topic of HELP_TOPICS)
            {
                const title = catalog[`help.${topic.id}.title`];
                const body = catalog[`help.${topic.id}.body`];
                if (!title || !body)
                {
                    problems.push(`${topic.id}: missing text`);
                    continue;
                }
                // "Diamètre de l'outil" for "Diamètre" is not acceptable: the body must explain more than the title
                if (body.length < 40 || body.toLowerCase().startsWith(title.toLowerCase()))
                {
                    problems.push(`${topic.id}: explanation too short or repeating the title`);
                }
            }
            expect(problems).toEqual([]);
        });

        it(`names every group in ${language}`, () =>
        {
            expect(HELP_GROUPS.filter((group) => !catalog[`help.group.${group}`])).toEqual([]);
        });
    }

    it("gives every machining parameter of the specification a recommended value", () =>
    {
        const parameters = HELP_TOPICS.filter((topic) => ["tool", "machining", "setup"].includes(topic.group));
        expect(parameters.length).toBe(21);
        expect(parameters.filter((topic) => !fr[`help.${topic.id}.advice` as keyof typeof fr])).toEqual([]);
    });

    it("has unique topic identifiers and no orphan help text", () =>
    {
        const ids = HELP_TOPICS.map((topic) => topic.id);
        expect(new Set(ids).size).toBe(ids.length);
        const orphans = Object.keys(fr)
            .filter((key) => /^help\.[A-Za-z]+\.(title|body|advice|warning)$/.test(key))
            .map((key) => key.split(".")[1] as string)
            .filter((id) => !ids.includes(id));
        expect(orphans).toEqual([]);
    });
});
