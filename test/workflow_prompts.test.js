// Unit tests for WorkflowPrompts
// Runs with: node test/workflow_prompts.test.js

const assert = require('node:assert');
const WorkflowPrompts = require('../utils/workflow_prompts.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    failed++;
  }
}

// 1. Real round-2b split answer (tasks block) -> 2 tasks, correct titles, needs arrays
test('1. Real round-2b split answer -> 2 tasks, correct titles, needs arrays', () => {
  const round2bSplitAnswer = `Split into 2 independent subtasks that can run in parallel. The first develops the beginner-friendly explanation and everyday analogy; the second builds a tiny Python example. Their outputs can then be combined into one ~600-word blog post.

\`\`\`tasks
Title: Beginner-Friendly Explanation and Analogy
Task: Draft approximately 450–500 words of a blog post explaining vector databases to undergraduates who know basic Python but have no machine learning background. Explain what vectors represent, how similarity search works, why a vector database is useful, and one practical application. Choose one concrete everyday analogy and use it consistently. Maintain a friendly, accessible tone, avoid vendor marketing and unnecessary jargon, and leave room for a short code example to be inserted later. Independently verify important technical claims.
Needs: Goal, Preferences, Current state, Open questions
Return: Draft prose; chosen analogy and why it works; important accuracy caveats; links to reliable sources used, including exact URLs.
===
Title: Tiny Python Example and Explanation
Task: Independently design a short, beginner-friendly Python example demonstrating the core idea behind vector similarity search. Choose an appropriate library or Python's standard library, prioritizing simplicity, readability, and minimal setup. Use a few small, understandable vectors and demonstrate finding the closest match. Clearly distinguish this educational simulation from an actual vector database. Write approximately 70–100 words explaining the example in a friendly, nontechnical tone suitable for insertion into a ~600-word blog post. Avoid vendor marketing.
Needs: Goal, Preferences, Current state, Open questions
Return: Selected library and brief justification; runnable code without comments; expected output; accompanying explanation; any limitations; documentation and technical source links with exact URLs; suggested placement in the final blog post.
\`\`\``;

  const tasks = WorkflowPrompts.parseTasks(round2bSplitAnswer);
  assert(Array.isArray(tasks), 'tasks should be an array');
  assert.strictEqual(tasks.length, 2);

  assert.strictEqual(tasks[0].title, 'Beginner-Friendly Explanation and Analogy');
  assert.deepStrictEqual(tasks[0].needs, ['Goal', 'Preferences', 'Current state', 'Open questions']);
  assert(tasks[0].task.includes('Draft approximately 450–500 words'));
  assert(tasks[0].ret.includes('Draft prose; chosen analogy and why it works'));

  assert.strictEqual(tasks[1].title, 'Tiny Python Example and Explanation');
  assert.deepStrictEqual(tasks[1].needs, ['Goal', 'Preferences', 'Current state', 'Open questions']);
  assert(tasks[1].task.includes('Independently design a short'));
  assert(tasks[1].ret.includes('Selected library and brief justification'));
});

// 2. Real result answer from logs containing ## headings inside result block
test('2. Real result answer containing ## headings inside the result block', () => {
  const round2bResultWithHeadings = `Here is the draft and background research ready for your broader blog post project.

The draft uses a Spotify-style music playlist/taste-map analogy to explain high-dimensional coordinates, similarity search (distance metrics like cosine similarity or Euclidean distance), and approximate nearest neighbors (ANN). It avoids vendor promotion and focuses purely on conceptual clarity for CS undergraduates.

\`\`\`result
## Draft Prose (~470 words)

Imagine organizing your music library. Traditional relational databases (like SQL) excel at exact keyword lookups: \`SELECT * FROM songs WHERE artist = 'Daft Punk'\`. But what if you ask: *"Find me songs that feel like late-night highway driving"*? A standard SQL database fails here because "late-night highway vibe" is not a column or keyword.

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
\`\`\``;

  const resultBlock = WorkflowPrompts.parseBlock(round2bResultWithHeadings, 'result');
  assert(resultBlock !== null, 'result block should not be null');
  assert(resultBlock.includes('## Draft Prose (~470 words)'));
  assert(resultBlock.includes('## Chosen Analogy and Why It Works'));
  assert(resultBlock.includes('## Sources Used'));
  assert(resultBlock.includes('## What Could Not Be Verified'));

  const wordsOutside = WorkflowPrompts.countWordsOutside(round2bResultWithHeadings, 'result');
  assert(wordsOutside > 0 && wordsOutside < 150, `words outside was ${wordsOutside}, should be < 150`);
});

