# Round 2 Log: Memory Workflow Experiment

Test date: 2026-10-26
Model under test: ChatGPT & Google Gemini (/u/2)
Prompts tested: prompts_v2.md

---

## Step 1: Split (ChatGPT main chat)

### Prompt sent:
```
Split this project into at most 2 independent subtasks for separate fresh chats. Explain briefly, then end with one fenced block labeled tasks: tasks separated by a line ===, each with Title:, Task: (self-contained), Needs: (section names from: Goal, Preferences, Decisions, Current state, Open questions), Return: (what the hand-off must keep, including source links).

# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Decisions
(none)
## Current state
Just started.
## Open questions
Indoor or outdoor?
```

### Response (trimmed):
```
I split the project into two independent subtasks: transportation and feasibility and museum itinerary planning. Each can run in a fresh chat without relying on the other. Both should preserve sources, costs, and unresolved questions for the final plan.

```tasks
Title: Chicago Transportation & Budget Feasibility
Task: Plan transportation for a Saturday day trip to Chicago, returning home by 9 pm. No car is available, and the total trip budget is $80, including activities. Determine feasible travel options, schedules, costs, and local transit. Ask for the starting city and exact Saturday if necessary. Assess whether the trip is realistic, suggest alternatives if not, and calculate the remaining activity budget. Do not assume any transportation has been booked.
Needs: Goal, Preferences, Current state
Return: Feasible transportation options, departure and return times, estimated costs, remaining budget, feasibility concerns, unresolved questions, and direct source links to official schedules, fares, and booking pages.
===
Title: Chicago Museum Day Itinerary
Task: Design a Saturday museum-focused Chicago itinerary for a traveler without a car, with a total trip budget of $80 and a requirement to be home by 9 pm. Research museums, admission prices, Saturday opening hours, nearby affordable food, and public transit connections. Provide an indoor-focused itinerary and optional outdoor stops. Keep the plan adjustable because the starting city, travel times, exact Saturday, and transportation costs are not yet known. Do not assume the entire $80 is available for activities.
Needs: Goal, Preferences, Current state, Open questions
Return: Recommended museums, suggested visit sequence, estimated activity and meal costs, local transit details, timing assumptions, indoor/outdoor alternatives, unresolved questions, and direct source links to official museum websites, tickets, hours, and transit information.
```
```

### Parsing & Observations:
- Fenced block labeled `tasks`: Yes, parsed cleanly.
- Delimiter `===`: Present between tasks.
- Fields: Title, Task, Needs, Return are all present.
- Needs sections correctly extracted: Task 1 needs Goal, Preferences, Current state. Task 2 needs Goal, Preferences, Current state, Open questions.
- Explanation outside block was brief (3 sentences, ~45 words). Nothing followed the block.

---

## Step 2: Dispatch Subtasks (Task 1 on Gemini, Task 2 on ChatGPT)

### Task 1 on Gemini (/u/2)

#### Prompt sent:
```
You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so. In the result block keep every item listed in Return, with source links and what you could not verify.

# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Current state
Just started.

Title: Chicago Transportation & Budget Feasibility
Task: Plan transportation for a Saturday day trip to Chicago, returning home by 9 pm. No car is available, and the total trip budget is $80, including activities. Determine feasible travel options, schedules, costs, and local transit. Ask for the starting city and exact Saturday if necessary. Assess whether the trip is realistic, suggest alternatives if not, and calculate the remaining activity budget. Do not assume any transportation has been booked.
Return: Feasible transportation options, departure and return times, estimated costs, remaining budget, feasibility concerns, unresolved questions, and direct source links to official schedules, fares, and booking pages.

Output requirements: Keep the answer under 150 words outside the block. End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question.
```

#### Response (trimmed):
```
Planning a car-free Saturday day trip to Chicago within an $80 total budget requires essential starting location details. Because the starting city and target Saturday are missing, feasibility depends heavily on your point of origin.

If traveling from the greater Chicago metropolitan area via Metra commuter rail, the trip is highly realistic and budget-friendly thanks to flat-rate weekend passes, leaving ample funds for museum admissions. However, if starting from a regional hub like Milwaukee via Amtrak, regional transit fares consume roughly half the total budget, requiring free or low-cost cultural attractions. Local transit within Chicago is easily handled via the Chicago Transit Authority (CTA).

Below is the complete transportation assessment, schedule benchmarks, feasibility breakdown, and official links.

```result
Chicago Transportation & Budget Feasibility Assessment

1. Feasible Transportation Options:
- Local/Suburban Regional Rail (Metra): Best for suburban origins...
- Northwest Indiana Regional Rail (South Shore Line)...
- Intercity Passenger Rail (Amtrak Hiawatha)...
- Local Chicago Transit (CTA): "L" trains and buses...

2. Departure & Return Times (Representative Saturday Schedules):
- Metra: Departs ~7:30-8:30 AM; arrives ~8:30-9:30 AM. Return: departs ~6:40-7:30 PM, arrives home before 8:30 PM.

