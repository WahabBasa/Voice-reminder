# Implementation Spec: Repeat Task Modal & Sound Repeat Modal

## Overview

Create two new modal components based on the reference UI (To-do List app screenshot):
1. **RepeatTaskModal** - for setting reminder recurrence (replaces the current Alert-based picker)
2. **SoundRepeatModal** - for setting how many times the notification sound repeats

Both modals should match the visual style of the existing `DatePickerModal` component.

---

## Reference UI (from screenshot)

```
┌─────────────────────────────────────────────┐
│  Set as Repeat Task                    [ON] │
├─────────────────────────────────────────────┤
│  [Hour] [Daily] [Weekly] [Monthly*] [Yearly]│
│                                             │
│  Repeat every              1 Month ▼        │
│  Repeat on                 Day 4 ▼    🔒    │
│  Repeat ends at            Endlessly ▼      │
│                                             │
│                     CANCEL        DONE      │
└─────────────────────────────────────────────┘
```

---

## Task 1: Create RepeatTaskModal Component

### File: `components/RepeatTaskModal.tsx`

### Props Interface
```typescript
type RepeatTaskModalProps = {
  visible: boolean;
  initialEnabled?: boolean;
  initialFrequency?: "hour" | "daily" | "weekly" | "monthly" | "yearly";
  initialRepeatEvery?: number;  // e.g., 1 = every 1 month, 2 = every 2 months
  initialRepeatOn?: number;     // day of month (1-31) or day of week (0-6)
  initialRepeatEnds?: "endlessly" | "date" | "count";
  initialEndDate?: Date | null;
  initialEndCount?: number;
  onConfirm: (data: {
    enabled: boolean;
    frequency: "hour" | "daily" | "weekly" | "monthly" | "yearly";
    repeatEvery: number;
    repeatOn: number | null;
    repeatEnds: "endlessly" | "date" | "count";
    endDate: Date | null;
    endCount: number | null;
  }) => void;
  onCancel: () => void;
};
```

### UI Structure

1. **Header Row**
   - Left: "Set as Repeat Task" label
   - Right: Toggle switch (use React Native `Switch` component)
   - When toggle is OFF, all options below should be grayed out / disabled

2. **Frequency Chips Row**
   - Horizontal row of pill buttons: `Hour`, `Daily`, `Weekly`, `Monthly`, `Yearly`
   - Selected chip: blue background (`#4285f4`), white text
   - Unselected chips: gray background (`#f5f5f5`), gray text (`#616161`)
   - Border radius: 20px for pill shape

3. **Settings Rows** (same style as DatePickerModal)
   - **"Repeat every"** row
     - Shows dropdown value on right (e.g., "1 Month", "2 Weeks")
     - On press: show Alert picker with options 1-12 for the selected frequency unit
   - **"Repeat on"** row (only show for Weekly/Monthly)
     - Weekly: show day of week picker (Sun-Sat)
     - Monthly: show day of month picker (1-31)
     - Include lock icon if this is a premium feature (optional)
   - **"Repeat ends at"** row
     - Options: "Endlessly", "On date...", "After X occurrences"
     - On press: show Alert picker

4. **Action Buttons**
   - Right-aligned: `CANCEL` (gray) and `DONE` (blue)
   - Same style as DatePickerModal

### Styling Notes
- Use same color variables as DatePickerModal
- Modal background: white, border-radius 12
- Overlay: `rgba(0, 0, 0, 0.5)`
- Use gray separators between settings rows
- Font sizes should use `scaleFontSize()` from theme

### State Management
```typescript
const [enabled, setEnabled] = useState(initialEnabled ?? true);
const [frequency, setFrequency] = useState(initialFrequency ?? "daily");
const [repeatEvery, setRepeatEvery] = useState(initialRepeatEvery ?? 1);
const [repeatOn, setRepeatOn] = useState(initialRepeatOn ?? null);
const [repeatEnds, setRepeatEnds] = useState(initialRepeatEnds ?? "endlessly");
const [endDate, setEndDate] = useState(initialEndDate ?? null);
const [endCount, setEndCount] = useState(initialEndCount ?? 10);
```

---

## Task 2: Create SoundRepeatModal Component

### File: `components/SoundRepeatModal.tsx`

### Props Interface
```typescript
type SoundRepeatModalProps = {
  visible: boolean;
  initialMode?: "count" | "until_stopped";
  initialCount?: number;
  onConfirm: (data: {
    mode: "count" | "until_stopped";
    count: number;
  }) => void;
  onCancel: () => void;
};
```

### UI Structure

1. **Header**
   - Title: "Sound Repeats" (centered or left-aligned)

2. **Options List** (radio-button style, single select)
   - `1 time` (default)
   - `2 times`
   - `3 times`
   - `5 times`
   - `10 times`
   - `Until stopped`
   
   Each row:
   - Left: option label
   - Right: radio indicator (filled circle if selected, empty circle if not)

3. **Action Buttons**
   - Right-aligned: `CANCEL` (gray) and `DONE` (blue)

### Alternative UI (chip-based, matching RepeatTaskModal)
If you want consistency with RepeatTaskModal, use chips instead:

```
┌─────────────────────────────────────────────┐
│  Sound Repeats                              │
├─────────────────────────────────────────────┤
│  [1x] [2x] [3x] [5x] [10x] [∞ Until stopped]│
│                                             │
│                     CANCEL        DONE      │
└─────────────────────────────────────────────┘
```

### Styling Notes
- Same modal style as DatePickerModal and RepeatTaskModal
- Selected option: blue highlight
- Use `scaleFontSize()` for text

