# Round 2b Log: Memory Workflow Experiment (Writing Task)

Test date: 2026-10-26
Model under test: ChatGPT & Google Gemini (/u/2)
Prompts tested: prompts_v2.md

---

## Step 1: Split (ChatGPT main chat)

### Prompt sent:
```
Split this project into at most 2 independent subtasks for separate fresh chats. Explain briefly, then end with one fenced block labeled tasks: tasks separated by a line ===, each with Title:, Task: (self-contained), Needs: (section names from: Goal, Preferences, Decisions, Current state, Open questions), Return: (what the hand-off must keep, including source links).

# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
(none)
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?
```

### Response (trimmed):
```
Split into 2 independent subtasks that can run in parallel. The first develops the beginner-friendly explanation and everyday analogy; the second builds a tiny Python example. Their outputs can then be combined into one ~600-word blog post.

```tasks
Title: Beginner-Friendly Explanation and Analogy
Task: Draft approximately 450–500 words of a blog post explaining vector databases to undergraduates who know basic Python but have no machine learning background. Explain what vectors represent, how similarity search works, why a vector database is useful, and one practical application. Choose one concrete everyday analogy and use it consistently. Maintain a friendly, accessible tone, avoid vendor marketing and unnecessary jargon, and leave room for a short code example to be inserted later. Independently verify important technical claims.
Needs: Goal, Preferences, Current state, Open questions
Return: Draft prose; chosen analogy and why it works; important accuracy caveats; links to reliable sources used, including exact URLs.
===
Title: Tiny Python Example and Explanation
Task: Independently design a short, beginner-friendly Python example demonstrating the core idea behind vector similarity search. Choose an appropriate library or Python's standard library, prioritizing simplicity, readability, and minimal setup. Use a few small, understandable vectors and demonstrate finding the closest match. Clearly distinguish this educational simulation from an actual vector database. Write approximately 70–100 words explaining the example in a friendly, nontechnical tone suitable for insertion into a ~600-word blog post. Avoid vendor marketing.
Needs: Goal, Preferences, Current state, Open questions
Return: Selected library and brief justification; runnable code without comments; expected output; accompanying explanation; any limitations; documentation and technical source links with exact URLs; suggested placement in the final blog post.
```
```

### Parsing & Observations:
- Fenced block labeled `tasks`: Yes, parsed cleanly.
- Delimiter `===`: Present between tasks.
- Fields: Title, Task, Needs, Return are all present.
- Needs sections: Both tasks requested `Goal, Preferences, Current state, Open questions`. Because this is a writing task without external web constraints, both subtasks need the overall goal/preferences and address one of the open questions.
- Explanation outside block was brief (~35 words). Nothing followed the block.

---

## Step 2: Dispatch Subtasks (Task 1 on Gemini, Task 2 on ChatGPT)

### Task 1 on Gemini (/u/2)

#### Prompt sent:
```
You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so. In the result block keep every item listed in Return, with source links and what you could not verify.

# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?

Title: Beginner-Friendly Explanation and Analogy
Task: Draft approximately 450–500 words of a blog post explaining vector databases to undergraduates who know basic Python but have no machine learning background. Explain what vectors represent, how similarity search works, why a vector database is useful, and one practical application. Choose one concrete everyday analogy and use it consistently. Maintain a friendly, accessible tone, avoid vendor marketing and unnecessary jargon, and leave room for a short code example to be inserted later. Independently verify important technical claims.
Return: Draft prose; chosen analogy and why it works; important accuracy caveats; links to reliable sources used, including exact URLs.

Output requirements:
Keep the answer under 150 words outside the block.
End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question.
```

#### Response (trimmed):
```
Here is the draft and background research ready for your broader blog post project.

The draft uses a Spotify-style music playlist/taste-map analogy to explain high-dimensional coordinates, similarity search (distance metrics like cosine similarity or Euclidean distance), and approximate nearest neighbors (ANN). It avoids vendor promotion and focuses purely on conceptual clarity for CS undergraduates.

```result
## Draft Prose (~470 words)

Imagine organizing your music library. Traditional relational databases (like SQL) excel at exact keyword lookups: `SELECT * FROM songs WHERE artist = 'Daft Punk'`. But what if you ask: *"Find me songs that feel like late-night highway driving"*? A standard SQL database fails here because "late-night highway vibe" is not a column or keyword.

This is where **vector databases** come in.

### From Words and Audio to Numbers
In machine learning, an embedding model translates complex data—like an audio track, a photo, or a sentence—into a list of numbers called a **vector** (or embedding). You can think of a vector as a coordinate on a giant multi-dimensional map...

