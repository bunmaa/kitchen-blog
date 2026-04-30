/**
 * 自動リサーチスクリプト
 * 調理家電の記事ネタ（キーワード・商品）をClaudeで分析して提案する
 *
 * 使い方: node scripts/research.mjs
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

// 調理家電のターゲットカテゴリ
const TARGET_CATEGORIES = [
  '電気圧力鍋',
  'ホットクック',
  'ホームベーカリー',
  '電気フライヤー',
  'スープメーカー',
  'フードプロセッサー',
  '電気グリル鍋',
  'ヨーグルトメーカー',
];

async function researchArticleIdeas() {
  console.log('🔍 記事ネタをリサーチ中...\n');

  const prompt = `あなたはアフィリエイトブログのSEOコンサルタントです。
以下の調理家電カテゴリについて、Amazonアフィリエイトで収益化できる記事ネタを提案してください。

対象カテゴリ:
${TARGET_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

各カテゴリについて以下を分析してください：
- 検索需要が高いキーワード（例：「電気圧力鍋 おすすめ」「ホットクック 比較」）
- 記事タイトルの候補（SEOに強い形式）
- 想定読者と悩み
- 紹介すべき商品の価格帯
- 競合の少ないニッチ切り口

出力形式はJSON配列で：
[
  {
    "category": "カテゴリ名",
    "keyword": "メインキーワード",
    "title": "記事タイトル案",
    "reader_intent": "読者の悩み・ニーズ",
    "price_range": "商品価格帯",
    "niche_angle": "差別化ポイント",
    "priority": 1〜5の数値（高いほど優先）
  }
]

上位10件を返してください。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;

  // JSONを抽出
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('JSON形式で返答がありませんでした');
    console.log(text);
    return;
  }

  const ideas = JSON.parse(jsonMatch[0]);

  // 結果を表示
  console.log('📊 記事ネタ候補（優先度順）:\n');
  ideas
    .sort((a, b) => b.priority - a.priority)
    .forEach((idea, i) => {
      console.log(`【${i + 1}位】 ${idea.title}`);
      console.log(`  カテゴリ: ${idea.category}`);
      console.log(`  キーワード: ${idea.keyword}`);
      console.log(`  読者ニーズ: ${idea.reader_intent}`);
      console.log(`  価格帯: ${idea.price_range}`);
      console.log(`  差別化: ${idea.niche_angle}`);
      console.log('');
    });

  // 結果をファイルに保存
  const outputPath = path.join(__dirname, '../scripts/research-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(ideas, null, 2), 'utf-8');
  console.log(`✅ 結果を保存しました: ${outputPath}`);
  console.log('\n次のステップ: node scripts/write.mjs <番号> で記事を自動生成できます');

  return ideas;
}

researchArticleIdeas().catch(console.error);
