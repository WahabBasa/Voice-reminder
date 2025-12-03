# Claude Development Guide - Todoist Agent Backend

## 🚀 Quick Start - READ THESE FIRST
1. **Project Overview**: Read `README.md` for complete architecture, tech stack, and directory structure
2. **Recent Context**: Check latest devlog in `updates/` folder for recent debugging sessions and lessons learned
3. **MCP Tools Ready**: GitHub integrations are working (see devlog 2025-08-01 for setup details)
4. **Documentation Research**: Always use the docs-researcher subagent for any documentation lookup or research tasks

## 📁 Key File Locations
- **Main Project**: `C:\Users\AtheA\Desktop\Personal_Programs\todoist-agent-backend` (current directory)
- **Active Project**: `C:\Users\AtheA\Desktop\Personal_Programs\todoist-agent-backend\ea-ai-main2\ea-ai-main2\` (React 19 + TypeScript frontend with Convex backend)
- **Backend**: `C:\Users\AtheA\Desktop\Personal_Programs\todoist-agent-backend\ea-ai-main2\ea-ai-main2\convex\` folder (Convex functions, schema, agents)
- **Devlogs**: `updates/YYYY-MM-DD_devlog.md` (debugging history and lessons learned)


## 🔍 Pre-Development Routine Checks

**STARTUP ROUTINE - ALWAYS CHECK CURRENT DATE FIRST:**
1. **Check Current Date** - Run `date` command (returns format like "Mon, Aug 18, 2025 12:40:05 PM") to verify today's date before any other action
2. **Check Today's Devlog** - Look for devlog matching today's date in `updates/` folder (format: YYYY-MM-DD_devlog.md)
3. **Create Today's Devlog if Missing** - If no devlog exists for today, create empty file `updates/YYYY-MM-DD_devlog.md` and inform user
4. **Review README Architecture** - Understand current system state
5. **Read CSS Design System Files** - Always read these files COMPLETELY for design system context:
   - `ea-ai-main2/ea-ai-main2/src/index.css` - **READ FULL FILE** - Main CSS configuration (Tailwind v4 @theme, ChatGPT grey theme, border radius system, typography)
   - `ea-ai-main2/ea-ai-main2/postcss.config.js` - PostCSS/Tailwind processing pipeline
6. **Project Structure Analysis** - Use standard tools for project structure analysis
7. **Architecture Alignment** - Ensure changes fit the React → Convex → AI SDK flow
8. **Check Someday Tasks** - Review `personal/someday/todolist.md` for conditional tasks that may now be ready

**For Feature Development:**
1. **Plan with TodoWrite** - Break features into logical, manageable tasks
2. **Validate Implementation** - Ensure each change works independently  
3. **Check Dependencies** - Map component and system dependencies before coding

**📚 Code Analysis & Documentation Research Protocol:**
- **Standard Tools**: Use Read, Grep, Glob, LS tools for code analysis and understanding
- **Documentation Research**: Use WebFetch for framework APIs, Read for local documentation files
- **Clear Tool Selection**:
  - **Code Analysis**: Read, Grep, Glob for understanding project structure and code
  - **External Documentation**: WebFetch for framework APIs (React, Convex, TailwindCSS, etc.)
  - **Configuration**: Read for package.json, config files, documentation

**Quality Assurance:**
1. **Code Analysis First** - Use standard tools to understand code structure and relationships before making changes
2. **File Location Verification** - Confirm working in correct project directory
3. **Schema Compatibility** - Check schema impacts in `convex/schema.ts`
4. **Frontend Integration** - Trace component dependencies using Grep and Read tools

**Breaking Features into Tasks:**
- **Small, Focused Changes** - Each task should have a single, clear purpose
- **Logical Dependencies** - Plan tasks that build on each other naturally
- **Independent Testing** - Each change should be testable on its own

## 📝 Devlog Writing Guidelines

**Writing Style: Semi-Formal Technical Documentation**
- Write as a senior engineer documenting their work session
- Use conversational but professional tone (avoid slang, maintain technical precision)
- Balance readability with technical depth

**Entry Structure (Required Elements):**
1. **Header**: `## Session Title - (HH:MM)` with clear description
2. **Status Line**: `**Status**: ✅/⚠️/❌ One-line summary of outcome`
3. **Context** (optional for small changes): Brief problem statement or goal
4. **Changes Made**: Bullet points with file paths and line numbers (`file.ts:42-56`)
5. **Result**: What works now that didn't before

