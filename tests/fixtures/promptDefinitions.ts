import type { MCPPrompt } from '../../src/types/mcp.types';

export const summarizePrompt: MCPPrompt = {
  name: 'summarize',
  description: 'Summarize long text content',
  arguments: [
    {
      name: 'content',
      description: 'The content to summarize',
      required: true,
    },
    {
      name: 'maxLength',
      description: 'Maximum length of summary in words',
      required: false,
    },
    {
      name: 'style',
      description: 'Summary style (brief, detailed, bullet-points)',
      required: false,
    },
  ],
};

export const translatePrompt: MCPPrompt = {
  name: 'translate',
  description: 'Translate text between languages',
  arguments: [
    {
      name: 'text',
      description: 'Text to translate',
      required: true,
    },
    {
      name: 'targetLanguage',
      description: 'Target language code (e.g., "es", "fr", "de")',
      required: true,
    },
    {
      name: 'sourceLanguage',
      description: 'Source language code (auto-detect if not provided)',
      required: false,
    },
  ],
};

export const codeReviewPrompt: MCPPrompt = {
  name: 'code_review',
  description: 'Review code for quality and suggest improvements',
  arguments: [
    {
      name: 'code',
      description: 'Source code to review',
      required: true,
    },
    {
      name: 'language',
      description: 'Programming language',
      required: true,
    },
    {
      name: 'focusAreas',
      description: 'Specific areas to focus on (security, performance, style)',
      required: false,
    },
  ],
};

export const generateEmailPrompt: MCPPrompt = {
  name: 'generate_email',
  description: 'Generate professional email content',
  arguments: [
    {
      name: 'purpose',
      description: 'Purpose of the email',
      required: true,
    },
    {
      name: 'recipient',
      description: 'Information about the recipient',
      required: true,
    },
    {
      name: 'tone',
      description: 'Tone of the email (formal, casual, friendly)',
      required: false,
    },
    {
      name: 'keyPoints',
      description: 'Key points to include',
      required: false,
    },
  ],
};

export const dataAnalysisPrompt: MCPPrompt = {
  name: 'analyze_data',
  description: 'Analyze data and provide insights',
  arguments: [
    {
      name: 'data',
      description: 'Data to analyze (CSV, JSON, or structured text)',
      required: true,
    },
    {
      name: 'analysisType',
      description: 'Type of analysis (statistical, trend, comparison)',
      required: true,
    },
    {
      name: 'questions',
      description: 'Specific questions to answer',
      required: false,
    },
  ],
};

export const explainConceptPrompt: MCPPrompt = {
  name: 'explain_concept',
  description: 'Explain complex concepts in simple terms',
  arguments: [
    {
      name: 'concept',
      description: 'Concept to explain',
      required: true,
    },
    {
      name: 'audience',
      description: 'Target audience level (beginner, intermediate, expert)',
      required: false,
    },
    {
      name: 'examples',
      description: 'Include practical examples',
      required: false,
    },
  ],
};

export const debugPrompt: MCPPrompt = {
  name: 'debug_code',
  description: 'Help debug code issues',
  arguments: [
    {
      name: 'code',
      description: 'Code with issues',
      required: true,
    },
    {
      name: 'error',
      description: 'Error message or unexpected behavior',
      required: true,
    },
    {
      name: 'context',
      description: 'Additional context about the code',
      required: false,
    },
  ],
};

export const creativeWritingPrompt: MCPPrompt = {
  name: 'creative_writing',
  description: 'Generate creative content',
  arguments: [
    {
      name: 'type',
      description: 'Type of content (story, poem, dialogue)',
      required: true,
    },
    {
      name: 'theme',
      description: 'Theme or topic',
      required: true,
    },
    {
      name: 'style',
      description: 'Writing style preferences',
      required: false,
    },
    {
      name: 'length',
      description: 'Desired length',
      required: false,
    },
  ],
};

export const allPrompts: MCPPrompt[] = [
  summarizePrompt,
  translatePrompt,
  codeReviewPrompt,
  generateEmailPrompt,
  dataAnalysisPrompt,
  explainConceptPrompt,
  debugPrompt,
  creativeWritingPrompt,
];

export function getPromptByName(name: string): MCPPrompt | undefined {
  return allPrompts.find((prompt) => prompt.name === name);
}

export function getPromptsByCategory(category: string): MCPPrompt[] {
  const categories: Record<string, string[]> = {
    text: ['summarize', 'translate', 'creative_writing'],
    code: ['code_review', 'debug_code'],
    communication: ['generate_email'],
    analysis: ['analyze_data', 'explain_concept'],
  };

  const promptNames = categories[category] || [];
  return allPrompts.filter((prompt) => promptNames.includes(prompt.name));
}

export const samplePromptMessages = {
  summarize: {
    role: 'system',
    content: `You are a professional summarizer. Create a {{style}} summary of the following content, keeping it under {{maxLength}} words:

{{content}}`,
  },
  translate: {
    role: 'system',
    content: `Translate the following text from {{sourceLanguage}} to {{targetLanguage}}:

{{text}}`,
  },
  code_review: {
    role: 'system',
    content: `Review the following {{language}} code, focusing on {{focusAreas}}:

\`\`\`{{language}}
{{code}}
\`\`\``,
  },
  generate_email: {
    role: 'system',
    content: `Generate a {{tone}} email for {{purpose}} to {{recipient}}. Include these key points: {{keyPoints}}`,
  },
};

export function getPromptMessage(name: string, args: Record<string, any>): any {
  const template = samplePromptMessages[name as keyof typeof samplePromptMessages];
  if (!template) return null;

  let content = template.content;
  Object.entries(args).forEach(([key, value]) => {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  });

  return {
    role: template.role,
    content,
  };
}