// 3. Result block whose body contains a nested ```python ... ``` code block -> full body kept
test('3. Result block whose body contains a nested ```python code block -> full body kept', () => {
  const answerWithNestedCode = `Here is the solution:

\`\`\`result
Title: Python Solution
Code:
\`\`\`python
def find_nearest(target, points):
    return min(points, key=lambda p: abs(p - target))
\`\`\`
Note: this is an educational simulation.
\`\`\``;

  const parsedNested = WorkflowPrompts.parseBlock(answerWithNestedCode, 'result');
  assert(parsedNested !== null);
  assert(parsedNested.includes('```python'));
  assert(parsedNested.includes('def find_nearest(target, points):'));
  assert(parsedNested.includes('Note: this is an educational simulation.'));
});

// 4. Gemini-style trailing text after the block -> ignored
test('4. Gemini-style trailing text after the block -> ignored', () => {
  const answerWithGeminiTrailing = `\`\`\`result
Title: Day Trip Plan
Details: Take the 8:00 AM train.
\`\`\`

Would you like me to combine them?
Yes`;

  const parsedTrailing = WorkflowPrompts.parseBlock(answerWithGeminiTrailing, 'result');
  assert.strictEqual(parsedTrailing, 'Title: Day Trip Plan\nDetails: Take the 8:00 AM train.');
  const outsideWords = WorkflowPrompts.countWordsOutside(answerWithGeminiTrailing, 'result');
  assert.strictEqual(outsideWords, 8);
});

// 5. No block at all -> null; with fallback and an unlabelled ``` block -> that block
test('5. No block at all -> null; with fallback and an unlabelled ``` block -> that block', () => {
  const noBlock = 'Just plain text response without code blocks.';
  assert.strictEqual(WorkflowPrompts.parseBlock(noBlock, 'result'), null);
  assert.strictEqual(WorkflowPrompts.parseBlock(noBlock, 'result', { fallback: true }), null);

  const unlabelledBlock = `Some conversational text.
\`\`\`
Title: Unlabelled Plan
Step 1: Do this.
\`\`\`
More trailing text.`;

  assert.strictEqual(WorkflowPrompts.parseBlock(unlabelledBlock, 'result'), null);
  const fallbackResult = WorkflowPrompts.parseBlock(unlabelledBlock, 'result', { fallback: true });
  assert.strictEqual(fallbackResult, 'Title: Unlabelled Plan\nStep 1: Do this.');
});

// 6. Unclosed block (truncated) -> body to the end
test('6. Unclosed block (truncated) -> body to the end', () => {
  const truncatedBlock = `Here is the start of the output:
\`\`\`result
Line 1: Beginning
Line 2: Middle
Line 3: Truncated without close`;

  const parsedTruncated = WorkflowPrompts.parseBlock(truncatedBlock, 'result');
  assert.strictEqual(parsedTruncated, 'Line 1: Beginning\nLine 2: Middle\nLine 3: Truncated without close');
});

// 7. Two result blocks -> last one wins
test('7. Two result blocks -> last one wins', () => {
  const twoResultBlocks = `\`\`\`result
First attempt (deprecated)
\`\`\`
Wait, I noticed an error, here is the corrected result:
\`\`\`result
Second attempt (final)
\`\`\``;

  const parsedTwo = WorkflowPrompts.parseBlock(twoResultBlocks, 'result');
  assert.strictEqual(parsedTwo, 'Second attempt (final)');
});

