/**
 * 自動執筆スクリプト
 * リサーチ結果をもとにClaudeが記事を生成し、下書きとして保存する
 *
 * 使い方: node scripts/write.mjs <番号>
 * 例:     node scripts/write.mjs 1
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSOCIATE_ID = process.env.AMAZON_ASSOCIATE_ID || 'your-associate-id-20';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .slice(0, 60);
}

function makeAmazonUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return `https://www.amazon.co.jp/s?k=${encoded}&tag=${ASSOCIATE_ID}`;
}

async function writeArticle(ideaIndex) {
  // リサーチ結果を読み込む
  const resultsPath = path.join(__dirname, 'research-results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error('❌ research-results.json が見つかりません。先に node scripts/research.mjs を実行してください。');
    process.exit(1);
  }

  const ideas = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const sorted = [...ideas].sort((a, b) => b.priority - a.priority);
  const idea = sorted[ideaIndex - 1];

  if (!idea) {
    console.error(`❌ 番号 ${ideaIndex} のアイデアが見つかりません（1〜${sorted.length} で指定）`);
    process.exit(1);
  }

  console.log(`✍️  記事を生成中: 「${idea.title}」\n`);

  const prompt = `あなたはアフィリエイトブログの専門ライターです。
以下の情報をもとに、SEOに強く読者に役立つ調理家電の紹介記事を書いてください。

【記事情報】
- タイトル: ${idea.title}
- メインキーワード: ${idea.keyword}
- カテゴリ: ${idea.category}
- 読者の悩み: ${idea.reader_intent}
- 商品価格帯: ${idea.price_range}
- 差別化ポイント: ${idea.niche_angle}

【執筆ルール】
1. 文字数: 2500〜3500字
2. 構成: 導入 → H2で3〜5セクション → まとめ
3. おすすめ商品を3〜5個紹介し、各商品に以下を含める：
   - 商品名
   - 特徴（2〜3文）
   - こんな人におすすめ
   - Amazonリンク（プレースホルダー: [AMAZON_LINK:商品名]）
4. 表形式の比較を1つ含める
5. 自然な日本語で、押しつけがましくなく
6. アフィリエイト開示文を記事末尾に入れる

Markdownで出力してください。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  let content = response.content[0].text;

  // Amazonリンクのプレースホルダーを実際のURLに変換
  content = content.replace(/\[AMAZON_LINK:([^\]]+)\]/g, (_, productName) => {
    const url = makeAmazonUrl(productName);
    return `[${productName}をAmazonで見る](${url})`;
  });

  // ファイル名を生成
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(idea.keyword) || `article-${Date.now()}`;
  const filename = `${date}-${slug}.md`;
  const outputDir = path.join(__dirname, '../src/content/articles');
  const outputPath = path.join(outputDir, filename);

  // フロントマターを付けて保存
  const frontmatter = `---
title: "${idea.title}"
description: "${idea.reader_intent}"
pubDate: ${date}
status: draft
keywords: ["${idea.keyword}", "${idea.category}"]
products: []
---

`;

  fs.writeFileSync(outputPath, frontmatter + content, 'utf-8');

  console.log(`✅ 下書きを保存しました: src/content/articles/${filename}`);
  console.log('\n次のステップ:');
  console.log('  1. node scripts/admin.mjs で管理画面を起動');
  console.log('  2. 記事を確認・修正して公開ステータスに変更');
  console.log('  3. git push で Cloudflare Pages に自動デプロイ');
}

const index = parseInt(process.argv[2] || '1', 10);
writeArticle(index).catch(console.error);