**Length Guidelines - Scale with Work Done:**
- **Quick fixes** (5-15 lines): Single issue, file change, result
- **Feature work** (20-35 lines): Multiple files, architectural decisions, testing notes  
- **Major sessions** (35-40 lines MAX): Complex integrations, migrations, full context
- **Never exceed 40 lines** - split into separate entries if needed

**Technical Specificity Requirements:**
- ✅ Always include file paths: `convex/auth/admin.ts:24-30`
- ✅ Reference actual code patterns: "Added `ENABLE_DEBUG_LOGS` env var"
- ✅ Explain architectural decisions: Why this approach vs alternatives
- ✅ Document debugging process: What failed, what worked, lesson learned
- ❌ Avoid vague descriptions: "fixed bug", "updated code", "made changes"

**Tone Examples:**

**Too Informal (Avoid):**
```
Yo so I was messing around with the logs and they were super annoying lol. 
Fixed it tho - just threw in some if statements and boom, clean terminal! 🎉
```

**Semi-Formal (Target):**
```
Cleaned up repetitive backend logging that was cluttering terminal output. 
Added ENABLE_DEBUG_LOGS environment variable to gate debug logs across 
conversations.ts, auth/admin.ts, and stream.ts. Terminal output reduced 
from ~30 lines to ~8 lines per message while preserving error visibility.
```

**Too Formal (Avoid):**
```
This session involved the implementation of a comprehensive logging 
reduction strategy utilizing environment-based conditional execution 
patterns to minimize console verbosity whilst maintaining operational 
visibility of critical system errors and warnings.
```

**Writing Process:**
1. Start with what you tried to accomplish
2. Document exact changes made (files + line numbers)
3. Note results and any remaining issues
4. Keep it digestible - reader should grasp it in < 60 seconds
5. Match length to actual work done (don't pad, don't over-compress)

**Real Examples by Length:**

**Quick Fix (5-15 lines):**
```markdown
## Backend logging cleanup (15:52)

**Status**: ✅ Clean, focused terminal showing only active chat execution

Removed verbose debug logs cluttering terminal output:
- `📚 [BACKEND DEBUG]` conversation fetching logs (conversations.ts)
- `🔄 [BACKEND DEBUG]` migration check logs (conversations.ts)
- `🔐 [Admin]` auth check logs (auth/admin.ts:24-30)
- `[STREAM][chunk:first]` and `[STREAM][persist_attempt]` noise (stream.ts:471-482)
- `[TELEMETRY][OAUTH]` page load logs (http.ts:246-260)

Added `ENABLE_DEBUG_LOGS` environment variable to gate debug logs across all files.
Terminal output reduced from ~30-40 lines to ~8-12 lines per message while 
preserving error visibility.
```

**Feature Work (20-35 lines):**
```markdown
## OAuth Authentication & API Context Fixes (11:30)

**Status**: ✅ Both OAuth and API integration issues resolved

### Problem & Solution
Faced two blocking issues preventing Todoist integration:
1. **OAuth Error**: "User not authenticated" during callback - serverless auth gap
2. **API Context Error**: "Cannot read properties of undefined" - action/query mismatch

### Implementation
**OAuth Fix**: Used OAuth `state` parameter to bridge authentication across redirect.
- `convex/todoist/auth.ts:generateOAuthURL` - Encoded userId into state (`userId_random`)
- `convex/todoist/auth.ts:storeTodoistTokenForUser` - Created mutation accepting userId
- `convex/todoist/auth.ts:exchangeCodeForToken` - Decode userId from state, call storage
- `convex/http.ts:64` - Updated route from `runMutation` to `runAction`

**API Context Fix**: Separated actions (external calls) from queries (database ops).
- `convex/todoist/auth.ts:getTodoistTokenForUser` - Created internal query
- `convex/todoist/api.ts:todoistRequest` - Fixed to use `ctx.runQuery()` pattern
- Added TypeScript annotations to resolve compilation errors

### Result
Complete OAuth → Token Storage → API Integration flow working. Live tested with 
task creation across projects, priority setting, and real-time AI tool execution.

**Insight**: OAuth `state` parameter technique essential for serverless architectures 
where session state doesn't persist across redirects.
```

