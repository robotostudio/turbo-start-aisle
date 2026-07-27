import { Bot } from "lucide-react";
import { defineField, defineType } from "sanity";

export const aiAssistantSettings = defineType({
  name: "aiAssistantSettings",
  title: "AI Assistant Settings",
  type: "document",
  icon: Bot,
  description:
    "Welcome panel shown when the shopping-assistant chat is first opened.",
  fields: [
    defineField({
      name: "welcomeHeading",
      title: "Welcome heading",
      type: "string",
      description: "Shown at the top of the empty chat panel.",
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: "welcomeSubtitle",
      title: "Welcome subtitle",
      type: "text",
      rows: 2,
      description: "One or two sentences explaining what the assistant can do.",
      validation: (rule) => rule.required().max(280),
    }),
    defineField({
      name: "suggestions",
      title: "Prompt suggestions",
      type: "array",
      description:
        "Up to 6 quick prompts shown as clickable chips. Pick the conversations you most want to encourage.",
      of: [
        {
          type: "string",
          validation: (rule) => rule.max(80),
        },
      ],
      validation: (rule) => rule.max(6),
    }),
  ],
  preview: {
    prepare: () => ({
      title: "AI Assistant Settings",
      subtitle: "Singleton",
    }),
  },
});
