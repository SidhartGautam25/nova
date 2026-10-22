Nova & NVM Systems Architecture: Progressive Engineering Roadmap

This document outlines the architectural evolution of the Nova language and Nova Virtual Machine (NVM) from a simple single-file static compiler into a true systems-level programming environment aligned with C, physical CPU hardware, and the JVM.

High-Level Vision: The Architectural Evolution
CURRENT DESIGN                          TARGET SYSTEMS DESIGN
┌───────────────────────────────┐       ┌─────────────────────────────────────────────────────────┐
│ Global Static Variables       │       │ Stack Frames / Activation Records (FP & SP)            │
│ VAR_0: .FILL #0               │ ───►  │ LDR R0, R5, #-1 (Local variable relative to frame)     │
└───────────────────────────────┘       └─────────────────────────────────────────────────────────┘
┌───────────────────────────────┐       ┌─────────────────────────────────────────────────────────┐
│ Flat Single Routine           │       │ Standard ABI Calling Convention (Caller/Callee Saved)   │
│ Inlined execution only        │ ───►  │ JSR / RET, parameter passing, return address on stack  │
└───────────────────────────────┘       └─────────────────────────────────────────────────────────┘
┌───────────────────────────────┐       ┌─────────────────────────────────────────────────────────┐
│ Value-only Expressions        │       │ Pointers & Uniform Virtual Addressing                   │
│ Only primitive integers       │ ───►  │ Address-of (&), Dereference (*), Base+Offset (LDR/STR)  │
└───────────────────────────────┘       └─────────────────────────────────────────────────────────┘
┌───────────────────────────────┐       ┌─────────────────────────────────────────────────────────┐
│ Static Memory Only            │       │ Memory Segmentation & Heap Allocator                    │
│ Fixed words at compile time   │ ───►  │ .text, .data, Heap (sbrk/malloc), Stack (high to low)   │
└───────────────────────────────┘       └─────────────────────────────────────────────────────────┘
┌───────────────────────────────┐       ┌─────────────────────────────────────────────────────────┐
│ Direct AST -> Assembly        │       │ 3-Address Code Intermediate Representation (IR)         │
│ Memory push/pop per operator  │ ───►  │ SSA / Quadruples + Register Allocation (R0-R4)          │
└───────────────────────────────┘       └─────────────────────────────────────────────────────────┘
Phase 1: Stack-Allocated Locals & Activation Records (The Frame Pointer)
The Problem in Current Nova

Currently, variables are placed in the .data segment as static global labels:

asm
VAR_0: .FILL #0
VAR_1: .FILL #0
Consequence: Variables live forever at a fixed address.
Block scoping is impossible (variables in separate {} collide).
Recursion is impossible (a function calling itself overwrites its own caller's variables).
The Real-World Design (C / x86 / ARM)

Real languages allocate local variables inside an Activation Record (Stack Frame) on the call stack.

High Memory (0xFF00)
    ┌──────────────────────────┐
    │ Caller's Stack Frame     │
    ├──────────────────────────┤
    │ Saved Frame Pointer (R5) │ <── Current Frame Pointer (R5)
    ├──────────────────────────┤
    │ Local Variable 0         │  (R5 - 1)
    ├──────────────────────────┤
    │ Local Variable 1         │  (R5 - 2)
    ├──────────────────────────┤
    │ Temporary Evaluation     │
    ├──────────────────────────┤
    │ ...                      │ <── Current Stack Pointer (R6)
Low Memory (grows downwards)
How to Implement in Nova (Small-Scale Step)

NVM already has the required instructions:

LDR DR, BaseR, offset6 (Read word at BaseR + offset)
STR SR, BaseR, offset6 (Write word at BaseR + offset)
Assign Registers:
R6: Stack Pointer (SP) — tracks top of active stack.
R5: Frame Pointer (FP) — anchors the current function/block frame.
Prolog (Entering a block or function):
asm
; Save previous Frame Pointer on stack
ADDI R6, #-1
STR R5, R6, #0
; Set new Frame Pointer to current SP
ADD R5, R6, #0
; Reserve space for N local variables
ADDI R6, #-2        ; (e.g., for 2 locals)
Variable Access: Instead of LD R0, VAR_0, emit:
asm
LDR R0, R5, #-1     ; Read local variable 0
STR R0, R5, #-1     ; Write local variable 0
Epilog (Leaving a block or function):
asm
; Collapse locals (SP = FP)
ADD R6, R5, #0
; Restore old Frame Pointer
LDR R5, R6, #0
ADDI R6, #1
Phase 2: Calling Convention & Subroutines (The ABI)
The Real-World Design

In C (System V ABI) and Java (JVM call frames), a function call follows a strict contract between the caller and the callee:

Responsibility	Action
Caller	Evaluates arguments and places them in designated registers (R0–R2) or pushes them onto the stack.
Call Instruction	Emits JSR / JSRR (or LD R7, return_label; BRnzp function_label), saving the return address into R7.
Callee	Saves R7 (return address) and R5 (caller's frame pointer) onto the stack. Allocates local frame.
Return	Places the return value in R0. Restores R5 and R7, then executes RET (JMP R7).
Concrete Implementation for NVM
asm
; --- CALLER SITE ---
; 1. Pass arguments into R0, R1
LOADI R0, #42
; 2. Call function
LD R7, RETURN_ADDR_0
BRnzp MY_FUNCTION
RETURN_ADDR_0:
; Result is now in R0!
; --- CALLEE SITE (MY_FUNCTION) ---
MY_FUNCTION:
    ; 1. Save Return Address and Old Frame Pointer
    ADDI R6, #-1
    STR R7, R6, #0      ; Stack: return address
    ADDI R6, #-1
    STR R5, R6, #0      ; Stack: old FP
    ADD R5, R6, #0      ; FP = SP
    ; 2. Function Body...
    ; (Computes result into R0)
    ; 3. Epilog & Return
    ADD R6, R5, #0      ; SP = FP
    LDR R5, R6, #0      ; Restore old FP
    ADDI R6, #1
    LDR R7, R6, #0      ; Restore return address
    ADDI R6, #1
    JMP R7              ; Return to caller!
Phase 3: Memory Layout & Pointers (Virtual vs Physical Address Space)
Virtual vs Physical Addressing in NVM

In a real computer:

Physical Address: The actual silicon transistor bus address on RAM chips.
Virtual Address: The address space mapped by the OS page tables / MMU.

In our project:

NVM Physical Memory: The JavaScript Uint16Array(65536) buffer.
NVM Virtual Memory: The 16-bit word addresses 0x0000 to 0xFFFF.
Memory Map Architecture

To prevent collisions, memory should be partitioned into standard segments:

0xFFFF ┌──────────────────────────────────────────────┐
       │ Hardware Reserved / Trap Vectors             │
0xFF00 ├──────────────────────────────────────────────┤ <── STACK TOP
       │ CALL STACK (Grows downward: FP, SP)          │
       │                                              │
       │                      ▼                       │
       ├ - - - - - - - - - - - - - - - - - - - - - - -┤
       │                      ▲                       │
       │                                              │
0x8000 ├──────────────────────────────────────────────┤ <── HEAP BASE
       │ DYNAMIC HEAP (Grows upward: malloc/free)     │
       ├──────────────────────────────────────────────┤
       │ STATIC DATA (.data / .rodata / strings)      │
0x3000 ├──────────────────────────────────────────────┤ <── CODE ORIGIN
       │ PROGRAM CODE (.text)                         │
0x0000 └──────────────────────────────────────────────┘
Implementing C-Style Pointers in Nova

A pointer is simply an integer variable holding an address. Because NVM is a word-addressed 16-bit machine:

Address-Of Operator (&x):
asm
; &x is calculated by doing arithmetic on R5!
ADD R0, R5, #-1     ; R0 now holds the address of x
If x is a stack variable at FP - 1:
Dereference Operator (*ptr):
asm
LDR R1, R5, #-2     ; Load pointer address into BaseR R1
LDR R0, R1, #0      ; Load value AT that address into R0 (*ptr)
Given a pointer in variable p:
Store Through Pointer (*ptr = value):
asm
LDR R1, R5, #-2     ; R1 = pointer address
STR R0, R1, #0      ; Memory[R1] = value

NVM already possesses all hardware primitives (LDR, STR) to support direct pointer mechanics.

Phase 4: Dynamic Heap Memory Management (malloc & free)

In C, memory that must outlive the current stack frame is allocated on the heap.

Step 1: Kernel Trap for Memory Expansion (sbrk)

Add a new software interrupt to nvm/src/traps.js:

TRAP x26 (SBRK):
Input: R0 = Number of words requested.
Action: Returns the previous heap_break in R0 and advances heap_break += requested.
Throws an out-of-memory error if heap_break collides with SP (R6).
Step 2: The Bump (Arena) Allocator

A simple bump allocator can be implemented in ~15 lines of assembly:

asm
; malloc(size in R0) -> returns pointer in R0
MALLOC:
    LD R1, HEAP_CURRENT_PTR
    ADD R2, R1, R0          ; New heap top
    ST R2, HEAP_CURRENT_PTR
    AND R0, R1, R1          ; Return original base in R0
    RET
Phase 5: Intermediate Representation (IR) & Register Allocation
The Problem Today

Currently, the compiler lowers AST nodes directly to assembly. For an expression like let total = (a + b) - c:

asm
generateExpression(a)  -> R0
pushR0()               -> STR R0, R6, #0 (Memory write)
generateExpression(b)  -> R0
popR2()                -> LDR R2, R6, #0 (Memory read)
ADD R0, R2, R1
pushR0()               -> STR R0, R6, #0 (Memory write)
...

Every intermediate arithmetic operation touches physical RAM via stack spills.

The Real-World Design (3-Address Code / SSA)

Modern compilers (LLVM, GCC, HotSpot) insert an intermediate representation:

AST ──► IR (3-Address Code) ──► Optimization ──► Register Allocation ──► Assembly
Example 3-Address Code (3AC) Quadruples:
t0 = a + b
t1 = t0 - c
total = t1
Register Allocation (Virtual t_n to Physical R0–R4):
Liveness Analysis: Detects that t0 dies immediately after t1 is computed.
Assignment:
t0 
→
→ R0
t1 
→
→ R1
c 
→
→ R2
Emitted Assembly:
asm
LDR R0, R5, #-1       ; Load a
LDR R1, R5, #-2       ; Load b
ADD R0, R0, R1        ; R0 = a + b (in register!)
LDR R2, R5, #-3       ; Load c
NOT R2, R2
ADDI R2, #1
ADD R0, R0, R2        ; R0 = (a + b) - c (in register!)
STR R0, R5, #-4       ; Store into total
Zero stack spills occurred, executing in a fraction of CPU cycles.
Incremental Implementation Checklist

To build this systematically without breaking existing functionality, tackle each milestone in sequence:

[ ] Milestone 1: Stack Frame Architecture
    ├── Define R5 (FP) and R6 (SP) conventions
    └── Convert VariableDeclaration & IdentifierExpression from static VAR_n to LDR/STR relative to R5
[ ] Milestone 2: Function Call Subroutines & ABI
    ├── Add function declaration syntax: make fun name(arg1, arg2) { ... }
    ├── Implement function calls with return address tracking via R7
    └── Support recursive function execution on the call stack
[ ] Milestone 3: Pointers & Address Operators
    ├── Add '&' (address-of) and '*' (dereference) expressions
    └── Lower pointers to LDR/STR base register operations
[ ] Milestone 4: Heap Memory Management
    ├── Add SBRK TRAP x26 in NVM
    └── Build runtime malloc() memory allocation
[ ] Milestone 5: 3-Address Code IR & Register Allocator
    ├── Lower AST to linear quadruple instructions
    └── Assign registers R0-R4 dynamically to eliminate stack pushing/popping