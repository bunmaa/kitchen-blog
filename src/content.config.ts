import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    status: z.enum(['draft', 'published']).default('draft'),
    keywords: z.array(z.string()).default([]),
    products: z.array(z.object({
      name: z.string(),
      asin: z.string(),
      price: z.number().optional(),
    })).default([]),
  }),
});

export const collections = { articles };