**Major Session (35-40 lines MAX):**
```markdown
## Schema Migration & User Activity Tracking (Evening)

**Status**: ✅ Migrated to Firebase-only schema with comprehensive analytics

### Schema Evolution
Migrated from mixed Clerk/Firebase to clean Firebase-only architecture. Old schema 
at `convex/schema.ts:5-17` had legacy `clerkId`, `firstName`, `lastName` fields 
we weren't using after Firebase migration.

Two-phase approach: made fields optional for migration, cleaned old data via dashboard, 
then enforced clean schema. New structure: `firebaseUid`, `displayName`, `photoUrl`, 
`email` with proper indexes `by_firebase_uid` and `by_email` at lines 16-17.

### User Activity Analytics
Built comprehensive tracking without exposing private messages. New `userActivity` 
table in `convex/schema.ts:27-45` captures:
- `totalMessages`, `totalToolCalls` - engagement metrics
- Todoist operations: `todosCreated`, `todosCompleted`, `todosUpdated`, `todosDeleted`
- Preferred AI model usage patterns
- Daily activity tracking with automatic resets

### Implementation Details
Added `updateUserActivity` mutation at `convex/agents.ts:115-181` called after each 
conversation. Intelligently counts tool usage by parsing `result.toolCalls` array 
and categorizing by tool name. Extracts from `result.toolCalls?.map(call => 
call.toolName)` at line 456 and filters by specific types like `createTask`, 
`completeTask`.

Created `getUserActivitySummary` query at `convex/agents.ts:99-112` returning 
activity sorted by last active. Dashboard now shows productivity metrics instead 
of private conversations.

User creation logic at `convex/agents.ts:32-66` handles Firebase identity extraction 
and creates/updates user records seamlessly. Each conversation isolated by `userId` 
(Firebase UID) with aggregate analytics maintaining privacy.

### Architecture Impact
Removed all Clerk dependencies and indexes. System now production-ready with proper 
user separation and meaningful usage insights without compromising privacy.
```

## 🔧 Code Analysis Tools - Standard Development Workflow

**Primary Code Analysis**: Use standard Claude Code tools for understanding and modifying the codebase.

### Core Development Tools
- **`Read`** - Read specific files with line number support
- **`Glob`** - Find files by pattern (e.g., `**/*.tsx`, `src/**/*.ts`)
- **`Grep`** - Search for patterns in code with regex support
- **`LS`** - List directory contents and navigate project structure
- **`Edit`** - Make precise edits to files
- **`MultiEdit`** - Make multiple edits to a single file
- **`Bash`** - Run development commands and scripts

### Tool Selection Guidelines
**✅ Use Standard Tools For:**
- Understanding project architecture and code structure
- Finding and editing functions, classes, methods
- Analyzing code relationships and dependencies  
- Refactoring and precise code modifications
- Configuration files (package.json, tailwind.config.js, etc.)
- Text-based content (README.md, devlogs, etc.)
- Build outputs and logs

**✅ Use External Tools For:**
- External documentation (WebFetch for React docs, Convex docs, etc.)
- Framework API references and guides

### Efficient Workflow Pattern
1. **Start with Structure**: Use `LS` to understand project layout
2. **Find Files**: Use `Glob` to locate relevant files by pattern
3. **Search Content**: Use `Grep` to find specific code patterns or functions
4. **Read & Analyze**: Use `Read` to examine specific files
5. **Make Changes**: Use `Edit` or `MultiEdit` for precise modifications