// 8. mem answer from the logs -> parseMemoryAnswer returns text with all sections; diffMemory shows added decisions
test('8. mem answer from logs -> parseMemoryAnswer returns text with all sections; diffMemory shows added decisions', () => {
  const oldMemory = `# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
(none)
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?`;

  const round2bMemAnswer = `\`\`\`mem
# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
- Analogy: Music recommendation / "Taste Map" (similar to Spotify playlist recommendations) 〔AI · basis: New material outlines draft prose and explicitly selects the music recommendation analogy for intuitive undergraduate appeal〕
- Code library: Python standard library (\`math.dist\`) 〔AI · basis: New material explicitly selects Python standard library math.dist for beginner-friendliness with no installation needed〕
## Current state
Draft prose (~470 words) and code example with explanation (~91 words) prepared.
## Open questions
(none)
Removed "Which analogy? Which library for the code example?" because both the music recommendation analogy and the Python standard library (\`math.dist\`) were selected in the new material.
\`\`\`

Would you like me to assemble these pieces into a complete ~600-word blog post draft?
Yes`;

  const parsedMem = WorkflowPrompts.parseMemoryAnswer(round2bMemAnswer);
  assert(parsedMem !== null, 'parsed memory answer should not be null');
  for (const sec of WorkflowPrompts.SECTIONS) {
    assert(parsedMem.includes(`## ${sec}`), `parsed memory should contain ## ${sec}`);
  }
  assert(!parsedMem.includes('Would you like me to assemble'), 'trailing text should be excluded');

  const diff = WorkflowPrompts.diffMemory(oldMemory, parsedMem);
  const decisionsDiff = diff.find(d => d.section === 'Decisions');
  assert(decisionsDiff, 'diff should contain a change for Decisions');
  assert.deepStrictEqual(decisionsDiff.removed, []);
  assert.strictEqual(decisionsDiff.added.length, 2);
  assert(decisionsDiff.added[0].includes('〔AI · basis:'));
  assert(decisionsDiff.added[1].includes('〔AI · basis:'));

  const questionsDiff = diff.find(d => d.section === 'Open questions');
  assert(questionsDiff, 'diff should contain a change for Open questions');
  assert(questionsDiff.added.some(line => line.includes('Removed "Which analogy?')));
});

