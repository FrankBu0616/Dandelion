// Harness scenarios — richer than the classifier test fixtures because they
// drive a full merge-flow simulation (parent context, branch prompts or
// pre-baked transcripts, and a follow-up question for the merged answer).
//
// Each scenario:
//   - title       : human-readable label
//   - parent      : initial chat messages establishing context
//   - branches    : either { id, prompt } (Ollama generates the branch) or
//                   { id, transcript, claims } (pre-baked content)
//   - followUp    : the question asked after the merge
//   - route?      : if present, skip model classification and use this. Shape
//                   matches scripts/classify-route.mjs: { kind, choices? }
//
// For pure classifier benchmarking on plants-only fixtures, see
// tests/merge-router/scenarios.json + scripts/classify-experiment.mjs.

export const SCENARIOS = {
  product_risk: {
    title: 'Dandelion product risk',
    parent: [
      {
        role: 'user',
        content:
          'I am building Dandelion: a local-first desktop app for spawning parallel LLM plants and merging them back into a main conversation as pooled context. What is the strongest product risk?',
      },
    ],
    branches: [
      {
        id: 'market',
        prompt:
          'Analyze the market and positioning risk. Focus on whether this is differentiated enough from Claude Side Chats, ChatGPT branching, and coding-agent parallel threads.',
      },
      {
        id: 'workflow',
        prompt:
          'Analyze the user-workflow risk. Focus on whether heavy LLM users will actually want root question -> plants -> merge -> continue often enough.',
      },
      {
        id: 'technical',
        prompt:
          'Analyze the technical risk. Focus on whether merge-as-context-pooling can work reliably without turning into a confusing transcript dump.',
      },
    ],
    followUp:
      'Given all of that, make the call: what should I validate before building the Electron app?',
  },

  disagreeing_providers: {
    title: 'Disagreeing branches: provider scope',
    parent: [
      {
        role: 'user',
        content:
          'For Dandelion v1, should I support OpenAI, Anthropic, Google, and Ollama from day one, or pick one provider and add others later?',
      },
      {
        role: 'assistant',
        content: 'This is a genuine tradeoff. I will explore both sides.',
      },
    ],
    branches: [
      {
        id: 'multi-provider',
        prompt:
          'Argue strongly for multi-provider support from day one. Account for BYO keys, local-first positioning, and user preference.',
      },
      {
        id: 'single-provider',
        prompt:
          'Argue strongly for one provider first. Account for prompt portability, testing burden, and a solo developer building v1.',
      },
    ],
    followUp: 'Okay, which should I actually do for v1? Just give me your call.',
  },

  curated_provider_scope: {
    title: 'Curated disagreement: provider scope',
    route: {
      kind: 'material_conflict',
      choices: [
        'Support OpenAI, Anthropic, and Gemini from day one.',
        'Start with one provider, tune the core experience, and add others later.',
      ],
    },
    parent: [
      {
        role: 'user',
        content:
          'For a single-user desktop app where each user brings their own LLM API key, should I support OpenAI, Anthropic, and Google all from day one, or pick one and add others later?',
      },
      {
        role: 'assistant',
        content: 'Genuinely two-sided question. Let me explore both framings.',
      },
    ],
    branches: [
      {
        id: 'multi-provider',
        transcript:
          'User: Argue for supporting all three providers from day one.\n\nAssistant: If the product is BYO-key and open-source, multi-provider on day one is close to free and protects against a real risk. The OpenAI SDK and Anthropic SDK have nearly identical chat-completion shapes; the Gemini SDK differs but is wrappable. A thin provider-adapter layer is maybe 200 lines of TypeScript per provider. The user-facing benefit is significant: people have strong existing preferences, and a tool that only supports the provider they do not have a key for is a tool they close. The downside is testing surface: you have to verify your prompt and merge logic against three model families with three different quirks. But you have to do this eventually anyway. Doing it day-one is cheaper than retrofitting after you have baked OpenAI-specific assumptions in. Verdict: ship multi-provider from day one.',
        claims:
          '- Multi-provider from day one is close to free for a BYO-key tool\n- SDK shapes are similar; provider-adapter layer is small\n- Strong user benefit: people have provider preferences and will not switch for one app\n- Testing burden exists but is unavoidable\n- Recommendation: ship OpenAI + Anthropic + Gemini together',
      },
      {
        id: 'single-provider',
        transcript:
          'User: Argue for picking one provider and adding others later.\n\nAssistant: For a single-developer side project, multi-provider from day one sounds free but is not. Each provider has subtle behavior differences: tokenization, system-prompt handling, max context, rate-limit error shapes, retry semantics, JSON-mode quirks, vision-API formats, tool-calling interfaces. Your code path can paper over all of these but your prompt engineering cannot: a prompt that works perfectly on Claude often degrades on Gemini and vice versa, and your merge template is going to be especially sensitive to this. Shipping with one model lets you tune the prompts against that model behavior and ship something that works well. Adding providers later, after the prompts are locked, is the right order. Verdict: pick one, probably Claude given the merge framing test complexity, and add others in v0.2.',
        claims:
          '- Multi-provider is not actually free for a solo project\n- Hidden cost is prompt engineering, not code\n- Merge template will be sensitive to model-family behavior\n- Better to tune prompts against one model first, then add others\n- Recommendation: ship with Claude only, add OpenAI/Gemini later',
      },
    ],
    followUp: 'Okay, which should I actually do for v1? Just give me your call.',
  },

  curated_additional_context: {
    title: 'Curated compatible branches: additional context',
    route: { kind: 'additional_context' },
    parent: [
      {
        role: 'user',
        content:
          'I want to build the first real Dandelion prototype. The core flow is root question, several plants, merge, then continue in the main thread.',
      },
      {
        role: 'assistant',
        content:
          'The right prototype should validate the merge loop before investing in a full Electron app.',
      },
    ],
    branches: [
      {
        id: 'data-model',
        transcript:
          'User: Explore the minimal data model for the prototype.\n\nAssistant: The prototype only needs sessions, thread records, and a merge record. A session stores the root question and model. Each plant stores its prompt, response, status, and parent session. A merge record stores the selected plant ids and the generated merge prompt. This can be in memory or a JSON file for the test; SQLite can wait until the real app. The key is preserving the transcript boundaries so the merge prompt can distinguish parent context from parallel threads.',
        claims:
          '- Prototype needs sessions, thread records, and merge records\n- Plants should preserve prompt, response, status, and parent session\n- JSON or memory is enough for the harness; SQLite can wait\n- Transcript boundaries are essential for merge prompting',
      },
      {
        id: 'ui-flow',
        transcript:
          'User: Explore the minimal UI flow for the prototype.\n\nAssistant: The smallest useful UI is a single page with a root question input, three plant prompt boxes, a Run button, and a Merge button. Show each plant in a column or drawer with status: queued, running, completed, failed. After merge, show either the continued answer or a conflict choice prompt. Do not build account settings, history, file uploads, or a canvas for this test.',
        claims:
          '- Minimal UI needs root input, plant prompts, Run, and Merge\n- Plants should show visible status\n- After merge, show continuation or conflict choice\n- Skip settings, history, uploads, and canvas in the prototype',
      },
      {
        id: 'eval',
        transcript:
          'User: Explore how to evaluate whether the prototype works.\n\nAssistant: Evaluate two scenarios: compatible branches and material conflict. Compatible branches should continue without recap. Material conflict should ask the user which stance to proceed with. Save the full prompt and output for each run so prompt changes can be compared over time.',
        claims:
          '- Evaluate compatible branches and material conflict\n- Compatible branches should continue without recap\n- Material conflict should ask the user to choose\n- Save prompts and outputs for comparison',
      },
    ],
    followUp: 'Okay, given all that, what should I build first tomorrow?',
  },

  curated_speed_vs_fidelity: {
    title: 'Curated material conflict: speed vs fidelity',
    route: {
      kind: 'material_conflict',
      choices: [
        'Ship the fastest rough prototype.',
        'Build a prototype clean enough to evaluate the feel.',
      ],
    },
    parent: [
      {
        role: 'user',
        content:
          'I am deciding how polished the first Dandelion prototype should be. It needs to test the merge workflow, but I also care about whether the interaction feels good.',
      },
      {
        role: 'assistant',
        content:
          'There is a tradeoff between speed and fidelity, but the prototype should stay focused on the merge workflow.',
      },
    ],
    branches: [
      {
        id: 'speed-first',
        transcript:
          'User: Argue for a rough prototype first.\n\nAssistant: Start rough. The highest-risk assumption is not visual polish; it is whether plant merge creates a useful continuation. Build the fastest possible harness: text boxes, run plants, merge, continue. If that fails, beautiful UI is wasted. Keep styling minimal and use the existing HTML prototype only as reference.',
        claims:
          '- Start with a rough prototype\n- The riskiest assumption is merge usefulness, not visual polish\n- Build text boxes, plant runs, merge, and continue\n- Use the existing HTML prototype only as reference',
      },
      {
        id: 'fidelity-matters',
        transcript:
          'User: Argue for enough UI fidelity to test the feeling.\n\nAssistant: Do not make it ugly. Dandelion is partly a workflow product, and the value depends on whether plants feel calm, live, and mergeable. You need enough UI fidelity to show plant status, selected-for-merge state, and the post-merge moment. But this does not require Electron or brand-perfect styling; a clean local web page is enough.',
        claims:
          '- Some UI fidelity matters because Dandelion is a workflow product\n- Prototype should show plant status, selection, and post-merge moment\n- Does not require Electron or brand-perfect styling\n- A clean local web page is enough',
      },
    ],
    followUp: 'So what level of prototype should I build first?',
  },
};