## 📋 Development Planning Examples

### Example 1: Adding New AI Agent Capability
```
Feature: Add task priority management to AI agent
Goal: Users can set/update task priorities via natural language

Task Sequence:
  Task 1: Add priority field to Convex schema + migration
  Task 2: Update AI agent tools to handle priority operations  
  Task 3: Add priority UI components to React frontend
  Task 4: Add tests and error handling

Why this works: Each task builds logically on the previous ones
```

### Example 2: Backend + Frontend Integration
```
Feature: Add task categories functionality
Goal: Organize tasks by custom categories

Task Sequence:
  Task 1: Backend - Add categories to Convex schema + CRUD functions
  Task 2: Backend - Update AI agent to recognize category commands
  Task 3: Frontend - Add category selection UI in React app
  Task 4: Integration - Connect frontend category UI to backend API

Why this works: Backend foundation established before frontend implementation
```

## 🏗️ Project Architecture (Summary from README)
```
React Frontend → Convex Backend → Claude AI (Anthropic SDK) → Convex Database
                      ↓
            Real-time Updates & Authentication
```

## 🔧 Debugging Guidelines (From Devlogs)
- **Component Loading Issues**: Always verify which files are actually loaded by the React router
- **TypeScript Compilation**: Check for smart quotes and Unicode characters breaking builds
- **MCP Connection Issues**: Use CMD.exe wrapper for Windows path resolution
- **AI SDK Integration**: Ensure proper message format for CoreMessage interface

## 🔒 User Base & Security Monitoring

**User Detection Trigger:**
- **Monitor Devlogs**: Check `updates/` for mentions of "users", "signups", "payments", or user metrics
- **When Users Detected**: Review `personal/someday/todolist.md` for security-sensitive tasks
- **Security Protocol**: Any browser automation or advanced tooling requires security review first

**AgentDeskAI Setup Trigger:**
- **Condition**: Application has confirmed paying users (documented in devlogs)
- **Action Required**: 
  1. Run security audit on current codebase
  2. Review browser automation security implications
  3. Test AgentDeskAI MCP in isolated environment
  4. Set up with: `claude mcp add browser-tools npx -- @agentdeskai/browser-tools-mcp@1.2.0`

