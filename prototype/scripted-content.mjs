// Scripted demo content for the prototype.
//
// Three pieces:
//   - STARTERS: the suggestion chips shown in the empty state.
//   - generateReply: canned main-thread responses keyed on prompt keywords.
//     Used as the offline fallback when Ollama isn't reachable.
//   - generatePostGraftReply: canned continuation after a graft.
//
// Pure data and pure functions. No DOM, no globals, no network.

export const STARTERS = [
  {
    label: "📝 Reviewing a paper",
    kind: "primary",
    text: "I'm reviewing a paper for a workshop. The paper is about gated VLM inference for robot engagement decisions — it proposes a two-stage pipeline where lightweight perceptual detectors trigger video-VLM queries at socially salient moments. I'll ask you about specific parts.",
    contextLabel: "Reviewing: VLM robot engagement paper",
    response:
      "Got it — I'll keep that framing. Reviewing a two-stage VLM pipeline paper. " +
      "Drop in whichever sections, formulas, or claims you want to dig into. " +
      "If you want to multi-task — for example, ask me about a formula here while I unpack a different section in parallel — " +
      "use the Plant button to open a parallel inquiry. It shares this paper-review context, so I won't need to be re-briefed.",
  },
  {
    label: "🧪 Debugging a system",
    kind: "normal",
    text: "I'm debugging a production system. We have a latency spike that started two days ago, only affects users in EU regions, no obvious change in deploys. I'll be exploring different hypotheses in parallel.",
    contextLabel: "Debugging: EU latency spike",
    response:
      "Understood — EU-only latency regression with no recent deploys is one of the harder shapes to diagnose. " +
      "Common candidates: CDN/edge issues, third-party dependency degradation, traffic shifts, silent infra changes by your cloud provider. " +
      "Use the Plant button to open parallel inquiries for each hypothesis — they'll share this incident framing.",
  },
  {
    label: "📚 Researching a topic",
    kind: "normal",
    text: "I'm researching the history of branching interfaces in LLM chat tools. I want to understand who shipped what and when, and which design choices have proven durable.",
    contextLabel: "Researching: LLM branching UX history",
    response:
      "Got it — the space splits roughly into pre-2024 Loom-style multiverse interfaces for creative writing, " +
      "2024–2025 hosted tools (ChatGPT, Claude, TypingMind, LMCanvas), and 2025–2026 open-source desktop tools. " +
      "Use the Plant button to spawn parallel inquiries for specific tools or design patterns — they'll share this research context.",
  },
];