// 9. Builders: buildTask layout matches round2b Task 1; buildSplit without short has no "Output requirements"
test('9. Builders: buildTask matches layout of round2b Task 1; buildSplit short toggles requirements', () => {
  const memory = `# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
(none)
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?`;

  const task1 = {
    title: 'Beginner-Friendly Explanation and Analogy',
    task: 'Draft approximately 450–500 words of a blog post explaining vector databases to undergraduates who know basic Python but have no machine learning background. Explain what vectors represent, how similarity search works, why a vector database is useful, and one practical application. Choose one concrete everyday analogy and use it consistently. Maintain a friendly, accessible tone, avoid vendor marketing and unnecessary jargon, and leave room for a short code example to be inserted later. Independently verify important technical claims.',
    needs: ['Goal', 'Preferences', 'Current state', 'Open questions'],
    ret: 'Draft prose; chosen analogy and why it works; important accuracy caveats; links to reliable sources used, including exact URLs.'
  };

  const builtTask = WorkflowPrompts.buildTask(memory, task1, { short: true });
  assert(builtTask.startsWith(WorkflowPrompts.TEXT.task));
  assert(builtTask.includes('# Project: beginner blog post on vector databases'));
  assert(builtTask.includes('## Goal'));
  assert(builtTask.includes('## Preferences'));
  assert(builtTask.includes('## Current state'));
  assert(builtTask.includes('## Open questions'));
  assert(!builtTask.includes('## Decisions'), 'should not contain unneeded Decisions section');
  assert(builtTask.includes('Title: Beginner-Friendly Explanation and Analogy'));
  assert(builtTask.includes('Task: Draft approximately 450–500 words'));
  assert(builtTask.includes('Return: Draft prose; chosen analogy'));
  assert(builtTask.endsWith('Output requirements:\n' + WorkflowPrompts.TEXT.short + '\n' + WorkflowPrompts.TEXT.result));

  const splitWithoutShort = WorkflowPrompts.buildSplit(memory, { short: false });
  assert(!splitWithoutShort.includes('Output requirements'), 'buildSplit without short should have no Output requirements');
  assert(splitWithoutShort.startsWith(WorkflowPrompts.TEXT.split));
  assert(splitWithoutShort.includes('## Goal'));
  assert(!splitWithoutShort.includes('Current state'));

  const splitWithShort = WorkflowPrompts.buildSplit(memory, { short: true });
  assert(splitWithShort.includes('Output requirements:\n' + WorkflowPrompts.TEXT.short));

  const resume = WorkflowPrompts.buildResume(memory, 'Make a timetable.', { short: true });
  assert(resume.startsWith(WorkflowPrompts.TEXT.resume));
  assert(resume.includes('Make a timetable.'));
  assert(resume.includes('Output requirements:\n' + WorkflowPrompts.TEXT.short));

  const fixPrompt = WorkflowPrompts.buildFix('result');
  assert.strictEqual(fixPrompt, 'Your last answer did not end with the required fenced block labeled result. Output only that block now, with no text before or after it.');
});

// 10. parseMemory/pickSections round-trip and unknown Needs names dropped
test('10. parseMemory/pickSections round-trip and unknown Needs names dropped', () => {
  const initialMem = WorkflowPrompts.emptyMemory('Chicago Trip', 'Spend one Saturday in Chicago.');
  assert(initialMem.includes('# Project: Chicago Trip'));
  assert(initialMem.includes('## Goal\nSpend one Saturday in Chicago.'));
  assert(initialMem.includes('## Decisions\n(none)'));
  assert(!initialMem.includes('## Current state'));
  assert(initialMem.includes('## Open questions\n(none)'));

  const parsedInit = WorkflowPrompts.parseMemory(initialMem);
  assert.strictEqual(parsedInit.title, 'Chicago Trip');
  assert.strictEqual(parsedInit.sections['Goal'], 'Spend one Saturday in Chicago.');
  assert.strictEqual(parsedInit.sections['Decisions'], '(none)');
  assert.strictEqual(parsedInit.sections['Current state'], '');
  assert.strictEqual(parsedInit.sections['Open questions'], '(none)');
  assert.strictEqual(parsedInit.sections['Preferences'], '');

  const picked = WorkflowPrompts.pickSections(initialMem, ['Decisions', 'NonExistentSection', 'Goal']);
  assert(picked.includes('# Project: Chicago Trip'));
  assert(picked.includes('## Goal\nSpend one Saturday in Chicago.'));
  assert(picked.includes('## Decisions\n(none)'));
  assert(!picked.includes('NonExistentSection'));
  assert(!picked.includes('## Preferences'));
  assert(!picked.includes('## Current state'));
  assert(!picked.includes('## Open questions'));

  const goalIdx = picked.indexOf('## Goal');
  const decIdx = picked.indexOf('## Decisions');
  assert(goalIdx !== -1 && decIdx !== -1 && goalIdx < decIdx, 'Goal must appear before Decisions in canonical order');

  const parsedPicked = WorkflowPrompts.parseMemory(picked);
  assert.strictEqual(parsedPicked.title, 'Chicago Trip');
  assert.strictEqual(parsedPicked.sections['Goal'], 'Spend one Saturday in Chicago.');
  assert.strictEqual(parsedPicked.sections['Decisions'], '(none)');
  assert.strictEqual(parsedPicked.sections['Current state'], '');
});