## 📚 Reference Links
- **README.md** - Complete project documentation
- **updates/** - Historical debugging context and lessons learned
- **ea-ai-main2/ea-ai-main2/convex/schema.ts** - Database schema (users, tasks, projects, conversations)

---
*This guide organizes existing documentation - always refer to README.md for complete details*

**Last Updated**: September 12, 2025 - Simplified to use standard development tools

**PROGRAMMING PROBLEM-SOLVING GUIDE FOR CLAUDE (120 Lines)**

**CORE PRINCIPLE: Never code until you understand the real mechanism**

This guide follows how the author actually solved the cheating hangman problem, showing the messy reality of problem-solving rather than idealized steps.

**PHASE 1: FROM VAGUE IDEA TO CONCRETE UNDERSTANDING**

**The Author's Journey - Discovering the Real Problem:**

The author started with a vague idea: "I'll choose an initial puzzle word and hang on to that as long as Player 2 chooses letters that aren't in that word. Once Player 2 hits a letter in the word, I'll switch to another word." This seemed reasonable but was too abstract to implement.

**Key Insight: When you have a vague mechanism, work concrete examples FIRST**

Instead of coding, the author worked through a paper simulation: "I'm going to work through an example on paper, taking on the role of Player 1, working from a word list." He used a simple 3-letter word list (bat, car, dot, eat, pit, saw, tap, top) and manually played through letter guesses.

**The Paper Exercise Revealed Flaws:**
- If Player 2 guesses 'b': only eliminates one word (bat)
- If Player 2 guesses 'a': saying "no" eliminates 5 words (bat, car, eat, saw, tap), saying "yes" leaves 5 words but requires showing position

**The Breakthrough Moment:**
Through this manual process, the author realized: "I have been thinking about cheating in the wrong way. I should never actually pick a puzzle word, even temporarily, but just keep track of all the possible words I could choose."

**Redefining the Problem:**
Original: "Switch between words when hit"
Actual: "Keep as many words as possible in the list of candidate puzzle words"

**PHASE 2: STRATEGIC PLANNING AFTER UNDERSTANDING**

**The Author's Approach - Listing Required Operations:**

Only after understanding the real mechanism could the author list specific operations:
1. Store and maintain a list of words
2. Create sublist of words of given length  
3. Track letters chosen
4. Count words where letter does not appear
5. Determine largest number of words based on letter and position
6. Create sublist matching a pattern
7. Keep playing until game over

**Notice: These weren't guessed - they emerged from understanding the mechanism**

**Making Design Decisions Explicit:**

The author documented reasoning for each choice:
- **Word storage**: `list<string>` because "no random access needed, don't know initial size, reducing frequently, string methods useful"
- **Letter tracking**: `bool array[26]` because "conceptually a set - letter chosen or not"  
- **Patterns**: `list<int>` for simplicity, storing positions where letter appears

**Key Decision: Prototype vs Final:**
"I'm going to allow myself to begin coding for the prototype at any time, but not allow any coding in the final solution until I believe my design is set."

**PHASE 3: SYSTEMATIC EXECUTION - THE AUTHOR'S CODING JOURNEY**

**Started With What He Knew:**
"I'm already familiar with reading text files in C++, but if I weren't, I would write a small test program just to play around with that skill first." He began with `readWordFile()` - familiar file I/O.

**Built Verification Tools:**
"This isn't on my required list of operations... but it's a good way to test whether my readWordFile function is working correctly." He wrote `displayList()` purely for testing.

**Used Same Patterns Repeatedly:**
The author recognized and reused the basic list traversal pattern:
```cpp
list<string>::const_iterator iter;
iter = wordList.begin();
while (iter != wordList.end()) {
    // do something with *iter
    iter++;
}
```

**Handled Complexity Through Division:**
For the hardest operation (finding most frequent pattern), he divided it:
1. First wrote `numberInPattern()` to check if position in pattern
2. Then `matchesPattern()` to test if word matches pattern  
3. Finally `mostFreqPatternByLetter()` combining the pieces

**Built Incrementally:**
Instead of writing the full game loop, he "reduced the problem by making some variables into constants" and built a simpler version first.

**APPLYING THIS APPROACH TO OTHER PROBLEMS:**

**Example: Building a Code Deployment System**

**Vague Starting Point**: "Build system that deploys code safely"

**Paper Exercise**: Manually trace through deployment steps - what happens when deployment fails halfway? How do you rollback? What about database migrations? Work through 3-4 failure scenarios by hand.

**Real Problem Emerges**: "Maintain system state consistency during multi-step deployment with automated rollback"

**Operations List**: 
- Backup current version
- Run pre-deployment checks  
- Deploy in stages with health checks
- Rollback mechanism for each stage
- Coordinate database migrations
- Handle partial failure states

**Start With Known**: Basic file copying and process execution before complex orchestration logic.

**Example: Real-Time Collaborative Editor**

**Vague Starting Point**: "Multiple people edit same document simultaneously"

**Paper Exercise**: Two people editing same sentence - who wins? What if they edit different paragraphs? Trace through character insertion/deletion conflicts manually.

**Real Problem Emerges**: "Transform operations so they can be applied in any order while maintaining document consistency"

**Operations List**:
- Capture text operations (insert/delete)
- Transform operations against concurrent changes
- Broadcast operations to connected clients
- Handle client disconnections mid-edit
- Resolve conflicts deterministically

**Start With Known**: Basic text operations and WebSocket connections before operational transformation algorithms.

**THE AUTHOR'S KEY INSIGHT:**

"At this point, though, this would be difficult because I don't know what the program will actually do to accomplish the cheating. I need to investigate this area further."

**When you don't understand the core mechanism, you cannot plan the subtasks. Always work concrete examples until the mechanism becomes clear, then plan systematically.**

This is how real problem-solving works - messy exploration leading to clear understanding, then systematic execution.