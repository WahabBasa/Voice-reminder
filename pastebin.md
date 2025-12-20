# Task: Convert edit page to a draggable bottom sheet

## Goal
Make the reminder edit screen appear as a bottom sheet that:
- Opens at ~60% screen height by default
- Can be dragged up to ~95% (full height)
- Has a drag handle at top center
- No back button - swipe down to dismiss

## Reference
See `Screenshot_20251218-194116_Todoist.jpg` for the desired look.

---

## Option A: Update DetailSheet.tsx (if using this component)

### File: `components/DetailSheet.tsx`

### Change 1: Update snapPoints
```tsx
// Current (line ~53):
const snapPoints = useMemo(() => ["90%"], []);

// Change to:
const snapPoints = useMemo(() => ["60%", "95%"], []);
```

### Change 2: Add index prop to start at 60%
In the `<BottomSheetModal>` component, add `index={0}`:
```tsx
<BottomSheetModal
  ref={ref}
  snapPoints={snapPoints}
  index={0}  // <-- ADD THIS to start at first snap point (60%)
  enablePanDownToClose
  ...
>
```

---

## Option B: Convert edit.tsx to bottom sheet (preferred)

### File: `app/reminder/edit.tsx`

The edit page is currently a full-screen page with a back button header. Convert it to use a bottom sheet pattern:

1. **Remove the header with back button** - Delete the header View containing `arrow-left` icon

2. **Wrap content in a BottomSheet** - Use `@gorhom/bottom-sheet`:
   ```tsx
   import BottomSheet from '@gorhom/bottom-sheet';
   
   const snapPoints = useMemo(() => ['60%', '95%'], []);
   ```

3. **Add drag handle** - The library provides this automatically via `handleIndicatorStyle`

4. **Dismiss on swipe down** - Use `enablePanDownToClose={true}` and call `router.back()` on dismiss

### Key changes in edit.tsx:
- Remove `<View style={styles.header}>` block (the one with arrow-left and more-vertical icons)
- Keep the 3-dot menu accessible (move to top-right of content or floating)
- Wrap the `<ScrollView>` content in a `<BottomSheet>` component
- Handle the "discard changes" logic in `onChange` callback when sheet is dismissed

---

## Styling notes
- Drag handle: small gray bar, centered at top (default from library)
- Background: white with rounded top corners (borderTopLeftRadius: 24, borderTopRightRadius: 24)
- Content scrollable within the sheet