3. Estimated Costs:
- Scenario A (Metra): Metra Pass $7 + CTA Day Pass $5 = $12 total transit.
- Scenario B (Amtrak from Milwaukee): Amtrak RT ~$38-$50 + CTA $5 = ~$43-$55.

4. Remaining Activity Budget:
- Scenario A: $68.00 remaining (plenty for paid museums).
- Scenario B: ~$32.00 remaining (requires free/low-cost museums).

5. Feasibility Concerns: Origin distance (>90 min risks schedule), budget cushion, schedule frequency.
6. Unresolved Questions & Missing Inputs: Origin city/station, exact Saturday/date, IL residency status.
7. Direct Source Links: metra.com/fares, metra.com/schedules, transitchicago.com/fares/, mysouthshoreline.com, amtrak.com/hiawatha-service-train
8. Items Could Not Verify: Exact departure station, specific Saturday schedule, definitive regional ticket prices.
```
```

#### Observations (Gemini Task 1):
- Return items kept: Yes, all 8 requested categories were comprehensively addressed.
- Links kept: Yes, official direct URLs for Metra, CTA, South Shore Line, and Amtrak included.
- Anything after the block: None. Followed "Put nothing after it, no follow-up question." completely.
- Did +short work: Yes, text outside the block was ~85 words (well under 150 words).

---

### Task 2 on ChatGPT

#### Prompt sent:
```
You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so. In the result block keep every item listed in Return, with source links and what you could not verify.

# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Current state
Just started.
## Open questions
Indoor or outdoor?

Title: Chicago Museum Day Itinerary
Task: Design a Saturday museum-focused Chicago itinerary for a traveler without a car, with a total trip budget of $80 and a requirement to be home by 9 pm. Research museums, admission prices, Saturday opening hours, nearby affordable food, and public transit connections. Provide an indoor-focused itinerary and optional outdoor stops. Keep the plan adjustable because the starting city, travel times, exact Saturday, and transportation costs are not yet known. Do not assume the entire $80 is available for activities.
Return: Recommended museums, suggested visit sequence, estimated activity and meal costs, local transit details, timing assumptions, indoor/outdoor alternatives, unresolved questions, and direct source links to official museum websites, tickets, hours, and transit information.

Output requirements: Keep the answer under 150 words outside the block. End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question.
```

#### Response (trimmed):
```
Official sources confirm several free indoor stops, a $32 Art Institute option, and a $5 CTA day pass.

```result
Title: Chicago Museum Day Itinerary

Recommended museums (Saturday):
- Chicago Cultural Center: Free admission, open Saturdays 10:00 am - 5:00 pm.
- Museum of Contemporary Photography (MoCP): Free admission, open Saturdays 10:00 am - 5:00 pm.
- National Museum of Mexican Art (Pilsen): Free admission, open Saturdays 10:00 am - 5:00 pm.
- Smart Museum of Art (Hyde Park): Free admission, open Saturdays 10:00 am - 4:30 pm.
- Art Institute of Chicago: General admission $32 adult (non-Illinois resident), open Saturdays 11:00 am - 5:00 pm.

Suggested indoor-focused sequence:
- Option A (Zero-admission / Maximum budget cushion):
  10:00 am - 11:30 am: Chicago Cultural Center (Loop)
  11:45 am - 1:00 pm: Museum of Contemporary Photography (South Loop)
  1:15 pm - 2:30 pm: Lunch nearby (Loop / South Loop)
  2:45 pm - 4:45 pm: CTA Pink Line to Pilsen -> National Museum of Mexican Art
- Option B (Paid flagship museum):
  11:00 am - 3:00 pm: Art Institute of Chicago
  3:15 pm - 4:45 pm: Chicago Cultural Center

Estimated costs (one adult):
- Transit: $5.00 CTA 1-Day Pass.
- Admission: $0.00 (Option A) or $32.00 (Option B).
- Food: $15.00 - $25.00 (Taqueria Los Comales or Loop fast-casual).
- Total estimated activity day cost: $20.00 - $30.00 (Option A) or $52.00 - $62.00 (Option B).

Local transit:
- CTA 1-Day Pass: $5.00, unlimited rides on CTA buses and 'L' trains.

Optional outdoor stops:
- Millennium Park (Cloud Gate / Lurie Garden), Lurie Garden, Maggie Daley Park.

Timing assumptions: Arrival downtown by 9:30-10:00 am, depart downtown by ~6:30-7:00 pm to be home by 9:00 pm.
Unresolved questions: Traveler's exact starting point/transit arrival time; preference between flagship paid museum vs multiple free neighborhood museums; Illinois residency status.
Could not verify: Exact date of trip (special exhibitions may have surcharges).
Direct source links:
- Cultural Center: https://chicago.gov/city/en/depts/dca/supp_info/chicago_culturalcenter.html
- Contemporary Photography: https://www.mocp.org/visit/
- Mexican Art: https://nationalmuseumofmexicanart.org/visit
- Art Institute: https://www.artic.edu/visit
- CTA fares: https://www.transitchicago.com/fares/
- Millennium Park: https://chicago.gov/city/en/depts/dca/supp_info/millennium_park.html
```
```

