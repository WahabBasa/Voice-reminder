import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useToast } from "./ToastProvider";
import { getDeviceId } from "../lib/deviceId";
import { useFeedbackUi } from "../lib/feedbackUi";
import { hasUnseenResponses, nextWatermark } from "../lib/feedbackSeen";
import {
  flush,
  type FeedbackSubmitInput,
  type FeedbackSubmitResult,
} from "../lib/feedbackOutbox";
import FeedbackSheet from "./FeedbackSheet";
import FeedbackList, { type ServerFeedback } from "./FeedbackList";

const SEEN_WATERMARK_KEY = "@feedback_seen_responded_at";

/**
 * The single mount point for the feedback UI, placed above every screen and
 * sheet so opening the composer from inside an edit leaves that edit untouched.
 *
 * It also owns the one subscription to the device's feedback and the "your
 * feedback was answered" banner: when a note has been responded to more recently
 * than the local watermark, a tappable toast offers the status list. The
 * watermark only advances once the list has actually been shown — to the newest
 * response displayed, never to "now" — so a reply is never silently marked seen.
 */
export default function FeedbackHost() {
  const composer = useFeedbackUi((s) => s.composer);
  const closeComposer = useFeedbackUi((s) => s.closeComposer);
  const listVisible = useFeedbackUi((s) => s.listVisible);
  const openList = useFeedbackUi((s) => s.openList);
  const closeList = useFeedbackUi((s) => s.closeList);
  const toast = useToast();
  const submitFeedback = useMutation(api.feedback.submit);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(0);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const banneredForRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void getDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    });
    void AsyncStorage.getItem(SEEN_WATERMARK_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw ? Number(raw) : 0;
        setWatermark(Number.isFinite(parsed) ? parsed : 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWatermarkLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useQuery(
    api.feedback.listForDevice,
    deviceId ? { deviceId } : "skip"
  ) as ServerFeedback[] | undefined;

  // Drain the outbox on the same signals the take pipeline uses: when the app
  // returns to the foreground, when connectivity comes back, and once as soon as
  // the device id is known (covers cold start). A post-enqueue flush lives in the
  // composer itself; the outbox serializes them so nothing double-sends.
  useEffect(() => {
    if (!deviceId) return;
    const drain = () => {
      const submit = (input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> =>
        submitFeedback({ deviceId, ...input }) as Promise<FeedbackSubmitResult>;
      void flush(submit).catch(() => {});
    };

    drain();
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") drain();
    });
    const netSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) drain();
    });
    return () => {
      appStateSub.remove();
      netSub();
    };
  }, [deviceId, submitFeedback]);

  // The banner: a reply newer than the watermark, shown once per new reply.
  useEffect(() => {
    if (!watermarkLoaded || !items) return;
    if (!hasUnseenResponses(items, watermark)) return;
    const newest = nextWatermark(items, watermark);
    if (newest <= banneredForRef.current) return;
    banneredForRef.current = newest;
    toast.show({
      title: "Your feedback was updated",
      message: "Tap to see",
      type: "info",
      onPress: openList,
    });
  }, [items, watermark, watermarkLoaded, toast, openList]);

  // Advance the watermark once the list is actually on screen, to the newest
  // response displayed — not on banner tap, not to Date.now().
  useEffect(() => {
    if (!listVisible || !items) return;
    const next = nextWatermark(items, watermark);
    if (next <= watermark) return;
    setWatermark(next);
    void AsyncStorage.setItem(SEEN_WATERMARK_KEY, String(next)).catch(() => {});
  }, [listVisible, items, watermark]);

  return (
    <>
      <FeedbackSheet
        visible={!!composer}
        context={composer?.context ?? null}
        notice={composer?.notice ?? ""}
        onClose={closeComposer}
      />
      <FeedbackList visible={listVisible} items={items} onClose={closeList} />
    </>
  );
}