---

## Task 3: Integrate into Edit Screen

### File: `app/reminder/edit.tsx`

### Changes Required

1. **Add imports**
   ```typescript
   import RepeatTaskModal from "../../components/RepeatTaskModal";
   import SoundRepeatModal from "../../components/SoundRepeatModal";
   ```

2. **Add state for modal visibility**
   ```typescript
   const [showRepeatModal, setShowRepeatModal] = useState(false);
   const [showSoundRepeatModal, setShowSoundRepeatModal] = useState(false);
   ```

3. **Replace `openFrequencyPicker` function**
   - Instead of calling `Alert.alert()`, set `setShowRepeatModal(true)`

4. **Replace `openSoundRepeatPicker` function**
   - Instead of calling `Alert.alert()`, set `setShowSoundRepeatModal(true)`

5. **Update the "Repeat Task" SettingsRow**
   ```tsx
   <SettingsRow
     icon="refresh-cw"
     label="Repeat Task"
     value={frequencyLabel}  // Update this to show more detail if needed
     onPress={() => setShowRepeatModal(true)}
   />
   ```

6. **Update the "Sound repeats" SettingsRow**
   ```tsx
   <SettingsRow
     icon="volume-2"
     label="Sound repeats"
     value={soundRepeatLabel}
     onPress={() => setShowSoundRepeatModal(true)}
   />
   ```

7. **Add modals at the bottom of the ScrollView (before closing tag)**
   ```tsx
   <RepeatTaskModal
     visible={showRepeatModal}
     initialEnabled={frequency !== "once"}
     initialFrequency={frequency === "once" ? "daily" : frequency}
     onCancel={() => setShowRepeatModal(false)}
     onConfirm={(data) => {
       if (!data.enabled) {
         setFrequency("once");
         setDays([]);
       } else {
         setFrequency(data.frequency);
         // Map repeatOn to days array if weekly
         if (data.frequency === "weekly" && data.repeatOn !== null) {
           const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
           setDays([dayMap[data.repeatOn]]);
         }
       }
       setShowRepeatModal(false);
     }}
   />

   <SoundRepeatModal
     visible={showSoundRepeatModal}
     initialMode={soundRepeatMode}
     initialCount={soundRepeatCount}
     onCancel={() => setShowSoundRepeatModal(false)}
     onConfirm={(data) => {
       setSoundRepeatMode(data.mode);
       setSoundRepeatCount(data.count);
       setShowSoundRepeatModal(false);
     }}
   />
   ```

8. **Remove or simplify DaySelector inline usage**
   - The RepeatTaskModal should handle day selection internally for weekly frequency
   - Remove `showDaysPicker` state and the inline DaySelector if moving it into the modal

---

## Task 4: Update Reminder Storage Schema (if needed)

### File: `lib/storage.ts`

Ensure the `Reminder` type includes these fields (may already exist):
```typescript
type Reminder = {
  // ... existing fields
  frequency: "once" | "hour" | "daily" | "weekly" | "monthly" | "yearly";
  repeatEvery?: number;      // NEW: e.g., every 2 weeks
  repeatOn?: number;         // NEW: day of week (0-6) or day of month (1-31)
  repeatEnds?: "endlessly" | "date" | "count";  // NEW
  repeatEndDate?: number;    // NEW: timestamp
  repeatEndCount?: number;   // NEW: number of occurrences
  soundRepeatMode: "count" | "until_stopped";
  soundRepeatCount: number;
};
```

### File: `convex/schema.ts`

Add corresponding fields to the Convex schema:
```typescript
reminders: defineTable({
  // ... existing fields
  frequency: v.string(),
  repeatEvery: v.optional(v.number()),
  repeatOn: v.optional(v.number()),
  repeatEnds: v.optional(v.string()),
  repeatEndDate: v.optional(v.number()),
  repeatEndCount: v.optional(v.number()),
  soundRepeatMode: v.optional(v.string()),
  soundRepeatCount: v.optional(v.number()),
})
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `components/RepeatTaskModal.tsx` | CREATE |
| `components/SoundRepeatModal.tsx` | CREATE |
| `app/reminder/edit.tsx` | MODIFY - integrate new modals |
| `lib/storage.ts` | MODIFY - add new fields to Reminder type (if not present) |
| `convex/schema.ts` | MODIFY - add new fields (if not present) |

---

## Visual Reference

Copy the styling patterns from:
- `components/DatePickerModal.tsx` - modal structure, overlay, buttons, settings rows
- `components/AppIcon.tsx` - icon usage

Use these existing style constants:
```typescript
// Colors
"#4285f4"  // Primary blue (selected state)
"#f5f5f5"  // Chip background
"#616161"  // Chip text
"#757575"  // Muted/secondary text
"#212121"  // Primary text
"#e0e0e0"  // Separator lines
"#ffffff"  // Modal background

// Border radius
12  // Modal corners
16-20  // Chips/pills
```

---

## Test Checklist

- [ ] RepeatTaskModal opens when tapping "Repeat Task" row
- [ ] Toggle on/off works and disables options when off
- [ ] Frequency chips select correctly (only one at a time)
- [ ] "Repeat every" dropdown shows correct options for selected frequency
- [ ] "Repeat on" shows for weekly/monthly only
- [ ] "Repeat ends at" options work
- [ ] Cancel closes modal without saving
- [ ] Done saves and closes modal
- [ ] SoundRepeatModal opens when tapping "Sound repeats" row
- [ ] Sound repeat options select correctly
- [ ] Values persist after closing and reopening edit screen
- [ ] Values save to storage and Convex correctly
