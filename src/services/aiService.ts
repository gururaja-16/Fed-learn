
export interface ChatMessage {
  role: 'user' | 'kani';
  content: string;
  time?: string;
  lat?: string;
  plevel?: string;
}

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_SETTINGS: AISettings = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'ollama',
  model: 'mistral',
};

export class AIService {
  private settings: AISettings;

  constructor() {
    const saved = localStorage.getItem('sovereign_ai_settings');
    this.settings = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  }

  getSettings(): AISettings {
    return this.settings;
  }

  updateSettings(newSettings: AISettings) {
    this.settings = newSettings;
    localStorage.setItem('sovereign_ai_settings', JSON.stringify(newSettings));
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      // Ensure we don't send too many messages to avoid context limits
      const recentMessages = messages.slice(-10);

      const response = await fetch(`${this.settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: recentMessages.map(m => ({
            role: m.role === 'kani' ? 'assistant' : 'user',
            content: m.content
          })),
          stream: false,
          max_tokens: 1000,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `AI Service Error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from AI service');
      }
      return data.choices[0].message.content;
    } catch (error: any) {
      console.error('AI Chat Error:', error);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Could not connect to the local LLM server. Please ensure it is running and CORS is enabled.');
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Try to fetch models as a health check
      const response = await fetch(`${this.settings.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
        },
      });
      return response.ok;
    } catch (error) {
      console.error('AI Test Connection Error:', error);
      return false;
    }
  }
}

export const aiService = new AIService();
