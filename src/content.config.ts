import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// schema 写成函数形式，是为了拿到 image() 助手：
// frontmatter 里的 cover 写相对本篇 md 的图片路径，构建期会被导入并转成
// ImageMetadata，可以直接喂给 <Image />（写成字符串则只能当普通 URL 用）。
const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { posts };
