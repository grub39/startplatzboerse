import { defineCollection, z } from 'astro:content';

const ratgeber = defineCollection({
  type: 'content',
  schema: z.object({
    title:       z.string(),
    teaser:      z.string(),
    image:       z.string(),
    category:    z.string().optional(),
    readingTime: z.string().optional(),
    pubDate:     z.coerce.date().optional(),  // ← das fehlte
  }),
});

export const collections = {
  'ratgeber': ratgeber,
};