// 11. \r\n input handling
test('11. \\r\\n input handling', () => {
  const crlfTasksText = "Split text\r\n\r\n```tasks\r\nTitle: CRLF Task\r\nTask: Do task\r\nNeeds: Goal, Invalid\r\nReturn: Result\r\n```";
  const parsedCrlfTasks = WorkflowPrompts.parseTasks(crlfTasksText);
  assert(parsedCrlfTasks !== null);
  assert.strictEqual(parsedCrlfTasks.length, 1);
  assert.strictEqual(parsedCrlfTasks[0].title, 'CRLF Task');
  assert.deepStrictEqual(parsedCrlfTasks[0].needs, ['Goal']);

  const crlfMemAnswer = "```mem\r\n# Project: CRLF\r\n## Goal\r\nGoal CRLF\r\n## Preferences\r\nPref CRLF\r\n## Decisions\r\n(none)\r\n## Current state\r\nJust started.\r\n## Open questions\r\n(none)\r\n```\r\n\r\nFollow up?";
  const parsedCrlfMem = WorkflowPrompts.parseMemoryAnswer(crlfMemAnswer);
  assert(parsedCrlfMem !== null);
  assert(parsedCrlfMem.includes('## Goal'));
  assert(!parsedCrlfMem.includes('Follow up?'));

  const crlfDiff = WorkflowPrompts.diffMemory(
    "# Project: CRLF\r\n## Goal\r\nOld Goal\r\n## Decisions\r\n(none)",
    "# Project: CRLF\r\n## Goal\r\nNew Goal\r\n## Decisions\r\n(none)"
  );
  const goalDiff = crlfDiff.find(d => d.section === 'Goal');
  assert(goalDiff);
  assert.deepStrictEqual(goalDiff.added, ['New Goal']);
  assert.deepStrictEqual(goalDiff.removed, ['Old Goal']);
});

test('12. Block followed by commentary and another fence -> only its own body', () => {
  const answer = "Intro\n```result\nA\n```python\nprint(1)\n```\nB\n```\nSome notes\n```text\nnot part of it\n```";
  assert.strictEqual(WorkflowPrompts.parseBlock(answer, 'result'), "A\n```python\nprint(1)\n```\nB");
});

test('13. Fallback never picks a code block', () => {
  assert.strictEqual(WorkflowPrompts.parseBlock("Here:\n```python\nx = 1\n```", 'result', { fallback: true }), null);
  assert.strictEqual(WorkflowPrompts.parseBlock("Here:\n```markdown\nok\n```", 'result', { fallback: true }), 'ok');
});

test('14. Task plan missing Task or Return is rejected; unlabelled tasks block accepted', () => {
  assert.strictEqual(WorkflowPrompts.parseTasks("```tasks\nTitle: only title\n```"), null);
  const t = WorkflowPrompts.parseTasks("```\nTitle: A\nTask: do a\nNeeds: Goal\nReturn: list\n```");
  assert(t && t.length === 1 && t[0].title === 'A');
});

test('15. Partial memory answer is rejected', () => {
  assert.strictEqual(WorkflowPrompts.parseMemoryAnswer("```mem\n## Goal\ng\n## Preferences\np\n## Current state\nc\n```"), null);
});

test('16. Combine message has memory, every result and the instruction', () => {
  const msg = WorkflowPrompts.buildCombine('## Goal\nPick a note app', [{ title: 'A', text: 'res a' }, { title: 'B', text: 'res b' }], 'One page please', { short: true });
  assert(msg.startsWith(WorkflowPrompts.TEXT.combine));
  assert(msg.includes('## Goal\nPick a note app'));
  assert(msg.includes('### A\nres a') && msg.includes('### B\nres b'));
  assert(msg.includes('One page please'));
  assert(msg.includes(WorkflowPrompts.TEXT.short));
  assert(!WorkflowPrompts.buildCombine('m', [], '').includes('\n\n\n'));
});