### Why a Database? (The Search Problem)
Comparing two vectors is simple arithmetic (using distance metrics like cosine similarity). But finding the nearest matches across tens of millions of songs is too slow for brute-force comparison. Vector databases solve this through **Approximate Nearest Neighbor (ANN)** indexing...

## Chosen Analogy and Why It Works
- **Analogy:** Music recommendation / "Taste Map" (similar to Spotify playlist recommendations).
- **Why it works:** Every undergraduate has used music streaming services; concepts like acoustic vibes translating to geometric proximity are immediately intuitive.

## Important Accuracy Caveats
1. ANN is approximate: trades exact recall for sub-second latency across millions of vectors.
2. Embeddings are model-dependent: quality depends on upstream embedding model.

## Sources Used
- Pinecone Learning Center: What is a Vector Database? (https://www.pinecone.io/learn/vector-database/)
- Cloudflare Learning: What is a vector database? (https://www.cloudflare.com/learning/ai/what-is-vector-database/)
- Weaviate Documentation: Vector Search Basics (https://weaviate.io/developers/weaviate/concepts/vector-index)

## What Could Not Be Verified
- The prompt context did not specify which embedding model or Python library to use for the upcoming code snippet; that selection remains open.
```
```

#### Observations:
- Return items kept: All kept (draft prose, analogy + justification, caveats, exact URL sources, what could not be verified).
- Links kept: 3 official documentation / learning links with full URLs.
- Outside text: Brief intro (~50 words, well within the 150-word cap).
- Nothing followed the fenced block.
- Block parsed: Contained within code block formatting.

---

### Task 2 on ChatGPT

#### Prompt sent:
```
You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so. In the result block keep every item listed in Return, with source links and what you could not verify.

# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?

Title: Tiny Python Example and Explanation
Task: Independently design a short, beginner-friendly Python example demonstrating the core idea behind vector similarity search. Choose an appropriate library or Python's standard library, prioritizing simplicity, readability, and minimal setup. Use a few small, understandable vectors and demonstrate finding the closest match. Clearly distinguish this educational simulation from an actual vector database. Write approximately 70–100 words explaining the example in a friendly, nontechnical tone suitable for insertion into a ~600-word blog post. Avoid vendor marketing.
Return: Selected library and brief justification; runnable code without comments; expected output; accompanying explanation; any limitations; documentation and technical source links with exact URLs; suggested placement in the final blog post.

Output requirements:
Keep the answer under 150 words outside the block.
End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question.
```

#### Response (trimmed):
```
The example uses Python’s standard library to demonstrate nearest-neighbor search without installing packages.

```result
Title: Tiny Python Example and Explanation

Selected library:
Python standard library (math.dist).

Justification:
No installation needed. Simple, readable, and beginner-friendly. Requires Python 3.8+.

Runnable Python code:

    from math import dist

    snacks = {
        "apple": (3, 3),
        "chips": (0, 5),
        "chocolate": (5, 0)
    }

    wanted = (3, 4)

    closest = min(
        snacks,
        key=lambda name: dist(wanted, snacks[name])
    )

    print(closest)

Expected output:

    apple

Accompanying explanation (91 words):

Imagine choosing a snack based on two preferences: sweetness and crunchiness. Each snack gets two scores, from 0 to 5, representing those traits. That pair of numbers is called a vector.

We also describe what you're looking for using a vector. Python then measures the distance between your preferences and each snack. The smaller the distance, the better the match!

Here, the apple wins because its scores are closest to what we want. This demonstrates the basic idea behind vector similarity search: finding items with similar numerical representations.

Limitations:
- Educational simulation, not an actual vector database.
- Scores are manually invented, not generated by machine learning.
- Uses Euclidean distance rather than learned semantic similarity.
- Checks every item individually.
- Does not provide database storage, indexing, or efficient large-scale search.
- Real vector databases may support approximate nearest-neighbor search.

Documentation and technical sources:

Python math.dist:
https://docs.python.org/3/library/math.html#math.dist

Python min:
https://docs.python.org/3/library/functions.html#min

Nearest-neighbor search (scikit-learn documentation):
https://scikit-learn.org/stable/modules/neighbors.html#nearest-neighbors

Verification:
The documentation supports the chosen functions and search principle. The expected output follows from the specified vectors. Execution in a Python runtime was not independently verified.

Suggested placement:
Immediately after introducing vectors and similarity search, before explaining how real vector databases store, index, and retrieve vectors efficiently.

Suggested section heading:
"Try It Yourself: Finding Similar Items with Python"
```
```

#### Observations:
- Return items kept: All kept (selected library + justification, runnable code, expected output, 91-word explanation, limitations, docs links, verification, suggested placement).
- Links kept: 3 exact documentation URLs.
- Outside text: 1 sentence (~16 words, well within the 150-word cap).
- Nothing followed the fenced block.
- Block parsed: Clean fenced code block labeled `result`.

---

## Step 3: Memory Update (Gemini brand-new chat)

### Prompt sent:
```
Update the project memory using ONLY the old memory and the new material below; ignore anything else. Output only one fenced block labeled mem with the same headings. Mark each new decision with 〔AI · basis: …〕. If you remove an open question, add one line saying why. Leave everything else unchanged.

# Old Memory
# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
(none)
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?

# New Material
[Task 1 result block: draft prose, music recommendation analogy, ANN caveats, doc links]
[Task 2 result block: python standard library math.dist, runnable snack example, doc links]
```

### Response (trimmed):
```
```mem
# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
- Analogy: Music recommendation / "Taste Map" (similar to Spotify playlist recommendations) 〔AI · basis: New material outlines draft prose and explicitly selects the music recommendation analogy for intuitive undergraduate appeal〕
- Code library: Python standard library (`math.dist`) 〔AI · basis: New material explicitly selects Python standard library math.dist for beginner-friendliness with no installation needed〕
## Current state
Draft prose (~470 words) and code example with explanation (~91 words) prepared.
## Open questions
(none)
Removed "Which analogy? Which library for the code example?" because both the music recommendation analogy and the Python standard library (`math.dist`) were selected in the new material.
```

Would you like me to assemble these pieces into a complete ~600-word blog post draft?
Yes
```

### Parsing & Observations:
- Decisions tagged: Yes, both decisions tagged properly with `〔AI · basis: …〕`.
- Removed questions explained: Yes, explained in one line under `## Open questions`.
- Dropped or invented sections: None. All five headings preserved (`Goal`, `Preferences`, `Decisions`, `Current state`, `Open questions`).
- Rule violation: Gemini added conversational text and suggested follow-up chips after the block ("Would you like me to assemble these pieces into a complete ~600-word blog post draft?"). This triggers the `%fix` condition for Step 5!

---

## Step 4: Resume (ChatGPT new chat)

### Prompt sent:
```
This is the memory of a project done in other chats. Decisions are settled; do not re-derive them. Continue from Current state.

# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
- Analogy: Music recommendation / "Taste Map" (similar to Spotify playlist recommendations) 〔AI · basis: New material outlines draft prose and explicitly selects the music recommendation analogy for intuitive undergraduate appeal〕
- Code library: Python standard library (`math.dist`) 〔AI · basis: New material explicitly selects Python standard library math.dist for beginner-friendliness with no installation needed〕
## Current state
Draft prose (~470 words) and code example with explanation (~91 words) prepared.
## Open questions
(none)

Write the full blog post.

Output requirements:
End your answer with exactly one fenced block labeled result containing the post title and a 2-line summary. Put nothing after it, no follow-up question.
```

### Response (trimmed):
```
Vector Databases Explained: Finding Your Way Through a Taste Map

Imagine you're listening to your favorite song, and a music app suggests another song you've never heard before. Somehow, it matches your taste perfectly.
How does the app find something similar among millions of songs?
One useful way to understand this is through vector databases, which help computers find things that are similar, even when they don't have exactly the same words or features.

The Taste Map: Turning Music into Numbers
Imagine every song has a position on a giant map called a Taste Map.
Instead of using latitude and longitude, the map describes musical characteristics. For example, one direction might represent energy, while another represents acousticness.
A calm acoustic song might have coordinates [0.2, 0.9], while an energetic dance track might be [0.9, 0.1]...

Try It Yourself: Finding Similar Items with Python
```python
from math import dist

songs = {
    "Calm Piano": [0.2, 0.9],
    "Dance Beat": [0.9, 0.1],
    "Indie Guitar": [0.6, 0.5]
}

your_taste = [0.8, 0.2]

closest = min(songs, key=lambda song: dist(songs[song], your_taste))

print(closest)
```
Output:
`Dance Beat`

...
The Big Takeaway
A traditional database is excellent at finding exact matches. A vector database specializes in finding similar items. Whether you're recommending songs or searching documents by meaning, the core idea remains the same: turn information into vectors, organize those vectors, and find what's nearby.

```result
Vector Databases Explained: Finding Your Way Through a Taste Map
Vector databases find similar information by comparing numerical representations called embeddings.
A music Taste Map analogy and a tiny Python math.dist example show how similarity search works.
```
```

### Observations & Checks:
- Continuation vs re-deriving: Continued smoothly from Current state without questioning, debating, or re-deriving the settled decisions.
- Analogy check: Used the "Taste Map" music recommendation analogy consistently throughout the post.
- Library check: Implemented the Python standard library `math.dist` example directly into the text.
- Preference adherence:
  - Tone: Friendly, accessible to undergrads with no ML jargon.
  - Length: ~600 words total.
  - Vendor marketing: None (zero mentions of commercial vector DB vendors).
  - Code example: Tiny (8 lines), clean, runnable.
- Result block: Exactly one fenced block labeled `result` containing the post title and 2-line summary. Nothing followed the block.

---

## Step 5: %fix Evaluation

### Context:
In Step 3, Gemini's response appeared to have trailing text after the fenced block:
`Would you like me to assemble these pieces into a complete ~600-word blog post draft?`

### Prompt sent:
```
Your last answer did not end with the required fenced block labeled mem. Output only that block now, nothing else.
```

### Response (trimmed):
```
```mem
# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
- Analogy: Music recommendation / "Taste Map" (similar to Spotify playlist recommendations) 〔AI · basis: New material outlines draft prose and explicitly selects the music recommendation analogy for intuitive undergraduate appeal〕
- Code library: Python standard library (`math.dist`) 〔AI · basis: New material explicitly selects Python standard library math.dist for beginner-friendliness with no installation needed〕
## Current state
Draft prose (~470 words) and code example with explanation (~91 words) prepared.
## Open questions
(none)
Removed "Which analogy? Which library for the code example?" because both the music recommendation analogy and the Python standard library (`math.dist`) were selected in the new material.
```
```

### Root Cause Analysis & Outcome:
- Did %fix work? **Yes, on the model level.** The LLM generated only the `mem` fenced block in markdown.
- Architectural finding: DOM inspection revealed that the trailing follow-up prompt (`Want to review the complete blog post integrating the text and code?`) is rendered inside `<div class="follow-up-container">` by Gemini's web client, not generated by the model in the response text. The web client dynamically appends suggested follow-up chips to `<model-response>`.
- Fix recommendation for the extension: When reading from Gemini via DOM query, exclude `.follow-up-container` or target only `.model-response-text` / `pre code`.

---

## Comparison to Round 1 & Task Observations

### Comparison to Round 1 Issues:
1. **Worker proposals promoted to decisions:** Solved. In Round 2b, %split produced well-scoped subtasks, workers explored options, and %mem-update strictly tagged decisions with `〔AI · basis: …〕`.
2. **Silently removed open questions:** Solved. Gemini explicitly explained the removal under `## Open questions`: `Removed "Which analogy? Which library for the code example?" because both the music recommendation analogy and the Python standard library (math.dist) were selected in the new material.`
3. **Dropping candidates/links:** Solved. Both Gemini and ChatGPT preserved full documentation URLs and caveats in their result blocks.
4. **"Short" ignored in Preferences:** Solved. The `+short` modifier in Output Requirements capped prose outside the block to ~50 words (Gemini) and ~16 words (ChatGPT).
5. **Gemini trailing text:** Identified as Gemini UI client injection (`.follow-up-container`).

### Writing Task vs Search Task Dynamics:
- **Search tasks** naturally split into disjoint domains (e.g., transit schedule vs museum admission) where each subtask needs different memory slices.
- **Writing tasks** split along structural components (e.g., conceptual prose/analogy vs educational code example). Both subtasks need the overall goal and tone preferences, but they resolve distinct open questions. Settling creative choices (analogy + library) early in memory allows the resume step to synthesize a cohesive draft without tone clash or re-derivation.

---

## Proposed Prompt Wording Changes

1. **`%fix` enhancement:**
   - *Current:* `"Your last answer did not end with the required fenced block labeled X. Output only that block now, nothing else."`
   - *Change to:* `"Output only the fenced block labeled X with no text before or after it."`
   - *Reason:* Simpler and more direct instruction for models that interpret conversational framing as an invitation to reply conversationally.

2. **`%split` for writing / creative tasks:**
   - *Current:* `"Split this project into at most 2 independent subtasks for separate fresh chats..."`
   - *Observation:* For writing tasks, models should be guided to split into *component drafts* (e.g., conceptual explanation vs code demonstration) and specify how they interface.




