const fs = require('fs');
const path = require('path');

class Tokenizer {
  constructor(modelDir) {
    this.vocab = null;
    this.idToToken = {};
    this.config = null;
    this.specialTokens = {
      bos: null,
      eos: null,
      pad: null,
      unk: null
    };

    this.loadVocabulary(modelDir);
  }

  loadVocabulary(modelDir) {
    // Try multiple vocabulary file formats
    const tokenizerJsonPath = path.join(modelDir, 'tokenizer.json');
    const vocabJsonPath = path.join(modelDir, 'vocab.json');
    const tokenizerConfigPath = path.join(modelDir, 'tokenizer_config.json');

    // Load tokenizer config if available
    if (fs.existsSync(tokenizerConfigPath)) {
      try {
        this.config = JSON.parse(fs.readFileSync(tokenizerConfigPath, 'utf-8'));
        console.log('Loaded tokenizer config');
      } catch (error) {
        console.warn('Failed to load tokenizer_config.json:', error.message);
      }
    }

    // Prefer tokenizer.json (Hugging Face format)
    if (fs.existsSync(tokenizerJsonPath)) {
      try {
        const tokenizerData = JSON.parse(fs.readFileSync(tokenizerJsonPath, 'utf-8'));

        // Extract vocabulary from Hugging Face tokenizer.json format
        if (tokenizerData.model && tokenizerData.model.vocab) {
          this.vocab = tokenizerData.model.vocab;
        } else if (tokenizerData.vocab) {
          this.vocab = tokenizerData.vocab;
        }

        console.log('Loaded vocabulary from tokenizer.json');
      } catch (error) {
        console.warn('Failed to load tokenizer.json:', error.message);
      }
    }

    // Fall back to vocab.json (legacy format)
    if (!this.vocab && fs.existsSync(vocabJsonPath)) {
      try {
        this.vocab = JSON.parse(fs.readFileSync(vocabJsonPath, 'utf-8'));
        console.log('Loaded vocabulary from vocab.json');
      } catch (error) {
        console.warn('Failed to load vocab.json:', error.message);
      }
    }

    if (!this.vocab) {
      throw new Error(
        `No vocabulary files found in ${modelDir}. ` +
        `Expected tokenizer.json or vocab.json`
      );
    }

    // Create reverse mapping (id -> token)
    for (const [token, id] of Object.entries(this.vocab)) {
      this.idToToken[id] = token;
    }

    // Identify special tokens
    this.identifySpecialTokens();

    const vocabSize = Object.keys(this.vocab).length;
    console.log(`Vocabulary loaded: ${vocabSize} tokens`);

    // Validate vocabulary
    if (vocabSize === 0) {
      throw new Error('Vocabulary is empty');
    }
  }

  identifySpecialTokens() {
    // Common special token patterns
    const specialTokenNames = {
      bos: ['<|startoftext|>', '<s>', '<|endoftext|>', '[CLS]'],
      eos: ['<|endoftext|>', '</s>', '[SEP]'],
      pad: ['<|endoftext|>', '<pad>', '[PAD]'],
      unk: ['<|unk|>', '<unk>', '[UNK]']
    };

    // Try to find special tokens in vocabulary
    for (const [tokenType, candidates] of Object.entries(specialTokenNames)) {
      for (const candidate of candidates) {
        if (this.vocab[candidate] !== undefined) {
          this.specialTokens[tokenType] = this.vocab[candidate];
          break;
        }
      }
    }

    // Also check tokenizer config for special tokens
    if (this.config) {
      const configMapping = {
        bos_token: 'bos',
        eos_token: 'eos',
        pad_token: 'pad',
        unk_token: 'unk'
      };

      for (const [configKey, tokenType] of Object.entries(configMapping)) {
        if (this.config[configKey]) {
          const tokenStr = this.config[configKey];
          if (this.vocab[tokenStr] !== undefined) {
            this.specialTokens[tokenType] = this.vocab[tokenStr];
          }
        }
      }
    }

    console.log('Special tokens:', this.specialTokens);
  }

  decode(tokenIds) {
    if (!Array.isArray(tokenIds)) {
      tokenIds = Array.from(tokenIds);
    }

    let tokens = [];

    for (const id of tokenIds) {
      // Skip special tokens
      if (this.isSpecialToken(id)) {
        continue;
      }

      const token = this.idToToken[id];

      if (token === undefined) {
        // Unknown token - skip or use UNK
        console.warn(`Unknown token ID: ${id}`);
        continue;
      }

      tokens.push(token);
    }

    // Join tokens into text
    let text = this.joinTokens(tokens);

    return text.trim();
  }

  isSpecialToken(tokenId) {
    // Whisper special tokens: all tokens >= 50257 are special tokens
    // This includes: <|endoftext|>, <|startoftranscript|>, language tokens,
    // <|translate|>, <|transcribe|>, <|startoflm|>, <|startofprev|>,
    // <|nospeech|>, <|notimestamps|>, and timestamp tokens
    if (tokenId >= 50257) {
      return true;
    }

    // Also check if token ID matches any known special token (for non-Whisper models)
    for (const specialId of Object.values(this.specialTokens)) {
      if (specialId !== null && tokenId === specialId) {
        return true;
      }
    }
    return false;
  }

  joinTokens(tokens) {
    let result = '';

    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];

      // Handle WordPiece tokens (BERT-style, ## prefix)
      if (token.startsWith('##')) {
        // Remove ## and concatenate without space
        result += token.slice(2);
      }
      // Handle SentencePiece tokens (▁ represents space)
      else if (token.startsWith('▁')) {
        // Replace ▁ with space
        result += ' ' + token.slice(1);
      }
      // Handle Whisper/GPT-style tokens (Ġ represents space in some tokenizers)
      else if (token.startsWith('Ġ')) {
        result += ' ' + token.slice(1);
      }
      // Handle tokens that are actually spaces
      else if (token === ' ' || token === '▁') {
        result += ' ';
      }
      // Regular tokens - add space before (except first token)
      else {
        if (i > 0 && !result.endsWith(' ')) {
          // Check if previous token was a prefix token
          const prevToken = tokens[i - 1];
          if (!prevToken || (!prevToken.startsWith('##') && !result.endsWith(' '))) {
            result += ' ';
          }
        }
        result += token;
      }
    }

    return result;
  }

  decodeBatch(batchTokenIds) {
    return batchTokenIds.map(ids => this.decode(ids));
  }
}

module.exports = Tokenizer;