test('17. Progress follows the project at every stage', () => {
  const P = WorkflowPrompts;
  const base = { memory: [], steps: [], tasks: [] };
  assert(P.buildProgress(base).includes('Not planned yet.'));
  assert(P.buildProgress({ ...base, planSkipped: true }).includes('No plan'));
  const running = {
    ...base,
    tasks: [
      { title: 'Weather', status: 'done', ai: 'gemini', result: '## Result\n**12°C**, rain after 2 pm\nSource: x' },
      { title: 'Museums', status: 'running', ai: 'chatgpt' },
      { title: 'Food', status: 'todo' }
    ]
  };
  const p1 = P.buildProgress(running);
  assert(p1.startsWith(P.PROGRESS_HEADING));
  assert(p1.includes('Plan: 3 tasks, 1 done.'));
  assert(p1.includes('- Done: Weather (Gemini)\n'), p1);
  assert(!p1.includes('12°C') && !p1.includes('Source:'), p1);
  assert(p1.includes('Running: Museums (ChatGPT)') && p1.includes('To do: Food'));
  assert(p1.includes('Next: Finish the tasks.'));
  const done = { ...running, tasks: running.tasks.map(t => ({ ...t, status: 'done' })) };
  assert(P.buildProgress(done).includes('Next: Combine the results.'));
  const combined = { ...done, steps: [{ kind: 'combine', status: 'done', ai: 'chatgpt' }] };
  assert(P.buildProgress(combined).includes('Combined into a final answer (ChatGPT).'));
  assert(P.buildProgress(combined).includes('Next: Keep going in a new chat.'));
  const w = P.withProgress('## Goal\ng', combined);
  assert(w.startsWith('## Goal\ng\n\n' + P.PROGRESS_HEADING));
});

test('18. Plan may carry a mem block; only a labelled one counts', () => {
  const P = WorkflowPrompts;
  const mem = '## Goal\ng\n## Preferences\n- no car\n## Decisions\n(none)\n## Current state\nPlanned.\n## Open questions\n(none)';
  const answer = 'Plan.\n\n```mem\n' + mem + '\n```\n\n```tasks\nTitle: A\nTask: a\nNeeds: Goal\nReturn: r\n```';
  assert.strictEqual(P.parseMemoryAnswer(answer, { labelledOnly: true }), mem);
  assert.strictEqual(P.parseTasks(answer).length, 1);
  const noMem = 'Plan.\n\n```\n' + mem + '\n```\n\n```tasks\nTitle: A\nTask: a\nNeeds: Goal\nReturn: r\n```';
  assert.strictEqual(P.parseMemoryAnswer(noMem, { labelledOnly: true }), null);
  assert(P.buildSplit('m', { requirements: '' }).includes(P.TEXT.splitMem));
  assert(P.buildMemUpdate('m', []).includes(P.TEXT.memStyle));
});

test('19. Readable answers hide workflow syntax without changing archives', () => {
  const P = WorkflowPrompts;
  const split = 'Two useful parts.\n\n```tasks\nTitle: Weather\nTask: Find the forecast.\nNeeds: Goal\nReturn: Forecast\n===\nTitle: Museums\nTask: Find 3 museums.\nNeeds: Goal\nReturn: Prices\n```';
  assert.strictEqual(P.readableAnswer('split', split), 'Two useful parts.\n\n**Weather**\n\nFind the forecast.\n\n**Museums**\n\nFind 3 museums.');
  assert.strictEqual(P.readableAnswer('task', '```result\n## Forecast\n12°C with rain.\n```'), '## Forecast\n12°C with rain.');
  assert.strictEqual(P.readableAnswer('mem-update', 'Updated.\n```mem\n## Goal\n- Study (AI · basis: your request)\n## Decisions\n- Indoors 〔AI · basis: rain〕\n```'), 'Updated.\n\n## Goal\n- Study\n## Decisions\n- Indoors');
  const combined = '## Plan\n1. Museum\n\n```python\nprint(1)\n```';
  for (const kind of ['combine', 'resume', 'unknown']) assert.strictEqual(P.readableAnswer(kind, combined), combined);
  assert.strictEqual(P.readableAnswer('split', 'Unfinished.\n```tasks\nTitle: Only a title\n```'), 'Unfinished.\n\nTitle: Only a title');
  assert(split.includes('Needs: Goal'), 'original remains unchanged');
});

