#!/usr/bin/env node
/**
 * AI Tools MCP Server
 * Provides AI-powered text processing and analysis tools
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Create the server
const server = new Server(
  {
    name: 'ai-tools-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Text analysis utilities
const analyzeText = (text) => {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    characterCount: characters,
    characterCountNoSpaces: charactersNoSpaces,
    averageWordLength: words.length > 0 
      ? words.reduce((sum, w) => sum + w.length, 0) / words.length 
      : 0,
    readingTime: Math.ceil(words.length / 200), // minutes at 200 wpm
  };
};

// Sentiment analysis (simplified)
const analyzeSentiment = (text) => {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'happy', 'joy', 'brilliant'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'sad', 'angry', 'disappointed', 'wrong', 'poor'];
  
  const lower = text.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;
  
  positiveWords.forEach(word => {
    const matches = (lower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    positiveScore += matches;
  });
  
  negativeWords.forEach(word => {
    const matches = (lower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    negativeScore += matches;
  });
  
  const total = positiveScore + negativeScore;
  const sentiment = positiveScore > negativeScore ? 'positive' 
    : negativeScore > positiveScore ? 'negative' 
    : 'neutral';
  
  return {
    sentiment,
    positiveScore,
    negativeScore,
    confidence: total > 0 ? Math.abs(positiveScore - negativeScore) / total : 0,
  };
};

// AI tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'analyze_text',
        description: 'Analyze text statistics and readability',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to analyze',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'extract_keywords',
        description: 'Extract keywords from text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to extract keywords from',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of keywords',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'summarize_text',
        description: 'Generate a summary of the text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to summarize',
            },
            maxLength: {
              type: 'number',
              description: 'Maximum summary length in words',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'analyze_sentiment',
        description: 'Analyze the sentiment of text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to analyze',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'generate_variations',
        description: 'Generate variations of the given text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Original text',
            },
            count: {
              type: 'number',
              description: 'Number of variations',
            },
            style: {
              type: 'string',
              enum: ['formal', 'casual', 'technical', 'simple'],
              description: 'Writing style',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'translate_pseudo',
        description: 'Pseudo-translate text (for demonstration)',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to translate',
            },
            targetLanguage: {
              type: 'string',
              enum: ['spanish', 'french', 'german', 'pirate', 'shakespearean'],
              description: 'Target language/style',
            },
          },
          required: ['text', 'targetLanguage'],
        },
      },
      {
        name: 'classify_text',
        description: 'Classify text into categories',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to classify',
            },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Possible categories',
            },
          },
          required: ['text'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze_text': {
      const analysis = analyzeText(args.text);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    }

    case 'extract_keywords': {
      const words = args.text.toLowerCase().split(/\s+/);
      const wordFreq = {};
      
      // Count word frequency
      words.forEach(word => {
        const cleaned = word.replace(/[^a-z0-9]/g, '');
        if (cleaned.length > 3) {
          wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1;
        }
      });
      
      // Sort by frequency and get top keywords
      const keywords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, args.limit || 10)
        .map(([word, freq]) => ({ word, frequency: freq }));
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ keywords }, null, 2),
          },
        ],
      };
    }

    case 'summarize_text': {
      const sentences = args.text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const maxLength = args.maxLength || 50;
      
      // Simple extractive summary (take first and important sentences)
      let summary = sentences[0] || '';
      
      if (sentences.length > 2) {
        const middle = Math.floor(sentences.length / 2);
        summary += '. ' + sentences[middle];
      }
      
      if (sentences.length > 1) {
        summary += '. ' + sentences[sentences.length - 1];
      }
      
      // Trim to max length
      const words = summary.split(/\s+/);
      if (words.length > maxLength) {
        summary = words.slice(0, maxLength).join(' ') + '...';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: summary.trim(),
              originalLength: args.text.length,
              summaryLength: summary.length,
              compressionRatio: (summary.length / args.text.length).toFixed(2),
            }, null, 2),
          },
        ],
      };
    }

    case 'analyze_sentiment': {
      const sentiment = analyzeSentiment(args.text);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sentiment, null, 2),
          },
        ],
      };
    }

    case 'generate_variations': {
      const variations = [];
      const count = args.count || 3;
      const style = args.style || 'casual';
      
      // Generate simple variations based on style
      for (let i = 0; i < count; i++) {
        let variation = args.text;
        
        switch (style) {
          case 'formal':
            variation = variation
              .replace(/can't/g, 'cannot')
              .replace(/won't/g, 'will not')
              .replace(/n't/g, ' not')
              .replace(/^/, 'It should be noted that ');
            break;
            
          case 'casual':
            variation = variation
              .replace(/cannot/g, "can't")
              .replace(/will not/g, "won't")
              .replace(/\./g, '!')
              .replace(/^/, 'Hey, ');
            break;
            
          case 'technical':
            variation = `Technical specification: ${variation}. Implementation required.`;
            break;
            
          case 'simple':
            variation = variation
              .replace(/[,;]/g, '.')
              .split('.')
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .join('. ') + '.';
            break;
        }
        
        variations.push({
          style,
          text: variation,
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ original: args.text, variations }, null, 2),
          },
        ],
      };
    }

    case 'translate_pseudo': {
      let translated = args.text;
      
      switch (args.targetLanguage) {
        case 'spanish':
          translated = translated
            .replace(/hello/gi, 'hola')
            .replace(/goodbye/gi, 'adiós')
            .replace(/yes/gi, 'sí')
            .replace(/no/gi, 'no')
            .replace(/the/gi, 'el/la');
          break;
          
        case 'french':
          translated = translated
            .replace(/hello/gi, 'bonjour')
            .replace(/goodbye/gi, 'au revoir')
            .replace(/yes/gi, 'oui')
            .replace(/no/gi, 'non')
            .replace(/the/gi, 'le/la');
          break;
          
        case 'german':
          translated = translated
            .replace(/hello/gi, 'hallo')
            .replace(/goodbye/gi, 'auf wiedersehen')
            .replace(/yes/gi, 'ja')
            .replace(/no/gi, 'nein')
            .replace(/the/gi, 'der/die/das');
          break;
          
        case 'pirate':
          translated = translated
            .replace(/hello/gi, 'ahoy')
            .replace(/you/gi, 'ye')
            .replace(/yes/gi, 'aye')
            .replace(/my/gi, 'me')
            .replace(/the/gi, "th'");
          translated = `Arrr! ${translated} Shiver me timbers!`;
          break;
          
        case 'shakespearean':
          translated = translated
            .replace(/you/gi, 'thou')
            .replace(/your/gi, 'thy')
            .replace(/are/gi, 'art')
            .replace(/have/gi, 'hast');
          translated = `Hark! ${translated} Forsooth!`;
          break;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              original: args.text,
              targetLanguage: args.targetLanguage,
              translated,
              note: 'This is a pseudo-translation for demonstration purposes',
            }, null, 2),
          },
        ],
      };
    }

    case 'classify_text': {
      const categories = args.categories || ['technology', 'business', 'health', 'entertainment', 'sports'];
      const lower = args.text.toLowerCase();
      
      // Simple keyword-based classification
      const scores = {};
      
      const keywords = {
        technology: ['computer', 'software', 'internet', 'digital', 'app', 'data', 'ai'],
        business: ['company', 'market', 'revenue', 'profit', 'investment', 'customer'],
        health: ['health', 'medical', 'doctor', 'patient', 'treatment', 'disease'],
        entertainment: ['movie', 'music', 'actor', 'film', 'show', 'celebrity'],
        sports: ['game', 'player', 'team', 'score', 'match', 'championship'],
      };
      
      categories.forEach(category => {
        scores[category] = 0;
        const catKeywords = keywords[category] || [];
        catKeywords.forEach(keyword => {
          if (lower.includes(keyword)) {
            scores[category]++;
          }
        });
      });
      
      const classification = Object.entries(scores)
        .sort(([,a], [,b]) => b - a)
        .map(([category, score]) => ({ category, score }));
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              text: args.text.substring(0, 100) + '...',
              classification,
              primaryCategory: classification[0]?.category || 'unknown',
            }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// AI prompts
server.setRequestHandler('prompts/list', async () => {
  return {
    prompts: [
      {
        name: 'improve_writing',
        description: 'Improve writing quality',
        arguments: [
          {
            name: 'text',
            description: 'Text to improve',
            required: true,
          },
          {
            name: 'style',
            description: 'Target writing style',
            required: false,
          },
        ],
      },
      {
        name: 'explain_concept',
        description: 'Explain a concept simply',
        arguments: [
          {
            name: 'concept',
            description: 'Concept to explain',
            required: true,
          },
          {
            name: 'audience',
            description: 'Target audience level',
            required: false,
          },
        ],
      },
      {
        name: 'generate_ideas',
        description: 'Generate creative ideas',
        arguments: [
          {
            name: 'topic',
            description: 'Topic for ideas',
            required: true,
          },
          {
            name: 'count',
            description: 'Number of ideas',
            required: false,
          },
        ],
      },
    ],
  };
});

// Handle prompt retrieval
server.setRequestHandler('prompts/get', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'improve_writing':
      return {
        messages: [
          {
            role: 'system',
            content: `You are a professional editor. Improve the following text for clarity, concision, and impact.${args?.style ? ` Use a ${args.style} writing style.` : ''}`,
          },
          {
            role: 'user',
            content: args?.text || '[No text provided]',
          },
        ],
      };

    case 'explain_concept':
      return {
        messages: [
          {
            role: 'system',
            content: `You are an expert teacher. Explain concepts clearly and simply.${args?.audience ? ` Target audience: ${args.audience}.` : ''}`,
          },
          {
            role: 'user',
            content: `Explain this concept: ${args?.concept || '[No concept provided]'}`,
          },
        ],
      };

    case 'generate_ideas':
      return {
        messages: [
          {
            role: 'system',
            content: 'You are a creative brainstorming assistant. Generate innovative and practical ideas.',
          },
          {
            role: 'user',
            content: `Generate ${args?.count || 5} creative ideas about: ${args?.topic || '[No topic provided]'}`,
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('AI Tools MCP server started');
  console.error('Ready to provide AI-powered text processing');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});