#### Observations (ChatGPT Task 2):
- Return items kept: Yes, all items (museums, sequence, costs, transit, outdoor options, timing, unresolved questions, links) were included.
- Links kept: Yes, extensive official links to museums, transit, and parks.
- Anything after the block: None.
- Did +short work: Yes, text outside the block was only 18 words.

---

## Step 3: Memory Update (%mem-update in brand-new Gemini chat)

### Prompt sent:
```
Update the project memory using ONLY the old memory and the new material below; ignore anything else. Output only one fenced block labeled mem with the same headings. Mark each new decision with 〔AI · basis: …〕. If you remove an open question, add one line saying why. Leave everything else unchanged.

# Old Memory
# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Decisions
(none)
## Current state
Just started.
## Open questions
Indoor or outdoor?

# New Material
[Result blocks from Step 2: Task 1 and Task 2]
```

### Response (trimmed):
```
```mem
# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Decisions
- Focus primarily on indoor museum itineraries with optional outdoor park stops 〔AI · basis: New Material museum day itinerary designs and user museum preference〕
- Rely on public transit (CTA 1-Day Pass $5.00 for local travel plus Metra/Amtrak regional rail) 〔AI · basis: New Material transportation feasibility assessment〕
## Current state
Transportation feasibility and museum itinerary options identified (Option A: free museums; Option B: paid flagship museum like Art Institute); awaiting origin and date specifics.
## Open questions
- Removed "Indoor or outdoor?": Resolved by selecting an indoor museum focus based on museum itineraries and preferences.
- Starting city/station of origin?
- Exact Saturday/date of trip?
- Illinois residency status (impacts museum admission rates)?
- Preference between free neighborhood museums (Option A) vs. paid flagship museum (Option B)?
```

Would you like help choosing between the free neighborhood museums and the Art Institute?
```

### Parsing & Observations:
- Fenced block labeled `mem`: Present and parsed.
- Decisions tagged: Yes! Every new decision tagged with `〔AI · basis: …〕`.
- Removed questions explained: Yes! Added `- Removed "Indoor or outdoor?": Resolved by selecting an indoor museum focus based on museum itineraries and preferences.`
- Anything invented or dropped: No inventions. New open questions from subtasks cleanly integrated into Open questions.
- Sections kept: All 5 sections (Goal, Preferences, Decisions, Current state, Open questions) preserved with exact headers.
- Rule violation: Gemini added text after the block ("Would you like help choosing between..."), violating "Output only one fenced block labeled mem... Leave everything else unchanged." Candidate for %fix.

---

## Step 4: Resume (%resume in new ChatGPT chat)

### Prompt sent:
```
This is the memory of a project done in other chats. Decisions are settled; do not re-derive them. Continue from Current state.

# Project: Saturday day trip in Chicago
## Goal
Spend one Saturday in Chicago, back home by 9 pm.
## Preferences
No car; budget $80; likes museums.
## Decisions
- Focus primarily on indoor museum itineraries with optional outdoor park stops 〔AI · basis: New Material museum day itinerary designs and user museum preference〕
- Rely on public transit (CTA 1-Day Pass $5.00 for local travel plus Metra/Amtrak regional rail) 〔AI · basis: New Material transportation feasibility assessment〕
## Current state
Transportation feasibility and museum itinerary options identified (Option A: free museums; Option B: paid flagship museum like Art Institute); awaiting origin and date specifics.
## Open questions
- Starting city/station of origin?
- Exact Saturday/date of trip?
- Illinois residency status (impacts museum admission rates)?
- Preference between free neighborhood museums (Option A) vs. paid flagship museum (Option B)?

Make a timetable for the day.

Output requirements: Keep the answer under 150 words.
```

### Response (trimmed):
```
Provisional schedule · Option A: Free museums · Chicago time

Time       Activity
9:30 AM    Arrive in downtown Chicago by train
10:00 AM   Chicago Cultural Center — free art exhibitions
11:15 AM   Millennium Park — optional outdoor stop
12:00 PM   Budget lunch ($15)
12:45 PM   CTA toward Pilsen
1:30 PM    National Museum of Mexican Art — free admission
3:30 PM    Return toward downtown station
4:30 PM+   Regional train home, arriving by 9 PM

Budget: $5 CTA pass + $15 lunch = $20, leaving $60 for round-trip regional rail.
To finalize: What Saturday are you traveling, and from which city or station? The train schedule determines whether the 9 PM return is feasible.
```

### Observations:
- Continued vs re-derived: It continued cleanly from Current state, utilizing Option A without re-arguing transit or indoor preference.
- Settled decisions respected: Kept transit (CTA pass + train), kept indoor museums with optional outdoor stop, stayed within $80 budget.
- Open questions handled: Only prompted for the genuinely unsettled parameters (starting city/station, exact Saturday).
- Word count: ~90 words (followed the under 150 words requirement).