test('21. Memory diff ignores leading bullets and surrounding whitespace', () => {
  const P = WorkflowPrompts;
  assert.deepStrictEqual(P.diffMemory('## Goal\nStudy psychology\n## Preferences\n* Quiet room', '## Goal\n- Study psychology  \n## Preferences\nQuiet room'), []);
  assert.deepStrictEqual(P.diffMemory('## Goal\nOld goal', '## Goal\n- New goal'), [{ section: 'Goal', added: ['New goal'], removed: ['Old goal'] }]);
});

test('22. Four-section memories and old five-section memories coexist without rewriting raw text', () => {
  const P = WorkflowPrompts;
  assert.deepStrictEqual(P.SECTIONS, ['Goal', 'Preferences', 'Decisions', 'Open questions']);
  const fresh = P.emptyMemory('Legacy', 'Study');
  const legacy = fresh.replace('## Open questions', '## Current state\nOld status\n## Open questions');
  assert.strictEqual(P.parseMemory(legacy).sections['Current state'], 'Old status');
  assert.strictEqual(P.parseMemoryAnswer('```mem\n' + legacy + '\n```'), legacy);
  assert.strictEqual(P.parseMemoryAnswer('```mem\n' + fresh + '\n```'), fresh);
  assert(P.pickSections(legacy, ['Current state']).includes('Old status'));
  assert.strictEqual(P.readableMemory(legacy), '## Goal\nStudy');
  for (const text of [P.buildSplit(legacy, {}), P.buildMemUpdate(legacy, [])]) {
    assert(!text.includes('Current state'));
    assert(!text.includes('Old status'));
  }
  assert(P.TEXT.memStyle.includes('under 150 words'));
  assert(P.TEXT.memStyle.includes('not the content of answers'));
  const resume = P.buildResume(P.withProgress(legacy, { tasks: [], steps: [] }), '', {});
  assert(resume.includes('Continue from Progress.'));
  assert(resume.includes(P.PROGRESS_HEADING));
});

test('23. Empty placeholders are not memory content or changes', () => {
  const P = WorkflowPrompts;
  for (const placeholder of ['', '(none)', '- (none)', '* (none)']) {
    const old = '## Goal\n\n## Decisions\n' + placeholder + '\n## Preferences\n- (none)\n## Open questions\n';
    const next = old.replace('## Decisions\n' + placeholder, '## Decisions\n- A settled choice');
    assert.strictEqual(P.readableMemory(old), '## Goal\n');
    assert.deepStrictEqual(P.diffMemory(old, next), [{ section: 'Decisions', added: ['A settled choice'], removed: [] }]);
    assert.deepStrictEqual(P.diffMemory(next, old), [{ section: 'Decisions', added: [], removed: ['A settled choice'] }]);
  }
});

test('24. Prompt helpers load in a worker without DOM or CommonJS', () => {
  const context = { self: {} };
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../utils/workflow_prompts.js'), 'utf8'), context);
  const P = context.self.WorkflowPrompts;
  const memory = P.emptyMemory('Worker', 'Study');
  assert(P.buildMemUpdate(memory, []).includes('under 150 words'));
  assert(!P.buildMemUpdate(memory + '\n## Current state', []).includes('Current state'));
  assert(!P.buildSplit(memory + '\r\n## Current state\r\nOld state', {}).includes('Old state'));
});

console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