export function generateReply(prompt) {
  const lower = prompt.toLowerCase();
  if (/formula|equation|math|derivation|theorem|proof|lemma/.test(lower)) {
    return {
      text:
        "Looking at the formula in context: the core move is using a discriminative posterior estimate directly rather than going through a generative observation model. " +
        "It's a reasonable shortcut for VLM outputs since you can't easily get a calibrated likelihood from them anyway, but it does break the POMDP belief-update guarantees the standard formulation gives you. " +
        "Worth raising in the review: do the authors justify this approximation, or is it convenient? " +
        "Not rejection-worthy but a thing they should add to the limitations.",
      duration: 4200,
    };
  }
  if (/baseline|comparison|sota|state of the art/.test(lower)) {
    return {
      text:
        "Their baselines are sequence models (GRU and similar) trained on the same data — a fair single-axis comparison since they hold data fixed. " +
        "The choice does sidestep a stronger baseline: a single-call VLM with no ensemble or saliency anchoring. That's the bar most readers will hold them to. " +
        "If they only beat the sequence models but not the single-call VLM, the contribution is much weaker. Check the table carefully for that row.",
      duration: 4600,
    };
  }
  if (/section\s*\d|that part|other part|the part about|second half|first half|section 5|section 4/.test(lower)) {
    return {
      text:
        "That section is where they describe the saliency-anchored self-critique pipeline. " +
        "K independent VLM samples produce behavior logs and intent estimates; a synthesis prompt extracts disputed claims; a verifier re-examines them — but instead of re-attaching raw video, the verifier sees pose-derived keyframes plus an external gaze label. " +
        "Worth scrutinizing whether the keyframe selection biases the verifier toward agreeing with the most-frequent sample. " +
        "If it does, the method is partly an ensembling trick dressed up as grounding.",
      duration: 5200,
    };
  }
  if (/method|approach|pipeline|architecture/.test(lower)) {
    return {
      text:
        "The two-stage framing is the core methodological contribution: stage one uses cheap perceptual detectors (gaze shifts, proxemic entries) to decide *when* to invoke a VLM, and stage two runs the VLM only at those triggered moments. " +
        "Sensible for cost and latency on edge hardware, and inherits a clean detection/interpretation separation that maps to standard HRI literature. " +
        "Weakness: stage-one false negatives mean the system can miss socially salient moments that don't trigger detectors, and the paper doesn't measure that directly.",
      duration: 5400,
    };
  }
  if (/experiment|result|table|figure/.test(lower)) {
    return {
      text:
        "The headline result is saliency-anchored self-critique outperforming vanilla self-consistency and self-critique on behavior-log accuracy. " +
        "The effect size is moderate (a few points), the comparison is on a small held-out set, and there are no confidence intervals reported. I'd be careful about claiming the improvement is robust. " +
        "Ask the authors for repeated-trial numbers. The qualitative examples in the appendix are more convincing than the headline table.",
      duration: 4400,
    };
  }
  if (/limitation|weakness|flaw|missing/.test(lower)) {
    return {
      text:
        "Main limitations I'd flag: (1) the held-out set is small enough that headline gains may not be statistically meaningful; " +
        "(2) the gaze classifier is trained on deployment data, making the pipeline less zero-shot than the abstract suggests; " +
        "(3) the saliency signals are tuned for trash-disposal gestures, so the generalization claim to broader social cues is unsupported by the experiments shown.",
      duration: 5000,
    };
  }
  if (/novelty|contribution|original|new/.test(lower)) {
    return {
      text:
        "The genuine novelty is the saliency-anchored verification step — using pose-derived keyframes plus an external gaze label as evidence for the second-pass VLM call. " +
        "Two-stage gating (perceptual detectors trigger VLM) is not new; what's new is grounding the verification step in physically meaningful saliency rather than re-attaching full video. " +
        "Whether the community considers it novel enough depends on framing: \"socially-grounded VLM verification\" is defensible; \"general engagement-decision pipeline\" makes the prior art look thicker.",
      duration: 5400,
    };
  }
  if (/cdn|edge|cloudflare|fastly|cache/.test(lower)) {
    return {
      text:
        "EU-only latency with no app changes is a classic CDN-edge issue. Three checks: " +
        "(1) edge-provider EU PoP health — sometimes degradations don't hit the public status page for hours; " +
        "(2) origin-shield routing — sometimes a regional shield flips and EU traffic takes a long path; " +
        "(3) compare cache hit rates per region for affected paths. A hit-rate drop in EU only is diagnostic.",
      duration: 4800,
    };
  }
  if (/database|db|query|postgres|mysql|index/.test(lower)) {
    return {
      text:
        "If only EU traffic is slow, the database is unlikely to be the primary cause unless you have regional replicas in worse shape. " +
        "Worth checking: do EU-served requests route to a different read replica than non-EU? If yes, check that replica's lag, IOPS, and recent autovacuum. " +
        "A silent replica promotion or vacuum storm could spike latency on one region without affecting others.",
      duration: 4400,
    };
  }
  if (/dependency|third.party|api|external/.test(lower)) {
    return {
      text:
        "Third-party services degrading in only one region is more common than people realize. " +
        "Check every external API your EU-region pods call: payments, auth, geolocation, ad networks. " +
        "Cross-reference each provider's status page for the last 48 hours, and look at p99 latency to each external endpoint from EU vs non-EU regions. " +
        "If even one external dep is 200ms slower from EU and you call it on the hot path, that's your spike.",
      duration: 4400,
    };
  }
  if (/chatgpt|openai/.test(lower)) {
    return {
      text:
        "ChatGPT shipped native branching in September 2025 as a \"Branch in new chat\" hover affordance, plus an implicit branch on message edit reachable via inline arrows. " +
        "Before that, branching existed only as a hidden side effect of editing. " +
        "ChatGPT's branching is not visualized as a tree — you navigate via arrows on the edited message, similar to Claude.ai.",
      duration: 4200,
    };
  }
  if (/claude|anthropic/.test(lower)) {
    return {
      text:
        "Claude.ai supports message branching only as a side effect of editing — there's no first-class fork action, no tree view, no canvas. " +
        "Branches are reachable via < > arrows on the edited message. " +
        "As of May 2026, Anthropic has not announced any branching-as-a-first-class-feature work publicly.",
      duration: 3800,
    };
  }
  if (/lmcanvas|canvas/.test(lower)) {
    return {
      text:
        "LMCanvas is the closest existing canvas-native branching tool. 300+ models via OpenRouter, branches as nodes on an infinite canvas, and a merge primitive — " +
        "but the merge is text concatenation, not context pooling. The model handling the post-merge turn sees the merged transcripts as raw appended text rather than as structurally-marked parallel branches, which limits how well it can integrate them.",
      duration: 4600,
    };
  }
  return {
    text:
      "Here's how I'd think about that: the strongest framing depends on which constraint is binding for you. " +
      "If you give me a couple more sentences on the specific angle you care about, I can give a more targeted take. " +
      "If you want to multi-task on this, the Plant button opens a parallel inquiry that shares this context — useful when you have two independent questions you don't want to interleave.",
    duration: 3600,
  };
}

// material_conflict never reaches here — it's handled by the conflict-choice UI.
export function generatePostGraftReply(prompt, graftedPlants) {
  const topics = graftedPlants.map((t) => t.title).join(" and ");
  return {
    text:
      "Start with the concrete next step from the grafted context: build the smallest working slice that exercises the thing you just explored. " +
      "For these plants, that means using " +
      (topics || "the selected material") +
      " as updated context, then continuing without recapping each plant. " +
      "If the next task is implementation, make the data shape explicit first, then wire the visible interaction around it.",
    duration: 5400,
  };
}
