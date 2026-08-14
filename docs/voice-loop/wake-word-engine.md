# Wake-Word Engine Research — openWakeWord vs Porcupine, and the path to "Claude" (2026-08-14)

Which engine do we build the always-on listener on, and how do we get a custom "Claude" model onto it?
Short answer: **openWakeWord**, and it's not close — but not for the reason the ticket assumed.

Porcupine was going to be the "better tech, worse license" option. As of **2026-06-30 it is not
licensable at all** for a personal project. That decides the engine before a single accuracy number
gets compared. The interesting work left is the custom-model path, and there the real finding is that
**bare "Claude" is a bad wake phrase by every published guideline and the only 2026 empirical data
that exists** — so the ladder should be built as three models running simultaneously in one process,
not as a fallback sequence.

Everything below is from primary sources with URLs inline. The Windows footprint numbers in
["Footprint"](#footprint-measured-on-this-machine) were measured on this machine today, not quoted.

---

## Verdict

**Build on openWakeWord** ([github.com/dscripka/openWakeWord](https://github.com/dscripka/openWakeWord),
Apache-2.0 code).

| | openWakeWord | Porcupine |
|---|---|---|
| License for this use | Apache-2.0 code; pre-trained models CC BY-NC-SA 4.0 (fine, this is non-commercial) | **Free tier disabled 2026-06-30. No personal/non-commercial plan exists.** |
| Runs offline | Yes, fully | No — AccessKey validated at every `create()` |
| Custom phrase | Train it yourself, ~1 GPU-hour, free, unlimited | Console self-service — but requires an account we can't get |
| One-syllable "Claude" | Hard; documented failure modes + workarounds | Explicitly advised against (<6 phonemes) |
| Windows | ONNX backend only, works (measured below) | First-class |
| Footprint | ~10% of one core, ~176 MB RSS (measured) | ~1 MB RAM, <4% of an RPi3 core (their claim) |
| Multi-model | Free — shared feature backbone | Free — no added runtime footprint |

Porcupine is the better engine on the merits. Picovoice's own numbers (97%+ detection at <1 false
alarm per 10 hours, [Porcupine FAQ](https://picovoice.ai/docs/faq/porcupine/)) and their 1 MB / <4%
of an RPi3 core footprint are both better than what openWakeWord does. It is irrelevant, because we
cannot get a key.

---

## Why Porcupine is out

Picovoice sunset the Free Tier. Confirmed by a Picovoice staff member answering a Home Assistant
hobbyist in [Picovoice/porcupine#1574](https://github.com/Picovoice/porcupine/issues/1574)
(2026-05-25), verbatim:

> The AccessKey is validated when the engine is initialized, before offline data processing, and is
> also used to enforce usage limits. **The SDK does not run without a valid key.** After Free Tier
> AccessKeys are disabled on **June 30, 2026**, features using those keys will stop working.
> Going forward, we'll be focusing on our core business, enterprise deployments.
> **There is no non-commercial tier planned.**

Corroborated in three independent places:

1. The [general FAQ](https://picovoice.ai/docs/faq/general/) — *"Can I use Picovoice for personal
   projects? Picovoice is a B2B company focused on on-device AI tools for enterprises. At this time,
   there are no dedicated free or paid plans for personal or non-commercial use."* The only remaining
   free path is a one-time, non-renewing Free Trial for enterprise developers ("Can I get my Free
   Trial period extended? No").
2. `https://picovoice.ai/pricing/` **now 302s straight to `/contact`** — a sales lead form. There is
   no self-serve price sheet left.
3. [Terms of Use](https://picovoice.ai/docs/terms-of-use/) (updated 2026-03-18, effective
   2026-03-30), §6: *"Picovoice may, at its sole discretion, grant You limited access to Services
   through a Free Trial... Picovoice reserves the right to approve, deny, modify, or revoke Free
   Trial access at any time without notice or liability."*

Note the GitHub SDK README and the Porcupine docs **still say** "You can get your `AccessKey` for
free" — those pages are stale. Don't be fooled by them.

Two more disqualifiers even if a key were obtainable, both from the issue tracker:

- **The engine phones home.** The key is validated at `pvporcupine.create()`. An always-on listener
  that dies when the network hiccups or a subscription lapses is a bad foundation for a daily driver.
- **One device per 30 days, non-resettable.** [#1433](https://github.com/Picovoice/porcupine/issues/1433):
  a dev machine plus a target machine burns the allowance and locks you out for 30 days.
  [#1532](https://github.com/Picovoice/porcupine/issues/1532): reformatting a PC counts as a new
  device, and Picovoice replied *"Unfortunately we are unable to reset your account."*

The `Picovoice/porcupine` repo itself is Apache-2.0, but that covers the bindings and demos. The
`.pv` model files and the runtime library are proprietary and gated on the key.

---

## Can openWakeWord actually hear "Claude"?

This is the real risk, and it deserves to be stated bluntly: **"Claude" is a poor wake word.**
Three independent sources say so, from three different directions.

**1. Phoneme count.** From CMUdict (verified locally with the `pronouncing` package, which is the
same dictionary openWakeWord's own adversarial-negative generator uses):

| phrase | CMUdict phones | count | syllables |
|---|---|---|---|
| `claude` | `K L AO1 D` | **4** | 1 |
| `hey claude` | `HH EY1 K L AO1 D` | **6** | 2 |
| `hey jarvis` | `HH EY1 JH AA1 R V AH0 S` | 8 | 3 |
| `alexa` | `AH0 L EH1 K S AH0` | 6 | 3 |

Picovoice's [Tips for Choosing a Wake Word](https://picovoice.ai/docs/tips/choosing-a-wake-word/)
sets the floor at six: *"Most well-known wake words have at least six phonemes... Choosing a wake
phrase with fewer than six phonemes is not recommended, because it is harder to detect and more
likely to produce false positives. A short wake word can be made more effective by prepending it
with e.g. 'Hey', or 'OK'."* Bare "Claude" is at four. "Hey Claude" is exactly at the floor.

**2. Home Assistant** — the largest real-world deployer of openWakeWord — tells users in
[Create your own wake word](https://www.home-assistant.io/voice_control/create_wake_word/) to pick
*"a word or short phrase (3-4 syllables) that is not commonly used."* "Claude" is one syllable and,
in this house, extremely commonly used.

**3. The only 2026 empirical numbers for openWakeWord single vs two-word phrases**, from
[dscripka/openWakeWord#317](https://github.com/dscripka/openWakeWord/issues/317) (five+ training runs
on a 3060 and a 4090):

| Wake word | Samples | Config | Accuracy | Recall | FP/hr |
|---|---|---|---|---|---|
| "Hey Atlas" | 50k | 2 aug, 32n | 81.10% | **62.48%** | 2.12 |
| "Hey Atlas" | 100k | 2 aug, 32n | 77.47% | 55.08% | **0.62** |
| "Atlas" | 50k | 3 aug, 32n | 71.64% | 43.54% | 2.57 |
| "Atlas" | 50k | 2 aug, 64n | 71.94% | 44.04% | 2.48 |

Dropping the "Hey" cost ~18 points of recall at the same sample count — and "Atlas" is *two*
syllables with a clean `AE T L AH S`. The repo's README reduces this to one line: **"Use a two-word
phrase."** Also note the sample-count row: 50k gives better recall, 100k gives better FP/hr. Our
tradeoff (misses hurt, false accepts are a soft chime) points at **50k**.

**4. The hard-"k" problem, and it's ours specifically.** In
[#71 ("Computer" as wake word)](https://github.com/dscripka/openWakeWord/issues/71) the maintainer
diagnosed why single-word models kept failing:

> I think the issue is related to how the Piper TTS model is pronouncing certain single words...
> I noticed that **the hard "k" was not consistently being produced by the TTS model**, which means
> that the trained model might not respond well to the correct pronunciation.
> In the meantime, a work-around is to try other phonetic spellings of the target word
> (e.g., `khom-puter`).

"Claude" is `K L AO D` — it *opens* on the hard k. This is exactly the failure mode. The working
community "computer" model got there with nine phonetic spellings in `target_phrase` plus ~1,400
real recorded clips.

**5. And the vocabulary is hostile.** `cloud` is `K L AW1 D` — one vowel away from `K L AO1 D`.
`code` is `K OW1 D`. `clawed`, `claud`, `laude` are *exact homophones* — and openWakeWord's
`generate_adversarial_texts` **deliberately excludes homophones** from the auto-generated negatives
("this wouldn't actually be an adversarial example"), so nothing will teach the model to tell them
apart. Ever. We will be sitting at a desk saying "cloud", "code", and "Claude Code" all day.

### The shape this implies

Don't build a fallback *ladder* (try A, if bad switch to B). openWakeWord's whole architecture is a
shared frozen feature backbone with a tiny classifier head per phrase — the README's point 3 —
so **the second and third models are nearly free**: one melspectrogram + one embedding pass feeds all
of them. Load all three at once and let them race:

| Model | Source | Threshold | Role |
|---|---|---|---|
| `hey_jarvis` | **ships pre-trained**, zero work | 0.40 | Working baseline from hour zero; also the permanent "it definitely heard me" escape hatch |
| `hey_claude` | train (primary target) | 0.35–0.40 | The one that should carry daily use |
| `claude` | train (secondary) | 0.60 + `patience` + VAD | The one-syllable convenience path, deliberately tighter |

That gives a working loop *today* (`hey_jarvis` is a shipped model — confirmed, 1.24 MB, downloads
in seconds), and it makes the "ladder" a runtime tuning exercise on three thresholds instead of a
migration.

---

## The concrete path to a custom "Claude" model

### The bad news first: upstream training is bit-rotted

`openwakeword` on PyPI is still **v0.6.0, uploaded 2024-02-11**. The repo has commits as recent as
2025-12-30 but no release since. The maintainer is largely absent — from #317: *"the project has
merged exactly 0 community PRs in the past 18 months, has 10 open community PRs (some over 2 years
old), and 90 open issues."*

Both official notebooks are broken.
[#296 (open since 2025-11-10)](https://github.com/dscripka/openWakeWord/issues/296) catalogues it:
`ModuleNotFoundError: No module named 'piper'`, then `generate_samples() missing 1 required
positional argument: 'model'`, then `ValueError: Error! Clip does not have the correct sample rate!`.
The notebook also sets `target_accuracy` / `target_recall` config keys that **current `train.py` no
longer reads** — it only honours `target_false_positives_per_hour`.

The dependency stack has aged out: `torch==1.13.1` (no wheels for Python 3.12+), `pyarrow` must be
`<15`, `fsspec` `<2024.1.0`, `tensorflow-cpu==2.8.1`, `onnx_tf==1.10.0`. The
`rhasspy/piper-sample-generator` repo moved to a package layout in commit
[`1a8c49bd` (2026-03-12)](https://github.com/rhasspy/piper-sample-generator/commits/master) which
`train.py` can't import — pin to `1a8c49bd^` (= `c9d824c0`).

Also note: **training is Linux-only.** From the notebook itself: *"Currently, automated model
training is only supported on linux systems due to the requirements of the text to speech library
used for synthetic sample generation (Piper)."* On this box that means WSL2 or a Colab runtime.
Inference on Windows is fine — it's only training that needs Linux.

### Recommended route: `briankelley/atlas-voice-training`

[github.com/briankelley/atlas-voice-training](https://github.com/briankelley/atlas-voice-training)
(Apache-2.0, pushed 2026-05-31). It pins `openwakeword` to commit `368c037` and
`piper-sample-generator` to `f1988a4` inside a Docker image, packages the ~20 GB training corpus as a
single HuggingFace tarball to dodge rate limits, and ships `train.sh` for a non-Docker native Linux
run. It is also the source of the single-vs-two-word table above, which is the exact question we care
about — the author had already run our experiment.

```bash
# in WSL2 (Ubuntu) with NVIDIA CUDA passthrough, ~45 GB free
git clone https://github.com/briankelley/atlas-voice-training.git
cd atlas-voice-training
./train-wakeword.sh     # interactive: confirms the ~20 GB download, prompts for the wake phrase
```

Needs an NVIDIA GPU + nvidia-container-toolkit for the Docker path, or Python 3.10 (`python3.10`,
`-venv`, `-dev`) for the bare-metal `train.sh`. ~1 hour end to end on a 4090. Outputs a ~200 KB
`.onnx` and a ~207 KB `.tflite` into `docker-output/`. **We want the `.onnx`** — tflite is unavailable
on Windows.

Fallback if there's no usable GPU: [alfiedennen/openwakeword-colab-2026](https://github.com/alfiedennen/openwakeword-colab-2026)
(MIT, 2026-05-09), a Colab notebook that patches the same bit-rot list — 75–90 min on Colab Pro
(L4 + High RAM). It has 1 star and was self-promoted in the issue thread, so treat it as unvetted;
read the notebook before running it. (A third suggestion in that thread,
`Mobivs/openwakeword-local-trainer`, **404s** — the repo is gone. Ignore it.)

### The config that matters

Training is driven by a YAML file
([`examples/custom_model.yml`](https://github.com/dscripka/openWakeWord/blob/main/examples/custom_model.yml))
consumed by `train.py` in three passes:

```bash
python openwakeword/train.py --training_config my_model.yaml --generate_clips
python openwakeword/train.py --training_config my_model.yaml --augment_clips
python openwakeword/train.py --training_config my_model.yaml --train_model
```

For "hey claude", the fields that actually matter:

```yaml
model_name: "hey_claude"

# Multiple spellings is the documented workaround for Piper dropping the hard "k" (issue #71).
# All entries train ONE binary model that fires on any of them.
target_phrase:
  - "hey claude"
  - "hey clawd"
  - "hey klawd"
  - "hey, claude"

# Phrases to suppress beyond the auto-generated phoneme-overlap negatives.
# This is where our desk vocabulary goes.
custom_negative_phrases:
  - "cloud"
  - "the cloud"
  - "code"
  - "load"
  - "loud"
  - "chord"
  - "called"
  - "close"

n_samples: 50000          # 50k > 100k for recall; see the Atlas table
n_samples_val: 2000
augmentation_rounds: 2
layer_size: 32            # 64 measured no better
steps: 50000
max_negative_weight: 1500
target_false_positives_per_hour: 0.2
```

Do **not** put `"claude code"` in `custom_negative_phrases`. It contains the wake word; training
against it will drag down the target, and per the design brief a false accept there costs one soft
chime and a 2-second window. Take the chime.

For the bare `claude` model, same file with `model_name: "claude"`,
`target_phrase: ["claude", "clawd", "klawd", "cload"]`, and the same negatives.

**The single biggest quality lever is real recordings.** The synthetic-only pipeline gets you a
baseline; the community "computer" model that finally worked added ~1,400 real clips on top
(#71). Record 30–60 utterances of "hey Claude" and "Claude" at your actual desk, actual mic, actual
distance, and drop the WAVs (16-bit 16 kHz mono) into the positive training dir before the augment
step. The maintainer confirms: *"Adding real clips of the wakeword absolutely does increase
performance... it should be included in the training clips as a best practice."*

If a from-scratch model underperforms even after that, there is a documented second-stage escape:
[custom verifier models](https://github.com/dscripka/openWakeWord/blob/main/docs/custom_verifier_models.md)
— a per-voice filter trained on a handful of your own recordings that only lets through activations
that sound like you. For a single-user desktop that "cost" (won't respond to new voices) is a feature.

---

## Tuning knobs

Construction ([`Model.__init__`](https://github.com/dscripka/openWakeWord/blob/main/openwakeword/model.py)):

```python
import openwakeword
from openwakeword.model import Model

openwakeword.utils.download_models()          # REQUIRED on Windows, even with a custom model

model = Model(
    wakeword_models=["hey_jarvis", "./hey_claude.onnx", "./claude.onnx"],
    inference_framework="onnx",               # REQUIRED on Windows — default is "tflite"
    vad_threshold=0.5,                        # Silero VAD gate; 0 (default) = off
    # enable_speex_noise_suppression=True,    # Linux x86/arm64 ONLY — not available to us
)
```

| Knob | Where | Default | For us |
|---|---|---|---|
| `vad_threshold` | `Model()` | `0` (off) | **0.5.** Silero VAD must simultaneously score above this for a detection to pass. Kills non-speech transients — keyboard, chair, door — which are exactly what a 1-syllable model false-fires on. Costs ~48% more CPU (measured). |
| score threshold | your code, on `predict()` output | 0.5 recommended | **0.35–0.40** for `hey_claude` / `hey_jarvis`. A production deployer in #296 reports *"Threshold 0.40 works well for 'hey_jarvis' (default 0.50 misses at distance)."* Misses cost more than chimes here. **0.60** for bare `claude`. |
| `patience` | `predict(patience={...})` | off | N consecutive 80 ms frames above threshold before firing. Use `{"claude": 2}` on the bare model only — it trades true-positive rate for fewer false fires, and adds 80 ms latency per frame of patience. |
| `debounce_time` | `predict(debounce_time=...)` | `0.0` | **1.5–2.0 s.** Stops one utterance producing a burst of detections. Should roughly match the 2 s dictation window. |
| `threshold` (dict) | `predict(threshold={...})` | `{}` | **Gotcha:** `patience` and `debounce_time` are only honoured when you *also* pass this dict, keyed by model name. Passing patience alone silently does nothing. |
| `enable_speex_noise_suppression` | `Model()` | `False` | Unavailable — Linux x86/arm64 only. |
| chunk size | `predict(x)` | — | 1280 samples (80 ms). Larger chunks are cheaper per second of audio but add latency (see table below). Stick with 1280 for a wake word. |

**Custom verifier models** (`custom_verifier_models=`, `custom_verifier_threshold=0.1`) are the
second-stage speaker filter mentioned above — the strongest remaining lever if false accepts become
intolerable.

---

## Footprint (measured on this machine)

Not quoted from docs — actually run, today, in a throwaway venv on this Windows 10 box
(AMD Zen family 23, 8 logical cores, Python **3.12.5**, `openwakeword` 0.6.0, `onnxruntime` 1.28.0,
`numpy` 2.5.2, ONNX backend, one `hey_jarvis` model):

| Metric | Value |
|---|---|
| `pip install openwakeword` | Clean. Pulls onnxruntime 1.28.0, scipy, scikit-learn, numpy **2.5.2**. No numpy-2 breakage. |
| Model load time | 0.36 s |
| CPU, 80 ms chunks | **8.34 ms per frame → 10.4% of one core** (~1.3% of the 8-core machine) |
| CPU, 80 ms chunks **+ Silero VAD** | **12.31 ms per frame → 15.4% of one core** |
| CPU, 160 ms chunks | 8.25% of one core |
| CPU, 320 ms chunks | 6.84% of one core |
| RSS, python + imports only | 128 MB |
| RSS, steady state, 1 model | **176 MB** |
| RSS, steady state, 1 model + VAD | **220 MB** |

Model files on disk: `melspectrogram.onnx` 1.04 MB, `embedding_model.onnx` 1.27 MB,
`silero_vad.onnx` 1.72 MB, plus ~0.2–1.2 MB per wake word (a freshly trained one is ~200 KB).
Adding the second and third wake-word models adds a classifier pass each — the expensive
melspectrogram and embedding passes are shared, so expect well under +1% of a core per extra phrase.

Read that as: **~10–15% of one core, permanently, and ~200 MB RAM.** Fine for a desktop that also
runs a browser. Not fine for a battery-powered laptop lid-closed scenario. If it ever needs to be
smaller, [rhasspy/openWakeWord-cpp](https://github.com/rhasspy/openWakeWord-cpp) (MIT) is a C++
reimplementation that skips the Python interpreter entirely.

### Windows gotchas, all confirmed

1. **`inference_framework="onnx"` is mandatory.** The default is `"tflite"`, and
   `tflite-runtime` has no Windows wheels — `pip install openwakeword` deliberately doesn't install it
   there (README). Leaving the default produces a confusing model-not-found crash
   ([#187](https://github.com/dscripka/openWakeWord/issues/187)).
2. **`openwakeword.utils.download_models()` is required even when you supply your own model** — the
   shared melspectrogram and embedding ONNX files aren't bundled in the wheel. Multiple users hit
   this ([#187](https://github.com/dscripka/openWakeWord/issues/187)).
3. **Model keys use underscores.** `download_models(["hey jarvis"])` silently downloads *nothing* and
   the subsequent `Model()` blows up with `NO_SUCHFILE`. The valid keys are
   `alexa, hey_mycroft, hey_jarvis, hey_rhasspy, timer, weather`. Found the hard way today.
4. The repo has an open report of the **ONNX backend returning near-zero scores on macOS ARM64**
   ([#336](https://github.com/dscripka/openWakeWord/issues/336)). Windows x86_64 is unaffected —
   scores looked sane here — but it's a reminder to validate scores on any new host before trusting
   a threshold.

---

## Microphone input stack

openWakeWord takes a raw numpy array and nothing else. Requirements, from the README and
`Model.predict`: **single-channel, 16-bit signed, 16 kHz PCM, ideally 1280 samples (80 ms) per call.**
Other lengths work but add up to 80 ms of latency while samples accumulate. `predict()` raises if
handed anything other than an `np.ndarray`.

The bundled `examples/detect_from_microphone.py` uses **PyAudio**:

```python
mic_stream = audio.open(format=pyaudio.paInt16, channels=1, rate=16000,
                        input=True, frames_per_buffer=1280)
frame = np.frombuffer(mic_stream.read(1280), dtype=np.int16)
prediction = model.predict(frame)
```

Both stacks are viable on Windows/Python 3.12 today:

| Package | Version | Windows wheels | Notes |
|---|---|---|---|
| `PyAudio` | 0.2.14 | cp38–cp313, win32 + amd64 | What the example uses. Blocking `read()`. |
| `sounddevice` | 0.5.5 | `py3-none-win32/amd64/arm64` | PortAudio; callback-driven, purpose-built for a background always-on thread. |

**Recommend `sounddevice`.** Its callback model suits a daemon better than a blocking read loop, and
the pure-Python wheel means no ABI churn on Python upgrades. The one caveat: the
`InputStream(dtype='int16', channels=1, samplerate=16000, blocksize=1280)` config must be exact —
the crash in [#187](https://github.com/dscripka/openWakeWord/issues/187) was a `sounddevice` callback
handing openWakeWord a float/multi-channel buffer, and the maintainer's debugging advice applies to
either library: *"It should produce an array with 1280 16-bit integers. If it does not, then you may
need to adjust your PyAudio settings."*

For Windows, prefer WASAPI shared mode and let Windows resample to 16 kHz rather than pulling native
48 kHz and downsampling ourselves — one less place to introduce aliasing that the model was never
trained on.

If we'd rather not own the audio loop at all, [rhasspy/wyoming-openwakeword](https://github.com/rhasspy/wyoming-openwakeword)
(Apache-2.0, active 2025-10) is a ready-made always-on detection server that accepts custom models
via `--preload-model /path/to/model.onnx` and `--trigger-level 1` for fastest response.

---

## Licensing, precisely

**Code:** Apache-2.0, all of it.

**Pre-trained models** (including `hey_jarvis`): **CC BY-NC-SA 4.0** — *"due to the inclusion of
datasets with unknown or restrictive licensing as part of the training data"* (README). Non-commercial
only, and share-alike. For a personal hands-free loop on your own PC that is fine. If any of this ever
ships to other people, `hey_jarvis` has to come out or be retrained.

**A model we train ourselves** is our own artifact, but it inherits provenance questions from its
training data: MIT RIRs, Google AudioSet, Free Music Archive, and the ACAV100M-derived precomputed
feature file. Again, fine personally; worth a real look before any distribution.

**Bundled Silero VAD** — [snakers4/silero-vad](https://github.com/snakers4/silero-vad) is MIT.

**Feature backbone** — Google's `speech_embedding` TFHub model, Apache-2.0, re-implemented in the repo.

Net: nothing in this stack costs money, phones home, or expires. That is the entire argument.

---

## Rejected options

**Picovoice Porcupine** — see above. Not licensable as of 2026-06-30. If circumstances change (an
enterprise key materialises), it's the better engine and its Console path is genuinely excellent:
type the phrase, it validates it, test in-browser, click Train, download a `.ppn` "in seconds"
([docs](https://picovoice.ai/docs/porcupine/)). Sensitivity is one float in `[0,1]` per keyword.
It would also have told us "Claude" is too short before we trained anything, which is worth knowing
regardless.

**microWakeWord** ([kahrendt/microWakeWord](https://github.com/kahrendt/microWakeWord), Apache-2.0,
active 2026-07) — the right answer for ESP32-class hardware and dscripka's own recommendation for
microcontrollers, but it targets **TensorFlow Lite for Microcontrollers**. There is no desktop Python
inference path. Its training pipeline (Piper samples, SpecAugment, quantisation) is nicer than
openWakeWord's, but the output runs on the wrong machine. Not applicable.

**Vosk keyword spotting** ([alphacep/vosk-api](https://github.com/alphacep/vosk-api), Apache-2.0,
very actively maintained) — you can constrain `KaldiRecognizer` to a word list, and
[the adaptation docs](https://alphacephei.com/vosk/adaptation) confirm *"Vosk-API supports online
modification of the vocabulary"* — with the caveat that *"big models with static graphs do not
support this modification, you need a model with dynamic graph."* But this is a full ASR decoder
running 24/7 to detect one word: an order of magnitude more CPU and RAM than a 200 KB classifier
head, and it has no notion of a detection threshold curve to tune. Also redundant — Wispr Flow is
already the ASR in this pipeline. Nothing to gain.

**Mycroft Precise, Snowboy, PocketSphinx** — dead. openWakeWord's README declines to benchmark
against them because they are *"either no longer maintained or demonstrate performance significantly
below that of Porcupine."*

**`openwakeword.com/train`** — a third-party hosted training service that surfaces in search results.
Not affiliated with dscripka's project despite the domain. Unvetted; would mean uploading voice
samples to a stranger. Skipped.

---

## Open questions

1. **Does bare "Claude" clear the bar at all?** Everything above says it won't reach `hey_jarvis`-class
   recall. The three-model design means we find out cheaply instead of betting on it — but if the
   bare model lands under ~40% recall even with real recordings, the honest answer is to drop it and
   live with "Hey Claude".
2. **How bad is "cloud"/"code" in practice?** Unmeasurable from docs. The test is a recorded hour of
   normal working speech replayed through `bulk_predict` — count activations, then decide whether the
   negatives list or a custom verifier model is the fix.
3. **Does WSL2 have usable CUDA passthrough on this box?** The whole Docker training route assumes an
   NVIDIA GPU. If not, it's the Colab notebook, with the unvetted-code caveat.
4. **Will Piper actually pronounce "Claude"?** The hard-k defect from #71 is documented but its
   current status is unknown. Cheap check: run `--generate_clips` for 200 samples and *listen* to
   twenty of them before spending an hour on training. If the k is inconsistent, add spellings until
   it isn't.
5. **Real CPU under real load.** 10–15% of one core was measured on an idle machine. Contention with
   a browser, Metro, and a Claude session is untested. If it matters, 160 ms chunks cut it ~20% for
   80 ms of added latency.
6. **`hey_jarvis` as a permanent third wake word** — it's a free, high-quality, already-trained escape
   hatch, but it's CC BY-NC-SA and it's someone else's brand. Fine forever if this stays personal.
7. **Whether to pin to git `main` instead of PyPI 0.6.0.** `main` has a Python 3.10+ bump and the
   `ai-edge-litert` switch (2025-10/12) that were never released. PyPI 0.6.0 installed and ran clean
   on Python 3.12 here, so there's no reason to move — but if a future numpy/onnxruntime breaks it,
   `main` is where the fix already is.
